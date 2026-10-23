"""Kubernetes API client.

Reads live cluster state directly from the Kubernetes API - the most
current possible view, independent of whatever kube-state-metrics has
most recently scraped into Prometheus (see the Data Contract, Chapter
3, "Kubernetes API" entry).

Authenticates using the Pod's own ServiceAccount token (in-cluster
config) - the dedicated, read-only `credai-service` ServiceAccount
defined in k8s/ai-service/rbac.yaml, entirely separate from every other
ServiceAccount already used in this project (Prometheus's, the
kubelet's, etc.).

Isolation: this module knows nothing about Prometheus, Azure, or the
LLM - it only knows how to ask the Kubernetes API a question and hand
back a normalized answer.
"""

from __future__ import annotations

from typing import Any

from kubernetes import client as k8s_client
from kubernetes import config as k8s_config
from kubernetes.client.rest import ApiException

from app.utils.logging import get_logger

logger = get_logger(__name__)


class KubernetesClientError(Exception):
    """Raised when the Kubernetes API cannot be reached or errors."""


class KubernetesClient:
    def __init__(self):
        self._configured = False
        try:
            k8s_config.load_incluster_config()
            self._configured = True
        except k8s_config.ConfigException:
            # Not running inside a cluster (e.g. local development) -
            # degrade gracefully rather than crash the whole service.
            logger.warning("Not running in-cluster; Kubernetes client is disabled")
        self._core = k8s_client.CoreV1Api() if self._configured else None
        self._apps = k8s_client.AppsV1Api() if self._configured else None

    @property
    def is_configured(self) -> bool:
        return self._configured

    def list_pods(self, namespace: str) -> list[dict[str, Any]]:
        if not self._configured:
            return []
        try:
            pods = self._core.list_namespaced_pod(namespace=namespace)
        except ApiException as exc:
            raise KubernetesClientError(f"Failed to list pods in {namespace}: {exc}") from exc

        summaries: list[dict[str, Any]] = []
        for pod in pods.items:
            restarts = sum(
                (status.restart_count or 0) for status in (pod.status.container_statuses or [])
            )
            ready = all(
                status.ready for status in (pod.status.container_statuses or [])
            ) if pod.status.container_statuses else False
            summaries.append(
                {
                    "name": pod.metadata.name,
                    "namespace": pod.metadata.namespace,
                    "phase": pod.status.phase or "Unknown",
                    "restarts": restarts,
                    "node": pod.spec.node_name,
                    "ready": ready,
                }
            )
        return summaries

    def list_deployments(self, namespace: str) -> list[dict[str, Any]]:
        if not self._configured:
            return []
        try:
            deployments = self._apps.list_namespaced_deployment(namespace=namespace)
        except ApiException as exc:
            raise KubernetesClientError(f"Failed to list deployments in {namespace}: {exc}") from exc

        summaries: list[dict[str, Any]] = []
        for deployment in deployments.items:
            desired = deployment.spec.replicas or 0
            available = deployment.status.available_replicas or 0
            summaries.append(
                {
                    "name": deployment.metadata.name,
                    "namespace": deployment.metadata.namespace,
                    "desired_replicas": desired,
                    "available_replicas": available,
                    "ready": available >= desired and desired > 0,
                }
            )
        return summaries

    def list_recent_events(self, namespace: str, limit: int = 20) -> list[dict[str, Any]]:
        if not self._configured:
            return []
        try:
            events = self._core.list_namespaced_event(namespace=namespace, limit=limit)
        except ApiException as exc:
            raise KubernetesClientError(f"Failed to list events in {namespace}: {exc}") from exc

        summaries: list[dict[str, Any]] = []
        for event in events.items:
            summaries.append(
                {
                    "reason": event.reason,
                    "message": event.message,
                    "involved_object": f"{event.involved_object.kind}/{event.involved_object.name}",
                    "type": event.type,
                    "last_timestamp": event.last_timestamp.isoformat() if event.last_timestamp else None,
                    "count": event.count,
                }
            )
        # Most recent first.
        summaries.sort(key=lambda e: e["last_timestamp"] or "", reverse=True)
        return summaries[:limit]

    def is_healthy(self, namespace: str) -> bool:
        """Probes with `list_namespaced_pod`, not a cluster-scoped call
        like `list_namespace` - the credai-service RBAC Role (see
        k8s/ai-service/rbac.yaml) deliberately grants only namespaced
        pod/deployment/event access, least-privilege, so a cluster-scoped
        probe would always 403 even when the client is working fine.
        """
        if not self._configured:
            return False
        try:
            self._core.list_namespaced_pod(namespace=namespace, limit=1)
            return True
        except ApiException:
            return False
