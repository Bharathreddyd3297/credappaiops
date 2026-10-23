# New Dashboards - PromQL Reference, Use Cases & Verification

Every query behind the 3 new dashboards in
`observability/grafana/03-dashboards/`, with a real-world use case and a
concrete "what to verify" check for each - so you can demo *why* the
panel matters, not just that it renders.

Run these on Prometheus's **Graph** page
(`kubectl port-forward -n monitoring svc/prometheus 9090:9090`) before
showing them in Grafana, so you can explain the raw query first.

---

## Dashboard: `credpay-node-resource-gauges.json`

### 1. Node CPU Usage %

```promql
100 - (avg by (instance) (rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)
```

- **Use case:** Capacity planning and noisy-neighbor detection - if one
  node is consistently near 90%+ while others idle, workloads are
  unevenly scheduled or one Pod is CPU-hungry.
- **What to verify:** One gauge per cluster node (`kubectl get nodes`
  count should match the number of gauge values). Value should track
  roughly with real load - generate traffic against the app and confirm
  the gauge moves.

### 2. Node Memory Usage %

```promql
(1 - node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes) * 100
```

- **Use case:** Early warning before a node hits memory pressure and
  starts evicting Pods.
- **What to verify:** Compare against `kubectl describe node <name>` -
  the `Allocated resources` section's memory requests should roughly
  correlate with what this gauge shows as "in use."

### 3. Node Root Disk Usage %

```promql
(1 - node_filesystem_avail_bytes{mountpoint="/",fstype!="tmpfs"} / node_filesystem_size_bytes{mountpoint="/",fstype!="tmpfs"}) * 100
```

- **Use case:** Disk pressure is one of the least-monitored, most
  disruptive failure modes (image pulls and Pod scheduling fail
  silently-ish when a node runs low on disk).
- **What to verify:** Cross-check with `kubectl describe node <name>` for
  a `DiskPressure` condition - it should read `False` while this gauge is
  comfortably under its red threshold (90%).

### 4-5. Network Receive / Transmit Rate (Bytes/s)

```promql
rate(node_network_receive_bytes_total{device!="lo"}[5m])
rate(node_network_transmit_bytes_total{device!="lo"}[5m])
```

- **Use case:** Confirms traffic is actually flowing through a node -
  useful when diagnosing "is this node even receiving requests" during a
  blue/green cutover.
- **What to verify:** Hit the app through the Ingress a few times
  (`curl http://<ingress-ip>/`) and confirm the bar for the node
  currently running the live frontend color visibly increases.

### 6. Load Average (1m)

```promql
node_load1
```

- **Use case:** A single, well-understood number ops teams have used for
  decades - load above the node's core count means work is queuing, not
  just running.
- **What to verify:** Compare the value against
  `kubectl describe node <name>` → `Capacity: cpu:` - a load average
  consistently higher than that core count is a real overload signal.

---

## Dashboard: `credpay-kubernetes-workload-health.json`

### 7. Pods by Namespace (cluster-wide)

```promql
count(kube_pod_info) by (namespace)
```

- **Use case:** A "zoom out" view proving Prometheus now sees the whole
  cluster's object state, not just the `monitoring` namespace it lives in.
- **What to verify:** The `credpay` slice of the pie should match
  `kubectl get pods -n credpay --no-headers | wc -l`.

### 8. Deployment Availability % (credpay)

```promql
kube_deployment_status_replicas_available{namespace="credpay"} / kube_deployment_spec_replicas{namespace="credpay"} * 100
```

- **Use case:** The single number that answers "is CredPay actually
  fully up right now" - better than eyeballing `kubectl get pods`.
- **What to verify:** Should read 100% in steady state. Scale a
  Deployment down (`kubectl scale deployment/user-service -n credpay
  --replicas=1`) and confirm the bar drops proportionally, then scale
  back up and confirm it recovers.

### 9. Total Container Restarts (credpay)

```promql
sum(kube_pod_container_status_restarts_total{namespace="credpay"})
```

- **Use case:** A crash-loop detector at a glance - this number should
  almost always be flat.
