"""GET /api/ai/health"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Request

from app.api.deps import get_telemetry_collector
from app.config.settings import Settings, get_settings
from app.models.schemas import ComponentStatus, DependencyHealth, HealthResponse
from app.services.telemetry_collector import TelemetryCollector

router = APIRouter()

SERVICE_VERSION = "1.0.0"


@router.get("/health", response_model=HealthResponse)
async def health(
    request: Request,
    collector: TelemetryCollector = Depends(get_telemetry_collector),
    settings: Settings = Depends(get_settings),
) -> HealthResponse:
    """Reports this service's own health plus each dependency's
    reachability. Never raises - an unreachable dependency is reported
    as a status, not a 500."""

    dependencies: list[DependencyHealth] = []

    prom_healthy = await collector.prometheus.is_healthy()
    dependencies.append(
        DependencyHealth(
            name="prometheus",
            status=ComponentStatus.OK if prom_healthy else ComponentStatus.UNAVAILABLE,
        )
    )

    k8s_healthy = collector.kubernetes.is_healthy(settings.kubernetes_namespace)
    k8s_status = ComponentStatus.OK if k8s_healthy else (
        ComponentStatus.NOT_CONFIGURED if not collector.kubernetes.is_configured else ComponentStatus.UNAVAILABLE
    )
    dependencies.append(DependencyHealth(name="kubernetes", status=k8s_status))

    azure_monitor_status = ComponentStatus.OK if collector.azure_monitor.is_healthy() else ComponentStatus.NOT_CONFIGURED
    dependencies.append(DependencyHealth(name="azure_monitor", status=azure_monitor_status))

    log_analytics_status = ComponentStatus.OK if collector.log_analytics.is_healthy() else ComponentStatus.NOT_CONFIGURED
    dependencies.append(DependencyHealth(name="log_analytics", status=log_analytics_status))

    llm = request.app.state.openai_client
    llm_status = ComponentStatus.OK if llm.is_healthy() else ComponentStatus.NOT_CONFIGURED
    dependencies.append(DependencyHealth(name="azure_openai", status=llm_status))

    # Overall status: OK only if Prometheus and the LLM (the two
    # mandatory dependencies) are both reachable/configured. The Azure
    # sources and Kubernetes are optional-by-design (see the Data
    # Contract) so their absence never degrades overall health.
    overall = ComponentStatus.OK if (prom_healthy and llm.is_healthy()) else ComponentStatus.DEGRADED

    return HealthResponse(status=overall, service=settings.service_name, version=SERVICE_VERSION, dependencies=dependencies)
