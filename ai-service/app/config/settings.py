"""Centralized configuration for the CredAI service.

All values are sourced from environment variables (see the Kubernetes
ConfigMap/Secret at k8s/ai-service/). Nothing here is hardcoded -
every credential arrives via the environment, never a committed file.
"""

from functools import lru_cache

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # --- Service identity ---
    service_name: str = Field(default="credai-service")
    environment: str = Field(default="production")
    log_level: str = Field(default="INFO")

    # --- Azure OpenAI (required) ---
    openai_endpoint: str = Field(default="", alias="OPENAI_ENDPOINT")
    openai_key: str = Field(default="", alias="OPENAI_KEY")
    openai_deployment: str = Field(default="", alias="OPENAI_DEPLOYMENT")
    openai_api_version: str = Field(default="2025-08-07", alias="OPENAI_API_VERSION")

    @field_validator("openai_endpoint")
    @classmethod
    def _strip_responses_suffix(cls, value: str) -> str:
        """Accept either the API root or the full `.../responses` URL.

        The OpenAI SDK's `responses.create()` appends `/responses` to
        `base_url` itself, so a pasted endpoint that already ends in
        `/responses` (the shape Azure AI Foundry shows in its portal)
        would otherwise double up to `.../responses/responses`.
        """
        return value.rstrip("/").removesuffix("/responses")

    # --- Prometheus (already running in-cluster, no auth) ---
    prometheus_url: str = Field(
        default="http://prometheus.monitoring.svc.cluster.local:9090",
        alias="PROMETHEUS_URL",
    )
    prometheus_timeout_seconds: float = Field(default=10.0, alias="PROMETHEUS_TIMEOUT_SECONDS")

    # --- Kubernetes (in-cluster ServiceAccount token, no extra config needed) ---
    kubernetes_namespace: str = Field(default="credpay", alias="KUBERNETES_NAMESPACE")
    kubernetes_monitoring_namespace: str = Field(default="monitoring", alias="KUBERNETES_MONITORING_NAMESPACE")

    # --- Azure Monitor / Log Analytics (optional - see README "Azure clients" note) ---
    azure_tenant_id: str = Field(default="", alias="AZURE_TENANT_ID")
    azure_client_id: str = Field(default="", alias="AZURE_CLIENT_ID")
    azure_client_secret: str = Field(default="", alias="AZURE_CLIENT_SECRET")
    azure_subscription_id: str = Field(default="", alias="AZURE_SUBSCRIPTION_ID")
    log_analytics_workspace_id: str = Field(default="", alias="LOG_ANALYTICS_WORKSPACE_ID")
    aks_resource_id: str = Field(default="", alias="AKS_RESOURCE_ID")

    # --- CORS (frontend is served behind the same Ingress, but allow override for local dev) ---
    cors_allow_origins: str = Field(default="*", alias="CORS_ALLOW_ORIGINS")

    @property
    def azure_credentials_configured(self) -> bool:
        """True only if a full Service Principal credential set is present.

        Azure Monitor/Log Analytics access is optional - the service
        degrades gracefully (see AzureMonitorClient/LogAnalyticsClient)
        rather than failing to start when these are absent.
        """
        return bool(self.azure_tenant_id and self.azure_client_id and self.azure_client_secret)

    @property
    def cors_origin_list(self) -> list[str]:
        if self.cors_allow_origins == "*":
            return ["*"]
        return [origin.strip() for origin in self.cors_allow_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    """Settings are read once per process and cached - env vars don't
    change at runtime inside a container."""
    return Settings()
