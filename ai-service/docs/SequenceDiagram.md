# CredAI Service - Sequence Diagrams

One diagram per endpoint, matching the actual code in `app/api/` and
`app/services/` exactly.

## POST /api/ai/chat

```mermaid
sequenceDiagram
    participant Client
    participant Route as api/chat.py
    participant Chat as ChatService
    participant IC as intent_classifier
    participant Col as TelemetryCollector
    participant PB as PromptBuilder
    participant LLM as AzureOpenAIClient

    Client->>Route: POST /api/ai/chat {message, history}
    Route->>Chat: ask(message, history)
    Chat->>IC: classify(message)
    IC-->>Chat: UseCase
    Chat->>Col: collect_*_facts() (per UseCase)
    Col-->>Chat: normalized facts
    Chat->>PB: build(use_case, facts, question, history)
    PB-->>Chat: prompt text
    Chat->>LLM: generate(prompt)
    LLM-->>Chat: reply text
    Chat-->>Route: ChatResponse
    Route-->>Client: 200 {reply, sources, use_case}
```

## POST /api/ai/root-cause

```mermaid
sequenceDiagram
    participant Client
    participant Route as api/chat.py
    participant RCA as RootCauseService
    participant Col as TelemetryCollector
    participant PB as PromptBuilder
    participant LLM as AzureOpenAIClient

    Client->>Route: POST /api/ai/root-cause {symptom}
    Route->>RCA: analyze(symptom)
    RCA->>Col: collect_root_cause_facts(symptom)
    Col-->>RCA: keyword-correlated facts
    RCA->>PB: build(ROOT_CAUSE, facts, symptom)
    PB-->>RCA: prompt text
    RCA->>LLM: generate(prompt)
    LLM-->>RCA: analysis text
    RCA-->>Route: RootCauseResponse
    Route-->>Client: 200 {symptom, analysis, evidence}
```

## GET /api/ai/cluster-summary

```mermaid
sequenceDiagram
    participant Client
    participant Route as api/summary.py
    participant Cluster as ClusterService
    participant Col as TelemetryCollector
    participant K8s as KubernetesClient
    participant Prom as PrometheusClient
    participant PB as PromptBuilder
    participant LLM as AzureOpenAIClient

    Client->>Route: GET /api/ai/cluster-summary
    Route->>Cluster: get_cluster_summary()
    Cluster->>Col: collect_cluster_facts()
    Col->>K8s: list_pods / list_deployments / list_recent_events
    Col->>Prom: query(restarts, availability, node CPU/memory)
    K8s-->>Col: pod/deployment/event data
    Prom-->>Col: metric data
    Col-->>Cluster: normalized facts
    Cluster->>PB: build(CLUSTER_HEALTH, facts)
    PB-->>Cluster: prompt text
    Cluster->>LLM: generate(prompt)
    LLM-->>Cluster: narrative
    Cluster-->>Route: ClusterSummaryResponse
    Route-->>Client: 200 {summary, healthy, pod_count, ...}
```

## GET /api/ai/business-summary

```mermaid
sequenceDiagram
    participant Client
    participant Route as api/summary.py
    participant Biz as BusinessService
    participant Col as TelemetryCollector
    participant Prom as PrometheusClient
    participant PB as PromptBuilder
    participant LLM as AzureOpenAIClient

    Client->>Route: GET /api/ai/business-summary
    Route->>Biz: get_business_summary()
    Biz->>Col: collect_business_facts()
    Col->>Prom: query(success rate, error rate, request volume, latency)
    Prom-->>Col: metric data
    Col-->>Biz: normalized facts
    Biz->>PB: build(BUSINESS_HEALTH, facts)
    PB-->>Biz: prompt text
    Biz->>LLM: generate(prompt)
    LLM-->>Biz: narrative
    Biz-->>Route: BusinessSummaryResponse
    Route-->>Client: 200 {summary, payment_success_rate_percent, ...}
```

## GET /api/ai/prometheus and GET /api/ai/kubernetes (no LLM involved)

```mermaid
sequenceDiagram
    participant Client
    participant Route as api/telemetry.py
    participant Col as TelemetryCollector
    participant Prom as PrometheusClient
    participant K8s as KubernetesClient

    alt GET /api/ai/prometheus?query=...
        Client->>Route: GET /api/ai/prometheus?query=up
        Route->>Col: prometheus.query(query)
        Col->>Prom: query(query)
        Prom-->>Col: normalized series
        Col-->>Route: series
        Route-->>Client: 200 PrometheusQueryResponse
    else GET /api/ai/kubernetes
        Client->>Route: GET /api/ai/kubernetes
        Route->>Col: kubernetes.list_pods/list_deployments/list_recent_events
        Col->>K8s: (same calls)
        K8s-->>Col: raw objects
        Col-->>Route: pod/deployment/event summaries
        Route-->>Client: 200 KubernetesStateResponse
    end
```

## GET /api/ai/health

```mermaid
sequenceDiagram
    participant Client
    participant Route as api/health.py
    participant Col as TelemetryCollector
    participant Prom as PrometheusClient
    participant K8s as KubernetesClient
    participant AzMon as AzureMonitorClient
    participant LogAn as LogAnalyticsClient
    participant LLM as AzureOpenAIClient

    Client->>Route: GET /api/ai/health
    Route->>Prom: is_healthy()
    Route->>K8s: is_healthy() / is_configured
    Route->>AzMon: is_healthy()
    Route->>LogAn: is_healthy()
    Route->>LLM: is_healthy()
    Note over Route: Overall status = OK only if<br/>Prometheus AND Azure OpenAI are both reachable -<br/>the other three are optional-by-design
    Route-->>Client: 200 HealthResponse {status, dependencies[]}
```
