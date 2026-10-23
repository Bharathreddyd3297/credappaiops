# Application Metrics

Custom, business-level metrics from CredPay's own services - the first
phase where the metrics pipeline sees the *application*, not just
infrastructure/Kubernetes object state. Both changes are additive: same
ports, same probes, same Deployment strategy - only a new metrics
endpoint and three annotations were added.

## What changed

| Service | Library | Endpoint | Deployment annotation |
|---|---|---|---|
| `user-service` (Spring Boot) | `spring-boot-starter-actuator` + `micrometer-registry-prometheus` | `GET /actuator/prometheus` | `k8s/user-service/deployment.yaml` |
| `payment-service` (FastAPI) | `prometheus-fastapi-instrumentator` | `GET /metrics` | `k8s/payment-service/deployment.yaml` |

Both endpoints are picked up automatically by Prometheus's existing
`kubernetes-pods` scrape job
(`observability/prometheus/01-prometheus-server/prometheus.yaml`) - that
job has been wired up and scraping zero targets since Phase 1;
annotating these two Deployments is what finally gives it something to
find. No changes were needed to Prometheus's own config, and no changes
were made to `azure-pipelines.yml` - the existing pipeline already builds
these images and applies these Deployment files on every run.

## Deploy

There's no new component to install here - just rebuild and redeploy the
two services as usual (either via the existing pipeline, or manually):

```bash
kubectl apply -f k8s/user-service/
kubectl rollout restart deployment/user-service -n credpay
kubectl apply -f k8s/payment-service/
kubectl rollout restart deployment/payment-service -n credpay
```

## Verify

```bash
# 1. Confirm the endpoints exist on a running pod
kubectl exec -n credpay deployment/user-service -- wget -qO- http://localhost:8080/actuator/prometheus | head -20
kubectl exec -n credpay deployment/payment-service -- wget -qO- http://localhost:8000/metrics | head -20

# 2. Confirm Prometheus now has non-zero "kubernetes-pods" targets
kubectl exec -n monitoring deployment/prometheus -- wget -qO- http://localhost:9090/api/v1/targets \
  | grep -o '"job":"kubernetes-pods"[^}]*"health":"[a-z]*"'
```

If step 2 shows `"health":"up"` entries (there were **zero** before this
phase), the annotation-based discovery is working end-to-end.

## Example PromQL queries

See `documentation/application-metrics-queries.md` for the full list with
explanations. Quick preview:

```promql
# user-service - request rate by endpoint
sum(rate(http_server_requests_seconds_count{job="kubernetes-pods"}[5m])) by (uri)

# payment-service - request rate by path and status code
sum(rate(http_requests_total{job="kubernetes-pods"}[5m])) by (handler, status)
```

## What's deliberately not changed

Probes remain TCP/HTTP `/health` as before (upgrading `user-service`'s
probes to `httpGet /actuator/health` is a separate, optional change, not
part of this phase). No AlertManager rules reference these metrics yet -
that's a later module.
