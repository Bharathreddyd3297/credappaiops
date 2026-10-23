# CredAI Service - Data Flow

## End-to-end flow (any use case)

```mermaid
flowchart TD
    A["HTTP request<br/>(e.g. POST /api/ai/chat)"] --> B["FastAPI route handler<br/>(app/api/*.py)"]
    B --> C["Service<br/>(app/services/*.py)"]
    C --> D{"Which facts<br/>does this use case need?"}
    D -->|cluster health| E1["PrometheusClient +<br/>KubernetesClient"]
    D -->|business health| E2["PrometheusClient<br/>(business metric queries)"]
    D -->|root cause| E3["KubernetesClient +<br/>PrometheusClient +<br/>LogAnalyticsClient +<br/>AzureMonitorClient<br/>(keyword-selected subset)"]
    E1 --> F["Data Normalizer<br/>(app/utils/normalizer.py)"]
    E2 --> F
    E3 --> F
    F --> G["Normalized facts:<br/>[source] label = value"]
    G --> H["PromptBuilder<br/>(app/prompt_builder/builder.py)"]
    H --> I["Constructed prompt<br/>(system preamble + facts + question)"]
    I --> J["AzureOpenAIClient<br/>(app/clients/openai_client.py)"]
    J --> K["Azure OpenAI<br/>Responses API"]
    K --> L["Natural-language text"]
    L --> M["Response model<br/>(app/models/schemas.py)"]
    M --> N["HTTP response (JSON)"]
```

## Where each dataset is produced and stored (unchanged from before CredAI existed)

```mermaid
flowchart LR
    subgraph Producers
        US["user-service<br/>(Micrometer)"]
        PS["payment-service<br/>(instrumentator)"]
        NE["Node Exporter"]
        CA["cAdvisor"]
        KSM["kube-state-metrics"]
        K8sAPI["Kubernetes API<br/>(live objects, Events)"]
        CI["Container Insights agent"]
    end

    subgraph Storage
        PromTSDB["Prometheus TSDB<br/>(10Gi PVC, 15d)"]
        LAWorkspace["Log Analytics Workspace<br/>(log-credpays1)"]
    end

    US --> PromTSDB
    PS --> PromTSDB
    NE --> PromTSDB
    CA --> PromTSDB
    KSM --> PromTSDB
    CI --> LAWorkspace

    PromTSDB -->|PromQL, read-only| CredAI["CredAI Service<br/>(this microservice)"]
    LAWorkspace -->|KQL, read-only| CredAI
    K8sAPI -->|live read, read-only| CredAI
```

**Key point:** CredAI adds a new arrow *out of* each existing store
(Prometheus TSDB, the Log Analytics Workspace, the Kubernetes API) - it
adds zero new arrows *into* any of them. Nothing about how telemetry is
produced or stored changed when this service was added.

## Chat request flow, with intent classification

```mermaid
flowchart TD
    Q["User question:<br/>'Why is payment-service slow?'"] --> IC["intent_classifier.classify()"]
    IC -->|matches 'why'/'slow'| RC["UseCase.ROOT_CAUSE"]
    RC --> CF["collect_root_cause_facts(symptom)"]
    CF --> KW{"Keyword match<br/>on symptom text"}
    KW -->|'slow'| Lat["Pull p95 latency + node CPU"]
    KW -->|'payment'| Pay["Pull payment error/success rate"]
    Lat --> Combine["Combine + normalize"]
    Pay --> Combine
    Combine --> PB["PromptBuilder.build(ROOT_CAUSE, facts, symptom)"]
    PB --> LLM["AzureOpenAIClient.generate()"]
    LLM --> Resp["ChatResponse{reply, sources, use_case}"]
```
