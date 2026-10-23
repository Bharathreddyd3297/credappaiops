# Classroom Walkthrough - Node Status & Pod Status

Live-demo script: deploy with plain `kubectl apply -f` (no script, so
students see exactly what's created), then run these 10 queries in order.

## Deploy

```bash
kubectl apply -f observability/prometheus/01-prometheus-server/prometheus.yaml
kubectl apply -f observability/prometheus/02-node-exporter/node-exporter.yaml
kubectl apply -f observability/prometheus/03-kube-state-metrics/kube-state-metrics.yaml
kubectl get pods -n monitoring -o wide
```

## Log in

```bash
kubectl port-forward -n monitoring svc/prometheus 9090:9090
```
Browse to `http://localhost:9090` → **Graph**.

## Queries

**Health check:**

1. `up` - every scrape target, reachable or not
2. `up{job="node-exporter"}` - one row per node
3. `up{job="kube-state-metrics"}` - object-state metrics flowing

**Node status:**

4. `100 - (avg by (instance) (rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)` - CPU usage % per node
5. `node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes * 100` - memory available % per node
6. `node_filesystem_avail_bytes{mountpoint="/",fstype!="tmpfs"}` - free disk space per node

**Pod status (CredPay's own app, seen through Prometheus):**

7. `kube_pod_status_phase{namespace="credpay"} == 1` - every CredPay pod's current phase
8. `kube_deployment_status_replicas_available{namespace="credpay"}` - available replicas per Deployment
9. `kube_pod_container_status_restarts_total{namespace="credpay"} > 0` - crash-loop detector
10. `count(kube_pod_info) by (namespace)` - pod count across every namespace, cluster-wide
