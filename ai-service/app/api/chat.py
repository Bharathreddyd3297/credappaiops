"""POST /api/ai/chat and POST /api/ai/root-cause"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import get_chat_service, get_root_cause_service
from app.clients.openai_client import OpenAIClientError
from app.models.schemas import ChatRequest, ChatResponse, RootCauseRequest, RootCauseResponse
from app.services.chat_service import ChatService
from app.services.root_cause_service import RootCauseService
from app.utils.logging import get_logger

logger = get_logger(__name__)
router = APIRouter()


@router.post("/chat", response_model=ChatResponse)
async def chat(
    body: ChatRequest,
    chat_service: ChatService = Depends(get_chat_service),
) -> ChatResponse:
    try:
        return await chat_service.ask(body.message, body.history)
    except OpenAIClientError as exc:
        logger.error("Chat request failed: %s", exc)
        raise HTTPException(status_code=503, detail="CredAI's language model is currently unavailable") from exc


@router.post("/root-cause", response_model=RootCauseResponse)
async def root_cause(
    body: RootCauseRequest,
    root_cause_service: RootCauseService = Depends(get_root_cause_service),
) -> RootCauseResponse:
    try:
        return await root_cause_service.analyze(body.symptom)
    except OpenAIClientError as exc:
        logger.error("Root cause analysis failed: %s", exc)
        raise HTTPException(status_code=503, detail="CredAI's language model is currently unavailable") from exc
