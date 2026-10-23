# CredPay Observability - Current State

A single reference document answering two questions: **what's actually
deployed right now**, and **what metrics are actually being collected**.
Everything below is verified against the live cluster, not just what's
in git. For deployment/verification commands and PromQL walkthroughs,
see each component's own `README.md` - this document is the cross-cutting
summary that ties them together.

Roadmap position: **Prometheus, Node Exporter, kube-state-metrics,
cAdvisor, Grafana, and Application Metrics are implemented.**
AlertManager, Prometheus alerting rules, Cloud Monitoring, and AIOps are
not yet built.

---

## 1. Architecture, as actually deployed

```
                              monitoring namespace
        ┌─────────────────────────────────────────────────────────┐
        │                                                          │
        │   Node Exporter (DaemonSet, 1/node)  ──┐                 │
        │   kube-state-metrics (Deployment)      ├──► Prometheus   │
        │   kubelet /metrics (built-in)           │    (1 replica,  │
        │   kubelet /metrics/cadvisor (built-in) ─┘     10Gi PVC,   │
        │   kube-apiserver /metrics (built-in) ────────► 15d retain)│
        │                                                 │         │
        │                                                 ▼         │
        │                                             Grafana       │
        │                                          (1 replica,      │
        │                                           2Gi PVC,        │
        │                                        6 dashboards)      │
        └─────────────────────────────────────────────────────────┘
                          ▲
                          │ scrapes (annotation-gated, cross-namespace)
        ┌─────────────────┴─────────────────────────────────────┐
        │                credpay namespace (untouched            │
        │                architecture - only additive changes)   │
        │                                                         │
        │   user-service (Spring Boot)     /actuator/prometheus   │
        │   payment-service (FastAPI)      /metrics                │
        │   frontend (blue/green)          not instrumented        │
        └─────────────────────────────────────────────────────────┘
```

Access is exclusively via `kubectl port-forward` - neither Prometheus
nor Grafana has an Ingress or LoadBalancer.

## 2. Components deployed

| Component | What it is | Image | Replicas | Storage |
|---|---|---|---|---|
| Prometheus | Metrics database + query engine | `prom/prometheus:v2.55.1` | 1 | 10Gi PVC, 15d retention |
| Node Exporter | Real OS-level node metrics | `prom/node-exporter:v1.8.2` | 1 per node (DaemonSet) | none |
| kube-state-metrics | Kubernetes object state as metrics | `registry.k8s.io/kube-state-metrics:v2.13.0` | 1 | none |
| cAdvisor | Per-container resource usage | *(built into every kubelet - no Pod deployed)* | n/a | n/a |
| Grafana | Dashboards on top of Prometheus | `grafana/grafana:11.3.1` | 1 | 2Gi PVC |
| Application Metrics | Business-level metrics from CredPay's own services | *(code change, not a new component)* | n/a | n/a |

**Resource footprint** (requests / limits, current):

| Component | CPU request | Mem request | CPU limit | Mem limit |
|---|---|---|---|---|
| Prometheus | 100m | 256Mi | 500m | 1Gi |
| Node Exporter (per node) | 50m | 32Mi | 200m | 128Mi |
| kube-state-metrics | 50m | 64Mi | 200m | 256Mi |
| Grafana | 50m | 128Mi | 300m | 512Mi |
| **Total requests (2-node cluster)** | **300m** | **512Mi** | - | - |

These requests were trimmed down from roughly double these values after
a real incident: this cluster is a 2-node, autoscaler-max-size AKS pool,
and the original requests left no scheduling headroom for the app's own
rolling updates. See `observability/prometheus/README.md`'s "Resource
footprint" section for the full story. Limits were left generous, so
none of this reduces how much each component can actually use if it
needs to - it only eased scheduling.

## 3. What's actually being scraped (8 jobs)

All defined in one ConfigMap:
`observability/prometheus/01-prometheus-server/prometheus.yaml`.