- **What to verify:** Force a restart
  (`kubectl delete pod -n credpay -l app.kubernetes.io/name=payment-service`)
  and confirm the stat panel turns red and increments within one scrape
  interval (15s) of the new Pod starting.

### 10. HPA Scaling Headroom % (credpay)

```promql
kube_horizontalpodautoscaler_status_current_replicas{namespace="credpay"} / kube_horizontalpodautoscaler_spec_max_replicas{namespace="credpay"} * 100
```

- **Use case:** Shows how close an HPA is to its ceiling *before* it maxes
  out and stops being able to absorb more load.
- **What to verify:** Cross-check against
  `kubectl get hpa -n credpay` - the `current`/`max` columns there should
  match this gauge's ratio exactly.

### 11. Node Exporter DaemonSet Ready %

```promql
kube_daemonset_status_number_ready{namespace="monitoring",daemonset="node-exporter"} / kube_daemonset_status_desired_number_scheduled{namespace="monitoring",daemonset="node-exporter"} * 100
```

- **Use case:** Meta-monitoring - confirms the monitoring stack itself is
  fully covering every node, not just that Prometheus is up.
- **What to verify:** Should read 100%. Cordon a node
  (`kubectl cordon <node>`) - the "desired" count should drop by one and
  the percentage should stay at 100% (not go down), proving DaemonSets
  correctly exclude unschedulable nodes.

### 12. Pod Resource Requests (credpay)

```promql
kube_pod_container_resource_requests{namespace="credpay"}
```

- **Use case:** Shows what each container *asked for* (from
  `k8s/*/deployment.yaml` `resources.requests`), independent of what it's
  actually using - the basis for any capacity-planning conversation.
- **What to verify:** Values in the table should match the `requests:`
  block in the corresponding Deployment YAML exactly (e.g. user-service
  memory request = `512Mi`).

### 13. Pod Count Trend by Namespace

