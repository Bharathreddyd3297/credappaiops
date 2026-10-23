# Verifying the Platform: Prometheus, Grafana, Azure, and a Live Load Test

A hands-on verification runbook: run this after
`STEP-BY-STEP-DEPLOYMENT-GUIDE.md` to prove the platform isn't just
*running*, but actually *working end to end* — metrics flowing, dashboards
rendering, Azure resources healthy, and finally, a real load test you can
watch scale a Deployment live in `kubectl`, in Grafana, and get explained
back to you in plain English by CredAI.

`kubectl`/`docker`/`az` commands only, no PowerShell — same convention as
the deployment guide.

---

## Table of contents

1. [Part A — Verify Prometheus: 10 PromQL queries](#part-a--verify-prometheus-10-promql-queries)
2. [Part B — Verify Grafana](#part-b--verify-grafana)
3. [Part C — Verify in the Azure portal](#part-c--verify-in-the-azure-portal)
4. [Part D — Load test: generate load, watch it scale, ask CredAI](#part-d--load-test-generate-load-watch-it-scale-ask-credai)
5. [Cleanup](#5-cleanup)

---

## Part A — Verify Prometheus: 10 PromQL queries

```bash
kubectl port-forward -n monitoring svc/prometheus 9090:9090
```

Open `http://localhost:9090/graph`, run each query below, and check it
against the **expected result** — this is a verification guide, not just a
tour, so "it returned something" isn't good enough on its own.

*(These are the same 10 queries from
`observability/prometheus/cheatsheets/node-and-pod-status-walkthrough.md`,
here with pass/fail criteria added.)*

| # | Query | Expected result |
|---|---|---|
| 1 | `up` | Every row `= 1`. Any `0` means that target is down — check §Troubleshooting in the deployment guide. |
| 2 | `up{job="node-exporter"}` | One row per AKS node, all `= 1`. |
| 3 | `up{job="kube-state-metrics"}` | Exactly one row, `= 1`. |
| 4 | `100 - (avg by (instance) (rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)` | One row per node, a sane percentage (usually low single/double digits at idle — not empty, not `NaN`). |
| 5 | `node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes * 100` | One row per node, a percentage between 0–100. |
| 6 | `node_filesystem_avail_bytes{mountpoint="/",fstype!="tmpfs"}` | Non-zero byte values per node. |
| 7 | `kube_pod_status_phase{namespace="credpay"} == 1` | One row per CredPay Pod, each showing its current phase (`Running` for everything healthy). |
| 8 | `kube_deployment_status_replicas_available{namespace="credpay"}` | One row per Deployment; the number should match `kubectl get deploy -n credpay`. |
| 9 | `kube_pod_container_status_restarts_total{namespace="credpay"} > 0` | **Empty result** in a healthy cluster. Any row here means something has restarted — investigate before moving on. |
| 10 | `count(kube_pod_info) by (namespace)` | A row per namespace with pods; `credpay`'s count should match `kubectl get pods -n credpay --no-headers \| wc -l`. |

If every query above matches its expected result, Prometheus is correctly
scraping both infrastructure (nodes) and application (CredPay) metrics.

## Part B — Verify Grafana

```bash
kubectl port-forward -n monitoring svc/grafana 3000:3000
```

1. **Datasource:** Configuration (gear icon) → Data Sources → Prometheus
   → **Test**. Expect a green "Data source is working" message.
2. **Each of the six dashboards renders real data, not "No Data":**

   | Dashboard | What to look for |
   |---|---|
   | `credpay-node-status` | Node Exporter targets all up, CPU/Memory %/Disk free showing live numbers |
   | `credpay-pod-status` | kube-state-metrics target up, every CredPay pod's phase, restart counts (should be 0) |
   | `credpay-node-resource-gauges` | CPU/Memory/Disk radial gauges moving, not stuck at 0 |
   | `credpay-kubernetes-workload-health` | Pods-by-namespace pie chart populated, Deployment availability at 100%, **HPA headroom panel showing current vs. max replicas** (this is the panel you'll watch move in Part D) |
   | `credpay-container-resource-usage` | Per-container CPU/memory (cAdvisor) populated, memory-vs-limit % reasonable (not near 100%, which would mean real OOM risk) |
   | `credpay-application-metrics` | HTTP request rate / latency panels showing traffic from the app |

3. **Auto-refresh:** confirm each dashboard's refresh interval (top-right,
   usually 30s or 1m) is actually ticking — if a panel's timestamp never
   updates, the datasource connection or the underlying scrape may be
   stuck even if the "Test" button above passed.

If a panel shows "No Data" but its underlying PromQL query works fine in
Part A, the problem is almost always the dashboard's configured time
range (top-right) being set somewhere with no data, not the platform
itself.

## Part C — Verify in the Azure portal

None of this requires `kubectl` — these are checks against the Azure
resources underneath the cluster, not the cluster itself.

| Resource | Where | What to verify |
|---|---|---|
| AKS cluster (`aks-credpays1`) | **Kubernetes services → aks-credpays1 → Insights** | Node CPU/memory charts show live data (this is Azure's own Container Insights view — separate from your self-hosted Grafana, and a useful cross-check that the two agree) |
| AKS cluster | **aks-credpays1 → Node pools** | Both nodes `Ready`, no pending upgrades stuck mid-way |
| Container Registry (`credpayacrs1`) | **Repositories → credpay/ai-service** | A `latest` tag exists with a recent "Last updated" timestamp matching your last `docker push` |
| Azure AI Foundry resource (`bharathreddy3297-0332-resource`) | **Azure AI Foundry portal → your project → Deployments** | The `gpt-5-mini` deployment shows **Succeeded** status, and check **Quota** (Management center → Quota) isn't near its rate limit — a quota exhaustion looks identical to "CredAI could not respond" from the frontend |
| Key Vault (`credpaykvs1`) | **Secrets** | `postgres-password` (and related) present, not expired |
| PostgreSQL Flexible Server (`psql-credpays1`) | **Overview** | Status `Available`, not `Stopped` |
| Log Analytics Workspace (`log-credpays1`) | **Logs → run `KubePodInventory \| take 10`** | Rows returned with recent `TimeGenerated` — confirms Container Insights is actively writing, independent of whether `ai-service`'s optional Log Analytics client is configured to read it (see `AIOps-From-Prometheus-To-AI-Service.md` for that distinction) |

## Part D — Load test: generate load, watch it scale, ask CredAI

This is the payoff: push real load at a Deployment, and watch the same
event show up in three different places — `kubectl`, Grafana, and
CredAI's own answers.

**Target:** `payment-service`, hitting its side-effect-free
`/api/payment/health` endpoint (already used by the pipeline's own smoke
test — safe to hammer, never touches the database). Requests: `100m` CPU
/ `128Mi` memory. HPA target: `75%` CPU, min `2` / max `6` replicas.

### D.1 Start watching, before generating any load

Open three terminals (or three panes) and leave these running for the
whole exercise:

```bash
# Terminal 1 - watch the HPA's replica count and CPU % live
kubectl get hpa payment-service -n credpay -w
```

```bash
# Terminal 2 - watch new Pods appear as it scales
kubectl get pods -n credpay -l app.kubernetes.io/name=payment-service -w
```

```bash
# Terminal 3 - Grafana, port-forwarded as in Part B
kubectl port-forward -n monitoring svc/grafana 3000:3000
```
In the browser: open `credpay-kubernetes-workload-health` (HPA headroom
panel) and `credpay-container-resource-usage` (CPU-vs-request %),
side by side.

### D.2 Generate load

A temporary Deployment of `busybox` Pods, each in a tight request loop
against `payment-service`'s internal ClusterIP address — the standard
pattern for demonstrating HPA scaling, scaled up via `--replicas` until
it's enough to push the target over its CPU threshold:

```bash
kubectl create deployment load-generator -n credpay --image=busybox:1.28 --replicas=10 -- /bin/sh -c "while true; do wget -q -O- http://payment-service.credpay.svc.cluster.local:8000/api/payment/health > /dev/null; done"
```
kubectl get hpa payment-service -n credpay -w

Give it 2–3 minutes. Watch Terminal 1: the `TARGETS` column's current
CPU % should start climbing toward and past `75%`, then `REPLICAS` should
increase (e.g. `2` → `3` → `4`).

**If nothing happens after ~5 minutes**, there isn't enough concurrent
load yet — scale the generator up:

```bash
kubectl scale deployment load-generator -n credpay --replicas=25
```

### D.3 Confirm the scale-up in all three places

1. **`kubectl`** (Terminals 1 and 2): `REPLICAS` above `2`, and new
   `payment-service-...` Pods in `ContainerCreating` → `Running`.
2. **Grafana:** the HPA headroom panel's current-replica line steps up;
   the CPU-vs-request % panel shows `payment-service` pods spiking well
   above 75%.
3. **CredAI:** ask it directly, either through the frontend's CredAI page
   or:
   ```bash
   curl -s -X POST http://<your-ingress-ip>/api/ai/chat \
     -H "Content-Type: application/json" \
     -d '{"message": "Which deployment consumes the highest CPU?", "history": []}'
   ```
   and also try the **Capacity Planning** quick action / "Any resource
   bottlenecks?" — while load is active, CredAI's answer should
   specifically name `payment-service`, cite CPU usage clearly above its
   configured request, and (if you ask "how is my cluster?") mention the
   HPA's increased replica count. This confirms the whole pipeline is
   live: real load → real Prometheus metrics → real HPA action → CredAI
   correctly reading and explaining all of it.

## 5. Cleanup

Stop the load and let the HPA settle back down:

```bash
kubectl delete deployment load-generator -n credpay
```

`payment-service` will **not** scale back down immediately — Kubernetes'
default scale-down stabilization window is 5 minutes of sustained low
usage before HPA removes replicas, specifically to avoid flapping. Watch
Terminal 1 for a few more minutes to see `REPLICAS` return to `2`, then
`Ctrl+C` out of all three watch terminals.

Re-run a couple of Part A's queries (9 in particular — restarts) to
confirm the load test didn't leave anything unhealthy behind.
