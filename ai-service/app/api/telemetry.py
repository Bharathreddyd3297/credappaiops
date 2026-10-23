"""GET /api/ai/prometheus and GET /api/ai/kubernetes

Raw telemetry passthrough endpoints - useful for debugging what the AI
actually sees, independent of any LLM call. Neither endpoint touches
the LLM Connector.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query

from app.api.deps import get_telemetry_collector
from app.clients.prometheus_client import PrometheusClientError
from app.config.settings import Settings, get_settings
from app.models.schemas import (
    DeploymentSummary,
    KubernetesStateResponse,
    PodSummary,
    PrometheusQueryResponse,
    PrometheusSeries,
)
from app.services.telemetry_collector import TelemetryCollector

router = APIRouter()


@router.get("/prometheus", response_model=PrometheusQueryResponse)
async def query_prometheus(
    query: str = Query(..., description="A PromQL expression, e.g. up"),
    collector: TelemetryCollector = Depends(get_telemetry_collector),
) -> PrometheusQueryResponse:
    try:
        facts = await collector.prometheus.query(query)
    except PrometheusClientError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    series = [
        PrometheusSeries(metric={"label": fact["label"]}, value=_safe_float(fact.get("value")))
        for fact in facts
    ]
    return PrometheusQueryResponse(query=query, result_type="vector", series=series)


@router.get("/kubernetes", response_model=KubernetesStateResponse)
async def kubernetes_state(
    collector: TelemetryCollector = Depends(get_telemetry_collector),
    settings: Settings = Depends(get_settings),
) -> KubernetesStateResponse:
    namespace = settings.kubernetes_namespace
    pods = collector.kubernetes.list_pods(namespace)
    deployments = collector.kubernetes.list_deployments(namespace)
    events = collector.kubernetes.list_recent_events(namespace)

    return KubernetesStateResponse(
        namespace=namespace,
        pods=[PodSummary(**pod) for pod in pods],
        deployments=[DeploymentSummary(**dep) for dep in deployments],
        recent_events=events,
    )


def _safe_float(value) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None
