# CredPay Observability Data Contract

**Document type:** Design reference (data contract), not an
implementation guide.

**Status:** Descriptive only. This document records the observability
platform exactly as it exists today. It contains no recommendations,
no proposed improvements, and no AIOps implementation. It is the
reference future AIOps design work is built against, not a design of
that work itself.

---

# Chapter 1 - Purpose

## Why this document exists

CredPay's observability platform was built in discrete phases:
Prometheus, Node Exporter, kube-state-metrics, cAdvisor, Grafana,
Application Metrics, and an assessment of Azure Monitor/Log Analytics
(Cloud Monitoring). Each phase has its own documentation, written at the
time that phase was built (`observability/OBSERVABILITY-STATUS.md`,
`observability/prometheus/`, `observability/grafana/`,
`observability/application-metrics/`,
`observability/cloud-monitoring/01-Azure-Cloud-Monitoring-Assessment.md`).

That documentation is organized by *how the platform was built* -
phase by phase, technology by technology. This document is organized
differently: by *what data actually exists*, independent of which
phase produced it. It exists because the next phase of this project -
an AIOps layer - is a *consumer* of observability data, and a consumer
needs a single, authoritative answer to four questions:

1. **What data exists?**
2. **Where does it come from?**
3. **How is it queried?**
4. **How can AI consume it?**

No prior document in this project answers all four questions for every
data source in one place. This one does.

## Why AIOps cannot begin until this is defined

An AI system that reasons about incidents, root causes, or trends is
bounded entirely by the data it can see. If that data is not first
enumerated precisely - what exists, where it lives, what it does and
does not cover - any AI design built on top of it rests on assumption
rather than fact. Three concrete risks this document exists to prevent:

- **Designing logic against data that does not exist.** For example, if
  an AI design assumed distributed tracing was available, every use
  case built on that assumption would fail at runtime - because, as
  Chapter 3 documents, no tracing capability exists in this platform
  today.
- **Duplicating data that already exists elsewhere.** For example, an
  AI design that re-implements Kubernetes Event capture, unaware that
  Container Insights already captures it (`KubeEvents`, confirmed live
  in the Cloud Monitoring assessment), would waste effort solving an
  already-solved problem.
- **Missing how to actually query what's available.** Knowing a data
  source exists is not the same as knowing its query language, its
  retention window, or which specific query answers which specific
  question - all of which Chapters 5 and 6 of this document define
  explicitly.

This document is the boundary between "the observability platform" and
"the AIOps layer." Everything on the observability side is described
here, exactly as implemented. Nothing on the AIOps side is designed
here - that begins only after this contract is agreed upon.

## Scope of this document

This document describes **only what is currently implemented and
verified** in the CredPay platform as of this writing. It draws
directly from:

- The self-hosted Prometheus stack (`observability/prometheus/`,
  `observability/grafana/`, `observability/application-metrics/`) -
  built and verified across this project's own phases.
- The Azure Monitor / Log Analytics assessment
  (`observability/cloud-monitoring/01-Azure-Cloud-Monitoring-Assessment.md`)
  - including its live, `az`-CLI-verified findings (Chapter 13 of that
    document), not just its initial assumptions.

Nothing in this document describes a future capability as if it
already existed. Where a capability does not yet exist (e.g.
distributed tracing, AKS control-plane log routing), it is stated
plainly as not present - never implied, never assumed.

---

# Chapter 2 - Current Project Architecture

## Provisioning layer (Terraform)

`terraform/` provisions the Azure infrastructure CredPay runs on, via
these modules (`terraform/modules/`):

- **resource-group** - the resource group the rest of the modules
  deploy into (`rg-credpays1`).
- **networking** - the virtual network.
- **aks** - the AKS cluster itself (`aks-credpays1`), a 2-node system
  node pool, SystemAssigned identity, Kubernetes v1.35.5.
- **postgres** - Azure Database for PostgreSQL Flexible Server
  (`psql-credpays1`), database `credpay`, used by both `user-service`
  and `payment-service`.
- **keyvault** - writes PostgreSQL credentials into an existing Azure
  Key Vault (`credpaykvs1`), created out-of-band, not by Terraform.
- **monitoring** - an Azure Log Analytics Workspace (`log-credpays1`)
  and a Container Insights solution attached to it.

The Azure Container Registry (`credpayacrs1`) also exists out-of-band,
not provisioned by Terraform, and is attached to the AKS cluster's
kubelet identity for image pulls.

## Delivery layer (Azure DevOps)

`azure-pipelines.yml` runs on every push to `main`: Terraform apply →
Docker build/push (frontend, `user-service`, `payment-service`) → Deploy
to AKS (namespace/ConfigMap, Secret from Key Vault, database schema Job,
`user-service`, `payment-service`, frontend blue/green, smoke test,
traffic switch, Ingress, final validation).

## Application layer (`credpay` namespace)

- **frontend** - React SPA served by Nginx, deployed as two parallel
  Deployments, `frontend-blue` and `frontend-green` (blue/green). The
  `frontend` Service's selector determines which color is currently
  live; the other color is idle until the next deploy.
- **user-service** - Spring Boot (Java), REST API on port 8080,
  connects to PostgreSQL.
- **payment-service** - FastAPI (Python), REST API on port 8000,
  connects to the same PostgreSQL database.
- **Ingress** (ingress-nginx) - single, host-less entry point,
  path-routing to all three.

## Observability layer (`monitoring` namespace + Azure)

- **Prometheus** - self-hosted, 1 replica, 10Gi PVC, scrapes 8 jobs
  (detailed in Chapter 3).
- **Node Exporter** - DaemonSet, one Pod per node.
- **kube-state-metrics** - Deployment, scoped to 7 Kubernetes resource
  kinds.
