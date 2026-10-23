# CredAI Service - API Documentation

Interactive Swagger UI is always available at `/docs` (ReDoc at
`/redoc`) on the running service - this document is a static
companion, not a replacement.

Base path for every endpoint: `/api/ai`.

---

## GET /api/ai/health

Returns this service's own status plus each dependency's reachability.
Never returns a 5xx - an unreachable dependency is reported as a field
value, not an error.

**Response 200:**
```json
{
  "status": "ok",
  "service": "credai-service",
  "version": "1.0.0",
  "timestamp": "2026-07-15T10:00:00Z",
  "dependencies": [
    { "name": "prometheus", "status": "ok", "detail": null },
    { "name": "kubernetes", "status": "ok", "detail": null },
    { "name": "azure_monitor", "status": "not_configured", "detail": null },
    { "name": "log_analytics", "status": "not_configured", "detail": null },
    { "name": "azure_openai", "status": "ok", "detail": null }
  ]
}
```

`status` is one of `ok`, `degraded`, `unavailable`, `not_configured`.
Overall `status` is `ok` only if Prometheus and Azure OpenAI (the two
mandatory dependencies) are both reachable.

---

## POST /api/ai/chat

The general-purpose conversational endpoint - backs the CredAI chat
page. Classifies intent from free text (see
`app/services/intent_classifier.py`) and routes to the right telemetry
gathering internally; the caller never specifies a use case explicitly.

**Request:**
```json
{
  "message": "How is my cluster?",
  "history": [
    { "role": "user", "content": "Hi" },
    { "role": "assistant", "content": "Hello! Ask me about CredPay's health." }
  ]
}
```
`message`: 1-2000 characters, required. `history`: up to 20 prior turns, optional.

**Response 200:**
```json
{
  "reply": "All CredPay Deployments are currently available...",
  "sources": [
    { "name": "kubernetes", "summary": "6 fact(s)" },
    { "name": "prometheus", "summary": "4 fact(s)" }
  ],
  "use_case": "cluster_health_summary",
  "generated_at": "2026-07-15T10:00:00Z"
}
```

**Response 503:** Azure OpenAI is not configured or unreachable -
`{"detail": "CredAI's language model is currently unavailable"}`.

---

## POST /api/ai/root-cause

Explicit root-cause analysis for a specific reported symptom - backs
the "🧠 Root Cause Analysis" quick action.

**Request:**
```json
{ "symptom": "payment-service is returning errors" }
```

**Response 200:**
```json
{
  "symptom": "payment-service is returning errors",
  "analysis": "The evidence points to elevated error rates on /api/payment/pay...",
  "evidence": [
    { "name": "kubernetes", "summary": "3 fact(s)" },
    { "name": "prometheus", "summary": "2 fact(s)" }
  ],
  "generated_at": "2026-07-15T10:00:00Z"
}
```

---

## GET /api/ai/prometheus

Raw PromQL passthrough - no LLM involved. Useful for verifying exactly
what CredAI can see, independent of any AI reasoning.

**Query parameters:** `query` (required) - any valid PromQL expression.

**Example:** `GET /api/ai/prometheus?query=up`

**Response 200:**
```json
{
  "query": "up",
  "result_type": "vector",
  "series": [
    { "metric": { "label": "job=prometheus" }, "value": 1.0, "values": null }
  ],
  "queried_at": "2026-07-15T10:00:00Z"
}
```

**Response 502:** Prometheus is unreachable or returned an error.

---

## GET /api/ai/kubernetes

Raw cluster state passthrough - no LLM involved.

**Response 200:**
```json
{
  "namespace": "credpay",
  "pods": [
    { "name": "user-service-abc123", "namespace": "credpay", "phase": "Running", "restarts": 0, "node": "aks-...", "ready": true }
  ],
  "deployments": [
    { "name": "user-service", "namespace": "credpay", "desired_replicas": 2, "available_replicas": 2, "ready": true }
  ],
  "recent_events": [],
  "queried_at": "2026-07-15T10:00:00Z"
}
```