```promql
count(kube_pod_info) by (namespace)
```
(same query as #7, plotted as a **range** instead of an instant value)

- **Use case:** Turns a snapshot into a trend - shows *when* a namespace's
  Pod count changed, not just what it is right now.
- **What to verify:** Trigger a rollout restart
  (`kubectl rollout restart deployment/user-service -n credpay`) and
  confirm a visible, temporary bump in the `credpay` line as old and new
  Pods briefly coexist.

---

## Dashboard: `credpay-container-resource-usage.json`

Source: the `kubernetes-cadvisor` scrape job (added to
`observability/prometheus/01-prometheus-server/prometheus.yaml`) - cAdvisor
is built into every kubelet, so this required **no new component and no
RBAC changes**, only a new `scrape_configs` entry reusing the same
`nodes/proxy` permission the `kubernetes-nodes` job already had. This is
the one gap flagged after the first round of dashboards: actual
per-container CPU/memory usage, as opposed to what kube-state-metrics
reports (Deployment/Pod *object state*) or what the app itself reports
(request-level metrics).

### 17. Container CPU Usage (cores)

```promql
sum(rate(container_cpu_usage_seconds_total{namespace="credpay", container!="", image!=""}[5m])) by (pod, container)
```

- **Use case:** The actual, ground-truth CPU consumption per container -
  what `kubectl top pod` shows, but historical and graphable.
- **What to verify:** The `container!="", image!=""` filters exclude the
  per-Pod "pause" cgroup cAdvisor also reports - if you remove those
  filters you'll see extra, label-less series appear. Confirm each real
  CredPay container (`frontend`, `user-service`, `payment-service`) shows
  up by name.

### 18. Container Memory Working Set

```promql
sum(container_memory_working_set_bytes{namespace="credpay", container!="", image!=""}) by (pod, container)
```

- **Use case:** This is the *exact* number the kubelet's OOM-killer
  watches - not "total memory usage" (which includes reclaimable page
  cache), but the memory the kernel considers non-reclaimable.
- **What to verify:** Compare a pod's value here against its
  `resources.limits.memory` in the corresponding `k8s/*/deployment.yaml`
  - if this metric is closing in on that limit, expect an OOMKill soon.

### 19. Memory Usage vs Limit % (per pod)

```promql
sum(container_memory_working_set_bytes{namespace="credpay", container!="", image!=""}) by (pod)
/ sum(kube_pod_container_resource_limits{namespace="credpay", resource="memory"}) by (pod) * 100
```

- **Use case:** The single most important number in this dashboard -
  combines cAdvisor's *actual usage* with kube-state-metrics' *declared
  limit* in one query, across two different metric sources. This is
  exactly the number that predicts an OOMKill before it happens.
- **What to verify:** Should stay comfortably under 75% in steady state.
  To prove it responds, temporarily lower a Deployment's memory limit
  very close to its current usage and confirm the gauge jumps into red -
  then revert the change.

### 20. CPU Usage vs Request % (per pod)

```promql
sum(rate(container_cpu_usage_seconds_total{namespace="credpay", container!="", image!=""}[5m])) by (pod)
/ sum(kube_pod_container_resource_requests{namespace="credpay", resource="cpu"}) by (pod) * 100
```

- **Use case:** Unlike memory, CPU requests are *not* a hard ceiling -
  this can legitimately go over 100% (a "burstable" pod using more CPU
  than it requested, up to its limit). Useful for right-sizing
  `resources.requests.cpu` in the Deployment YAMLs based on real usage.
- **What to verify:** A pod consistently near 0% means its CPU request is
  oversized (wasting scheduling headroom); consistently over 150-200%
  means it's undersized - either way, the Deployment YAML's `requests.cpu`
  is worth revisiting.

### 21. Container Network Receive Rate

```promql
sum(rate(container_network_receive_bytes_total{namespace="credpay"}[5m])) by (pod)
```

- **Use case:** Per-pod (not per-node) network visibility - answers "is
  *this specific* payment-service pod receiving traffic" rather than
  "is this node."
- **What to verify:** During a blue/green cutover, the pod receiving
  traffic should show a clear signal while the idle color's pods stay
  near zero - a good way to confirm the Service selector flip actually
  worked, at the network level.

### 22. Top 10 Containers by Memory (cluster-wide)

```promql
topk(10, container_memory_working_set_bytes{container!="", image!=""})
```

- **Use case:** A cluster-wide "what's using the most memory right now"
  view, not scoped to `credpay` - useful for spotting a runaway container
  in `monitoring` itself (e.g. Prometheus's own memory creeping up) just
  as easily as in the app namespace.
- **What to verify:** Prometheus and Grafana's own containers should
  appear in this list too (they're containers like any other) - a good
  way to demonstrate that the monitoring stack monitors itself, not just
  the app it was built to watch.

---

## Dashboard: `credpay-application-metrics.json`

See `observability/application-metrics/documentation/application-metrics-queries.md`
for the base queries this dashboard is built from. Use cases and
verification specific to the dashboard panels:

### 14. Error Rate % gauges (both services)

- **Use case:** The two numbers that actually matter for a payments app -
  not "is the Pod Running" but "is it correctly processing requests."
- **What to verify:** Should read close to 0% in steady state. To prove
  it responds, temporarily point a request at a route that 500s (or
  stop the database connection briefly) and confirm the gauge visibly
  climbs into yellow/red within a few scrape intervals.

### 15. Requests In Flight (payment-service)

- **Use case:** A leading indicator of a stuck downstream dependency -
  climbs *before* error rate does, since hung requests haven't failed
  yet, just haven't finished.
- **What to verify:** Should return to near-zero between bursts of
  traffic. A number that only ever climbs and never drops means requests
  are leaking (never completing) - check for missing timeouts.

### 16. Combined Request Rate (both services)

- **Use case:** One number for a top-of-dashboard "is CredPay receiving
  traffic at all" check - useful as the very first thing to glance at.
- **What to verify:** Should be exactly `0` if no one is using the app,
  and visibly non-zero within 15-30 seconds of running the smoke-test
  curls from `k8s/README.md`'s "Final validation" section.
