# Prometheus

The metrics-collection layer of CredPay's observability stack: Prometheus
itself, plus the two exporters it needs to see the whole cluster (Node
Exporter for machine metrics, kube-state-metrics for Kubernetes object
state). Deployed together, as plain Kubernetes YAML - no Helm.

## What is Prometheus

Prometheus is an open-source metrics collection and query system. It
**pulls** metrics from targets on a schedule (rather than targets pushing
to it), stores them as time series in its own on-disk database (TSDB),
and exposes PromQL for querying that data - live, ad-hoc, or as the basis
for dashboards (Grafana, next) and alerts (AlertManager, a later module).

## Why Prometheus alone isn't enough

Prometheus only scrapes what something exposes. Out of the box, that's
just itself and the Kubernetes API/kubelets - it has no visibility into
real OS-level resource usage (CPU, memory, disk, network per node) or
into Kubernetes object state (is this Deployment fully rolled out? is
this HPA scaling?). That's what the two exporters below add:

| Folder | Adds | Answers |
|---|---|---|
| `01-prometheus-server/` | Prometheus itself | "What metrics exist, and how do I query them?" |
| `02-node-exporter/` | Real node-level CPU/memory/disk/network | "Is this node under resource pressure?" |
| `03-kube-state-metrics/` | Deployment/Pod/ReplicaSet/DaemonSet/Namespace/Service/HPA state | "Is this Deployment healthy, from the API server's point of view?" |

`04-prometheus-rules/` (recording/alerting rules) comes later, once
there's a real need to alert on what's being collected here.

## Deploy

```bash
bash observability/prometheus/deploy.sh
```

Applies all three (Prometheus, Node Exporter, kube-state-metrics) in
order and waits for each rollout. Safe to re-run (`kubectl apply` is
idempotent).

## Verify

```bash
bash observability/prometheus/verify.sh
```

Checks Pods (including one Node Exporter Pod per cluster node), the
Prometheus/kube-state-metrics Deployments, the PVC, each component's
logs, and queries Prometheus's own Targets API directly from inside its
Pod to confirm every scrape job reports `"health":"up"`.

## Access the UI

```bash
kubectl port-forward -n monitoring svc/prometheus 9090:9090
```

Then browse to `http://localhost:9090` - **Graph** to run PromQL,
**Status → Targets** to see every scrape job's health.

No Ingress, no LoadBalancer - Prometheus is an internal tool, reachable
only via `port-forward`.

## Resource footprint

**Incident (2026-07-14):** deploying this stack pushed a small, 2-node
AKS cluster (already at its cluster-autoscaler max node count) past its
scheduling capacity - `user-service`'s rolling update needs headroom for
a temporary 3rd Pod (`maxSurge: 1`), and there wasn't enough spare
CPU/memory left after Prometheus + Node Exporter + kube-state-metrics +
Grafana claimed their `requests`. The new Pod sat `Pending` with
`FailedScheduling` / `NotTriggerScaleUp` until this was fixed.

**Fix:** reduced `requests` only (not `limits`, so nothing lost its burst
ceiling) across all four components:

| Component | Before (cpu/mem) | After (cpu/mem) |
|---|---|---|
| Prometheus | 250m / 512Mi | 100m / 256Mi |
| Node Exporter (per node) | 100m / 64Mi | 50m / 32Mi |
| kube-state-metrics | 100m / 128Mi | 50m / 64Mi |
| Grafana | 100m / 256Mi | 50m / 128Mi |

On a 2-node cluster (Node Exporter runs once per node), that's a drop
from **650m CPU / 1024Mi memory** to **300m CPU / 512Mi memory** in total
requests - freeing roughly the 512Mi a stuck rollout needed. If this
stack ever moves to a cluster with real scheduling headroom (or a higher
autoscaler max), these can be raised again - the values above are a
scheduling-pressure fix, not a "this is the correct size forever" claim.

---

Supporting material spanning all of Prometheus lives in `labs/`
(hands-on exercises), `cheatsheets/` (quick PromQL/`kubectl` reference),
and `interview/` (interview-style Q&A) - populated as needed.
