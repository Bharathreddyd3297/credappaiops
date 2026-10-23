# Application Metrics - PromQL Queries

Run these on Prometheus's **Graph** page
(`kubectl port-forward -n monitoring svc/prometheus 9090:9090`) or paste
them into a Grafana panel. Metric names differ per service because each
uses a different instrumentation library - that's normal, not a
mismatch to fix.

## 0. Confirm scraping is actually working first

```promql
up{job="kubernetes-pods"}
```

Before this phase, this returned **nothing** (0 targets). Now it should
show one row per `user-service` and `payment-service` Pod, each `1`. If
it doesn't, see the Troubleshooting section in
`observability/application-metrics/README.md`.

---

## user-service (Spring Boot / Micrometer)

Metric prefix: `http_server_requests_seconds_*`, `jvm_*`, `hikaricp_*`,
`process_*`.

### 1. Request rate by endpoint

```promql
sum(rate(http_server_requests_seconds_count{job="kubernetes-pods", uri!="/actuator/prometheus"}[5m])) by (uri)
```

Requests per second, per route (`/api/users/login`, `/api/users/register`,
...). The `uri!=...` exclusion keeps Prometheus's own scrape of the
metrics endpoint out of the "real traffic" view.

### 2. Error rate by endpoint (HTTP 5xx)

```promql
sum(rate(http_server_requests_seconds_count{job="kubernetes-pods", status=~"5.."}[5m])) by (uri)
```

Non-zero here means user-service is actually returning server errors -
worth cross-checking against `kubectl logs deployment/user-service -n credpay`.

### 3. p95 latency by endpoint

```promql
histogram_quantile(0.95, sum(rate(http_server_requests_seconds_bucket{job="kubernetes-pods"}[5m])) by (le, uri))
```

95th-percentile response time per route - needs
`management.metrics.distribution.percentiles-histogram.http.server.requests=true`
(already set in `application.properties`) or this returns nothing.

### 4. JVM heap usage

```promql
jvm_memory_used_bytes{job="kubernetes-pods", area="heap"} / jvm_memory_max_bytes{job="kubernetes-pods", area="heap"} * 100
```

Heap usage % - compare against the `512Mi`/`768Mi` request/limit in
`k8s/user-service/deployment.yaml`.

### 5. Database connection pool saturation

```promql
hikaricp_connections_active{job="kubernetes-pods"} / hikaricp_connections_max{job="kubernetes-pods"} * 100
```

How much of the HikariCP pool (Spring Boot's default datasource pool,
connecting to the same Azure PostgreSQL every other CredPay service
uses) is currently in use.

---

## payment-service (FastAPI / prometheus-fastapi-instrumentator)

Metric prefix: `http_requests_total`, `http_request_duration_seconds_*`,
`http_requests_inprogress`.

### 6. Request rate by handler and status code

```promql
sum(rate(http_requests_total{job="kubernetes-pods"}[5m])) by (handler, status)
```

Requests per second, split by route and HTTP status - the FastAPI
equivalent of query 1, with status broken out directly.

### 7. Error rate (HTTP 5xx)

```promql
sum(rate(http_requests_total{job="kubernetes-pods", status=~"5.."}[5m])) by (handler)
```

The metric this phase exists to unlock: **is CredPay's actual payment
logic failing**, not just "is the Pod Running."

### 8. p95 latency by handler

```promql
histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket{job="kubernetes-pods"}[5m])) by (le, handler))
```

`prometheus-fastapi-instrumentator` exposes histogram buckets by
default - no extra config needed, unlike the Spring Boot side.

### 9. Requests currently in flight

```promql
http_requests_inprogress{job="kubernetes-pods"}
```

How many requests payment-service is handling *right now* - a sudden
sustained climb here, with no matching rise in the request-rate query,
usually means requests are hanging (e.g. a slow downstream DB call), not
that traffic increased.

---

## Both services together

### 10. Combined request rate, CredPay-wide

```promql
sum(rate(http_server_requests_seconds_count{job="kubernetes-pods"}[5m])) + sum(rate(http_requests_total{job="kubernetes-pods"}[5m]))
```

Total requests/second across both instrumented services - the single
number to watch on a top-level dashboard.
