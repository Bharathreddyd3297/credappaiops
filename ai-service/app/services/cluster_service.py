"""Cluster Health Summary service.

Gathers cluster telemetry via the Telemetry Collector, asks the LLM
for a plain-language narrative, and also derives a few structured
fields directly from the facts (pod/deployment counts) for callers
that want numbers, not just prose.
"""

from __future__ import annotations

from app.clients.openai_client import AzureOpenAIClient
from app.models.schemas import ClusterSummaryResponse
from app.prompt_builder.builder import PromptBuilder, UseCase
from app.services.telemetry_collector import TelemetryCollector


class ClusterService:
    def __init__(
        self,
        collector: TelemetryCollector,
        prompt_builder: PromptBuilder,
        llm: AzureOpenAIClient,
    ):
        self._collector = collector
        self._prompt_builder = prompt_builder
        self._llm = llm

    async def get_cluster_summary(self) -> ClusterSummaryResponse:
        facts = await self._collector.collect_cluster_facts()

        pod_facts = [f for f in facts if f.get("type") == "pod"]
        deployment_facts = [f for f in facts if f.get("type") == "deployment"]
        unhealthy_pods = [f for f in pod_facts if not f.get("ready", True)]

        prompt = self._prompt_builder.build(UseCase.CLUSTER_HEALTH, facts)
        narrative = self._llm.generate(prompt)

        return ClusterSummaryResponse(
            summary=narrative,
            healthy=len(unhealthy_pods) == 0,
            pod_count=len(pod_facts),
            unhealthy_pod_count=len(unhealthy_pods),
            deployment_count=len(deployment_facts),
        )