| Job | Discovers | Targets (live) | Status |
|---|---|---|---|
| `prometheus` | itself | 1 | up |
| `kubernetes-apiservers` | the K8s API server | 1 | up |
| `kubernetes-nodes` | every node's kubelet `/metrics` | 2 | up |
| `kubernetes-cadvisor` | every node's kubelet `/metrics/cadvisor` | 2 | up |
| `kube-state-metrics` | the kube-state-metrics Service | 1 | up |
| `node-exporter` | the Node Exporter Service (one endpoint per node) | 2 | up |
| `kubernetes-pods` | Pods annotated `prometheus.io/scrape: "true"` | 4 (`user-service` ×2, `payment-service` ×2) | up |
| `kubernetes-service-endpoints` | Services annotated `prometheus.io/scrape: "true"` | 0 | *(no Service has this annotation yet - not a bug)* |

Total TSDB size: ~62,500 active time series. The single largest
contributor is `kubernetes-apiservers` (~30,000 series) - the API
server's own histogram metrics are inherently high-cardinality; this is
normal for any cluster, not something specific to this setup.

## 4. Full metrics inventory, by source

### A. Prometheus itself (`job="prometheus"`)
`up`, `prometheus_build_info`, `prometheus_tsdb_head_series`,
`prometheus_tsdb_storage_blocks_bytes`, `prometheus_engine_queries`,
`scrape_duration_seconds`, `scrape_samples_scraped`, and every other
`prometheus_*` metric - Prometheus monitors its own health as just
another target.

### B. Kubernetes control plane (`job="kubernetes-apiservers"`)
`apiserver_request_total`, `apiserver_request_duration_seconds_bucket`,
`workqueue_depth`, and the rest of the API server's own metrics surface.

### C. Kubelet itself (`job="kubernetes-nodes"`)
`kubelet_running_pods`, `kubelet_running_containers`,
`process_cpu_seconds_total`, `rest_client_requests_total` - the
kubelet's *own* process metrics, not the machine it runs on.

### D. Real node/OS metrics (`job="node-exporter"`)
`node_cpu_seconds_total`, `node_memory_MemAvailable_bytes` /
`MemTotal_bytes`, `node_filesystem_avail_bytes` / `size_bytes`,
`node_network_receive_bytes_total` / `transmit_bytes_total`, `node_load1`
/ `load5` / `load15`, `node_disk_*` - genuine machine-level telemetry,
independent of any Pod running on the node.

### E. Per-container resource usage (`job="kubernetes-cadvisor"`)
`container_cpu_usage_seconds_total`, `container_memory_working_set_bytes`
(the exact number the OOM-killer watches), `container_memory_usage_bytes`,
`container_network_receive_bytes_total` / `transmit_bytes_total`,
`container_fs_usage_bytes` - per container, across **every namespace**,
not just `credpay`.

### F. Kubernetes object state (`job="kube-state-metrics"`)
Scoped to exactly 7 resource kinds (`--resources=` flag, matching the
RBAC granted): `kube_pod_status_phase`, `kube_pod_info`,
`kube_pod_container_status_restarts_total`,
`kube_pod_container_resource_requests` / `resource_limits`,
`kube_deployment_status_replicas_available` / `spec_replicas` /
`status_replicas_unavailable`, `kube_replicaset_*`,
`kube_daemonset_status_number_ready` / `desired_number_scheduled`,
`kube_namespace_*`, `kube_service_info`,
`kube_horizontalpodautoscaler_status_current_replicas` /
`desired_replicas` / `spec_max_replicas`.

### G. `user-service` application metrics (`job="kubernetes-pods"`, Spring Boot / Micrometer)
Exposed at `GET /actuator/prometheus`:
`http_server_requests_seconds_count` / `_sum` / `_bucket` (labeled by
`uri`, `method`, `status`, `outcome` - histogram buckets enabled),
`jvm_memory_used_bytes` / `max_bytes`, `jvm_threads_live_threads`,
`hikaricp_connections_active` / `idle` / `max` (the PostgreSQL
connection pool), `process_cpu_usage`, `system_cpu_usage`.