- **Grafana** - self-hosted, 1 replica, 2Gi PVC, Prometheus datasource
  auto-provisioned, 6 dashboards.
- **Azure Monitor / Log Analytics** - not self-hosted; an existing
  Azure platform capability, connected to this cluster via the AKS
  `omsagent` addon profile (Container Insights), writing into the
  `log-credpays1` workspace.

## Complete architecture diagram

```
                              Azure DevOps Pipeline
                    (Terraform → Docker build/push → Deploy to AKS)
                                        │
                                        ▼
┌──────────────────────────────────────────────────────────────────────┐
│                         Azure Subscription                            │
│                                                                        │
│  ┌──────────────────────────── AKS Cluster (aks-credpays1) ─────────┐ │
│  │                                                                    │ │
│  │   credpay namespace              monitoring namespace              │ │
│  │  ┌─────────────────────┐        ┌─────────────────────────────┐  │ │
│  │  │ frontend-blue         │        │ Prometheus (1 replica,       │  │ │
│  │  │ frontend-green        │        │  10Gi PVC)                    │  │ │
│  │  │ user-service          │◄──────┤  scrapes: itself, apiserver,  │  │ │
│  │  │  (Spring Boot :8080)  │scrape  │  nodes, cadvisor, pods,       │  │ │
│  │  │ payment-service       │◄──────┤  service-endpoints,           │  │ │
│  │  │  (FastAPI :8000)      │        │  node-exporter, kube-state-   │  │ │
│  │  │                       │        │  metrics                      │  │ │
│  │  │ Ingress (ingress-nginx)│        │                               │  │ │
│  │  └─────────────────────┘        │ Node Exporter (DaemonSet)     │  │ │
│  │            │                     │ kube-state-metrics (Deploy.)  │  │ │
│  │            │                     │ Grafana (1 replica, 2Gi PVC,   │  │ │
│  │            │                     │  6 dashboards)                 │  │ │
│  │            │                     └─────────────────────────────┘  │ │
│  │            │                                                       │ │
│  │            │          omsagent addon (ama-logs / ama-logs-rs)      │ │
│  │            │          (Container Insights agent, kube-system)      │ │
│  └────────────┼──────────────────────────┼───────────────────────────┘ │
│               │                          │                             │
│               ▼                          ▼                             │
│      Azure PostgreSQL              Log Analytics Workspace              │
│      (psql-credpays1)              (log-credpays1)                      │
│                                     ContainerInventory, KubePodInventory,│
│                                     KubeNodeInventory, Heartbeat,        │
│                                     KubeEvents, ContainerLog             │
│                                                                        │
│      Azure Key Vault (credpaykvs1)     Azure Metrics (automatic)        │
│      Azure Container Registry          Azure Activity Log (automatic)   │
│      (credpayacrs1)                    Azure Resource Health (automatic)│
└──────────────────────────────────────────────────────────────────────┘
```

---

# Chapter 3 - Observability Data Sources

Every data source below is currently implemented and verified. Sources
that were assessed and confirmed *not* present (e.g. AKS control-plane
logs, distributed tracing) are documented in Chapter 7, not here.

## Prometheus-based sources

### Prometheus (self-monitoring)

- **Purpose:** Reports Prometheus's own operational health - TSDB size,
  scrape performance, query engine load.
- **Producer:** The Prometheus server itself (`job="prometheus"`).
- **Consumer:** Grafana; ad-hoc PromQL queries.
- **Retention:** 15 days (`--storage.tsdb.retention.time=15d`), stored
  on a 10Gi PVC.
- **Typical usage:** Confirming Prometheus itself is healthy before
  trusting any other metric it reports.

### Kubernetes API Server metrics

- **Purpose:** Control-plane request rates, latencies, and error codes.
- **Producer:** The AKS API server's own `/metrics` endpoint
  (`job="kubernetes-apiservers"`).
- **Consumer:** Grafana; ad-hoc PromQL queries.
- **Retention:** 15 days (same Prometheus TSDB).
- **Typical usage:** Determining whether a cluster-wide issue
  originates in the control plane itself.

### Kubelet self-metrics

- **Purpose:** Each node's kubelet's own process metrics (e.g.
  `kubelet_running_pods`, `kubelet_running_containers`) - not the
  machine's resource usage, the kubelet process's own behavior.
- **Producer:** Each node's kubelet `/metrics` endpoint
  (`job="kubernetes-nodes"`).