If the Kubernetes client is not configured (e.g. running outside a
cluster), `pods`/`deployments`/`recent_events` are all empty arrays,
not an error.

---

## GET /api/ai/cluster-summary

AI-generated cluster health narrative - backs the "🏥 Cluster Health"
quick action.

**Response 200:**
```json
{
  "summary": "All Deployments are fully available. No unhealthy pods...",
  "healthy": true,
  "pod_count": 8,
  "unhealthy_pod_count": 0,
  "deployment_count": 4,
  "generated_at": "2026-07-15T10:00:00Z"
}
```

---

## GET /api/ai/business-summary

AI-generated business health narrative - backs the "💳 Payment Summary"
and "📊 Business Metrics" quick actions.

**Response 200:**
```json
{
  "summary": "98.5% of payment attempts succeeded in the last hour...",
  "payment_success_rate_percent": 98.5,
  "total_requests_last_hour": 142.0,
  "generated_at": "2026-07-15T10:00:00Z"
}
```

---

## Environment Variables

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `OPENAI_ENDPOINT` | Yes | - | Azure OpenAI / AI Foundry project endpoint (`.../openai/v1/responses`) |
| `OPENAI_KEY` | Yes | - | Azure OpenAI API key |
| `OPENAI_DEPLOYMENT` | Yes | - | Model deployment name |
| `OPENAI_API_VERSION` | No | `2025-08-07` | API version |
| `PROMETHEUS_URL` | No | `http://prometheus.monitoring.svc.cluster.local:9090` | In-cluster Prometheus Service DNS name |
| `PROMETHEUS_TIMEOUT_SECONDS` | No | `10.0` | HTTP timeout for Prometheus queries |
| `KUBERNETES_NAMESPACE` | No | `credpay` | Namespace whose Pods/Deployments/Events are read |
| `KUBERNETES_MONITORING_NAMESPACE` | No | `monitoring` | Reserved for future use (Prometheus/Grafana namespace) |
| `AZURE_TENANT_ID` | No | - | Service Principal tenant ID (enables Azure Monitor/Log Analytics) |
| `AZURE_CLIENT_ID` | No | - | Service Principal client ID |
| `AZURE_CLIENT_SECRET` | No | - | Service Principal client secret |
| `AZURE_SUBSCRIPTION_ID` | No | - | Subscription ID (for Resource Health lookups) |
| `LOG_ANALYTICS_WORKSPACE_ID` | No | - | Workspace customer ID (`log-credpays1`'s GUID) |
| `AKS_RESOURCE_ID` | No | - | Full ARM resource ID of the AKS cluster (for Azure Metrics/Resource Health) |
| `CORS_ALLOW_ORIGINS` | No | `*` | Comma-separated origins, or `*` |
| `LOG_LEVEL` | No | `INFO` | `DEBUG`/`INFO`/`WARNING`/`ERROR` |

`AZURE_TENANT_ID`/`AZURE_CLIENT_ID`/`AZURE_CLIENT_SECRET` are a **new**,
dedicated Service Principal - not the AKS cluster's own managed
identity and not the Azure DevOps pipeline's service connection. See
`k8s/ai-service/README.md` for how to create one out-of-band (never
committed to git).

## Error handling conventions

- Every route catches the specific exception its dependencies can
  raise (`PrometheusClientError`, `OpenAIClientError`) and translates
  it to an appropriate HTTP status (`502`, `503`).
- Any *unexpected* exception is caught by the global handler in
  `app/main.py` and returns a generic `500` with no stack trace exposed
  to the caller - full details are logged server-side only.
- Optional dependencies (Kubernetes, Azure Monitor, Log Analytics)
  never raise from a route at all - they return empty results, so a
  missing optional credential never breaks an endpoint that doesn't
  strictly need it.
