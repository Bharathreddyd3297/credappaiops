"""CredAI Service - FastAPI application entry point.

Run with:
    uvicorn app.main:app --host 0.0.0.0 --port 8010
"""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api import api_router
from app.clients.openai_client import AzureOpenAIClient
from app.config.settings import get_settings
from app.prompt_builder.builder import PromptBuilder
from app.services.business_service import BusinessService
from app.services.chat_service import ChatService
from app.services.cluster_service import ClusterService
from app.services.root_cause_service import RootCauseService
from app.services.telemetry_collector import TelemetryCollector
from app.utils.logging import configure_logging, get_logger

logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    configure_logging(settings.log_level)
    logger.info("Starting %s (env=%s)", settings.service_name, settings.environment)

    telemetry_collector = TelemetryCollector(settings)
    prompt_builder = PromptBuilder()
    openai_client = AzureOpenAIClient(settings)

    app.state.settings = settings
    app.state.telemetry_collector = telemetry_collector
    app.state.prompt_builder = prompt_builder
    app.state.openai_client = openai_client
    app.state.chat_service = ChatService(telemetry_collector, prompt_builder, openai_client)
    app.state.cluster_service = ClusterService(telemetry_collector, prompt_builder, openai_client)
    app.state.business_service = BusinessService(telemetry_collector, prompt_builder, openai_client)
    app.state.root_cause_service = RootCauseService(telemetry_collector, prompt_builder, openai_client)

    if not openai_client.is_configured:
        logger.warning("Azure OpenAI is not configured - chat/summary endpoints will return 503")
    if not telemetry_collector.kubernetes.is_configured:
        logger.warning("Kubernetes client is not configured (not running in-cluster?)")
    if not telemetry_collector.azure_monitor.is_configured:
        logger.info("Azure Monitor client is not configured - platform-level facts will be omitted")
    if not telemetry_collector.log_analytics.is_configured:
        logger.info("Log Analytics client is not configured - log/event facts will be limited to the Kubernetes API")

    logger.info("%s startup complete", settings.service_name)
    yield
    logger.info("%s shutting down", settings.service_name)


app = FastAPI(
    title="CredAI Service",
    description=(
        "AI Operations Assistant for the CredPay platform. Reasons over telemetry already "
        "collected by Prometheus, Kubernetes, and Azure Monitor - see "
        "observability/aiops/01-AIOps-Architecture.md for the full architecture."
    ),
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
    lifespan=lifespan,
)

_settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=_settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Last-resort handler - never leaks a stack trace to the caller,
    always logs one server-side."""
    logger.exception("Unhandled exception on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "An unexpected error occurred in CredAI. This has been logged."},
    )


app.include_router(api_router)


@app.get("/", include_in_schema=False)
async def root():
    return {"service": "CredAI", "docs": "/docs", "health": "/api/ai/health"}
