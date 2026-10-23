# Step-by-Step: Deploying the Observability + AIOps Platform (kubectl only)

This is a hands-on runbook: every command needed to stand up Prometheus,
Node Exporter, kube-state-metrics, Grafana, and the CredAI (`ai-service`)
assistant on an existing AKS cluster — **using `kubectl`/`docker`/`az` CLI
commands only, no PowerShell scripts.** Run these from any bash-compatible
shell (Git Bash, WSL, macOS/Linux Terminal).

This assumes the rest of CredPay (frontend, user-service, payment-service,
PostgreSQL) is already deployed via the normal pipeline/Terraform flow —
this guide only covers the **observability and AIOps layer**, which is
intentionally *not* wired into `azure-pipelines.yml` (see
`AIOps-From-Prometheus-To-AI-Service.md` §1 for why).

For the concepts behind each step, read
`AIOps-From-Prometheus-To-AI-Service.md` first. This document is the
"how"; that one is the "why."

---

## Table of contents

1. [Prerequisites](#1-prerequisites)
2. [Deploy Prometheus](#2-deploy-prometheus)
3. [Deploy Node Exporter](#3-deploy-node-exporter)
4. [Deploy kube-state-metrics](#4-deploy-kube-state-metrics)
5. [Verify the metrics stack](#5-verify-the-metrics-stack)
6. [Deploy Grafana](#6-deploy-grafana)
7. [Import the pre-built dashboards](#7-import-the-pre-built-dashboards)
8. [Build and push the ai-service image](#8-build-and-push-the-ai-service-image)
9. [Apply RBAC and ConfigMap](#9-apply-rbac-and-configmap)
10. [Create the Azure OpenAI Secret](#10-create-the-azure-openai-secret)
11. [Deploy ai-service](#11-deploy-ai-service)
12. [Verify end to end](#12-verify-end-to-end)
13. [Updating / rotating the OpenAI API key later](#13-updating--rotating-the-openai-api-key-later)
14. [Troubleshooting](#14-troubleshooting)
15. [Tearing everything down (and starting over)](#15-tearing-everything-down-and-starting-over)

---

## 1. Prerequisites

- `kubectl` pointed at the right cluster:
  ```bash
  az aks get-credentials --resource-group rg-credpays1 --name aks-credpays1 --overwrite-existing
  kubectl get nodes
  ```
- `docker` running locally (Docker Desktop or equivalent).
- `az` CLI logged in (`az login`) with access to the ACR (`credpayacrs1`)
  and the Azure AI Foundry resource.
- The repo checked out locally — every path below is relative to the repo
  root.

## 2. Deploy Prometheus

`prometheus.yaml` creates the `monitoring` namespace itself — no separate
namespace step needed.

```bash
kubectl apply -f observability/prometheus/01-prometheus-server/prometheus.yaml
kubectl rollout status deployment/prometheus -n monitoring --timeout=180s
```

## 3. Deploy Node Exporter

A DaemonSet — one Pod per node, reading node-level CPU/memory/disk.

```bash
kubectl apply -f observability/prometheus/02-node-exporter/node-exporter.yaml
kubectl rollout status daemonset/node-exporter -n monitoring --timeout=180s
```

## 4. Deploy kube-state-metrics

Exposes Kubernetes object state (Pod phase, Deployment replicas, HPA
status, configured resource requests/limits) as Prometheus metrics — this
is what lets PromQL see things like "how many replicas does this
Deployment want" at all.

```bash
kubectl apply -f observability/prometheus/03-kube-state-metrics/kube-state-metrics.yaml
kubectl rollout status deployment/kube-state-metrics -n monitoring --timeout=120s
```

*(All three of the above are also captured in one script,
`observability/prometheus/deploy.sh` — read it if you want to see the
exact same three commands run in sequence.)*

## 5. Verify the metrics stack

```bash
kubectl get pods -n monitoring
```

Expect `prometheus-...`, one `node-exporter-...` per node, and
`kube-state-metrics-...`, all `1/1 Running`.

Check that Prometheus is actually scraping everything (not just running):

```bash
kubectl port-forward -n monitoring svc/prometheus 9090:9090
```

In another terminal (or a browser at `http://localhost:9090/targets`):

```bash
curl -s http://localhost:9090/api/v1/targets | grep -o '"health":"[a-z]*"' | sort | uniq -c
```

Every target should show `"health":"up"`. If any show `"down"`, see
[§14 Troubleshooting](#14-troubleshooting).

## 6. Deploy Grafana

Pre-wired to the Prometheus Service above — nothing to configure by hand.

```bash
kubectl apply -f observability/grafana/02-datasource/grafana-datasource.yaml
kubectl apply -f observability/grafana/01-installation/grafana.yaml
kubectl rollout status deployment/grafana -n monitoring --timeout=180s
```

```bash
kubectl port-forward -n monitoring svc/grafana 3000:3000
```

Open `http://localhost:3000` — login `admin` / `admin`, then **change the
password immediately** when prompted.

## 7. Import the pre-built dashboards

This one step is a UI action, not a `kubectl` command — Grafana dashboards
here are imported through the browser, not auto-provisioned via a
ConfigMap sidecar:

1. In Grafana: **Dashboards → New → Import**.
2. Upload each file from `observability/grafana/03-dashboards/` (six total:
   node status, pod status, node resource gauges, workload health,
   container resource usage, application metrics).
3. Select the Prometheus datasource when prompted → **Import**.

Full click-by-click walkthrough with screenshots-equivalent detail:
`observability/grafana/documentation/install-and-dashboard-guide.md`.

## 8. Build and push the ai-service image

```bash
az acr login --name credpayacrs1

cd ai-service
docker build -t credpayacrs1.azurecr.io/credpay/ai-service:latest .
docker push credpayacrs1.azurecr.io/credpay/ai-service:latest
cd ..
```

## 9. Apply RBAC and ConfigMap

```bash
kubectl apply -f k8s/ai-service/rbac.yaml
kubectl apply -f k8s/ai-service/configmap.yaml
```

`rbac.yaml` creates a dedicated `credai-service` ServiceAccount with a
**namespaced Role** (not a ClusterRole) — read-only `get/list/watch` on
`pods`, `events`, and `apps/deployments`, scoped to the `credpay` namespace
only. Nothing broader is granted, on purpose (see the companion doc §7.9
and §9 for why this matters).

## 10. Create the Azure OpenAI Secret

**This is the one thing that's genuinely different every time** — it
depends on your own Azure OpenAI / Azure AI Foundry deployment, and it's
never committed to git (`k8s/ai-service/secret.example.yaml` in the repo is a
placeholder template only).

### 10.1 Find your real values

You need four things: the endpoint, the API key, the deployment name, and
the API version.

```bash
# List your Cognitive Services / AI Foundry accounts:
az cognitiveservices account list --query "[].{name:name, rg:resourceGroup, kind:kind}" -o table

# Get the endpoint for the one you're using:
az cognitiveservices account show \
  --name <your-resource-name> \
  --resource-group <your-resource-group> \
  --query "properties.endpoint" -o tsv

# List the deployment names that actually exist under that resource -
# do NOT assume the project name (from the Foundry portal URL) is the
# deployment name. They are two different things - see the companion
# doc, section 7.5, for the exact mistake this caused here.
az cognitiveservices account deployment list \
  --name <your-resource-name> \
  --resource-group <your-resource-group> \
  -o table
```

The endpoint the portal shows you may end in `/openai/v1/responses` —
that's fine to use as-is; `ai-service/app/config/settings.py` strips a
trailing `/responses` automatically before calling the SDK (see the
companion doc §7.2 for why that matters).

### 10.2 Create the Secret

```bash
kubectl create secret generic credai-secrets \
  --namespace credpay \
  --from-literal=OPENAI_ENDPOINT="<your-endpoint>" \
  --from-literal=OPENAI_KEY="<your-api-key>" \
  --from-literal=OPENAI_DEPLOYMENT="<your-deployment-name>" \
  --from-literal=OPENAI_API_VERSION="2025-08-07" \
  --dry-run=client -o yaml | kubectl apply -f -
```

PowerShell version of the same command (backtick line continuation):

```powershell
kubectl create secret generic credai-secrets `
  --namespace credpay `
  --from-literal=OPENAI_ENDPOINT="<your-endpoint>" `
  --from-literal=OPENAI_KEY="<your-api-key>" `
  --from-literal=OPENAI_DEPLOYMENT="<your-deployment-name>" `
  --from-literal=OPENAI_API_VERSION="2025-08-07" `
  --dry-run=client -o yaml | kubectl apply -f -
```


The `--dry-run=client -o yaml | kubectl apply -f -` pattern makes this
safe to run repeatedly — it creates the Secret the first time and updates
it in place on every later run, without ever needing `kubectl delete`
first.

**Never** put real values directly into a `.yaml` file that gets
committed. This command is the only place the real key should exist.

## 11. Deploy ai-service

```bash
kubectl apply -f k8s/ai-service/deployment.yaml
kubectl apply -f k8s/ai-service/service.yaml
kubectl apply -f k8s/ai-service/hpa.yaml
kubectl apply -f k8s/ai-service/ingress.yaml
```

This adds a **second, separate** `Ingress` object (`path: /api/ai`) —
it does not modify `k8s/ingress/ingress.yaml`. ingress-nginx merges
multiple `Ingress` resources that share the same `ingressClassName`
automatically.

## 12. Verify end to end

```bash
kubectl rollout status deployment/credai-service -n credpay --timeout=120s
kubectl get pods -n credpay -l app.kubernetes.io/name=credai-service
```

Health check:

```bash
kubectl port-forward -n credpay svc/credai-service 8010:8010
curl http://localhost:8010/api/ai/health
```

Expect `"status":"ok"` with `prometheus` and `azure_openai` both `"ok"`.
(`kubernetes` should also be `"ok"` if you applied §9's RBAC correctly;
`azure_monitor`/`log_analytics` will show `"not_configured"` unless you've
set up the optional Service Principal — that's expected, not an error.)

A real chat request:

```bash
curl -s -X POST http://localhost:8010/api/ai/chat `
  -H "Content-Type: application/json" `
  -d '{"message": "How is my cluster?", "history": []}'
```

You should get back a JSON body with a `reply` field containing a real,
multi-sentence answer built from your actual cluster's telemetry.

## 13. Updating / rotating the OpenAI API key later

If your key is rotated/regenerated in Azure (or you switch to a different
Azure OpenAI resource), update the live Secret the same way you created
it — re-run the same command from [§10.2](#102-create-the-secret) with
the new value. It's idempotent:

```bash
kubectl create secret generic credai-secrets \
  --namespace credpay \
  --from-literal=OPENAI_ENDPOINT="<endpoint>" \
  --from-literal=OPENAI_KEY="<new-key>" \
  --from-literal=OPENAI_DEPLOYMENT="<deployment-name>" \
  --from-literal=OPENAI_API_VERSION="2025-08-07" \
  --dry-run=client -o yaml | kubectl apply -f -
```

**Then restart the Deployment** — updating a Secret does **not**
automatically restart the Pods using it as environment variables. The old
key stays in the running container's environment until you force a
restart:

```bash
kubectl rollout restart deployment/credai-service -n credpay
kubectl rollout status deployment/credai-service -n credpay
```

To change just one field (e.g. only the key, leaving the rest alone),
`kubectl patch` is a lighter-weight alternative to re-running the full
`create`:

```bash
kubectl patch secret credai-secrets -n credpay --type merge \
  -p '{"stringData":{"OPENAI_KEY":"<new-key>"}}'
kubectl rollout restart deployment/credai-service -n credpay
```

Confirm the rotation actually worked the same way as §12 — health check,
then a real chat request.

## 14. Troubleshooting

Real problems hit while building this exact platform, in the order
they'd typically show up:

**Prometheus targets show `"health":"down"`** — usually node-exporter or
kube-state-metrics not yet `Running`; re-check `kubectl get pods -n
monitoring` and re-run §5 once they're up.

**`credai-service` health check shows `"kubernetes":"unavailable"`** even
though pods/deployments clearly exist — check the RBAC was actually
applied (`kubectl get role,rolebinding -n credpay | grep credai-service`).
If it's there and this still happens, you may have an older image built
before this was fixed (see companion doc §7.9) — rebuild from the current
`ai-service/` source.

**Chat returns `503 CredAI's language model is currently unavailable`**
— check the Pod logs for the real Azure OpenAI error, it's always logged:
```bash
kubectl logs deployment/credai-service -n credpay --tail=50
```
Common causes, in the order we actually hit them: wrong deployment name
(§10.1 — verify with `az cognitiveservices account deployment list`, not
by re-reading the portal URL), an `openai` SDK version too old for the
Responses API, or an `api-version` query param being sent to a `/v1`-shape
endpoint that rejects it. All three are already fixed in this repo's
`ai-service/` source as of this guide — if you're hitting one of them,
you're likely running an older image; rebuild.

**Chat responses cut off mid-sentence** — the model ran out of
`max_output_tokens` before finishing (reasoning models spend part of that
budget on hidden reasoning tokens). Already tuned in this repo's
`app/clients/openai_client.py` (`reasoning={"effort": "low"}`,
`max_output_tokens=3500`) — if you still see truncation on a very
data-heavy question, that value can be raised further.

**`ImagePullBackOff` on `credai-service`** — confirm the image was
actually pushed (`az acr repository show-tags --name credpayacrs1
--repository credpay/ai-service`) and that AKS has `AcrPull` on your ACR:
```bash
az aks update --resource-group rg-credpays1 --name aks-credpays1 --attach-acr credpayacrs1
```

## 15. Tearing everything down (and starting over)

For a full, dedicated teardown runbook (individual removal steps, a
one-line fast path, PVC/persistent-data notes, and verification), see the
companion document: **`MONITORING-REMOVAL-GUIDE.md`**. It removes exactly
what this guide builds — nothing in the core app (frontend/user-service/
payment-service) or the git repository is ever touched — and ends by
pointing back to [§2](#2-deploy-prometheus) of this guide to rebuild.
