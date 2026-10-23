"""Telemetry Collector.

The component named in observability/aiops/01-AIOps-Architecture.md,
Chapter 5: owns one instance of each source-specific client and
exposes higher-level "gather facts for this use case" methods. Every
method returns the same normalized fact shape (see
app/utils/normalizer.py) regardless of which client(s) it called -
this is the layer that makes the rest of the service indifferent to
where a fact came from.
"""

from __future__ import annotations

from typing import Any

from app.clients.azure_monitor_client import AzureMonitorClient
from app.clients.kubernetes_client import KubernetesClient, KubernetesClientError
from app.clients.log_analytics_client import LogAnalyticsClient
from app.clients.prometheus_client import PrometheusClient, PrometheusClientError, PromQL
from app.config.settings import Settings
from app.utils.logging import get_logger
from app.utils.normalizer import normalize_deployment_list, normalize_events, normalize_pod_list

logger = get_logger(__name__)


class TelemetryCollector:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.prometheus = PrometheusClient(settings)
        self.kubernetes = KubernetesClient()
        self.azure_monitor = AzureMonitorClient(settings)
        self.log_analytics = LogAnalyticsClient(settings)

    async def _safe_prometheus_query(
        self, promql: str, metric_name: str | None = None
    ) -> list[dict[str, Any]]:
        try:
            return await self.prometheus.query(promql, metric_name)
        except PrometheusClientError as exc:
            logger.warning("Prometheus query skipped: %s", exc)
            return []

    def _safe_k8s_pods(self, namespace: str) -> list[dict[str, Any]]:
        try:
            return self.kubernetes.list_pods(namespace)
        except KubernetesClientError as exc:
            logger.warning("Kubernetes pod list skipped: %s", exc)
            return []

    def _safe_k8s_deployments(self, namespace: str) -> list[dict[str, Any]]:
        try:
            return self.kubernetes.list_deployments(namespace)
        except KubernetesClientError as exc:
            logger.warning("Kubernetes deployment list skipped: %s", exc)
            return []

    def _safe_k8s_events(self, namespace: str) -> list[dict[str, Any]]:
        try:
            return self.kubernetes.list_recent_events(namespace)
        except KubernetesClientError as exc:
            logger.warning("Kubernetes event list skipped: %s", exc)
            return []

    async def collect_cluster_facts(self) -> list[dict[str, Any]]:
        namespace = self.settings.kubernetes_namespace
        pods = self._safe_k8s_pods(namespace)
        deployments = self._safe_k8s_deployments(namespace)
        events = self._safe_k8s_events(namespace)

        restarts = await self._safe_prometheus_query(
            PromQL.POD_RESTARTS_TOTAL, "Total pod restarts (all Pods, cumulative)"
        )
        availability = await self._safe_prometheus_query(
            PromQL.DEPLOYMENT_AVAILABILITY, "Deployment availability %"
        )
        node_cpu = await self._safe_prometheus_query(PromQL.NODE_CPU_PERCENT, "Node CPU utilization %")
        node_memory = await self._safe_prometheus_query(
            PromQL.NODE_MEMORY_AVAILABLE_PERCENT, "Node available memory %"
        )

        return (
            normalize_pod_list(pods)
            + normalize_deployment_list(deployments)
            + normalize_events(events)
            + restarts
            + availability
            + node_cpu
            + node_memory
        )

    async def collect_business_facts(self) -> list[dict[str, Any]]:
        success_rate = await self._safe_prometheus_query(
            PromQL.PAYMENT_SUCCESS_RATE, "HTTP success rate % (last 1h)"
        )
        error_rate = await self._safe_prometheus_query(
            PromQL.PAYMENT_ERROR_RATE, "HTTP 5xx error rate (requests/sec, by endpoint)"
        )
        total_requests = await self._safe_prometheus_query(
            PromQL.TOTAL_REQUEST_RATE, "Total request rate (requests/sec, last 1h)"
        )
        latency = await self._safe_prometheus_query(
            PromQL.USER_SERVICE_P95_LATENCY, "P95 latency in seconds (by endpoint)"
        )
        return success_rate + error_rate + total_requests + latency

    async def collect_capacity_facts(self) -> list[dict[str, Any]]:
        pod_cpu_usage = await self._safe_prometheus_query(
            PromQL.ALL_PODS_CPU_USAGE_MILLICORES, "Pod CPU usage (millicores, 5m rate)"
        )
        pod_memory_usage = await self._safe_prometheus_query(
            PromQL.ALL_PODS_MEMORY_USAGE_MIB, "Pod memory usage (MiB, working set)"
        )
        pod_cpu_requests = await self._safe_prometheus_query(
            PromQL.POD_CPU_REQUESTS_MILLICORES, "Pod CPU request (millicores, configured)"
        )
        pod_memory_requests = await self._safe_prometheus_query(
            PromQL.POD_MEMORY_REQUESTS_MIB, "Pod memory request (MiB, configured)"
        )
        hpa_current = await self._safe_prometheus_query(
            PromQL.HPA_CURRENT_REPLICAS, "HPA current replica count"
        )
        hpa_max = await self._safe_prometheus_query(PromQL.HPA_MAX_REPLICAS, "HPA max replica ceiling")
        node_cpu = await self._safe_prometheus_query(PromQL.NODE_CPU_PERCENT, "Node CPU utilization %")
        node_memory = await self._safe_prometheus_query(
            PromQL.NODE_MEMORY_AVAILABLE_PERCENT, "Node available memory %"
        )
        deployments = normalize_deployment_list(
            self._safe_k8s_deployments(self.settings.kubernetes_namespace)
        )
        return (
            pod_cpu_usage
            + pod_memory_usage
            + pod_cpu_requests
            + pod_memory_requests
            + hpa_current
            + hpa_max
            + node_cpu
            + node_memory
            + deployments
        )

    async def collect_deployment_facts(self) -> list[dict[str, Any]]:
        namespace = self.settings.kubernetes_namespace
        deployments = normalize_deployment_list(self._safe_k8s_deployments(namespace))
        pods = normalize_pod_list(self._safe_k8s_pods(namespace))
        latency = await self._safe_prometheus_query(
            PromQL.USER_SERVICE_P95_LATENCY, "P95 latency in seconds (by endpoint)"
        )
        error_rate = await self._safe_prometheus_query(
            PromQL.PAYMENT_ERROR_RATE, "HTTP 5xx error rate (requests/sec, by endpoint)"
        )
        return deployments + pods + latency + error_rate

    async def collect_daily_ops_facts(self) -> list[dict[str, Any]]:
        cluster_facts = await self.collect_cluster_facts()
        business_facts = await self.collect_business_facts()
        recent_events = self.log_analytics.recent_kube_events(hours=24)
        return cluster_facts + business_facts + recent_events

    async def collect_root_cause_facts(self, symptom: str) -> list[dict[str, Any]]:
        """Keyword-driven correlation, mirroring the Correlation Matrix
        already documented in the Data Contract (Chapter 6) - each
        keyword pulls in exactly the sources that matrix maps to that
        incident type, rather than always gathering everything."""
        symptom_lower = symptom.lower()
        facts: list[dict[str, Any]] = []

        namespace = self.settings.kubernetes_namespace
        facts += normalize_pod_list(self._safe_k8s_pods(namespace))
        facts += normalize_events(self._safe_k8s_events(namespace))

        if any(word in symptom_lower for word in ("slow", "latency", "delay")):
            facts += await self._safe_prometheus_query(
                PromQL.USER_SERVICE_P95_LATENCY, "P95 latency in seconds (by endpoint)"
            )
            facts += await self._safe_prometheus_query(PromQL.NODE_CPU_PERCENT, "Node CPU utilization %")

        if any(word in symptom_lower for word in ("cpu", "throttle", "busy")):
            facts += await self._safe_prometheus_query(PromQL.NODE_CPU_PERCENT, "Node CPU utilization %")
            facts += await self._safe_prometheus_query(
                PromQL.HIGHEST_CPU_DEPLOYMENT, "Highest CPU-consuming pod (millicores, 5m rate)"
            )

        if any(word in symptom_lower for word in ("memory", "oom", "killed")):
            facts += await self._safe_prometheus_query(
                PromQL.NODE_MEMORY_AVAILABLE_PERCENT, "Node available memory %"
            )

        if any(word in symptom_lower for word in ("restart", "crash", "unhealthy", "down")):
            facts += await self._safe_prometheus_query(
                PromQL.POD_RESTARTS_TOTAL, "Total pod restarts (all Pods, cumulative)"
            )
            facts += self.log_analytics.recent_kube_events(reason="Unhealthy", hours=6)

        if any(word in symptom_lower for word in ("schedul", "pending")):
            facts += self.log_analytics.recent_kube_events(reason="FailedScheduling", hours=6)

        if any(word in symptom_lower for word in ("payment", "transaction")):
            facts += await self._safe_prometheus_query(
                PromQL.PAYMENT_ERROR_RATE, "HTTP 5xx error rate (requests/sec, by endpoint)"
            )
            facts += await self._safe_prometheus_query(
                PromQL.PAYMENT_SUCCESS_RATE, "HTTP success rate % (last 1h)"
            )

        if any(word in symptom_lower for word in ("azure", "platform", "infrastructure")):
            health = self.azure_monitor.get_resource_health()
            facts.append({"source": "azure_resource_health", "label": "AKS resource health", "value": health})

        if not facts:
            # No keyword matched - fall back to a broad cluster snapshot
            # rather than returning nothing.
            facts += await self.collect_cluster_facts()

        return facts
