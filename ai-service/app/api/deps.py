"""FastAPI dependency providers.

Every service/client is constructed exactly once, at application
startup (see app/main.py's lifespan handler), and stored on
`app.state`. These functions are the only place routes reach into
`app.state` - keeps the wiring in one place instead of scattered
`request.app.state.xxx` lookups throughout the route modules.
"""

from __future__ import annotations

from fastapi import Request

from app.services.business_service import BusinessService
from app.services.chat_service import ChatService
from app.services.cluster_service import ClusterService
from app.services.root_cause_service import RootCauseService
from app.services.telemetry_collector import TelemetryCollector


def get_telemetry_collector(request: Request) -> TelemetryCollector:
    return request.app.state.telemetry_collector


def get_chat_service(request: Request) -> ChatService:
    return request.app.state.chat_service


def get_cluster_service(request: Request) -> ClusterService:
    return request.app.state.cluster_service


def get_business_service(request: Request) -> BusinessService:
    return request.app.state.business_service


def get_root_cause_service(request: Request) -> RootCauseService:
    return request.app.state.root_cause_service
