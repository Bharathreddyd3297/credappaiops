# CredAI Service

The AI Operations Assistant backend for CredPay - a FastAPI
microservice that reasons over telemetry already collected by
Prometheus, Kubernetes, and Azure Monitor to answer operational
questions in plain language.

This service **adds** to CredPay; it does not modify any existing
service, Deployment, or pipeline. See `docs/Architecture.md` for the
full design.

## What CredAI is not

- Not a dashboard. Grafana already exists for that (`observability/grafana/`).
- Not a replacement for Prometheus/Kubernetes/Azure Monitor - it only
  *reads* from all three; none of them changed.
- Not a chatbot with general knowledge - every answer is grounded in
  CredPay's own telemetry, or the model says so.

## Quick start (local development)

```bash
cd ai-service
python -m venv .venv
.venv/Scripts/activate   # Windows; use `source .venv/bin/activate` on Linux/macOS
pip install -r requirements.txt

# Minimum required environment variables (see docs/API-Documentation.md
# "Environment Variables" for the full list):
export OPENAI_ENDPOINT="https://your-resource.services.ai.azure.com/api/projects/your-project/openai/v1/responses"
export OPENAI_KEY="your-key"
export OPENAI_DEPLOYMENT="your-deployment-name"
export OPENAI_API_VERSION="2025-08-07"

uvicorn app.main:app --reload --port 8010
```

Then open `http://localhost:8010/docs` for interactive Swagger UI.

Outside a cluster, the Kubernetes, Azure Monitor, and Log Analytics
clients disable themselves automatically (see `docs/Architecture.md`,
"Graceful degradation") - only Prometheus (if reachable) and Azure
OpenAI are required for local development.

## Running against the real cluster

Prometheus is only reachable at `prometheus.monitoring.svc.cluster.local:9090`
*from inside* the AKS cluster. For local development against real data,
port-forward it first:

```bash
kubectl port-forward -n monitoring svc/prometheus 9090:9090
```

Then set `PROMETHEUS_URL=http://localhost:9090` before starting Uvicorn.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/ai/health` | Service + dependency health |
| POST | `/api/ai/chat` | Free-text question → AI answer |
| POST | `/api/ai/root-cause` | Symptom description → root-cause analysis |
| GET | `/api/ai/prometheus` | Raw PromQL passthrough (debugging) |
| GET | `/api/ai/kubernetes` | Raw cluster state passthrough (debugging) |
| GET | `/api/ai/cluster-summary` | AI-generated cluster health summary |
| GET | `/api/ai/business-summary` | AI-generated business health summary |

Full request/response schemas: `docs/API-Documentation.md`.

## Documentation

| Doc | Covers |
|---|---|
| `docs/Architecture.md` | Component design, Mermaid diagrams, graceful degradation |
| `docs/FolderStructure.md` | Every file, what it's responsible for |
| `docs/DataFlow.md` | How a request moves through the system |
| `docs/SequenceDiagram.md` | Per-endpoint sequence diagrams |
| `docs/API-Documentation.md` | Full API reference, environment variables, error responses |

Kubernetes deployment: `k8s/ai-service/README.md`. The CredAI page was removed from the customer portal; AIOps will be
surfaced in the admin portal once the platform runs on Kubernetes.
