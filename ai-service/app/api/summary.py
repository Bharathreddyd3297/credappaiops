"""GET /api/ai/business-summary and GET /api/ai/cluster-summary"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import get_business_service, get_cluster_service
from app.clients.openai_client import OpenAIClientError
from app.models.schemas import BusinessSummaryResponse, ClusterSummaryResponse
from app.services.business_service import BusinessService
from app.services.cluster_service import ClusterService
from app.utils.logging import get_logger

logger = get_logger(__name__)
router = APIRouter()


@router.get("/cluster-summary", response_model=ClusterSummaryResponse)
async def cluster_summary(
    cluster_service: ClusterService = Depends(get_cluster_service),
) -> ClusterSummaryResponse:
    try:
        return await cluster_service.get_cluster_summary()
    except OpenAIClientError as exc:
        logger.error("Cluster summary failed: %s", exc)
        raise HTTPException(status_code=503, detail="CredAI's language model is currently unavailable") from exc


@router.get("/business-summary", response_model=BusinessSummaryResponse)
async def business_summary(
    business_service: BusinessService = Depends(get_business_service),
) -> BusinessSummaryResponse:
    try:
        return await business_service.get_business_summary()
    except OpenAIClientError as exc:
        logger.error("Business summary failed: %s", exc)
        raise HTTPException(status_code=503, detail="CredAI's language model is currently unavailable") from exc