- **Consumer:** Grafana; ad-hoc PromQL queries.
- **Retention:** 15 days.
- **Typical usage:** Per-node capacity checks (how many Pods a kubelet
  believes it's running).

### Node Exporter

- **Purpose:** Real, machine-level OS metrics - CPU, memory,
  filesystem, network, load average.
- **Producer:** `prom/node-exporter`, a DaemonSet with one Pod per
  node, reading `/proc` and `/sys` directly.
- **Consumer:** Grafana (`credpay-node-status.json`,
  `credpay-node-resource-gauges.json`); ad-hoc PromQL queries.
- **Retention:** 15 days (same Prometheus TSDB).
- **Typical usage:** Node-level resource pressure investigation - is a
  specific node low on memory, disk, or CPU.

### cAdvisor (per-container resource usage)

- **Purpose:** Real, per-container CPU/memory/network/filesystem usage
  - built into every kubelet, not a separately deployed component.
- **Producer:** Each node's kubelet `/metrics/cadvisor` endpoint
  (`job="kubernetes-cadvisor"`).
- **Consumer:** Grafana (`credpay-container-resource-usage.json`);
  ad-hoc PromQL queries.
- **Retention:** 15 days (same Prometheus TSDB).
- **Typical usage:** Per-container usage-vs-limit analysis - e.g.
  predicting an OOMKill before it happens.

### kube-state-metrics

- **Purpose:** Kubernetes *object state* - Deployment replica counts,
  Pod phase, container restart counts, DaemonSet readiness, HPA
  current/desired/max replicas - derived from the API server, not the
  machine.
- **Producer:** `kube-state-metrics` Deployment, scoped to 7 resource
  kinds: Deployments, Pods, ReplicaSets, DaemonSets, Namespaces,
  Services, HorizontalPodAutoscalers.
- **Consumer:** Grafana (`credpay-pod-status.json`,
  `credpay-kubernetes-workload-health.json`); ad-hoc PromQL queries.
- **Retention:** 15 days (same Prometheus TSDB).
- **Typical usage:** Object-level health checks - is a Deployment fully
  available, has a Pod restarted, is an HPA near its scaling ceiling.

### Application Metrics (`user-service`, `payment-service`)

- **Purpose:** Business-level request rate, error rate, and latency, by
  specific endpoint/handler - not infrastructure health, application
  behavior.
- **Producer:** `user-service` (Spring Boot Actuator + Micrometer,
  exposed at `/actuator/prometheus`) and `payment-service`
  (`prometheus-fastapi-instrumentator`, exposed at `/metrics`); both
  scraped via the same annotation-gated job (`job="kubernetes-pods"`).
- **Consumer:** Grafana (`credpay-application-metrics.json`); ad-hoc
  PromQL queries.
- **Retention:** 15 days (same Prometheus TSDB).
- **Typical usage:** Determining whether an incident is a business-logic
  problem (e.g. rising payment error rate) versus purely an
  infrastructure one.

### Grafana

- **Purpose:** Visualization and ad-hoc querying layer on top of
  Prometheus. Not a data producer.
- **Producer:** None - Grafana consumes, it does not generate
  observability data.
- **Consumer:** Human operators (via the 6 dashboards in
  `observability/grafana/03-dashboards/`), or anyone issuing a query
  through its Prometheus datasource.
- **Retention:** N/A (Grafana itself stores only dashboard definitions
  and settings, on its own 2Gi PVC - not observability data).
- **Typical usage:** Human-facing incident investigation and routine
  monitoring; not currently queried programmatically by any other
  system in this platform.

## Azure Monitor / Log Analytics-based sources

### Azure Monitor (umbrella)

- **Purpose:** Platform-level monitoring for Azure resources themselves
  - the layer beneath what Prometheus can see.
- **Producer:** The Azure platform itself.
- **Consumer:** Azure Portal; `az` CLI; any system with Azure Resource
  Manager API access.
- **Retention:** Varies by sub-feature (see individual entries below).
- **Typical usage:** Distinguishing "the application has a bug" from
  "the underlying Azure infrastructure has a problem."

### Log Analytics Workspace (`log-credpays1`)

- **Purpose:** The durable, KQL-queryable log/inventory storage backend
  Container Insights writes into.
- **Producer:** Receives data from Container Insights (below); does not
  generate data itself.
- **Consumer:** Azure Portal Logs blade; `az monitor log-analytics
  query`; any system with workspace read access.
- **Retention:** Workspace-configured retention period (commonly 30
  days by default, extendable).
- **Typical usage:** Querying container logs, inventory snapshots, and
  Kubernetes Events after the fact.

### Container Insights inventory and health tables

Live-confirmed populated (`observability/cloud-monitoring/01-Azure-Cloud-Monitoring-Assessment.md`,
Chapter 13):

| Table | Purpose | Producer | Confirmed volume |
|---|---|---|---|
| `ContainerInventory` | Point-in-time container snapshots (image, state, container ID) | `ama-logs`/`ama-logs-rs` (Container Insights agent) | 103,172 rows |
| `KubePodInventory` | Point-in-time Pod snapshots (namespace, phase, controller, node) | Same agent | 103,231 rows |
| `KubeNodeInventory` | Point-in-time node snapshots (status, labels, allocatable resources) | Same agent | 3,640 rows |
| `Heartbeat` | Proof the collection agent itself is alive and reporting | Same agent | 5,465 rows |
| `KubeEvents` | Kubernetes Events (e.g. `FailedScheduling`, `Unhealthy`) | Same agent | 88 rows in a single 24h window |
| `ContainerLog` / `ContainerLogV2` | Raw container stdout/stderr text | Same agent | Populated (not row-counted in this contract) |

- **Consumer (all rows in this table):** Azure Portal Logs blade;
  `az monitor log-analytics query`; the Container Insights "Insights"
  tabs in the Portal.
- **Retention (all rows in this table):** Same workspace-level
  retention as the Log Analytics Workspace entry above.
- **Typical usage:** `ContainerInventory`/`KubePodInventory`/
  `KubeNodeInventory` - point-in-time inventory audits.
  `Heartbeat` - agent health verification. `KubeEvents` - root-cause
  investigation of scheduling/health transitions (already proven
  against this project's own real capacity incident). `ContainerLog` -
  retrieving the specific error text behind a metric-level symptom.

### Azure Metrics

- **Purpose:** Automatic, platform-level numeric telemetry for Azure
  resources (e.g. AKS node CPU at the VM level, as seen by Azure, not
  by Kubernetes).
- **Producer:** The Azure platform, automatically, for every resource -
  no agent or configuration required.
- **Consumer:** Azure Portal Metrics Explorer; `az monitor metrics`;
  any system with Azure Monitor API access.
- **Retention:** Not workspace-based - a separate metrics store,
  commonly retaining recent data at fine granularity with automatic
  downsampling over longer windows.
- **Typical usage:** Confirming whether a node-level symptom originates
  at the underlying VM/infrastructure layer, independent of anything
  Kubernetes reports.

### Azure Activity Log

- **Purpose:** Subscription-wide audit trail of control-plane
  operations - who created, changed, or deleted an Azure resource, and
  when.
- **Producer:** The Azure Resource Manager control plane, automatically,
  for every resource.
- **Consumer:** Azure Portal Activity Log blade; `az monitor
  activity-log list`.
- **Retention:** 90 days, by default, with no configuration required.
- **Typical usage:** Confirming (or ruling out) whether a human or
  automated change to an Azure resource coincided with an incident.

### Azure Resource Health

- **Purpose:** Per-resource, Azure-reported platform health status,
  independent of anything happening inside a workload.
- **Producer:** The Azure platform, automatically, for every resource.
- **Consumer:** Azure Portal Resource Health blade; the Resource Health
  REST API.
- **Retention:** Reflects current/recent status; live-confirmed
  `Available` for the AKS cluster resource at time of assessment.
- **Typical usage:** Distinguishing an application-level incident from
  an underlying Azure platform incident.

---

# Chapter 4 - Data Classification

| Category | Definition | Current status | Sources (Chapter 3) |
|---|---|---|---|
| **Infrastructure Metrics** | Machine/container-level resource usage, independent of business logic | **Exists** | Node Exporter, cAdvisor, kubelet self-metrics, Azure Metrics |
| **Application Metrics** | Request-level technical metrics from CredPay's own services (rate, latency, JVM/DB pool) | **Exists** | `user-service` (Micrometer), `payment-service` (instrumentator) |
| **Business Metrics** | The subset of Application Metrics with direct business meaning (e.g. payment success/failure by endpoint) | **Exists** (same producers as Application Metrics; distinguished by semantic meaning, not by a separate pipeline) | `user-service`, `payment-service` |
| **Cluster Inventory** | Point-in-time structural state of Kubernetes objects and Azure-side container/pod/node snapshots | **Exists** | kube-state-metrics; `ContainerInventory`, `KubePodInventory`, `KubeNodeInventory` |
| **Logs** | Free-text or structured event records | **Partially exists** - container-level logs exist (`ContainerLog`/`ContainerLogV2`); AKS control-plane logs (`kube-audit`, `kube-scheduler`, `kube-controller-manager`) do not, confirmed absent (no Diagnostic Setting configured) | `ContainerLog`/`ContainerLogV2` only |
| **Events** | Discrete Kubernetes state-transition signals | **Exists** | `KubeEvents` |
| **Platform Metadata** | Control-plane audit trail of changes to Azure resources themselves | **Exists** | Azure Activity Log |
| **Health Signals** | Direct up/down or available/unavailable status, independent of a metric threshold | **Exists** | Prometheus `up`; kube-state-metrics Pod phase/restart counts; Azure Resource Health |

## What currently exists vs. what is not currently implemented

**Currently exists**, spanning every category above except the
control-plane-log portion of Logs: infrastructure metrics, application
metrics, business metrics, cluster inventory, container-level logs,
Kubernetes Events, platform metadata, and health signals.

**Not currently implemented:**

- **AKS control-plane logs** (the remaining portion of the Logs
  category) - no Diagnostic Setting exists on the AKS resource, Key
  Vault, PostgreSQL, or ACR (confirmed empty on all four in the Cloud
  Monitoring assessment).
- **Distributed tracing** - no category above covers it because it does
  not exist as a category of available data in this platform at all;
  no request-tracing mechanism (e.g. Application Insights) is
  implemented.
- **Alerting-derived data** (e.g. a persisted history of fired alerts) -
  AlertManager and Prometheus recording/alerting rules were explicitly
  not built for this platform; no alert-history data source exists as a
  result.

---

# Chapter 5 - Available Queries

Every query below is runnable today against this platform's real data.
Full catalogs with additional queries and worked examples already exist
in `observability/prometheus/cheatsheets/` and
`observability/application-metrics/documentation/`; this chapter is the
subset most relevant to future AIOps consumption, organized by query
language.

## PromQL

### Health / targets

**1. `up`**
- Purpose: Overall scrape target health, every job at once.
- Expected result: One row per target, `1` (healthy) or `0` (down).
- Typical investigation: The first query in any investigation - is
  monitoring itself intact.
- When to use: Start of every investigation.

**2. `up{job="kubernetes-pods"}`**
- Purpose: Health of `user-service`/`payment-service` scraping
  specifically.
- Expected result: One row per application Pod.
- Typical investigation: Confirming application metrics are even
  reachable before trusting any business-metric query below.
- When to use: Before investigating an application-level symptom.

### Node-level (Node Exporter)

**3. `100 - (avg by (instance) (rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)`**
- Purpose: CPU usage % per node.
- Expected result: One value per node, 0-100.
- Typical investigation: Node-level resource pressure, capacity
  planning.
- When to use: A symptom appears correlated with a specific node rather
  than a specific Pod.

**4. `node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes * 100`**
- Purpose: Memory available % per node (inverse of usage).
- Expected result: One value per node, 0-100.
- Typical investigation: Node memory pressure - the exact condition
  behind this project's own real capacity incident.
- When to use: A Pod is `Pending` with a `FailedScheduling`/
  `Insufficient memory` event.

**5. `node_load1`**
- Purpose: 1-minute load average per node.
- Expected result: One value per node.
- Typical investigation: Whether work is queuing (load higher than core
  count) rather than just running.
- When to use: Node appears busy but CPU% alone doesn't explain it.

### Container-level (cAdvisor)

**6. `sum(rate(container_cpu_usage_seconds_total{namespace="credpay", container!="", image!=""}[5m])) by (pod, container)`**
- Purpose: Real CPU usage per container.
- Expected result: One series per container.
- Typical investigation: Which specific container is responsible for a
  node's load.
- When to use: Node-level CPU pressure needs to be attributed to a
  specific workload.

**7. `sum(container_memory_working_set_bytes{namespace="credpay", container!="", image!=""}) by (pod) / sum(kube_pod_container_resource_limits{namespace="credpay", resource="memory"}) by (pod) * 100`**
- Purpose: Memory usage vs. configured limit, per Pod - the exact
  number the kubelet's OOM-killer watches.
- Expected result: One value per Pod, 0-100+ (can exceed 100 briefly
  before an OOMKill).
- Typical investigation: Predicting or explaining an OOMKill.
- When to use: A Pod has restarted and OOMKilled is suspected.

### Kubernetes object state (kube-state-metrics)

**8. `kube_pod_status_phase{namespace="credpay"} == 1`**
- Purpose: Current phase of every CredPay Pod.
- Expected result: One row per Pod, the current phase only.
- Typical investigation: Confirming which Pods are `Running` vs.
  `Pending`/`Failed` right now.
- When to use: Any incident involving Pod availability.

**9. `sum(kube_pod_container_status_restarts_total{namespace="credpay"})`**
- Purpose: Total container restarts across CredPay.
- Expected result: A single number, ideally flat over time.
- Typical investigation: Crash-loop detection.
- When to use: Suspected application instability.

**10. `kube_deployment_status_replicas_available{namespace="credpay"} / kube_deployment_spec_replicas{namespace="credpay"} * 100`**
- Purpose: Deployment availability %.
- Expected result: One value per Deployment, ideally 100.
- Typical investigation: Confirming a Deployment is fully healthy, not
  partially degraded.
- When to use: Any incident where "is the service actually up" is in
  question.

**11. `kube_horizontalpodautoscaler_status_current_replicas{namespace="credpay"} / kube_horizontalpodautoscaler_spec_max_replicas{namespace="credpay"} * 100`**
- Purpose: HPA headroom - how close to its scaling ceiling.
- Expected result: One value per HPA, 0-100.
- Typical investigation: Whether a service is about to run out of
  autoscaling room under load.
- When to use: Sustained high traffic or CPU, before it becomes a
  capacity incident.

### Application/business metrics

**12. `sum(rate(http_server_requests_seconds_count{job="kubernetes-pods", uri!="/actuator/prometheus"}[5m])) by (uri)`**
- Purpose: `user-service` request rate by endpoint.
- Expected result: One series per endpoint.
- Typical investigation: Traffic pattern analysis, or confirming a
  specific endpoint is receiving traffic at all.
- When to use: Investigating a specific `user-service` route.

**13. `sum(rate(http_requests_total{job="kubernetes-pods", status=~"5.."}[5m])) by (handler)`**
- Purpose: `payment-service` error rate by handler.
- Expected result: One series per handler, ideally near zero.
- Typical investigation: The core "is the payment logic itself failing"
  question.
- When to use: A reported payment issue, with no other obvious
  infrastructure symptom.

**14. `histogram_quantile(0.95, sum(rate(http_server_requests_seconds_bucket{job="kubernetes-pods"}[5m])) by (le, uri))`**
- Purpose: `user-service` p95 latency by endpoint.
- Expected result: One series per endpoint, in seconds.
- Typical investigation: "Is this endpoint slow" complaints.
- When to use: A "slow API" report, before assuming an infrastructure
  cause.

**15. `hikaricp_connections_active{job="kubernetes-pods"} / hikaricp_connections_max{job="kubernetes-pods"} * 100`**
- Purpose: `user-service`'s PostgreSQL connection pool saturation.
- Expected result: One value per Pod, 0-100.
- Typical investigation: Database connectivity/exhaustion issues.
- When to use: Symptoms suggest the database layer, not the application
  logic itself.

## KQL (Log Analytics)

### Events

**16. `KubeEvents | where TimeGenerated > ago(1h) | where Reason == "FailedScheduling"`**
- Purpose: Recent scheduling failures, cluster-wide.
- Expected result: Rows with `Namespace`, `Name`, `Message` describing
  each failure (e.g. "Insufficient memory").
- Typical investigation: Root-causing a `Pending` Pod.
- When to use: A Pod won't start and the reason isn't immediately
  obvious from `kubectl` alone.

**17. `KubeEvents | where TimeGenerated > ago(1h) | where Reason == "Unhealthy"`**
- Purpose: Recent probe failures, cluster-wide.
- Expected result: Rows describing which container failed a
  readiness/liveness/startup probe, and why.
- Typical investigation: Application startup or health-check failures.
- When to use: A Pod is restarting and the specific probe failure
  reason is needed.

**18. `KubeEvents | where TimeGenerated > ago(24h) | summarize count() by Reason`**
- Purpose: A frequency breakdown of every Event reason in the last day.
- Expected result: A ranked list (e.g. `FailedScheduling`, `Unhealthy`,
  `BackOff`, each with a count).
- Typical investigation: Spotting a recurring, systemic issue rather
  than a one-off.
- When to use: General health review, not tied to one specific
  incident.

### Inventory

**19. `KubePodInventory | where TimeGenerated > ago(1h) | where Namespace == "credpay" | summarize by Name, PodStatus, ClusterName`**
- Purpose: Recent Pod inventory snapshot for `credpay`.
- Expected result: One row per Pod, with its recorded status.
- Typical investigation: Historical "what did the fleet look like at
  time X" questions - not possible from `kubectl` alone once time has
  passed.
- When to use: Investigating an incident after the fact, once the live
  cluster state has already changed.

**20. `KubeNodeInventory | where TimeGenerated > ago(1h) | summarize by Computer, Status`**
- Purpose: Recent node inventory snapshot.
- Expected result: One row per node, with its recorded status.
- Typical investigation: Confirming node-level state at a point in the
  past.
- When to use: Same as above, at node granularity.

### Logs

**21. `ContainerLog | where TimeGenerated > ago(1h) | where LogEntry contains "Exception"`**
- Purpose: Free-text search for exceptions across all container logs.
- Expected result: Matching log lines with timestamp, container, and
  the raw text.
- Typical investigation: Finding the specific error behind a metric-only
  symptom (e.g. an error-rate spike with no further detail from
  Prometheus alone).
- When to use: A Prometheus metric shows *that* something failed; this
  query finds *why*.

### Health

**22. `Heartbeat | where TimeGenerated > ago(1h) | summarize LastCall = max(TimeGenerated) by Computer`**
- Purpose: Confirms the monitoring agent itself is alive, per node.
- Expected result: A recent timestamp per node.
- Typical investigation: Ruling out "the monitoring pipeline itself is
  broken" before trusting an absence of data elsewhere as meaningful.
- When to use: Any time a Log Analytics query unexpectedly returns
  nothing.

## Explicitly not catalogued

No KQL query against `AzureDiagnostics` is included here - the table is
confirmed empty (0 rows; Chapter 3/7), so no query against it would
return meaningful data. No PromQL query against a `kubernetes-service-endpoints`
target is included for the same reason - confirmed zero targets.

---

# Chapter 6 - Correlation Matrix

For each incident type, the data sources and queries (by number,
Chapter 5) that already contribute real evidence in this platform
today.

| Incident | Required Data Sources | Queries (Ch.5 #) | Expected Findings |
|---|---|---|---|
| **High CPU** | Node Exporter, cAdvisor, kube-state-metrics | #3 (node CPU%), #6 (per-container CPU) | #3 identifies the affected node; #6 attributes the load to a specific container |
| **Pod Restart** | kube-state-metrics, KubeEvents, ContainerLog | #9 (restart count), #17 (`Unhealthy` events), #21 (log search) | #9 confirms a restart occurred; #17 gives the probe-failure reason; #21 gives the application's own error text at that moment |
| **Node Failure** | Node Exporter, Azure Resource Health, KubeNodeInventory | #3, #4 (node CPU/memory), Ch.3's Resource Health entry, #20 (node inventory) | Node Exporter shows the node's metrics stop updating or degrade; Resource Health confirms whether Azure itself reports a platform-level problem with that node |
| **Failed Scheduling** | kube-state-metrics, KubeEvents, Node Exporter | #9, #16 (`FailedScheduling` events), #4 (node memory) | #16 gives the exact scheduler message (e.g. "Insufficient memory") - **already proven against this project's own real incident** |
| **Memory Pressure** | Node Exporter, cAdvisor, kube-state-metrics | #4 (node memory %), #7 (container memory vs. limit) | #4 identifies node-wide pressure; #7 attributes it to a specific Pod approaching its limit |
| **Deployment Failure** | kube-state-metrics | #10 (Deployment availability %), #9 (restarts) | #10 shows a Deployment below 100% availability; cross-referenced with #9 for restart-driven causes |
| **Application Crash** | kube-state-metrics, KubeEvents, ContainerLog | #9, #17, #21 | Same evidence chain as Pod Restart - a crash is a restart with a specific, log-visible cause |
| **Slow API** | Application Metrics | #14 (p95 latency by endpoint) | #14 identifies which specific endpoint is slow, isolated from infrastructure metrics entirely |
| **High Latency** | Application Metrics, Node Exporter, cAdvisor | #14, #3, #6 | #14 confirms the symptom; #3/#6 rule in or out an infrastructure cause (node or container resource pressure) |
| **Payment Failure** | Application Metrics (`payment-service`) | #13 (error rate by handler), #14-equivalent for `payment-service` | #13 isolates failures to a specific handler (e.g. `/api/payment/pay`), independent of infrastructure health |
| **Database Connectivity** | Application Metrics (HikariCP), ContainerLog | #15 (connection pool saturation), #21 (log search for connection errors) | #15 shows pool exhaustion as a leading indicator; #21 surfaces the specific connection error text |

## How to read this matrix

Every row lists only sources and queries already confirmed available in
Chapters 3 and 5 - no row assumes a data source this platform does not
have (e.g. no row for "Slow API" references distributed tracing, since
none exists). Some incident types (Node Failure, Database Connectivity)
draw on Azure-side sources; others (Slow API, Payment Failure) are
answerable from Prometheus/application metrics alone. This split is
itself a fact about the current platform's evidence coverage, expanded
on in Chapter 7.

---

# Chapter 7 - Current Coverage

This chapter states current observability capability as a fact, not a
gap list. Where a capability is not present, that is stated plainly
alongside what is.

## What can already be detected

- **Node-level resource pressure** (CPU, memory, disk, network) - via
  Node Exporter, cluster-wide, per node.
- **Container-level resource usage and limit proximity** - via cAdvisor,
  including the exact signal that predicts an OOMKill before it happens.
- **Kubernetes object health** - Deployment availability, restart
  counts, HPA headroom, DaemonSet readiness - via kube-state-metrics.
- **Kubernetes Events**, including scheduling failures and probe
  failures - via `KubeEvents` (Container Insights). **Proven**, not
  theoretical: this exact capability already correctly captured this
  project's own real capacity incident (a `FailedScheduling` event,
  matching what was independently diagnosed via `kubectl` at the time).
- **Application-level request rate, error rate, and latency**, broken
  down by specific endpoint/handler, for both `user-service` and
  `payment-service` - via Prometheus instrumentation.
- **Container log text** (stdout/stderr) - via `ContainerLog`/
  `ContainerLogV2`, queryable after the fact, independent of whether the
  Pod producing it still exists.
- **Point-in-time historical inventory** of Pods, nodes, and containers
  - via `KubePodInventory`, `KubeNodeInventory`, `ContainerInventory` -
  answerable even after the live cluster state has since changed.
- **Azure platform-level health** for the AKS resource - via Azure
  Resource Health, confirmed `Available` at time of assessment.
- **Azure control-plane change history** (subscription-wide) - via
  Azure Activity Log.
- **Monitoring pipeline self-health** - via Prometheus's `up` metric and
  the Log Analytics `Heartbeat` table, both confirming the observability
  platform itself is functioning before any other signal is trusted.

## What cannot currently be detected

- **AKS control-plane behavior** (`kube-audit`, `kube-scheduler`,
  `kube-controller-manager` logs) - no Diagnostic Setting routes these
  anywhere; confirmed absent, not partially covered by any other source
  documented in this contract.
- **Distributed request tracing** - no mechanism exists to answer "as
  one request moved through `frontend` → `user-service`/`payment-service`
  → PostgreSQL, where specifically did the time go." Latency is
  measurable per-service (Chapter 5, #14) but not as a single, connected
  trace across services.
- **Diagnostic Settings-routed logs for Key Vault, PostgreSQL, or ACR**
  - confirmed absent for all three, in addition to AKS.
- **Any alert-derived history** - no AlertManager, no Prometheus
  alerting/recording rules exist in this platform; there is no record
  of "an alert fired at time X" anywhere, because no alerting mechanism
  has been built.
- **Frontend-level telemetry** - the `frontend` Nginx server is not
  instrumented; no request-level metrics exist for it specifically
  (only Node Exporter/cAdvisor's generic resource-usage view of its
  Pods).

## What requires future phases

Per this project's own roadmap
(`observability/README.md`), the following are explicitly deferred to
phases beyond Cloud Monitoring, not part of current coverage:

- The AIOps layer itself - the system that would consume everything
  documented in this contract.
- Any decision on whether to close the AKS-control-plane-log gap (a
  Diagnostic Setting) or the distributed-tracing gap (Application
  Insights or an alternative) - both identified, neither yet decided or
  built.

---

# Chapter 8 - Data Flow

## Flow 1: Application → Metrics → Prometheus → Grafana

```
user-service (Spring Boot)          payment-service (FastAPI)
  Micrometer + Actuator               prometheus-fastapi-instrumentator
  exposes GET /actuator/prometheus    exposes GET /metrics
  (port 8080)                         (port 8000)
        │                                    │
        │  annotated: prometheus.io/scrape=true, port, path
        └──────────────────┬─────────────────┘
                            ▼
              Prometheus "kubernetes-pods" scrape job
              (role: pod, annotation-gated discovery)
                            │
                            ▼
              Prometheus TSDB (10Gi PVC, 15d retention)
                            │
                            ▼
              Grafana (auto-provisioned Prometheus datasource)
                            │
                            ▼
              credpay-application-metrics.json dashboard
```

The same shape applies to infrastructure/inventory metrics, with a
different producer and scrape job:

```
Node Exporter (DaemonSet)        cAdvisor (built into kubelet)      kube-state-metrics (Deployment)
  job="node-exporter"               job="kubernetes-cadvisor"          matched by Service name
        │                                 │                                  │
        └─────────────────┬───────────────┴──────────────────┬───────────────┘
                           ▼                                  ▼
                  Prometheus TSDB (same instance, same PVC, same retention)
                           │
                           ▼
                  Grafana (credpay-node-*.json, credpay-kubernetes-workload-health.json,
                           credpay-container-resource-usage.json)
```

## Flow 2: Application → Logs → Azure Monitor → Log Analytics

```
Any container in the cluster (frontend, user-service, payment-service,
Prometheus, Grafana, kube-system Pods - all of them, not just credpay)
        │
        │  writes to stdout/stderr
        ▼
Container runtime (containerd) captures the stream
        │
        ▼
ama-logs / ama-logs-rs (Container Insights agent, AKS "omsagent" addon)
        │
        │  authenticated via the workspace's legacy shared key
        │  (useAADAuth: false on this cluster's addon config)
        ▼
Log Analytics Workspace (log-credpays1)
        │
        ▼
ContainerLog / ContainerLogV2 table
        │
        ▼
Queried via KQL (Azure Portal Logs blade, or `az monitor log-analytics query`)
```

## Flow 3: Kubernetes → Events → Azure Monitor

```
Kubernetes control plane (API server) emits an Event
(e.g. the scheduler emits FailedScheduling; the kubelet emits Unhealthy)
        │
        ▼
ama-logs / ama-logs-rs (same Container Insights agent as Flow 2)
        │
        ▼
Log Analytics Workspace (log-credpays1)
        │
        ▼
KubeEvents table
        │
        ▼
Queried via KQL - confirmed, live, including this project's own
FailedScheduling incident (Chapter 7)
```

## Flow 4: Kubernetes object state → kube-state-metrics → Prometheus (for contrast with Flow 3)

```
Kubernetes API server (Deployment/Pod/ReplicaSet/DaemonSet/
Namespace/Service/HorizontalPodAutoscaler objects)
        │
        │  list/watch (read-only, via kube-state-metrics' scoped RBAC)
        ▼
kube-state-metrics Deployment
        │
        │  exposes /metrics (Prometheus text format)
        ▼
Prometheus "kube-state-metrics" scrape job
        │
        ▼
Prometheus TSDB
```

Flow 3 and Flow 4 both originate from Kubernetes, but diverge
immediately: **object state** (is this Deployment available, how many
replicas) flows into Prometheus via kube-state-metrics; **discrete
Events** (why did a specific scheduling attempt fail, at that moment)
flow into Azure Monitor via Container Insights. Neither pipeline
produces the other's data - this is why both are documented as
independent flows, not one.

---

# Chapter 9 - AIOps Readiness

This chapter documents data sufficiency only. It does not design,
recommend, or scope an AI solution - it states which currently-existing
datasets are, or are not, sufficient inputs for each listed use case.

## Root Cause Analysis

**Sufficient for:** Infrastructure- and Kubernetes-object-level root
causes. Chapter 6's Correlation Matrix already demonstrates this
end-to-end for `Failed Scheduling`, `Memory Pressure`, `Pod Restart`,
and `Deployment Failure` - each resolvable using only data sources
documented in Chapter 3, and one of them (`Failed Scheduling`) proven
against this project's own real incident, not a hypothetical.

**Not sufficient for:** Root causes that require tracing a single
request across multiple services (`frontend` → `user-service`/
`payment-service` → PostgreSQL). Per-service metrics (Chapter 5, #12-15)
show each service's own behavior in isolation; no data source in this
contract connects one specific request's path across service
boundaries.

## Incident Summaries

**Sufficient for:** Constructing a factual timeline of infrastructure
and application-level incidents - what changed, when, and how it
resolved - using kube-state-metrics (state before/during/after),
KubeEvents (the specific triggering event), and Application Metrics
(business-visible impact, e.g. an error-rate time series).

**Not sufficient for:** Summaries that require identifying which
specific end-user requests were affected. No data source in this
contract correlates a specific user session or request ID across the
metrics, events, and logs it does have.

## Operational Insights

**Sufficient for:** Cluster-wide and per-service resource utilization,
HPA headroom, request volume, and latency patterns - Node Exporter,
cAdvisor, kube-state-metrics, and Application Metrics together cover
node, container, object, and business-request granularity
simultaneously.

**Not sufficient for:** Insights requiring AKS control-plane-level
operational detail (e.g. API server admission/webhook behavior) or
Key Vault/PostgreSQL/ACR-level operational logs - none of these are
captured, per Chapter 7.

## Trend Analysis

**Sufficient for:** Trend analysis within each data source's current
retention window - 15 days for all Prometheus-based sources (Chapter 3),
and the Log Analytics Workspace's configured retention (commonly 30
days by default) for Container Insights-based sources.

**Not sufficient for:** Trend analysis beyond those retention windows -
no data source in this contract currently retains data long enough to
support multi-month or seasonal trend analysis without a retention
change, and no such change is documented as having been made.

## Predictive Analysis

**Sufficient for:** Narrow, leading-indicator-based prediction where the
leading indicator is already a documented metric - e.g. Chapter 5's
memory-vs-limit-% query (#7) is already, today, a leading indicator for
an OOMKill; the HPA-headroom query (#11) is already a leading indicator
for an autoscaling ceiling being reached. Both exist as raw, queryable
data today, independent of any predictive system being built on top of
them.

**Not sufficient for:** Prediction requiring signal combinations or
historical depth not established elsewhere in this contract - e.g.
predicting a payment-processing incident from a combination of business
and infrastructure signals together has not been demonstrated; only the
underlying individual metrics (Chapter 5, #7, #11, #13-15) have been
confirmed to exist.

---

# Chapter 10 - Summary

CredPay's observability platform, as implemented today, consists of two
independent pipelines feeding a common set of consumers.

**The self-hosted pipeline** (Prometheus, Node Exporter,
kube-state-metrics, cAdvisor, Grafana, and Prometheus-based Application
Metrics from `user-service` and `payment-service`) collects
infrastructure metrics, container-level resource usage, Kubernetes
object state, and business-level application metrics. It scrapes 8
distinct jobs, retains 15 days of data on a 10Gi PVC, and surfaces
through 6 Grafana dashboards.

**The Azure-native pipeline** (Log Analytics Workspace `log-credpays1`,
reached via the AKS `omsagent` addon / Container Insights agent)
collects container logs, Kubernetes Events, and point-in-time
inventory of containers, Pods, and nodes. It uses the direct
workspace-link model rather than the modern Data Collection Rule
architecture, authenticates via the workspace's legacy shared key, and
is confirmed live with real data: 103,231 `KubePodInventory` rows,
103,172 `ContainerInventory` rows, 5,465 `Heartbeat` rows, 3,640
`KubeNodeInventory` rows, and 88 `KubeEvents` rows in a single 24-hour
window - including a live capture of this project's own real capacity
incident.

**Three Azure platform capabilities** operate automatically, with no
agent and no configuration: Azure Metrics (platform-level numeric
telemetry), Azure Activity Log (control-plane audit trail), and Azure
Resource Health (per-resource platform status) - all confirmed present
and queryable.

**One gap is confirmed, not inferred:** no Diagnostic Setting exists on
the AKS cluster, Key Vault, PostgreSQL, or Container Registry, so AKS
control-plane logs and these resources' own diagnostic logs are not
captured anywhere. **One capability does not exist at all:** distributed
request tracing across service boundaries. **One capability was
explicitly not built:** any alerting mechanism (AlertManager, or
Prometheus recording/alerting rules) - no alert-history data exists as a
result.

Across eight documented data sources and their associated query
catalog (15 PromQL, 7 KQL), this platform already supports
root-cause analysis, incident summarization, and operational insight
generation for infrastructure- and Kubernetes-object-level incidents -
demonstrated, not merely claimed, against this project's own real
`FailedScheduling` incident. The same platform does not currently
support cross-service request tracing, AKS-control-plane-log-based
analysis, or trend/predictive analysis beyond each source's current
retention window (15 days for Prometheus-based sources; the Log
Analytics Workspace's configured retention for Azure-native sources).

This is the complete state of CredPay's observability platform as
implemented on the date of this document.
