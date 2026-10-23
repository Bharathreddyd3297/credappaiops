"""Azure Monitor client.

Reads platform-level Azure Metrics and Azure Resource Health for the
AKS cluster - the infrastructure layer beneath Kubernetes' own
awareness (see the Data Contract, Chapter 3, "Azure Monitor" entry).

Authentication: a dedicated Azure AD Service Principal, supplied via
AZURE_TENANT_ID / AZURE_CLIENT_ID / AZURE_CLIENT_SECRET (see
k8s/ai-service/secret.example.yaml). This is intentionally a *new*, separate
credential - it does not reuse the AKS cluster's own managed identity
or the Azure DevOps pipeline's service connection, and it does not
require any change to Terraform or existing infrastructure.

Degrades gracefully: if no credential is configured, every method
returns an empty/"not configured" result rather than raising, so the
rest of the service (Prometheus- and Kubernetes-backed use cases)
keeps working with or without Azure access.

Isolation: this module knows nothing about Prometheus, Kubernetes, or
the LLM - it only knows how to ask Azure Monitor a question and hand
back a normalized answer.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from app.config.settings import Settings
from app.utils.logging import get_logger

logger = get_logger(__name__)


class AzureMonitorClient:
    def __init__(self, settings: Settings):
        self._settings = settings
        self._credential = None
        self._metrics_client = None

        if settings.azure_credentials_configured:
            try:
                from azure.identity import ClientSecretCredential
                from azure.monitor.query import MetricsQueryClient

                self._credential = ClientSecretCredential(
                    tenant_id=settings.azure_tenant_id,
                    client_id=settings.azure_client_id,
                    client_secret=settings.azure_client_secret,
                )
                self._metrics_client = MetricsQueryClient(self._credential)
            except Exception:  # noqa: BLE001 - degrade, never crash startup
                logger.exception("Failed to initialize Azure Monitor client; disabling it")
                self._metrics_client = None
        else:
            logger.info("Azure credentials not configured; Azure Monitor client is disabled")

    @property
    def is_configured(self) -> bool:
        return self._metrics_client is not None

    def get_node_metrics(self, metric_names: list[str] | None = None) -> list[dict[str, Any]]:
        """Returns recent Azure Metrics (VM-level) for the AKS resource."""
        if not self.is_configured or not self._settings.aks_resource_id:
            return []

        metric_names = metric_names or ["node_cpu_usage_percentage", "node_memory_working_set_percentage"]
        try:
            response = self._metrics_client.query_resource(
                self._settings.aks_resource_id,
                metric_names=metric_names,
                timespan=timedelta(hours=1),
            )
        except Exception as exc:  # noqa: BLE001 - external API, don't crash the request
            logger.warning("Azure Metrics query failed: %s", exc)
            return []

        facts: list[dict[str, Any]] = []
        for metric in response.metrics:
            for series in metric.timeseries:
                if not series.data:
                    continue
                latest = series.data[-1]
                facts.append(
                    {
                        "source": "azure_metrics",
                        "label": metric.name,
                        "value": latest.average if latest.average is not None else latest.total,
                        "timestamp": latest.timestamp.isoformat() if latest.timestamp else None,
                    }
                )
        return facts

    def get_resource_health(self) -> dict[str, Any]:
        """Returns the AKS resource's current platform health status."""
        if not self.is_configured or not self._settings.aks_resource_id:
            return {"available": None, "reason": "not_configured"}

        try:
            from azure.mgmt.resourcehealth import MicrosoftResourceHealth

            client = MicrosoftResourceHealth(self._credential, self._settings.azure_subscription_id)
            status = client.availability_statuses.get_by_resource(
                resource_uri=self._settings.aks_resource_id,
            )
            return {
                "available": status.properties.availability_state == "Available",
                "reason": status.properties.availability_state,
                "summary": status.properties.title,
            }
        except Exception as exc:  # noqa: BLE001 - external API, don't crash the request
            logger.warning("Azure Resource Health query failed: %s", exc)
            return {"available": None, "reason": "query_failed"}

    def is_healthy(self) -> bool:
        return self.is_configured
