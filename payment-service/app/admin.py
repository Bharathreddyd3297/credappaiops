"""Admin portal APIs: every payment, and payment totals for the Overview page.

All routes require the ADMIN Keycloak role; customers get 403.
"""

import os
from typing import Literal

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import Date, case, cast, func, or_
from sqlalchemy.orm import Session

from app.auth import require_role
from app.database import get_db
from app.models import Card, Payment, User

# Business day boundaries for "today" and the daily chart (PostgreSQL zone name)
REPORT_TIMEZONE = os.getenv("REPORT_TIMEZONE", "Asia/Kolkata")
MAX_PAGE_SIZE = 100

router = APIRouter(
    prefix="/api/admin/payments",
    tags=["admin"],
    dependencies=[Depends(require_role("ADMIN"))],
)


class AdminPaymentItem(BaseModel):
    transactionId: str | None
    amount: float
    status: str
    upiId: str
    createdAt: str
    userId: int
    userEmail: str
    userName: str
    cardNumber: str | None  # masked, e.g. **** **** **** 1111
    cardNetwork: str | None


class AdminPaymentPage(BaseModel):
    items: list[AdminPaymentItem]
    total: int
    page: int
    size: int


class DailyTotal(BaseModel):
    date: str
    count: int
    amount: float


class PaymentSummary(BaseModel):
    totalPayments: int
    totalAmount: float
    averageAmount: float
    successRate: float  # percent, all payments
    paymentsToday: int
    amountToday: float
    last7Days: list[DailyTotal]


def _local_date(column):
    """Calendar date of a timestamptz in the reporting time zone."""
    return cast(func.timezone(REPORT_TIMEZONE, column), Date)


@router.get("", response_model=AdminPaymentPage)
def list_payments(
    status: Literal["SUCCESS", "FAILED", "PENDING"] | None = None,
    search: str | None = Query(default=None, max_length=150, description="Transaction id, customer email or UPI id"),
    page: int = Query(default=0, ge=0),
    size: int = Query(default=20, ge=1, le=MAX_PAGE_SIZE),
    db: Session = Depends(get_db),
) -> AdminPaymentPage:
    query = (
        db.query(Payment, User, Card)
        .join(User, User.id == Payment.user_id)
        .outerjoin(Card, Card.id == Payment.card_id)
    )
    if status:
        query = query.filter(Payment.status == status)
    if search and search.strip():
        pattern = f"%{search.strip()}%"
        query = query.filter(
            or_(
                Payment.transaction_id.ilike(pattern),
                User.email.ilike(pattern),
                Payment.upi_id.ilike(pattern),
            )
        )

    total = query.count()
    rows = (
        query.order_by(Payment.created_at.desc(), Payment.id.desc())
        .offset(page * size)
        .limit(size)
        .all()
    )

    return AdminPaymentPage(
        items=[
            AdminPaymentItem(
                transactionId=payment.transaction_id,
                amount=float(payment.amount),
                status=payment.status,
                upiId=payment.upi_id,
                createdAt=payment.created_at.isoformat(),
                userId=user.id,
                userEmail=user.email,
                userName=user.full_name,
                cardNumber=card.card_number if card else None,
                cardNetwork=card.card_network if card else None,
            )
            for payment, user, card in rows
        ],
        total=total,
        page=page,
        size=size,
    )


@router.get("/summary", response_model=PaymentSummary)
def summary(db: Session = Depends(get_db)) -> PaymentSummary:
    total_count, total_amount, success_count = db.query(
        func.count(Payment.id),
        func.coalesce(func.sum(Payment.amount), 0),
        func.coalesce(func.sum(case((Payment.status == "SUCCESS", 1), else_=0)), 0),
    ).one()

    today = _local_date(func.now())
    today_count, today_amount = (
        db.query(func.count(Payment.id), func.coalesce(func.sum(Payment.amount), 0))
        .filter(_local_date(Payment.created_at) == today)
        .one()
    )

    # Last 7 days including today; days without payments are filled with 0
    day = _local_date(Payment.created_at).label("day")
    by_day = {
        row.day: row
        for row in db.query(day, func.count(Payment.id).label("count"), func.sum(Payment.amount).label("amount"))
        .filter(day > today - 7)
        .group_by(day)
        .all()
    }
    today_value = db.query(today).scalar()
    last_7_days = []
    for offset in range(6, -1, -1):
        date = today_value.fromordinal(today_value.toordinal() - offset)
        row = by_day.get(date)
        last_7_days.append(
            DailyTotal(
                date=date.isoformat(),
                count=row.count if row else 0,
                amount=float(row.amount) if row else 0.0,
            )
        )

    return PaymentSummary(
        totalPayments=total_count,
        totalAmount=float(total_amount),
        averageAmount=float(total_amount) / total_count if total_count else 0.0,
        successRate=round(100.0 * success_count / total_count, 1) if total_count else 0.0,
        paymentsToday=today_count,
        amountToday=float(today_amount),
        last7Days=last_7_days,
    )
