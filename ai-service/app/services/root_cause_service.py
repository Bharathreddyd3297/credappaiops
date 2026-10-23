"""Root Cause Analysis service.

Given a short, free-text symptom description, gathers exactly the
telemetry sources the Data Contract's Correlation Matrix (Chapter 6)
identifies as relevant to that kind of symptom, then asks the LLM to
explain the most likely cause using only that evidence.
"""

from __future__ import annotations

from app.clients.openai_client import AzureOpenAIClient
from app.models.schemas import ChatSource, RootCauseResponse
from app.prompt_builder.builder import PromptBuilder, UseCase
from app.services.telemetry_collector import TelemetryCollector


class RootCauseService:
    def __init__(
        self,
        collector: TelemetryCollector,
        prompt_builder: PromptBuilder,
        llm: AzureOpenAIClient,
    ):
        self._collector = collector
        self._prompt_builder = prompt_builder
        self._llm = llm

    async def analyze(self, symptom: str) -> RootCauseResponse:
        facts = await self._collector.collect_root_cause_facts(symptom)

        prompt = self._prompt_builder.build(UseCase.ROOT_CAUSE, facts, symptom=symptom)
        narrative = self._llm.generate(prompt)

        sources_seen: set[str] = set()
        evidence: list[ChatSource] = []
        for fact in facts:
            source = fact.get("source", "unknown")
            if source not in sources_seen:
                sources_seen.add(source)
                evidence.append(ChatSource(name=source, summary=f"{len(facts)} related fact(s) gathered"))

        return RootCauseResponse(symptom=symptom, analysis=narrative, evidence=evidence)
