"""Prompt Builder.

Single responsibility: turn already-collected, already-normalized
telemetry facts into the one text prompt sent to the LLM. This module
never queries Prometheus, Kubernetes, or Azure itself - it only
assembles what the services layer already gathered (see
observability/aiops/01-AIOps-Architecture.md, Chapter 5, "Prompt
Builder").
"""

from __future__ import annotations

from enum import Enum
from typing import Any

from app.prompt_builder import templates
from app.utils.normalizer import facts_to_prompt_lines


class UseCase(str, Enum):
    GENERAL_CHAT = "general_chat"
    CLUSTER_HEALTH = "cluster_health_summary"
    BUSINESS_HEALTH = "business_health_summary"
    ROOT_CAUSE = "root_cause_analysis"
    CAPACITY = "capacity_recommendations"
    DAILY_OPS = "daily_operations_summary"
    DEPLOYMENT_ANALYSIS = "deployment_analysis"


_TEMPLATE_BY_USE_CASE: dict[UseCase, str] = {
    UseCase.GENERAL_CHAT: templates.GENERAL_CHAT_TEMPLATE,
    UseCase.CLUSTER_HEALTH: templates.CLUSTER_HEALTH_TEMPLATE,
    UseCase.BUSINESS_HEALTH: templates.BUSINESS_HEALTH_TEMPLATE,
    UseCase.ROOT_CAUSE: templates.ROOT_CAUSE_TEMPLATE,
    UseCase.CAPACITY: templates.CAPACITY_TEMPLATE,
    UseCase.DAILY_OPS: templates.DAILY_OPS_TEMPLATE,
    UseCase.DEPLOYMENT_ANALYSIS: templates.DEPLOYMENT_ANALYSIS_TEMPLATE,
}

_MAX_FACT_LINES = 200  # keeps the prompt bounded regardless of how much telemetry was gathered


class PromptBuilder:
    """Builds one enterprise prompt from normalized telemetry facts.

    The LLM never sees which client (Prometheus, Kubernetes, Azure
    Monitor, Log Analytics) produced any given fact - only the
    normalized "[source] label = value" lines below.
    """

    def build(
        self,
        use_case: UseCase,
        facts: list[dict[str, Any]],
        *,
        question: str | None = None,
        symptom: str | None = None,
        history: list[dict[str, str]] | None = None,
    ) -> str:
        template = _TEMPLATE_BY_USE_CASE[use_case]
        telemetry_text = self._render_telemetry(facts)

        if use_case == UseCase.GENERAL_CHAT:
            return template.format(
                system_preamble=templates.SYSTEM_PREAMBLE,
                telemetry=telemetry_text,
                history=self._render_history(history or []),
                question=question or "",
            )

        if use_case == UseCase.ROOT_CAUSE:
            return template.format(
                system_preamble=templates.SYSTEM_PREAMBLE,
                symptom=symptom or "(no symptom description provided)",
                telemetry=telemetry_text,
            )

        return template.format(system_preamble=templates.SYSTEM_PREAMBLE, telemetry=telemetry_text)

    @staticmethod
    def _render_telemetry(facts: list[dict[str, Any]]) -> str:
        if not facts:
            return "(no telemetry was available for this request)"
        lines = facts_to_prompt_lines(facts)[:_MAX_FACT_LINES]
        return "\n".join(lines)

    @staticmethod
    def _render_history(history: list[dict[str, str]]) -> str:
        if not history:
            return "(no prior messages)"
        lines = [f"{turn.get('role', 'user')}: {turn.get('content', '')}" for turn in history]
        return "\n".join(lines)
