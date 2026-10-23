"""Payment API security and validation rules (no database or Keycloak needed)."""

from decimal import Decimal
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.auth import current_customer
from app.database import get_db
from app.main import app
from app.schemas import PaymentRequest
from app.services import _replay


@pytest.fixture
def client():
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_history_requires_a_token(client):
    response = client.get("/api/payment/history")
    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"


def test_pay_requires_a_token(client):
    response = client.post(
        "/api/payment/pay",
        json={"cardId": 1, "amount": 10, "upiId": "asha@okhdfcbank"},
        headers={"Idempotency-Key": "key-0001-abcd"},
    )
    assert response.status_code == 401


def test_rejects_a_forged_token(client):
    response = client.get(
        "/api/payment/history", headers={"Authorization": "Bearer not.a.jwt"}
    )
    assert response.status_code == 401


def test_pay_requires_an_idempotency_key(client):
    app.dependency_overrides[current_customer] = lambda: SimpleNamespace(id=1)
    app.dependency_overrides[get_db] = lambda: None
    response = client.post(
        "/api/payment/pay", json={"cardId": 1, "amount": 10, "upiId": "asha@okhdfcbank"}
    )
    assert response.status_code == 422


@pytest.mark.parametrize(
    "body",
    [
        {"cardId": 1, "amount": 0, "upiId": "asha@okhdfcbank"},  # not positive
        {"cardId": 1, "amount": "10.555", "upiId": "asha@okhdfcbank"},  # 3 decimals
        {"cardId": 1, "amount": 500001, "upiId": "asha@okhdfcbank"},  # over the limit
        {"cardId": 1, "amount": 10, "upiId": "not-a-upi-id"},  # no @bank
        {"cardId": 0, "amount": 10, "upiId": "asha@okhdfcbank"},  # bad card id
    ],
)
def test_rejects_invalid_payment_requests(body):
    with pytest.raises(ValidationError):
        PaymentRequest(**body)


def test_accepts_a_valid_payment_request():
    request = PaymentRequest(cardId=1, amount="2500.50", upiId="asha.v@okhdfcbank")
    assert request.amount == Decimal("2500.50")


def test_replay_returns_the_original_payment():
    existing = SimpleNamespace(
        card_id=1, amount=Decimal("2500.00"), upi_id="asha@okhdfcbank",
        transaction_id="TXN20261022000001", status="SUCCESS",
    )
    request = PaymentRequest(cardId=1, amount=2500, upiId="asha@okhdfcbank")
    assert _replay(existing, request).transactionId == "TXN20261022000001"


def test_replay_refuses_a_different_payment_with_the_same_key():
    existing = SimpleNamespace(
        card_id=1, amount=Decimal("2500.00"), upi_id="asha@okhdfcbank",
        transaction_id="TXN20261022000001", status="SUCCESS",
    )
    request = PaymentRequest(cardId=1, amount=999, upiId="asha@okhdfcbank")
    with pytest.raises(HTTPException) as error:
        _replay(existing, request)
    assert error.value.status_code == 422
