"""Prometheus client.

Talks directly to the existing Prometheus server's HTTP API
(http://prometheus.monitoring.svc.cluster.local:9090) - the exact same
instance and same query language documented in
observability/aiops/architecture/01-Observability-Data-Contract.md.
This client is intentionally a thin, dependency-light HTTP wrapper
(httpx) rather than a heavier third-party PromQL library - Prometheus's
own HTTP API is simple enough that no extra abstraction is needed, and
this avoids taking on a dependency whose own maintenance/versioning is
outside our control.

Isolation: this module knows nothing about Kubernetes, Azure, or the
LLM - it only knows how to ask Prometheus a PromQL question and hand
back a normalized answer.
"""

from __future__ import annotations

import httpx

from app.config.settings import Settings
from app.utils.logging import get_logger
from app.utils.normalizer import normalize_prometheus_result

logger = get_logger(__name__)


class PrometheusClientError(Exception):
    """Raised when Prometheus cannot be reached or returns an error."""


class PrometheusClient:
    def __init__(self, settings: Settings):
        self._base_url = settings.prometheus_url.rstrip("/")
        self._timeout = settings.prometheus_timeout_seconds

    async def query(self, promql: str, metric_name: str | None = None) -> list[dict]:
        """Runs an instant PromQL query and returns normalized facts.

        `metric_name` is a short human-readable description (e.g. "Node
        CPU utilization %") embedded into each fact's label - see
        normalize_prometheus_result for why this matters.
        """
        url = f"{self._base_url}/api/v1/query"
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                response = await client.get(url, params={"query": promql})
                response.raise_for_status()
        except httpx.HTTPError as exc:
            logger.warning("Prometheus query failed: %s (%s)", promql, exc)
            raise PrometheusClientError(f"Prometheus query failed: {exc}") from exc

        payload = response.json()
        if payload.get("status") != "success":
            raise PrometheusClientError(f"Prometheus returned non-success status: {payload}")

        return normalize_prometheus_result(payload, promql, metric_name)

    async def query_scalar(self, promql: str) -> float | None:
        """Convenience helper for queries expected to return exactly one value."""
        facts = await self.query(promql)
        if not facts:
            return None
        try:
            return float(facts[0]["value"])
        except (TypeError, ValueError):
            return None

    async def is_healthy(self) -> bool:
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                response = await client.get(f"{self._base_url}/-/healthy")
                return response.status_code == 200
        except httpx.HTTPError:
            return False


# --- Well-known queries this service relies on, kept in one place so
# they're easy to audit against observability/prometheus/cheatsheets/. ---

class PromQL:
    """Named PromQL queries - avoids scattering raw query strings across
    the services layer, and keeps them easy to cross-check against the
    Data Contract's query catalog."""

    UNHEALTHY_PODS = 'kube_pod_status_phase{namespace="credpay", phase!="Running"} == 1'
    POD_RESTARTS_TOTAL = 'sum(kube_pod_container_status_restarts_total{namespace="credpay"})'
    DEPLOYMENT_AVAILABILITY = (
        'kube_deployment_status_replicas_available{namespace="credpay"} '
        '/ kube_deployment_spec_replicas{namespace="credpay"} * 100'
    )
    NODE_CPU_PERCENT = (
        '100 - (avg by (instance) (rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)'
    )
    # `by (instance)` keeps this aggregated to one clean label per node,
    # matching NODE_CPU_PERCENT's style - the un-aggregated form carries
    # every raw label (job, instance, and more), which reads as noise
    # once metric_name is prefixed on top.
    NODE_MEMORY_AVAILABLE_PERCENT = (
        "avg by (instance) (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes * 100)"
    )
    HIGHEST_CPU_DEPLOYMENT = (
        "topk(1, sum(rate(container_cpu_usage_seconds_total"
        '{namespace="credpay", container!="", image!=""}[5m])) by (pod)) * 1000'
    )
    # --- Capacity planning: usage vs configured requests, per Pod, plus
    # HPA ceiling - all confirmed present in this cluster's Prometheus via
    # kube-state-metrics (kube_pod_container_resource_requests,
    # kube_horizontalpodautoscaler_*) and cAdvisor (container_cpu/memory_*). ---
    ALL_PODS_CPU_USAGE_MILLICORES = (
        "sum(rate(container_cpu_usage_seconds_total"
        '{namespace="credpay", container!="", image!=""}[5m])) by (pod) * 1000'
    )
    ALL_PODS_MEMORY_USAGE_MIB = (
        'sum(container_memory_working_set_bytes{namespace="credpay", container!="", image!=""}) '
        "by (pod) / 1024 / 1024"
    )
    POD_CPU_REQUESTS_MILLICORES = (
        'sum(kube_pod_container_resource_requests{namespace="credpay", resource="cpu"}) '
        "by (pod) * 1000"
    )
    POD_MEMORY_REQUESTS_MIB = (
        'sum(kube_pod_container_resource_requests{namespace="credpay", resource="memory"}) '
        "by (pod) / 1024 / 1024"
    )
    HPA_CURRENT_REPLICAS = (
        'sum(kube_horizontalpodautoscaler_status_current_replicas{namespace="credpay"}) '
        "by (horizontalpodautoscaler)"
    )
    HPA_MAX_REPLICAS = (
        'sum(kube_horizontalpodautoscaler_spec_max_replicas{namespace="credpay"}) '
        "by (horizontalpodautoscaler)"
    )
    PAYMENT_ERROR_RATE = (
        'sum(rate(http_requests_total{job="kubernetes-pods", status=~"5.."}[5m])) by (handler)'
    )
    PAYMENT_SUCCESS_RATE = (
        'sum(rate(http_requests_total{job="kubernetes-pods", status=~"2.."}[1h])) '
        '/ sum(rate(http_requests_total{job="kubernetes-pods"}[1h])) * 100'
    )
    USER_SERVICE_P95_LATENCY = (
        "histogram_quantile(0.95, sum(rate(http_server_requests_seconds_bucket"
        '{job="kubernetes-pods"}[5m])) by (le, uri))'
    )
    TOTAL_REQUEST_RATE = (
        'sum(rate(http_server_requests_seconds_count{job="kubernetes-pods"}[1h])) '
        '+ sum(rate(http_requests_total{job="kubernetes-pods"}[1h]))'
    )
