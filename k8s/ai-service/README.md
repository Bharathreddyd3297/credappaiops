# CredAI Service - Kubernetes Manifests

Deploys `ai-service/` into the existing `credpay` namespace, alongside
`user-service`/`payment-service`/`frontend` - additive only. Nothing in
`k8s/user-service/`, `k8s/payment-service/`, `k8s/frontend/`, or
`k8s/ingress/ingress.yaml` was modified.

## Files

| File | Creates |
|---|---|
| `rbac.yaml` | `credai-service` ServiceAccount + namespaced Role + RoleBinding (read-only: Pods/Deployments/Events in `credpay` only) |
| `configmap.yaml` | Non-secret config (`PROMETHEUS_URL`, `KUBERNETES_NAMESPACE`, etc.) |
| `secret.example.yaml` | **Example only** - the real Secret is created out-of-band (see below), never committed |
| `deployment.yaml` | The `credai-service` Deployment (1 replica, `maxSurge: 0` - see the file's own comment for why) |
| `service.yaml` | ClusterIP Service, port 8010 |
| `hpa.yaml` | HPA, min 1 / max 3 |
| `ingress.yaml` | A **second, separate** Ingress routing only `/api/ai` - does not touch the existing `credpay` Ingress |

## Why the pipeline wasn't touched

Per this phase's constraints, `azure-pipelines.yml` was not modified.
This means `ai-service` is **not** yet built/pushed/deployed
automatically on every commit, unlike the other three services. Until
someone (deliberately, as a separate decision) extends the pipeline,
deploying a new version of `ai-service` is a manual process - the same
manual steps below.

## Deploy (manual, in order)

```bash
# 1. Build and push the image (from the ai-service/ directory)
az acr login --name credpayacrs1
docker build -t credpayacrs1.azurecr.io/credpay/ai-service:latest ai-service/
docker push credpayacrs1.azurecr.io/credpay/ai-service:latest

# 2. RBAC, ConfigMap
kubectl apply -f k8s/ai-service/rbac.yaml
kubectl apply -f k8s/ai-service/configmap.yaml

# 3. Secret - create the REAL one out-of-band (never commit real values,
#    same pattern as credpay-db's own Secret):
kubectl create secret generic credai-secrets \
  --namespace credpay \
  --from-literal=OPENAI_ENDPOINT="<your-endpoint>" \
  --from-literal=OPENAI_KEY="<your-key>" \
  --from-literal=OPENAI_DEPLOYMENT="<your-deployment-name>" \
  --from-literal=OPENAI_API_VERSION="2025-08-07" \
  --dry-run=client -o yaml | kubectl apply -f -

# 4. Deployment, Service, HPA, Ingress
kubectl apply -f k8s/ai-service/deployment.yaml
kubectl apply -f k8s/ai-service/service.yaml
kubectl apply -f k8s/ai-service/hpa.yaml
kubectl apply -f k8s/ai-service/ingress.yaml

# 5. Verify
kubectl rollout status deployment/credai-service -n credpay --timeout=120s
kubectl get pods -n credpay -l app.kubernetes.io/name=credai-service
kubectl logs deployment/credai-service -n credpay --tail=30
```

## Verify end-to-end

```bash
# From inside the cluster / via port-forward:
kubectl port-forward -n credpay svc/credai-service 8010:8010
curl http://localhost:8010/api/ai/health

# Through the Ingress, once DNS/IP is known (same Ingress IP as the rest of CredPay):
curl http://<INGRESS_IP>/api/ai/health
```

## Re-deploying after a code change

Same manual loop as step 1 + a restart:

```bash
docker build -t credpayacrs1.azurecr.io/credpay/ai-service:latest ai-service/
docker push credpayacrs1.azurecr.io/credpay/ai-service:latest
kubectl rollout restart deployment/credai-service -n credpay
kubectl rollout status deployment/credai-service -n credpay
```

## Notes

- **Resource footprint kept deliberately small** (1 replica, `100m`/`128Mi`
  request) - this cluster's 2-node pool is already near its memory
  ceiling (see `observability/prometheus/README.md`, "Resource
  footprint"). Raise once real usage data justifies it, and do so
  incrementally, checking `kubectl describe nodes` "Allocated
  resources" before and after - exactly the lesson learned twice already
  in this project.
- **Azure Monitor / Log Analytics access is optional.** If
  `AZURE_TENANT_ID`/`AZURE_CLIENT_ID`/`AZURE_CLIENT_SECRET` are left
  empty in the Secret, `ai-service` starts normally and simply omits
  those facts from its answers (see `ai-service/docs/Architecture.md`,
  "Graceful degradation").
