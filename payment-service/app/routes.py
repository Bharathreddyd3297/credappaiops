"""API routes for the payment service."""

from fastapi import APIRouter, Depends, Header, status
from sqlalchemy.orm import Session

from app.auth import current_customer
from app.database import get_db
from app.models import User
from app.schemas import PaymentHistoryItem, PaymentRequest, PaymentResponse
from app.services import create_payment, get_payment_history

router = APIRouter(prefix="/api/payment", tags=["payment"])


# Used by the pipeline's post-deployment smoke test (GET /api/payment/health).
# Kept separate from the root /health used by the liveness/readiness probes.
@router.get("/health")
def health():
    return {"status": "UP"}


@router.post("/pay", response_model=PaymentResponse, status_code=status.HTTP_201_CREATED)
def pay(
    request: PaymentRequest,
    idempotency_key: str = Header(
        alias="Idempotency-Key",
        min_length=8,
        max_length=64,
        description="One unique value per payment attempt (e.g. a UUID)",
    ),
    user: User = Depends(current_customer),
    db: Session = Depends(get_db),
) -> PaymentResponse:
    return create_payment(db, user, request, idempotency_key)


@router.get("/history", response_model=list[PaymentHistoryItem])
def history(
    user: User = Depends(current_customer), db: Session = Depends(get_db)
) -> list[PaymentHistoryItem]:
    return get_payment_history(db, user)
