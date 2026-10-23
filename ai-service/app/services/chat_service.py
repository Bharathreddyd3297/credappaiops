"""Chat service - the orchestrator behind POST /api/ai/chat.

For a free-text question, this is the only service that: (1) classifies
intent, (2) asks the Telemetry Collector for the right facts, (3) asks
the Prompt Builder to assemble a prompt, and (4) asks the LLM Connector
for a response. Every other service (cluster/business/root-cause) does
the same four steps for a *fixed* use case - this one does it for
whatever the user actually asked.
"""

from __future__ import annotations

from app.clients.openai_client import AzureOpenAIClient
from app.models.schemas import ChatMessage, ChatResponse, ChatSource
from app.prompt_builder.builder import PromptBuilder, UseCase
from app.services.intent_classifier import classify
from app.services.telemetry_collector import TelemetryCollector


class ChatService:
    def __init__(
        self,
        collector: TelemetryCollector,
        prompt_builder: PromptBuilder,
        llm: AzureOpenAIClient,
    ):
        self._collector = collector
        self._prompt_builder = prompt_builder
        self._llm = llm

    async def ask(self, message: str, history: list[ChatMessage]) -> ChatResponse:
        use_case = classify(message)
        facts = await self._gather_facts(use_case, message)

        history_dicts = [{"role": turn.role, "content": turn.content} for turn in history]

        if use_case == UseCase.ROOT_CAUSE:
            prompt = self._prompt_builder.build(use_case, facts, symptom=message)
        else:
            prompt = self._prompt_builder.build(
                UseCase.GENERAL_CHAT if use_case == UseCase.GENERAL_CHAT else use_case,
                facts,
                question=message,
                history=history_dicts,
            )

        reply = self._llm.generate(prompt)

        sources = self._summarize_sources(facts)
        return ChatResponse(reply=reply, sources=sources, use_case=use_case.value)

    async def _gather_facts(self, use_case: UseCase, message: str) -> list[dict]:
        if use_case == UseCase.CLUSTER_HEALTH:
            return await self._collector.collect_cluster_facts()
        if use_case == UseCase.BUSINESS_HEALTH:
            return await self._collector.collect_business_facts()
        if use_case == UseCase.CAPACITY:
            return await self._collector.collect_capacity_facts()
        if use_case == UseCase.DEPLOYMENT_ANALYSIS:
            return await self._collector.collect_deployment_facts()
        if use_case == UseCase.DAILY_OPS:
            return await self._collector.collect_daily_ops_facts()
        if use_case == UseCase.ROOT_CAUSE:
            return await self._collector.collect_root_cause_facts(message)

        # GENERAL_CHAT - no specific use case matched; give the LLM a
        # broad, cheap snapshot rather than nothing.
        return await self._collector.collect_cluster_facts()

    @staticmethod
    def _summarize_sources(facts: list[dict]) -> list[ChatSource]:
        counts: dict[str, int] = {}
        for fact in facts:
            source = fact.get("source", "unknown")
            counts[source] = counts.get(source, 0) + 1
        return [ChatSource(name=source, summary=f"{count} fact(s)") for source, count in counts.items()]
