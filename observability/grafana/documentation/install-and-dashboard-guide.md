# Installing Grafana & Building Your First Dashboard - Step by Step

Three parts: installing Grafana from the plain YAML files (no script, so
every step is visible), importing two pre-built dashboards so you have
something real on screen in under a minute, and (optional) building a
panel from scratch to understand how they're made.

---

## Part 1 - Install Grafana

### Step 1 - Confirm Prometheus is already running

Grafana is useless without something to query. Check first:

```bash
kubectl get pods -n monitoring
```

You should see `prometheus`, one `node-exporter` pod per node, and
`kube-state-metrics` all `Running`. If not, deploy those first:
`bash observability/prometheus/deploy.sh`.

### Step 2 - Apply the Prometheus datasource

```bash
kubectl apply -f observability/grafana/02-datasource/grafana-datasource.yaml
```

This is a ConfigMap Grafana reads on startup - it tells Grafana where
Prometheus lives *before Grafana even boots*, so the connection exists
automatically, with nothing to click through later.

### Step 3 - Apply Grafana itself

```bash
kubectl apply -f observability/grafana/01-installation/grafana.yaml
```

Creates the PVC (so dashboards/settings survive a restart), the
Deployment, and the Service.

### Step 4 - Watch it come up

```bash
kubectl get pods -n monitoring -l app.kubernetes.io/name=grafana -o wide
kubectl rollout status deployment/grafana -n monitoring
```

### Step 5 - Port-forward

```bash
kubectl port-forward -n monitoring svc/grafana 3000:3000
```

### Step 6 - Log in

Browse to `http://localhost:3000`.

- Username: `admin`
- Password: `admin`

Grafana immediately forces a new password - **set one**, even on a demo
cluster. This is the one manual credential step; everything else about
this install is automated.

### Step 7 - Confirm the datasource is already there

Left menu → **Connections → Data sources**. You should already see
**Prometheus**, pointing at
`http://prometheus.monitoring.svc.cluster.local:9090` - nothing you had
to type in. Click it, then **Save & test** at the bottom - expect a green
"Successfully queried the Prometheus API" message.

---

## Part 2 - Import the pre-built dashboards (fast path)

Two ready-to-import dashboards live in `observability/grafana/03-dashboards/`,
built from the exact same queries as
`observability/prometheus/cheatsheets/node-and-pod-status-walkthrough.md`:

| File | Dashboard | Panels |
|---|---|---|
| `credpay-node-status.json` | CredPay - Node Status Overview | Node Exporter targets up, CPU %, Memory %, Disk free |
| `credpay-pod-status.json` | CredPay - Pod & Kubernetes Status | kube-state-metrics target up, CredPay pod phase, available replicas, container restarts, pods per namespace |

### Step 8 - Import a dashboard

1. Left menu → **Dashboards → New → Import**
2. Click **Upload dashboard JSON file** and select
   `observability/grafana/03-dashboards/credpay-node-status.json`
3. When prompted for the **Prometheus** data source input, select the
   **Prometheus** datasource (the one auto-provisioned in Part 1)
4. Click **Import**

The dashboard renders immediately - no query typing required.

### Step 9 - Repeat for the second dashboard

Same steps, uploading `credpay-pod-status.json`. You now have both
dashboards side by side in **Dashboards**.

If a panel is empty, that's a real signal, not a bug in the dashboard -
see the Troubleshooting table at the end of this guide.

---

## Part 3 (optional) - Build a panel from scratch

Useful once, to understand what the imported dashboards are actually
doing under the hood - not required to have a working dashboard, since
Part 2 already gave you one.

### Step 10 - Create a new, empty dashboard

Left menu → **Dashboards → New → New Dashboard → Add visualization**.
When prompted for a data source, choose **Prometheus**.

### Step 11 - Build one panel by hand

In the query box, paste:

```promql
100 - (avg by (instance) (rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)
```

Click **Run queries** - one line per node should appear. On the right,
set **Panel title** to `Node CPU Usage %`, then **Apply** (top right), then
save the dashboard (save icon, top right) as `My First Dashboard`.

This is exactly panel 2 of `credpay-node-status.json` - compare the two
to see how a panel you built matches the JSON you imported.

### Step 12 (optional) - Add a variable to filter by node

Dashboard settings (gear icon) → **Variables → + New variable**:

- Name: `instance`
- Type: `Query`
- Data source: `Prometheus`
- Query: `label_values(node_cpu_seconds_total, instance)`

Save, then edit the panel's query to filter on it, e.g.
`...{instance=~"$instance"}...`. A dropdown now appears at the top of the
dashboard that filters the panel using it, live.

### Step 13 (optional) - Import a community dashboard instead

Real teams often start from a proven community dashboard, then
customize, rather than building every panel from scratch - same **Import**
screen as Part 2, but with a numeric ID instead of a file:

Left menu → **Dashboards → New → Import**. Enter a known dashboard ID
from grafana.com's dashboard library - e.g. **1860** ("Node Exporter
Full") or **315** ("Kubernetes cluster monitoring via Prometheus") -
select **Prometheus** as the data source when prompted, click **Import**.

### Step 14 - Prove the PVC works (data survives a restart)

```bash
kubectl delete pod -n monitoring -l app.kubernetes.io/name=grafana
kubectl get pods -n monitoring -l app.kubernetes.io/name=grafana -w
```

Once the new Pod is `Running`, port-forward again and log in with the
password you set in Step 6 (not `admin`/`admin`) - if it works, and the
dashboards imported in Part 2 are still there, the PVC did its job:
nothing was lost when the Pod was recreated.

---

## Troubleshooting quick reference

| Symptom | Likely cause |
|---|---|
| Grafana Pod stuck `Pending` | PVC not bound yet - check `kubectl get pvc grafana-data -n monitoring` and confirm the `managed-csi` StorageClass exists |
| Datasource "Save & test" fails | Check `kubectl get svc prometheus -n monitoring` exists; check `kubectl logs deployment/grafana -n monitoring` for the exact connection error |
| A panel shows "No data" | Usually a query typo - run the same query in Prometheus's own Graph page first (`kubectl port-forward -n monitoring svc/prometheus 9090:9090`) to confirm it returns something there |
| Login/password lost after a restart | Confirms the PVC isn't actually being used - check the Deployment's `volumeMounts`/`volumes` still reference `grafana-data` |
