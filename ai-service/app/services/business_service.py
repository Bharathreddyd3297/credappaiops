"""Business Health Summary service.

Same pattern as ClusterService, scoped to business/application-level
telemetry (payment success rate, request volume) rather than
infrastructure state.
"""

from __future__ import annotations

from app.clients.openai_client import AzureOpenAIClient
from app.models.schemas import BusinessSummaryResponse
from app.prompt_builder.builder import PromptBuilder, UseCase
from app.services.telemetry_collector import TelemetryCollector


class BusinessService:
    def __init__(
        self,
        collector: TelemetryCollector,
        prompt_builder: PromptBuilder,
        llm: AzureOpenAIClient,
    ):
        self._collector = collector
        self._prompt_builder = prompt_builder
        self._llm = llm

    async def get_business_summary(self) -> BusinessSummaryResponse:
        facts = await self._collector.collect_business_facts()

        success_rate = self._extract_value(facts, "sum(rate(http_requests_total")
        total_requests = self._extract_value(facts, "sum(rate(http_server_requests_seconds_count")

        prompt = self._prompt_builder.build(UseCase.BUSINESS_HEALTH, facts)
        narrative = self._llm.generate(prompt)

        return BusinessSummaryResponse(
            summary=narrative,
            payment_success_rate_percent=success_rate,
            total_requests_last_hour=total_requests,
        )

    @staticmethod
    def _extract_value(facts: list[dict], query_prefix: str) -> float | None:
        for fact in facts:
            query = fact.get("query", "")
            if query.startswith(query_prefix):
                try:
                    return float(fact["value"])
                except (TypeError, ValueError, KeyError):
                    return None
        return None
