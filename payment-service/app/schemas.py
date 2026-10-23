"""Pydantic request/response schemas.

Field names use camelCase to match the JSON contract exactly, so no aliasing
is required.
"""

from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

# name@bank, e.g. asha@okhdfcbank
UPI_ID_PATTERN = r"^[A-Za-z0-9._-]{2,256}@[A-Za-z]{2,64}$"

# Largest single payment accepted (INR)
MAX_PAYMENT_AMOUNT = Decimal("500000")


class PaymentRequest(BaseModel):
    # The payer is the signed-in customer (from the access token), so there
    # is no userId field.
    cardId: int = Field(gt=0)
    amount: Decimal = Field(
        gt=0,
        le=MAX_PAYMENT_AMOUNT,
        max_digits=12,
        decimal_places=2,
        description="Payment amount in INR, up to 2 decimal places",
    )
    upiId: str = Field(max_length=100, pattern=UPI_ID_PATTERN)


class PaymentResponse(BaseModel):
    transactionId: str
    status: str
    amount: float


class PaymentHistoryItem(BaseModel):
    # from_attributes lets us build directly from SQLAlchemy rows
    model_config = ConfigDict(from_attributes=True)

    # None for rows created before transaction_id existed (e.g. schema.sql seed data)
    transactionId: str | None = None
    amount: float
    status: str
    createdAt: datetime
