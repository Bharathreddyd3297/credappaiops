"""CREDPAY Payment Service - FastAPI application entry point.

Run with:
    uvicorn app.main:app --reload --port 8000
"""

import logging
import os

from fastapi import Depends, FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from prometheus_fastapi_instrumentator import Instrumentator
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.admin import router as admin_router
from app.database import get_db
from app.routes import router

logger = logging.getLogger("payment-service")

app = FastAPI(
    title="CREDPAY Payment Service",
    description="Simulated payments for the signed-in customer (Keycloak bearer token required).",
    version="0.2.0",
)

# Browser origins allowed to call this service: the customer portal (5173) and
# the admin portal (5174) in local dev. Comma-separated, override per environment.
CORS_ALLOWED_ORIGINS = os.getenv(
    "CORS_ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:5174"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in CORS_ALLOWED_ORIGINS.split(",") if o.strip()],
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=True,
)

app.include_router(router)
app.include_router(admin_router)

# Exposes GET /metrics (request count, latency histograms, in-progress
# requests) - scraped by Prometheus (see observability/application-metrics/).
Instrumentator().instrument(app).expose(app, include_in_schema=False)


@app.exception_handler(Exception)
async def unexpected_error(request: Request, exc: Exception) -> JSONResponse:
    """Anything unexpected: log the cause, never return it to the caller."""
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "Something went wrong. Please try again."},
    )


# Liveness: the process is up
@app.get("/health", tags=["health"])
def health():
    return {"status": "UP"}


# Readiness: the service can reach its database and take traffic
@app.get("/health/ready", tags=["health"])
def ready(db: Session = Depends(get_db)):
    db.execute(text("SELECT 1"))
    return {"status": "UP"}
