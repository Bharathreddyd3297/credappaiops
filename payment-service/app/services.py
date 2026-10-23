"""Business logic for the payment service."""

from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import Card, Payment, User
from app.schemas import PaymentHistoryItem, PaymentRequest, PaymentResponse


def _transaction_id(payment: Payment) -> str:
    """Unique, readable transaction id like 'TXN20261022000042'.

    Built from the payment's own primary key, so two concurrent payments can
    never get the same id.
    """
    return f"TXN{datetime.now(timezone.utc):%Y%m%d}{payment.id:06d}"


def _to_response(payment: Payment) -> PaymentResponse:
    return PaymentResponse(
        transactionId=payment.transaction_id,
        status=payment.status,
        amount=float(payment.amount),
    )


def _find_by_idempotency_key(db: Session, user: User, key: str) -> Payment | None:
    return (
        db.query(Payment)
        .filter(Payment.user_id == user.id, Payment.idempotency_key == key)
        .one_or_none()
    )


def _replay(existing: Payment, request: PaymentRequest) -> PaymentResponse:
    """A retry with the same key returns the original payment - but only if
    it really is the same payment."""
    same_payment = (
        existing.card_id == request.cardId
        and existing.amount == request.amount
        and existing.upi_id == request.upiId
    )
    if not same_payment:
        raise HTTPException(
            status_code=422,  # Unprocessable Content
            detail="This Idempotency-Key was already used for a different payment",
        )
    return _to_response(existing)


def create_payment(
    db: Session, user: User, request: PaymentRequest, idempotency_key: str
) -> PaymentResponse:
    # 1. Same key seen before -> return the original payment, never charge twice
    existing = _find_by_idempotency_key(db, user, idempotency_key)
    if existing is not None:
        return _replay(existing, request)

    # 2. The card must belong to the signed-in customer. A card owned by
    #    someone else gets the same 404 as a missing one, so card ids of other
    #    customers cannot be discovered.
    card = db.get(Card, request.cardId)
    if card is None or card.user_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Card not found",
        )

    # 3. Record the payment (simulated: always SUCCESS)
    payment = Payment(
        user_id=user.id,
        card_id=card.id,
        amount=request.amount,
        upi_id=request.upiId,
        idempotency_key=idempotency_key,
        status="SUCCESS",
    )
    db.add(payment)
    try:
        db.flush()  # assigns payment.id
        payment.transaction_id = _transaction_id(payment)
        db.commit()
    except IntegrityError:
        # A concurrent request with the same key won the race: return its payment
        db.rollback()
        existing = _find_by_idempotency_key(db, user, idempotency_key)
        if existing is None:
            raise
        return _replay(existing, request)

    db.refresh(payment)
    return _to_response(payment)


def get_payment_history(db: Session, user: User) -> list[PaymentHistoryItem]:
    payments = (
        db.query(Payment)
        .filter(Payment.user_id == user.id)
        .order_by(Payment.created_at.desc())
        .all()
    )

    return [
        PaymentHistoryItem(
            transactionId=p.transaction_id,
            amount=float(p.amount),
            status=p.status,
            createdAt=p.created_at,
        )
        for p in payments
    ]
