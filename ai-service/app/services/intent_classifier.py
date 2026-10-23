"""Intent classification for free-text chat questions.

Deliberately a small, transparent, keyword-based classifier for this
first version - not an ML model. It is easy to audit, easy to extend,
and its failure mode is graceful (falls through to GENERAL_CHAT with a
broad telemetry snapshot rather than refusing to answer). See
observability/aiops/01-AIOps-Architecture.md, Chapter 9, "Future
Expansion" for why a more sophisticated classifier is explicitly out of
scope for v1.
"""

from __future__ import annotations

from app.prompt_builder.builder import UseCase

_ROOT_CAUSE_KEYWORDS = ("why", "root cause", "slow", "latency issue", "azure healthy", "is azure")
_DEPLOYMENT_KEYWORDS = ("deployment", "rollout", "latest release")
_CAPACITY_KEYWORDS = (
    "highest cpu",
    "bottleneck",
    "capacity",
    "over-provisioned",
    "under-provisioned",
    "consumes the highest",
    "resource bottleneck",
)
_BUSINESS_KEYWORDS = ("payment", "business metric", "transaction", "revenue", "login attempt", "successful payments")
_DAILY_OPS_PHRASES = (
    ("daily", "summary"),
    ("today", "summary"),
    ("daily", "report"),
    ("today", "report"),
)
_CLUSTER_KEYWORDS = ("cluster", "pod", "node", "unhealthy", "restart", "scheduling")


def classify(question: str) -> UseCase:
    text = question.lower()

    if any(keyword in text for keyword in _ROOT_CAUSE_KEYWORDS):
        return UseCase.ROOT_CAUSE

    if any(keyword in text for keyword in _DEPLOYMENT_KEYWORDS):
        return UseCase.DEPLOYMENT_ANALYSIS

    if any(keyword in text for keyword in _CAPACITY_KEYWORDS):
        return UseCase.CAPACITY

    if any(keyword in text for keyword in _BUSINESS_KEYWORDS):
        return UseCase.BUSINESS_HEALTH

    if any(all(word in text for word in phrase) for phrase in _DAILY_OPS_PHRASES):
        return UseCase.DAILY_OPS

    if any(keyword in text for keyword in _CLUSTER_KEYWORDS):
        return UseCase.CLUSTER_HEALTH

    return UseCase.GENERAL_CHAT
