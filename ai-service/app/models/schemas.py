"""Pydantic request/response models for every CredAI API endpoint.

Kept separate from the clients/services that populate them so the API
contract (what a caller sees) never depends on the internal shape any
one telemetry source happens to return.
"""

from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------
# Shared
# ---------------------------------------------------------------------

class ComponentStatus(str, Enum):
    OK = "ok"
    DEGRADED = "degraded"
    UNAVAILABLE = "unavailable"
    NOT_CONFIGURED = "not_configured"


class DependencyHealth(BaseModel):
    name: str
    status: ComponentStatus
    detail: Optional[str] = None


class HealthResponse(BaseModel):
    status: ComponentStatus
    service: str
    version: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    dependencies: list[DependencyHealth] = Field(default_factory=list)


# ---------------------------------------------------------------------
# Chat
# ---------------------------------------------------------------------

class ChatMessage(BaseModel):
    role: str = Field(description="'user' or 'assistant'")
    content: str


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    history: list[ChatMessage] = Field(default_factory=list, max_length=20)


class ChatSource(BaseModel):
    """One telemetry source that contributed evidence to a chat answer."""

    name: str
    summary: str


class ChatResponse(BaseModel):
    reply: str
    sources: list[ChatSource] = Field(default_factory=list)
    use_case: str
    generated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


# ---------------------------------------------------------------------
# Telemetry (raw, normalized)
# ---------------------------------------------------------------------

class PrometheusSeries(BaseModel):
    metric: dict[str, str]
    value: Optional[float] = None
    values: Optional[list[list[Any]]] = None


class PrometheusQueryResponse(BaseModel):
    query: str
    result_type: str
    series: list[PrometheusSeries]
    queried_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class PodSummary(BaseModel):
    name: str
    namespace: str
    phase: str
    restarts: int
    node: Optional[str] = None
    ready: bool


class DeploymentSummary(BaseModel):
    name: str
    namespace: str
    desired_replicas: int
    available_replicas: int
    ready: bool


class KubernetesStateResponse(BaseModel):
    namespace: str
    pods: list[PodSummary]
    deployments: list[DeploymentSummary]
    recent_events: list[dict[str, Any]] = Field(default_factory=list)
    queried_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


# ---------------------------------------------------------------------
# Summaries
# ---------------------------------------------------------------------

class ClusterSummaryResponse(BaseModel):
    summary: str
    healthy: bool
    pod_count: int
    unhealthy_pod_count: int
    deployment_count: int
    generated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class BusinessSummaryResponse(BaseModel):
    summary: str
    payment_success_rate_percent: Optional[float] = None
    total_requests_last_hour: Optional[float] = None
    generated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


# ---------------------------------------------------------------------
# Root cause analysis
# ---------------------------------------------------------------------

class RootCauseRequest(BaseModel):
    symptom: str = Field(
        min_length=1,
        max_length=500,
        description="A short description of the observed problem, e.g. 'payment-service is slow'",
    )
    namespace: Optional[str] = None


class RootCauseResponse(BaseModel):
    symptom: str
    analysis: str
    evidence: list[ChatSource] = Field(default_factory=list)
    generated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
