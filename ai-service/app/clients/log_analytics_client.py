"""Log Analytics client.

Runs KQL queries against the existing Log Analytics Workspace
(log-credpays1) that Container Insights already writes into - the same
workspace, same tables (KubeEvents, ContainerLog, KubePodInventory,
Heartbeat) documented and live-verified in the Data Contract
(observability/aiops/architecture/01-Observability-Data-Contract.md,
Chapter 3). This client only *reads*; it never configures Diagnostic
Settings, Data Collection Rules, or anything else about how data gets
into the workspace.

Authentication and graceful degradation follow the same pattern as
AzureMonitorClient - a dedicated Service Principal, optional, with
every method returning an empty result rather than raising when not
configured.

Isolation: this module knows nothing about Prometheus, Kubernetes, or
the LLM - it only knows how to run a KQL query and hand back a
normalized answer.
"""

from __future__ import annotations

from datetime import timedelta
from typing import Any

from app.config.settings import Settings
from app.utils.logging import get_logger
from app.utils.normalizer import normalize_log_analytics_rows

logger = get_logger(__name__)


class LogAnalyticsClient:
    def __init__(self, settings: Settings):
        self._settings = settings
        self._logs_client = None

        if settings.azure_credentials_configured:
            try:
                from azure.identity import ClientSecretCredential
                from azure.monitor.query import LogsQueryClient

                credential = ClientSecretCredential(
                    tenant_id=settings.azure_tenant_id,
                    client_id=settings.azure_client_id,
                    client_secret=settings.azure_client_secret,
                )
                self._logs_client = LogsQueryClient(credential)
            except Exception:  # noqa: BLE001 - degrade, never crash startup
                logger.exception("Failed to initialize Log Analytics client; disabling it")
                self._logs_client = None
        else:
            logger.info("Azure credentials not configured; Log Analytics client is disabled")

    @property
    def is_configured(self) -> bool:
        return self._logs_client is not None and bool(self._settings.log_analytics_workspace_id)

    def run_query(self, kql: str, timespan_hours: int = 24) -> list[dict[str, Any]]:
        if not self.is_configured:
            return []
        try:
            response = self._logs_client.query_workspace(
                workspace_id=self._settings.log_analytics_workspace_id,
                query=kql,
                timespan=timedelta(hours=timespan_hours),
            )
        except Exception as exc:  # noqa: BLE001 - external API, don't crash the request
            logger.warning("Log Analytics query failed: %s", exc)
            return []

        table = response.tables[0] if response.tables else None
        if table is None:
            return []

        rows = [dict(zip(table.columns, row)) for row in table.rows]
        return rows

    @staticmethod
    def _escape_kql_string(value: str) -> str:
        """Escapes a value for safe interpolation inside a KQL string
        literal - prevents query injection from any caller-influenced
        text (e.g. a symptom description derived from chat input)."""
        return value.replace("\\", "\\\\").replace('"', '\\"')

    def recent_kube_events(self, reason: str | None = None, hours: int = 1) -> list[dict[str, Any]]:
        filter_clause = ""
        if reason:
            filter_clause = f'| where Reason == "{self._escape_kql_string(reason)}"'
        kql = f"KubeEvents | where TimeGenerated > ago({hours}h) {filter_clause} | order by TimeGenerated desc"
        rows = self.run_query(kql, timespan_hours=hours)
        return normalize_log_analytics_rows(rows, table="KubeEvents")

    def search_container_logs(self, contains: str, hours: int = 1) -> list[dict[str, Any]]:
        safe_contains = self._escape_kql_string(contains)
        kql = (
            f'ContainerLog | where TimeGenerated > ago({hours}h) '
            f'| where LogEntry contains "{safe_contains}" | order by TimeGenerated desc | take 20'
        )
        rows = self.run_query(kql, timespan_hours=hours)
        return normalize_log_analytics_rows(rows, table="ContainerLog")

    def is_healthy(self) -> bool:
        return self.is_configured
