"""Admin payment APIs are for the ADMIN role only."""

import pytest
from fastapi.testclient import TestClient

from app.auth import token_claims
from app.main import app


@pytest.fixture
def client():
    yield TestClient(app)
    app.dependency_overrides.clear()


def signed_in_as(*roles):
    app.dependency_overrides[token_claims] = lambda: {
        "sub": "test-user",
        "realm_access": {"roles": list(roles)},
    }


@pytest.mark.parametrize("path", ["/api/admin/payments", "/api/admin/payments/summary"])
def test_requires_a_token(client, path):
    assert client.get(path).status_code == 401


@pytest.mark.parametrize("path", ["/api/admin/payments", "/api/admin/payments/summary"])
def test_rejects_customers(client, path):
    signed_in_as("USER")
    assert client.get(path).status_code == 403


def test_rejects_unknown_status_filter(client):
    signed_in_as("ADMIN")
    assert client.get("/api/admin/payments?status=STOLEN").status_code == 422


def test_limits_page_size(client):
    signed_in_as("ADMIN")
    assert client.get("/api/admin/payments?size=1000").status_code == 422