### H. `payment-service` application metrics (`job="kubernetes-pods"`, FastAPI / prometheus-fastapi-instrumentator)
Exposed at `GET /metrics`: `http_requests_total` (labeled by `handler`,
`method`, `status`), `http_request_duration_seconds_bucket` / `_sum` /
`_count` (histogram, on by default), `http_requests_inprogress`,
`http_request_size_bytes` / `response_size_bytes`, plus standard Python
process/GC metrics (`python_gc_*`, `process_*`).

### Confirmed real traffic already captured (not synthetic)
```
user-service:    POST /api/users/register  -> 200
                 POST /api/users/login     -> 401 (a real failed login)
                 GET  /api/cards/user/{id} -> 200
payment-service: POST /api/payment/pay              -> 200 (a real payment)
                 GET  /api/payment/history/{user_id} -> 200
```

### Not collected (by design, not yet, or never)
- **Logs** - out of scope for this entire module; Prometheus only does
  metrics. Azure Log Analytics / Container Insights (`ama-logs`, already
  running via Terraform) covers this today, separately.
- **Traces** - not part of the roadmap.
- **`frontend`** - not instrumented; it's a static Nginx server with no
  natural application-level metrics to expose (unlike the two backend
  services).
- **Service-level annotation scraping** (`kubernetes-service-endpoints`
  job) - wired up, unused. Would activate if any Service gets a
  `prometheus.io/scrape: "true"` annotation.

## 5. Grafana - what's built on top

6 importable dashboards in `observability/grafana/03-dashboards/`:

| Dashboard | Data source(s) | Panel types |
|---|---|---|
| `credpay-node-status.json` | Node Exporter | stat, timeseries |
| `credpay-pod-status.json` | kube-state-metrics | stat, table |
| `credpay-node-resource-gauges.json` | Node Exporter | gauge, bargauge, stat |
| `credpay-kubernetes-workload-health.json` | kube-state-metrics | piechart, bargauge, gauge, stat, table, timeseries |
| `credpay-container-resource-usage.json` | cAdvisor + kube-state-metrics (combined) | timeseries, gauge, bargauge, table |
| `credpay-application-metrics.json` | user-service + payment-service | timeseries, gauge, stat |

Prometheus datasource is auto-provisioned (ConfigMap-based, no manual
setup). All 6 confirmed successfully imported and opened.

## 6. Known open items

- **`ama-logs` (Azure Monitor Container Insights)** uses more memory
  per node than this entire self-hosted stack combined. Not yet
  resolved - a real decision for the Cloud Monitoring phase: keep both
  (redundant but gives log aggregation Prometheus can't), or retire one.
- **No alerting yet** - everything above is purely observational.
  `prometheus/04-prometheus-rules/` and AlertManager are still empty/unbuilt.
- **Cluster is at ~89-90% memory requests at steady state** - stable
  today (nothing needs surge capacity since the `maxSurge:0` rollout
  strategy fix), but there's no real headroom for adding another
  component without either trimming further or growing the node pool.

## 7. Where to go for more detail

| Topic | Doc |
|---|---|
| Prometheus deploy/verify/architecture | `prometheus/README.md` |
| Node/pod PromQL walkthrough (10 queries) | `prometheus/cheatsheets/node-and-pod-status-walkthrough.md` |
| Advanced dashboard queries + use cases + verification | `prometheus/cheatsheets/new-dashboards-promql-reference.md` |
| Grafana install + dashboard building | `grafana/README.md`, `grafana/documentation/install-and-dashboard-guide.md` |
| Application metrics queries | `application-metrics/README.md`, `application-metrics/documentation/application-metrics-queries.md` |
| Full roadmap and folder layout | `README.md` (this folder's parent) |
