"""Combines every route module into one APIRouter, mounted at /api/ai
in app/main.py."""

from fastapi import APIRouter

from app.api import chat, health, summary, telemetry

api_router = APIRouter(prefix="/api/ai", tags=["CredAI"])
api_router.include_router(health.router)
api_router.include_router(chat.router)
api_router.include_router(telemetry.router)
api_router.include_router(summary.router)
