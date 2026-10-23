# CredPay Kubernetes Manifests — Explained (Overview & Sequence)

This folder is a **teaching walkthrough** of every YAML file in `k8s/`,
written so you (or anyone) can explain them to someone else — a student,
a teammate, an interviewer — one file at a time, in the order they're
actually applied to the cluster. Each numbered file below covers one
deployment step and breaks its YAML down block by block.

This is different from `k8s/README.md`, which is an operator's runbook
("how do I deploy this"). These files are the **explainer's script**
("what does each block of this YAML actually mean, and why").

---

## The architecture, in one picture

```
                          Internet
                             │
                      ┌──────▼───────┐
                      │   Ingress    │   ingress-nginx controller
                      │   (credpay)  │   no host, no TLS — public LB IP
                      └──┬─────┬────┬┘
           /api/payment  │     │    │ /  (everything else)
           /api/users    │     │    │
           /api/cards    │     │    │
              ┌──────────▼┐ ┌──▼─────────┐ ┌▼──────────┐
              │ payment-  │ │   user-    │ │ frontend  │
              │ service   │ │  service   │ │ (React +  │
              │ (FastAPI  │ │ (Spring    │ │  Nginx)   │
              │  :8000)   │ │  Boot      │ │  :80      │
              └─────┬─────┘ │  :8080)    │ └───────────┘
                    │       └─────┬──────┘
                    └───────┬─────┘
                            │ sslmode=require
                   ┌────────▼─────────┐
                   │  Azure PostgreSQL │  (Flexible Server — outside AKS,
                   │  Flexible Server  │   managed by Terraform)
                   └───────────────────┘
```

Every arrow above is a **Kubernetes Service** doing name-based DNS
resolution (`user-service`, `payment-service`, `frontend` — all resolve
inside the cluster via CoreDNS to `<name>.credpay.svc.cluster.local`,
shortened to just `<name>` from within the same namespace). Nothing talks
to anything by IP address.

---

## Why the apply order matters

Kubernetes doesn't stop you from applying manifests in the wrong order —
most of the time it "works" because Kubernetes retries in the background.
But two specific dependencies in this project make order matter for a
**clean, first-time deploy without pods crash-looping**:

1. **ConfigMap/Secret before Deployments.** The Deployments use
   `envFrom: configMapRef` / `secretKeyRef` to inject `DB_HOST`,
   `DB_PASSWORD`, etc. If the ConfigMap/Secret don't exist yet, the pod
   is stuck in `CreateContainerConfigError` until they do.
2. **Database schema before the backends start.** `user-service` runs
   Hibernate with `ddl-auto=validate` — it does **not** create tables, it
   only checks they already exist and **crashes on startup** if they
   don't. The schema must be loaded into Postgres first.

Everything else (Services, Ingress, HPAs) is order-independent — they just
declare routing/scaling rules and don't care whether their target pods
exist yet.

## The sequence (also the order to explain these files in)

| # | File(s) | What it creates | Explained in |
|---|---------|------------------|--------------|
| 1 | `namespace/namespace.yaml` | The `credpay` namespace + its Pod Security level | [01-namespace.md](01-namespace.md) |
| 2 | `configmap/configmap.yaml` | Non-secret config (DB host, port, JDBC URL, JVM flags) | [02-configmap.md](02-configmap.md) |
| 3 | `secrets/secret.example.yaml` (+ real Secret created imperatively) | DB password, injected as env vars | [03-secret.md](03-secret.md) |
| 4 | `postgres/schema-init-job.yaml` | One-shot Job that loads `schema.sql` into Postgres | [04-schema-job.md](04-schema-job.md) |
| 5 | `user-service/*.yaml` | Spring Boot Deployment + Service + HPA | [05-user-service.md](05-user-service.md) |
| 6 | `payment-service/*.yaml` | FastAPI Deployment + Service + HPA | [06-payment-service.md](06-payment-service.md) |
| 7 | `frontend/*.yaml` | React/Nginx Deployment + Service + HPA | [07-frontend.md](07-frontend.md) |
| 8 | `ingress/ingress.yaml` | Single public entry point, path-based routing | [08-ingress.md](08-ingress.md) |

This is exactly the order `k8s/README.md`'s "Deployment order" section
applies them in — these files explain the *content*, that one explains the
*commands*.

## Concepts that repeat across almost every file

Rather than re-explain these in each file, here's what to recognize once
and then spot everywhere:

- **`metadata.labels`** — every resource carries
  `app.kubernetes.io/name` (this specific resource) and
  `app.kubernetes.io/part-of: credpay` (the whole app). Services and HPAs
  use `app.kubernetes.io/name` as their **selector** to find their pods —
  it's not decorative, it's how routing/scaling actually finds the right
  pods.
- **`envFrom: configMapRef` / `env: ... secretKeyRef`** — the standard
  Kubernetes pattern for injecting configuration and secrets as
  environment variables without baking them into the container image.
- **`securityContext`** (pod-level and container-level) — least-privilege
  hardening: non-root users, read-only root filesystems, dropped Linux
  capabilities. The frontend is the one deliberate exception (needs root
  to bind port 80) — see [07-frontend.md](07-frontend.md) for why, including
  a real incident where over-hardening it broke the container.
- **`readinessProbe` / `livenessProbe` / `startupProbe`** — readiness
  controls whether a pod receives traffic from its Service; liveness
  controls whether Kubernetes restarts it; startup gives slow-starting
  apps (like Spring Boot) breathing room before liveness checks begin.
- **`resources.requests` / `resources.limits`** — requests are what the
  scheduler reserves when placing the pod on a node; limits are the hard
  ceiling the container is killed/throttled at if exceeded.
