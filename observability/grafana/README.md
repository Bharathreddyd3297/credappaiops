# Grafana

The visualization layer on top of Prometheus. Grafana doesn't collect any
metrics itself - it queries Prometheus (already running in `monitoring`)
and turns PromQL into dashboards.

## Why Grafana

Chapter/queries like the ones in
`observability/prometheus/cheatsheets/node-and-pod-status-walkthrough.md`
work fine typed into Prometheus's own Graph page one at a time - but a
dashboard shows many of them together, continuously refreshing, which is
what an actual operations team would stare at day to day.

## Deploy

```bash
bash observability/grafana/deploy.sh
```

Applies the Prometheus datasource (auto-provisioned - no manual "Add data
source" click-through) and the Grafana Deployment/Service/PVC, then waits
for rollout.

## Verify

```bash
bash observability/grafana/verify.sh
```

Checks the Pod, Deployment, PVC, Service, logs, and queries Grafana's own
API from inside its Pod to confirm the Prometheus datasource is already
configured.

## Access

```bash
kubectl port-forward -n monitoring svc/grafana 3000:3000
```

Browse to `http://localhost:3000`.

- **Login:** `admin` / `admin` - Grafana forces a password change on
  first login. This is acceptable here only because Grafana is
  ClusterIP-only (no Ingress, no LoadBalancer, same trust model as
  Prometheus itself) - reachable exclusively via `port-forward`.
- **Datasource:** Go to Connections → Data sources - "Prometheus" is
  already there, pointing at
  `http://prometheus.monitoring.svc.cluster.local:9090`, nothing to
  configure.
- **Fastest path to a dashboard:** Dashboards → New → Import → upload a
  file from `03-dashboards/` (see below) → select the Prometheus
  datasource → Import. Renders immediately, no query typing required.

## Pre-built dashboards (`03-dashboards/`)

| File | Dashboard | Panel types |
|---|---|---|
| `credpay-node-status.json` | Node Exporter targets, CPU %, Memory %, Disk free per node | stat, timeseries |
| `credpay-pod-status.json` | kube-state-metrics target, CredPay pod phase, available replicas, restarts, pods per namespace | stat, table |
| `credpay-node-resource-gauges.json` | Per-node CPU/Memory/Disk as radial gauges, network I/O as bar gauges, load average | gauge, bargauge, stat |
| `credpay-kubernetes-workload-health.json` | Pods-by-namespace pie chart, Deployment availability, HPA headroom, restart counter, resource requests | piechart, bargauge, gauge, stat, table, timeseries |
| `credpay-container-resource-usage.json` | Per-container CPU/memory (cAdvisor), memory-vs-limit % (OOMKill risk), CPU-vs-request %, network I/O, top 10 by memory | timeseries, gauge, bargauge, table |
| `credpay-application-metrics.json` | user-service & payment-service request rate, error rate, p95 latency, JVM heap, DB pool | timeseries, gauge, stat |

All six use queries documented in
`observability/prometheus/cheatsheets/node-and-pod-status-walkthrough.md`,
`observability/prometheus/cheatsheets/new-dashboards-promql-reference.md`
(with a use case and a "what to verify" check per query), and
`observability/application-metrics/documentation/application-metrics-queries.md`.

## Full step-by-step guide

For a slower, click-by-click walkthrough - install, import the pre-built
dashboards, and (optionally) build one panel from scratch to see how
they're made - plus a troubleshooting section, see
`documentation/install-and-dashboard-guide.md`.

## What's deliberately not included

No AlertManager integration yet (a later module). No custom dashboards
beyond the six provided - `04-custom-dashboards/` is reserved for
whatever you build on top of these.
