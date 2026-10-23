# CredAI Service - Folder Structure

```
ai-service/
├── app/
│   ├── main.py                  # FastAPI app, lifespan (dependency wiring), CORS, global error handler
│   ├── api/
│   │   ├── __init__.py          # Combines every route module into one /api/ai router
│   │   ├── deps.py              # FastAPI Depends() providers - read from app.state
│   │   ├── health.py            # GET /health
│   │   ├── chat.py               # POST /chat, POST /root-cause
│   │   ├── telemetry.py          # GET /prometheus, GET /kubernetes
│   │   └── summary.py            # GET /cluster-summary, GET /business-summary
│   ├── clients/
│   │   ├── prometheus_client.py  # PromQL over HTTP (httpx) - includes the PromQL named-query catalog
│   │   ├── kubernetes_client.py  # In-cluster Kubernetes API reads (pods, deployments, events)
│   │   ├── azure_monitor_client.py  # Azure Metrics + Resource Health (optional)
│   │   ├── log_analytics_client.py  # KQL over the existing Log Analytics workspace (optional)
│   │   └── openai_client.py      # Azure OpenAI Responses API connector
│   ├── services/
│   │   ├── telemetry_collector.py   # Owns all 4 telemetry clients; "gather facts for this use case" methods
│   │   ├── intent_classifier.py     # Keyword-based question → UseCase mapping
│   │   ├── chat_service.py          # POST /chat orchestration
│   │   ├── cluster_service.py       # GET /cluster-summary orchestration
│   │   ├── business_service.py      # GET /business-summary orchestration
│   │   └── root_cause_service.py    # POST /root-cause orchestration
│   ├── prompt_builder/
│   │   ├── builder.py             # PromptBuilder class + UseCase enum
│   │   └── templates.py           # One prompt template per use case + shared system preamble
│   ├── models/
│   │   └── schemas.py             # Every request/response Pydantic model
│   ├── config/
│   │   └── settings.py            # Pydantic BaseSettings - the only place env vars are read
│   └── utils/
│       ├── logging.py             # configure_logging() - one call at startup
│       └── normalizer.py          # Raw client responses → normalized "[source] label = value" facts
├── docs/                          # This folder
├── Dockerfile
├── .dockerignore
├── requirements.txt
└── README.md
```

## Why this structure

Mirrors the layering already described in `Architecture.md`: a request
enters through `api/`, is orchestrated by exactly one `services/`
module, which asks `services/telemetry_collector.py` for facts (which
in turn delegates to `clients/`), hands those facts to
`prompt_builder/`, and gets a response from the OpenAI client in
`clients/`. Each folder maps to exactly one layer - there is no folder
that mixes, say, HTTP routing with a Prometheus query.

`config/` and `utils/` are cross-cutting (used by every layer) and
therefore sit outside the request-processing chain entirely - neither
imports from `api/`, `services/`, `clients/`, or `prompt_builder/`.
