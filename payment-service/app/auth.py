"""Keycloak access-token validation.

Every payment API call must carry `Authorization: Bearer <access token>`.
The token's signature is checked against Keycloak's published keys, and
its issuer, audience and expiry are verified. The customer is identified
by the token's `sub` claim - never by anything in the request.
"""

import json
import os
import urllib.request
from functools import lru_cache

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User

OIDC_ISSUER_URI = os.getenv("OIDC_ISSUER_URI", "http://localhost:8081/realms/credpay")
OIDC_AUDIENCE = os.getenv("OIDC_AUDIENCE", "credpay-api")
# Where to fetch the signing keys. Empty = discover them from the issuer.
# Set it when the issuer's public URL is not reachable from inside the
# container, e.g. http://keycloak:8080/realms/credpay/protocol/openid-connect/certs
OIDC_JWKS_URI = os.getenv("OIDC_JWKS_URI", "")

_bearer = HTTPBearer(auto_error=False)


@lru_cache(maxsize=1)
def _jwks_client() -> jwt.PyJWKClient:
    """Finds Keycloak's signing keys once; PyJWKClient caches the keys."""
    jwks_uri = OIDC_JWKS_URI
    if not jwks_uri:
        discovery_url = f"{OIDC_ISSUER_URI}/.well-known/openid-configuration"
        with urllib.request.urlopen(discovery_url, timeout=5) as response:
            jwks_uri = json.load(response)["jwks_uri"]
    return jwt.PyJWKClient(jwks_uri, cache_keys=True)


def _unauthorized(detail: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": "Bearer"},
    )


def token_claims(credentials: HTTPAuthorizationCredentials | None = Depends(_bearer)) -> dict:
    """Validates the bearer token and returns its claims."""
    if credentials is None:
        raise _unauthorized("Sign in to continue")
    try:
        signing_key = _jwks_client().get_signing_key_from_jwt(credentials.credentials)
        return jwt.decode(
            credentials.credentials,
            signing_key.key,
            algorithms=["RS256"],
            audience=OIDC_AUDIENCE,
            issuer=OIDC_ISSUER_URI,
            options={"require": ["exp", "iat", "sub"]},
        )
    except jwt.PyJWTError:
        raise _unauthorized("Your session is invalid or has expired")


def require_role(role: str):
    """Dependency factory: the token must carry the given Keycloak realm role."""

    def check(claims: dict = Depends(token_claims)) -> dict:
        roles = claims.get("realm_access", {}).get("roles", [])
        if role not in roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
        return claims

    return check


def current_customer(
    claims: dict = Depends(require_role("USER")), db: Session = Depends(get_db)
) -> User:
    """The signed-in customer. user-service creates the row on first login
    (GET /api/users/me), which the portal always calls before any payment."""
    user = db.query(User).filter(User.keycloak_id == claims["sub"]).one_or_none()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your CredPay profile is not set up yet. Sign in to the portal first.",
        )
    return user
