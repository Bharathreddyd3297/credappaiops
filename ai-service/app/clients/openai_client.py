"""Azure OpenAI client (LLM Connector).

Sends an already-built prompt (see app/prompt_builder/) to the Azure
OpenAI model and returns its raw text response. This is the *only*
module in the service that talks to the LLM - it has no knowledge of
Prometheus, Kubernetes, or Azure Monitor, and never queries telemetry
itself (see architecture: observability/aiops/01-AIOps-Architecture.md,
Chapter 5, "LLM Connector").

Uses the OpenAI Python SDK's Responses API (`client.responses.create`)
against the Azure AI Foundry project endpoint, matching the
`.../openai/v1/responses` endpoint shape this deployment uses - not the
older `chat.completions.create` call, which targets a different
endpoint shape.
"""

from __future__ import annotations

from openai import OpenAI

from app.config.settings import Settings
from app.utils.logging import get_logger

logger = get_logger(__name__)


class OpenAIClientError(Exception):
    """Raised when the LLM cannot be reached or returns an error."""


class AzureOpenAIClient:
    def __init__(self, settings: Settings):
        self._deployment = settings.openai_deployment
        self._configured = bool(settings.openai_endpoint and settings.openai_key and settings.openai_deployment)

        self._client: OpenAI | None = None
        if self._configured:
            # Azure AI Foundry's `/openai/v1` endpoint shape is
            # self-versioning and rejects an `api-version` query param
            # outright ("api-version query parameter is not allowed when
            # using /v1 path") - unlike the older `/openai/deployments/...`
            # shape, which requires it. This client targets the former.
            self._client = OpenAI(
                base_url=settings.openai_endpoint,
                api_key=settings.openai_key,
            )
        else:
            logger.warning("Azure OpenAI is not fully configured; chat responses will be unavailable")

    @property
    def is_configured(self) -> bool:
        return self._configured

    def generate(self, prompt: str, *, max_output_tokens: int = 3500) -> str:
        if not self._configured or self._client is None:
            raise OpenAIClientError(
                "Azure OpenAI is not configured - OPENAI_ENDPOINT/OPENAI_KEY/OPENAI_DEPLOYMENT are required"
            )

        try:
            response = self._client.responses.create(
                model=self._deployment,
                input=prompt,
                max_output_tokens=max_output_tokens,
                # gpt-5-mini is a reasoning model: with the default effort,
                # long/complex prompts (e.g. capacity planning's per-Pod
                # usage-vs-request comparison) can spend the entire
                # max_output_tokens budget on hidden reasoning tokens,
                # leaving nothing for the visible answer. "low" keeps
                # reasoning brief so tokens go to the actual response -
                # appropriate for an ops assistant that needs fast,
                # concise answers, not deep multi-step reasoning.
                reasoning={"effort": "low"},
            )
        except Exception as exc:  # noqa: BLE001 - external API, translate to our own error type
            logger.exception("Azure OpenAI request failed")
            raise OpenAIClientError(f"Azure OpenAI request failed: {exc}") from exc

        text = getattr(response, "output_text", None)
        if text:
            return text.strip()

        # Fallback: walk the structured output if output_text is unavailable
        # for this SDK version.
        try:
            chunks = []
            for item in response.output:
                for content in getattr(item, "content", []):
                    if getattr(content, "type", "") == "output_text":
                        chunks.append(content.text)
            if chunks:
                return "\n".join(chunks).strip()
        except Exception:  # noqa: BLE001 - best-effort fallback only
            pass

        logger.error(
            "Azure OpenAI returned no usable output_text - status=%s incomplete_details=%s",
            getattr(response, "status", None),
            getattr(response, "incomplete_details", None),
        )
        raise OpenAIClientError("Azure OpenAI returned an empty or unrecognized response")

    def is_healthy(self) -> bool:
        return self._configured
