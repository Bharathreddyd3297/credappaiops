# CredPay + CredAI: Project Analysis and Enterprise-Readiness Assessment

| | |
|---|---|
| **Scope** | Entire `CredAppStage1/` folder: application code, Terraform, Kubernetes manifests, Azure DevOps pipelines, observability stack, AIOps service, and all `.md` documentation |
| **Date** | 2026-10-20 |
| **Method** | Every source file and manifest was read. Docs were cross-checked against the code. High-impact findings were re-verified directly in source. File references are given as `path:line`. |
| **Purpose** | Baseline for taking the capstone to an enterprise-grade, end-to-end DevOps + AIOps platform |

---

## Table of contents

1. [Executive summary](#1-executive-summary)
2. [What the project is today](#2-what-the-project-is-today)
3. [Maturity scorecard](#3-maturity-scorecard)
4. [Critical issues: fix before anything else](#4-critical-issues-fix-before-anything-else)
5. [Detailed findings by area](#5-detailed-findings-by-area)
   - 5.1 [Application services](#51-application-services)
   - 5.2 [Database and data management](#52-database-and-data-management)
   - 5.3 [Infrastructure as Code (Terraform)](#53-infrastructure-as-code-terraform)
   - 5.4 [Kubernetes platform](#54-kubernetes-platform)
   - 5.5 [CI/CD (Azure DevOps)](#55-cicd-azure-devops)
   - 5.6 [Observability](#56-observability)
   - 5.7 [AIOps service (CredAI)](#57-aiops-service-credai)
   - 5.8 [Security and compliance (cross-cutting)](#58-security-and-compliance-cross-cutting)
   - 5.9 [Documentation and repository hygiene](#59-documentation-and-repository-hygiene)
6. [Target enterprise architecture](#6-target-enterprise-architecture)
7. [Enhancement roadmap (phased)](#7-enhancement-roadmap-phased)
8. [Quick wins (under 1 day each)](#8-quick-wins-under-1-day-each)
9. [Capacity and cost considerations](#9-capacity-and-cost-considerations)
10. [Appendix A: Component inventory](#appendix-a-component-inventory)
11. [Appendix B: Doc vs. reality discrepancies](#appendix-b-doc-vs-reality-discrepancies)

---

## 1. Executive summary

CredPay is a three-tier, CRED-style credit-card bill-payment app:

- **React frontend**
- **Spring Boot `user-service`**
- **FastAPI `payment-service`**
- **Shared PostgreSQL**

It is deployed on **Azure AKS**, with infrastructure provisioned by **Terraform** and delivered by an **Azure DevOps** pipeline that does blue/green frontend releases gated by a smoke test.

**CredAI** sits on top of that. It is an AIOps FastAPI service. It reads Prometheus and Kubernetes telemetry, normalises it, and asks Azure OpenAI (`gpt-5-mini`) to answer operational questions in plain English. The answers appear on a page inside the app.

**What is genuinely strong**

- It is a real end-to-end flow: IaC → build → deploy → observe → AI insight, run against a live cluster.
- The incident write-ups are honest and root-caused. Examples:
  - the schema Job wiping data (`STAGE2-CHANGES.md` §2.7)
  - the `kubectl apply` blue/green selector reset (§2.5)
  - the nine-bug Azure OpenAI integration chain (`observability/AIOps-From-Prometheus-To-AI-Service.md` §7)
- The workloads are well hardened: non-root, read-only root FS, `drop: ALL`, seccomp, Pod Security Admission labels.
- Least-privilege, read-only RBAC is in place for CredAI.
- The documentation set is extensive (~14k lines) and good teaching material.
- The AIOps pattern is sound: deterministic telemetry retrieval, then LLM summarisation ("RAG for ops").

**What keeps it from being enterprise grade**

1. **Security fundamentals are missing in the app:**
   - Passwords are stored in plain text.
   - There is no authentication token or session, so every API trusts a client-supplied `userId`. That is an IDOR on every resource.
   - A user can pay with another user's card.
2. **Secrets hygiene:**
   - A live **Azure OpenAI API key is written in a markdown doc**.
   - The subscription ID is committed, in `terraform.tfvars` and again in `terraform.zip`.
3. **Network exposure:**
   - Plain-HTTP public ingress with no TLS.
   - Publicly reachable PostgreSQL, with a `0.0.0.0` "Allow Azure services" rule.
   - Public, unauthenticated AI endpoints, including a **raw PromQL passthrough**.
4. **Delivery:**
   - Deployments use the `:latest` tag plus `rollout restart`.
   - `terraform apply -auto-approve` runs with no plan or approval.
   - There are no tests, lint or SAST, and scanning does not block anything.
   - There is a single environment, the deploy pipeline is triggered manually, and the AI service is not in CI.
5. **Operations:**
   - No alerting, no SLOs, no tracing, no structured logs.
   - Prometheus and Grafana are single-replica.
   - Grafana uses `admin/admin`.
6. **Quality:**
   - **Zero automated tests** across all four services, with no LLM evaluation harness.
7. **Capacity:**
   - A fixed 2-node burstable (B2s) pool runs at about 90% of memory requests. Nothing can be added without resizing.

The project is a **strong capstone foundation at roughly "Level 2 of 5" enterprise maturity**. The roadmap in §7 takes it to Level 4 in six phases.

---

## 2. What the project is today

### 2.1 Architecture as deployed

```
                         Internet (HTTP only, no TLS, no WAF)
                                        │
                                        ▼
                     ingress-nginx (public LoadBalancer IP)
       ┌────────────┬──────────────┬──────────────┬──────────────┐
       │ /          │ /api/users   │ /api/payment │ /api/ai      │
       │            │ /api/cards   │              │              │
       ▼            ▼              ▼              ▼
  frontend svc   user-service   payment-service  credai-service        namespace: credpay
  (blue|green)   Spring Boot    FastAPI          FastAPI
  nginx, 2+2     Java 21, x2    Py 3.14, x2      Py 3.14, x1
                     │              │              │  │
                     └──────┬───────┘              │  └──► Azure OpenAI (gpt-5-mini, API key)
                            ▼                      │
           Azure PostgreSQL Flexible Server        ├──► K8s API (read-only Role)
           (B2s, public + 0.0.0.0 rule, TLS)       └──► Prometheus ─────────────┐
                                                                                │
   namespace: monitoring                                                        │
   Prometheus (1x, 10Gi, 15d) ◄── node-exporter, kube-state-metrics, cAdvisor,  │
        │                         apiserver, app /metrics (annotations)  ◄──────┘
        ▼
   Grafana (1x, 2Gi, admin/admin, 6 dashboards imported manually)

   Azure: AKS (Free tier, 2x B2s, Azure CNI + Azure NPM) · ACR (credpayacrs1, out-of-band)
          Key Vault (out-of-band, access-policy model) · Log Analytics + Container Insights
          Terraform state in Blob (credpaybaserg/credpaystatesa)
```

### 2.2 Delivery flow (`azure-pipelines.yml`, manually triggered)

```
Terraform (init → apply -auto-approve)
   → DockerBuild (frontend, user-service, payment-service → ACR as $(BuildId) + latest)
   → DeployToAKS
        get-credentials --admin → attach ACR → helm ingress-nginx (if missing)
        → Key Vault → create credpay-db Secret → schema Job (re-run every deploy)
        → backends: kubectl apply + rollout restart (pulls :latest)
        → frontend: deploy idle colour → kubectl exec smoke test → patch Service selector
        → apply Ingress → final validation dump
```

The other two pipelines do Trivy scanning only and never block a build. `azure-pipelines-2.yml` is the only pipeline with an active `main` trigger. `ai-service` is built and deployed by hand.

### 2.3 Repository layout

| Path | Contents |
|---|---|
| `frontend-react/` | React 18 + Vite + MUI 6, nginx runtime image, 8 pages including the CredAI chat |
| `user-service/` | Spring Boot 3.5.3 / Java 21; users and cards; actuator + Micrometer |
| `payment-service/` | FastAPI; pay and history; prometheus-fastapi-instrumentator |
| `ai-service/` | CredAI: FastAPI with Prometheus, K8s, Azure Monitor, Log Analytics and OpenAI clients |
| `terraform/` | Root + 6 modules (resource-group, networking, monitoring, postgres, keyvault, aks) |
| `k8s/` | Raw manifests per component plus `explained/` teaching docs |
| `observability/` | Prometheus, node-exporter, KSM, Grafana manifests, dashboards, AIOps and Azure-monitoring docs |
| `schema.sql`, `migrations/` | DDL + seed data; one manual migration |
| `azure-pipelines*.yml` | Deploy pipeline + two scan-only pipelines |
| `*.md` (root) | System design, tracker, Stage 1/2 change logs, runbooks, API docs, interview guide |

---

## 3. Maturity scorecard

Rating scale: 1 = ad hoc · 2 = repeatable · 3 = defined · 4 = managed/measured · 5 = optimised.

| Dimension | Score | Evidence | Target |
|---|:---:|---|:---:|
| Application security (authN/authZ, data protection) | **1** | Plain-text passwords, no tokens, IDOR on every resource, cross-user card use | 4 |
| Secrets management | **2** | Key Vault for the DB password; but OpenAI key in a doc, subscription ID committed, K8s Opaque secrets, SP secrets | 4 |
| Network security | **1** | No TLS, public PostgreSQL, no NSGs or NetworkPolicies, public AKS API, no WAF | 4 |
| Infrastructure as Code | **2–3** | Clean modules and a remote state; but single environment, no plan/approve, docs drift, out-of-band ACR and Key Vault | 4 |
| Kubernetes workload hardening | **3** | Strong securityContext and PSA labels; but `:latest`, no PDBs, no NetworkPolicies, TCP probes on user-service, frontend runs as root | 4 |
| CI/CD | **2** | Real pipeline with blue/green and smoke tests; but manual trigger, no tests or gates, mutable tags, no environments | 4 |
| Testing / quality | **1** | No unit, integration, contract, E2E, load (automated) or LLM eval tests | 4 |
| Observability: metrics | **3** | Prometheus, 8 scrape jobs, 6 custom dashboards, app metrics | 4 |
| Observability: logs / traces | **1–2** | Container Insights only; no structured logs, no tracing, no Diagnostic Settings | 4 |
| Alerting / SLOs / incident mgmt | **1** | No rules, no Alertmanager, no SLOs, no on-call routing | 4 |
| AIOps | **2–3** | Working grounded Q&A; but no auth, no guardrails, no eval, no anomaly detection, no remediation workflow | 4 |
| Reliability / HA / DR | **1–2** | 2-node burstable pool, single-replica monitoring and AI, burstable DB with no HA, no DR plan | 4 |
| Documentation | **3** | Extensive and candid; but several docs stale or contradictory (Appendix B) | 4 |

---

## 4. Critical issues: fix before anything else

These are ordered by risk. Items **C1–C3** should be done **before the folder is pushed to any remote**.

| # | Issue | Evidence | Action |
|---|---|---|---|
| **C1** | **Live Azure OpenAI API key in plaintext**, plus the real Foundry endpoint and deployment name | `observability/STEP-BY-STEP-DEPLOYMENT-GUIDE.md` ~lines 218–224 (twice) | **Rotate the key in Azure now.** Replace it with a placeholder. Move it to Key Vault. Add gitleaks as a pre-commit hook and a CI check. |
| **C2** | Subscription ID committed in two places | `terraform/terraform.tfvars:12`; `terraform.zip` (an old snapshot of `terraform/`, 35 files) | Delete `terraform.zip`. Pass the subscription ID as a **non-secret** pipeline variable or `ARM_SUBSCRIPTION_ID`. Git-ignore `*.tfvars` again. |
| **C3** | The repo boundary is wrong: the git root is `C:/Users/user` (the whole home directory), with no commits | `git rev-parse --show-toplevel` | Run `git init` **inside** `CredAppStage1/`. Never push the home-directory repo (it contains `.ssh`, `.aws`, `.azure`). |
| **C4** | Plain-text passwords | `user-service/.../service/UserService.java:35` (`.passwordHash(request.getPassword()) // plain text for now`), and `:53` compares with `equals` | BCrypt or Argon2 via `spring-security-crypto`. Migrate the existing rows. |
| **C5** | No authentication on any API; IDOR everywhere | Login returns only `userId` (`UserController.java:37-46`). The frontend stores `userId` in `localStorage` (`api.js:68-91`). `/api/cards/user/{id}` and `/api/payment/history/{id}` trust the path. | Add OIDC/JWT (Entra External ID or Keycloak). Validate at the gateway and in each service. Derive `userId` from the token. |
| **C6** | A user can pay with someone else's card | `payment-service/app/services.py:37-43` checks only that the card exists | Enforce `card.user_id == principal.user_id`. |
| **C7** | Unauthenticated, internet-exposed CredAI, including **arbitrary PromQL** | `ai-service/app/api/telemetry.py:27-35`; `k8s/ai-service/ingress.yaml` (no TLS, `ssl-redirect: false`); CORS `*` with credentials (`ai-service/app/main.py:77-83`) | Remove or admin-gate `/prometheus` and `/kubernetes`. Require auth. Restrict CORS. Disable `/docs` in production. |
| **C8** | Public PostgreSQL with a `0.0.0.0` rule; the app connects as server admin | `terraform/modules/postgres/main.tf:22,61-66`; `k8s/configmap/configmap.yaml` | VNet integration on the delegated `snet-postgres` (or a private endpoint). Drop the rule. Add an app role with least privilege. |
| **C9** | No TLS anywhere at the edge | `k8s/ingress/ingress.yaml:14-28` | Real hostname, cert-manager with Let's Encrypt (or a Key Vault certificate), HSTS. |
| **C10** | Payment transaction-ID race; history can return 500 | `services.py:10-23` (`count(*) + 1`); seed payments have NULL `transaction_id`, but `schemas.py:29` requires `str` | Use a UUID or ULID (or a DB sequence). Make the field `Optional`, or backfill the rows. Add an idempotency key. |

---

## 5. Detailed findings by area

### 5.1 Application services

#### user-service (Spring Boot 3.5.3, Java 21)

| Area | Current state | Gap |
|---|---|---|
| Endpoints | `POST /api/users/register`, `/login`; `POST /api/cards/add`; `GET /api/cards/user/{userId}`; `/api/users/health`; `/actuator/{health,prometheus}` | No `/me` endpoint, no logout or refresh, no pagination |
| Auth | None. Plain-text password compare. Seed users have fake bcrypt strings, so they cannot log in (`schema.sql:81-82`) | Spring Security, BCrypt, JWT resource server |
| Card handling | Full PAN received, masked to the last 4 before saving (`CardService.java:71-74`); no CVV | No Luhn check. Expiry checked by year only. `expiryYear` can overflow `Short`. AMEX masked as 4-4-4-4. The PAN transits the service, so it is in PCI scope (prefer tokenisation). |
| Validation / errors | Bean Validation on DTOs; `GlobalExceptionHandler` | The catch-all leaks `ex.getMessage()` (`GlobalExceptionHandler.java:54-58`). Registration race (exists-then-save). Email check is case-sensitive. |
| Config | Datasource defaults to `postgres/postgres` (`application.properties:15-17`) | Remove the fallback credential. Fail fast if it is missing. |
| Logging | Default text logs; `show-sql=true`, `format_sql=true` | JSON logs, correlation IDs, SQL logging off in production |
| Probes | Actuator present, but K8s uses **TCP** probes (`k8s/user-service/deployment.yaml:80-95`) | Use `/actuator/health/{liveness,readiness}` |
| Container | Multi-stage, non-root, JRE-alpine | `-DskipTests`, floating tags, no digest pin |
| Tests | **None** (`src/test` does not exist) | JUnit 5 + Testcontainers + MockMvc |

#### payment-service (FastAPI, Python 3.14)

| Area | Current state | Gap |
|---|---|---|
| Endpoints | `POST /api/payment/pay`, `GET /api/payment/history/{user_id}`, `/health`, `/api/payment/health`, `/metrics`, `/docs` | `/docs` open in production; no pagination |
| Payment logic | Validates that the user and card exist; status is hard-coded `SUCCESS` | No ownership check (C6), no expiry check, no idempotency key, no state machine (PENDING → SUCCESS/FAILED), no ledger/outbox |
| Money type | `float` in the model and schema over `NUMERIC(12,2)` (`models.py:47`, `schemas.py:15`) | Use `Decimal` end to end. Add an upper bound and a 2-decimal-place constraint. |
| Input validation | `upiId` `min_length=3` only | `^[\w.-]+@[\w]+$` regex, `max_length=100` |
| DB connection | f-string URL without URL-encoding; no `sslmode`; no pool tuning; `echo=True` logs SQL **with bound params** (UPI IDs, amounts) | `URL.create(...)`, `sslmode=require`, `pool_pre_ping`, `echo=False` |
| Health | Static `{"status":"UP"}` | Readiness should check the DB |
| Dependencies | `>=` lower bounds only, no lockfile | Pin with `pip-tools` or `uv` lock; hash-checked installs |
| Coupling | Reads the `users` and `cards` tables directly (shared-DB coupling) | Call user-service (or consume events), or own a read model |
| Tests | **None** | pytest + httpx `AsyncClient` + Testcontainers Postgres |

#### frontend-react (React 18, Vite 5, MUI 6)

| Area | Current state | Gap |
|---|---|---|
| Auth state | `userId`, `fullName` and `email` in `localStorage`; `ProtectedRoute` only checks that `userId` exists | OIDC (PKCE) with an in-memory token; axios interceptor; 401 handling |
| API wiring | Relative URLs by default (good; Stage 1 fix); `VITE_AI_API_URL` missing from `.env.example` | Document all env vars |
| UX / error handling | Load errors are silently turned into empty lists (`DashboardPage.jsx:80-89` and others) | Surface errors; add an error boundary |
| Card input | `maxLength: 19` truncates a spaced 16-digit PAN | Strip spaces before validating, or raise `maxLength` |
| nginx | SPA fallback, gzip, cache headers | No CSP, XFO, XCTO, Referrer-Policy or HSTS headers; `server_tokens` on; no `/healthz` |
| Container | Multi-stage node → nginx | **Runs as root** (blocks PSA `restricted`). Switch to `nginxinc/nginx-unprivileged` on port 8080. |
| Tooling | No ESLint, no tests, no TypeScript | ESLint + Prettier, Vitest + React Testing Library, Playwright E2E |

### 5.2 Database and data management

- **Schema** (`schema.sql`): `users`, `cards` (masked PAN), and `payments` with sensible CHECKs and FKs. It is idempotent after the Stage 2 fix (`CREATE TABLE IF NOT EXISTS` and guarded seeds).
- **Migrations:**
  - There is no migration tool. `schema.sql` is re-run **as server admin** on every deploy through a K8s Job.
  - `migrations/001_*.sql` is applied by hand.
  - On a fresh install it adds a *second* UNIQUE constraint on `transaction_id`.
- **Data integrity:**
  - `payments.user_id ... ON DELETE CASCADE` destroys the financial audit trail.
  - Seed rows hard-code IDs 1–3.
  - The `expiry_year >= 2024` CHECK will age badly.
- **Shared database:** one database serves both services. The doc defers DB-per-service as "later" (`systemdesign.md:208-219`).
- **Platform:**
  - Burstable `B_Standard_B2s`.
  - No HA, no geo-redundant backup.
  - 7-day PITR only.
  - `prevent_destroy` is commented out (`terraform/modules/postgres/main.tf:46-48`).

**Enterprise target**

- Flyway (user-service owns its tables) and Alembic (payment-service owns its tables). Migrations run as a dedicated migrator role in a pre-deploy step.
- Separate schemas or databases per service, with app roles that have least privilege.
- Use Entra ID authentication for PostgreSQL.
- Soft delete or `RESTRICT` for payments.
- Add `updated_at`, `idempotency_key UNIQUE`, and an index on `(user_id, created_at DESC)`.
- PostgreSQL General Purpose SKU with zone-redundant HA and geo-redundant backup, plus a tested restore runbook.

### 5.3 Infrastructure as Code (Terraform)

**What's good**

- Small, readable modules.
- Remote state with blob-lease locking.
- `random_password` for the DB, with the value pushed to Key Vault.
- Entra ID + Azure RBAC on AKS.
- Auto-upgrade channels set.
- Azure CNI + Azure network policy engine.
- `ignore_changes` on `node_count`.

**Gaps**

| Area | Finding | Reference |
|---|---|---|
| Environments | One hardcoded prefix (`credpays2`), no dev/stg/prod, minimal tags | `terraform/main.tf:5-13` |
| Bootstrap | ACR, Key Vault and the state storage account are created by hand (ClickOps) | `NEW-LAPTOP-RUNBOOK.md` §5 |
| AKS | Free tier (no SLA); a single `system` pool with min = max = 2 on **B2s**; no zones; no user pool; not private; no authorised IP ranges; local accounts enabled | `modules/aks/main.tf:30-45`, `terraform.tfvars:23-26` |
| Identity | **OIDC issuer and Workload Identity are not enabled**, although the README and header comment claim they are; no `key_vault_secrets_provider` | `modules/aks/main.tf` (absent), `terraform/README.md:45-47` |
| Network | No NSGs, private endpoints, private DNS, egress control (Firewall/NAT GW) or App Gateway/WAF; `snet-postgres` is unused and undelegated | `modules/networking/main.tf` |
| Postgres | Public + `0.0.0.0` rule; admin used by the app | `modules/postgres/main.tf:22,61-66` |
| Monitoring | Legacy `azurerm_log_analytics_solution` + omsagent; no DCRs, Diagnostic Settings, alerts, action groups or budgets | `modules/monitoring/main.tf` |
| Hygiene | `.terraform.lock.hcl` is git-ignored; no `validation` blocks; no tflint/checkov/terratest; README drift (VM size, node count, backend names) | `.gitignore:6`, `terraform/README.md` |
| Security add-ons | No Defender for Containers, no Azure Policy add-on | |

### 5.4 Kubernetes platform

**What's good**

- PSA `enforce: baseline` / `warn: restricted` on the `credpay` namespace.
- Strong `securityContext` on the backends and CredAI.
- HPAs on everything.
- `maxSurge: 0` chosen deliberately for the capacity limit.
- A dedicated SA and read-only Role for CredAI.

**Gaps**

| Area | Finding |
|---|---|
| Packaging | Raw YAML applied with `kubectl`; no Helm/Kustomize, no overlays, no GitOps |
| Images | `:latest` + `imagePullPolicy: Always` everywhere, so the running version is not reproducible and rollback is unreliable |
| Availability | No PodDisruptionBudgets, no topology spread or anti-affinity, no PriorityClasses; CredAI runs 1 replica with `maxUnavailable: 1`, so every rollout causes downtime |
| Network | **No NetworkPolicies**, even though Azure NPM is enabled; Prometheus, Grafana and the DB are reachable from any pod |
| Probes | user-service uses TCP; payment-service `/health` does not check the DB; CredAI's `/health` calls Prometheus and the K8s API on every liveness probe |
| Secrets | Opaque Secrets created by the pipeline or by hand; no CSI Secret Store or External Secrets |
| Governance | No ResourceQuota/LimitRange; user-service and payment-service run under the default SA with the token mounted |
| Ingress | HTTP only; `use-regex` is set but unused; no rate limiting, auth or WAF; two separate Ingress objects |
| HPA vs. capacity | HPA max values (6 per service, plus 2+2 idle/live frontend colours) cannot fit on 2× B2s |

### 5.5 CI/CD (Azure DevOps)

**What's good**

- Three-stage pipeline.
- Key Vault-sourced DB secret.
- Blue/green frontend with an in-pod smoke test before the traffic switch.
- Final validation step.
- A Trivy scanning experiment exists.

**Gaps**

| Area | Finding | Reference |
|---|---|---|
| Triggers | Deploy pipeline trigger is commented out (manual only); no PR validation | `azure-pipelines.yml:2-3` |
| Terraform | `terraformVersion: latest`; **`apply -auto-approve` on every run with no plan artifact or approval**; no fmt/validate/tflint/checkov | `azure-pipelines.yml:73-141` |
| Build | No unit tests, lint, SAST (CodeQL/Sonar), SCA, SBOM or image signing; `-DskipTests` | |
| Scanning | Trivy runs in separate pipelines, is **non-blocking** (no `--exit-code 1`), and pulls an unpinned template from `main` | `azure-pipelines-1.yml`, `-2.yml` |
| Tagging | Builds tag `$(Build.BuildId)` **and** `latest`, but deploys use `latest` + `rollout restart`, so the immutable tag is never deployed | `:187-189`, `:421-440` |
| Blue/green | Only the frontend; backends roll in place *before* the smoke test with no rollback; both colours share `:latest`, so the "old" colour pulls the new image when it restarts | `:468-551` |
| Environments | No ADO `environment:` or deployment jobs, so no approvals, checks or history; a single prod-like environment | |
| Identity | `get-credentials --admin` bypasses Azure RBAC; one SPN does both infra and cluster-admin; SPN secret rather than workload-identity federation | `:264-268` |
| Coverage | **ai-service is not built or deployed by any pipeline** | |
| Idempotency | `az aks update --attach-acr` and the Helm existence check run on every deploy | `:284-321` |

### 5.6 Observability

**Deployed and working**

- Prometheus v2.55.1: 1 replica, 10Gi PVC, 15-day retention, 8 scrape jobs.
- node-exporter, kube-state-metrics, and cAdvisor through the kubelet.
- Grafana 11.3.1 with the Prometheus datasource auto-provisioned.
- 6 hand-built dashboards covering node, pod, workload, container and app metrics.
- App metrics: Micrometer on user-service and the FastAPI instrumentator on payment-service.
- Azure: Container Insights → Log Analytics, KubeEvents, Activity Log and Resource Health. All are verified in `observability/cloud-monitoring/01-Azure-Cloud-Monitoring-Assessment.md`.

**Missing**

| Pillar | Gap |
|---|---|
| Alerting | **None.** No `rule_files`, no Alertmanager (`observability/alertmanager/README.md` is a one-line stub), no Azure Monitor alerts or action groups, no on-call routing, no runbooks |
| SLOs | None: no SLIs, error budgets, burn-rate alerts or recording rules |
| Logs | Container Insights only. App logs are plain text with no correlation ID. **Diagnostic Settings are empty** on AKS (no kube-audit), Key Vault, PostgreSQL and ACR. Ingestion uses shared-key auth. |
| Tracing | None: no OpenTelemetry, no Application Insights |
| Coverage | Frontend and **CredAI** are not instrumented; no business KPIs (payments/min, success rate, GMV) as first-class metrics |
| Prometheus | Single replica, no long-term storage, no `retention.size`, `insecure_skip_verify: true` on apiserver scraping |
| Grafana | `admin/admin` (`grafana/deploy.sh:20`); `verify.sh` hardcodes it; dashboards imported by hand (not provisioned as code); no SSO |
| Duplication | `ama-logs` uses more memory than the whole self-hosted stack, with an unresolved decision between self-hosted and Azure Managed Prometheus/Grafana |

### 5.7 AIOps service (CredAI)

**Design** (sound)

- Keyword intent classifier → `TelemetryCollector` (named PromQL + K8s API, optionally Azure Monitor/Log Analytics) → normaliser (`[source] label = value`) → per-use-case prompt template → Azure OpenAI Responses API (`gpt-5-mini`, `reasoning.effort=low`).
- It is strictly read-only, and the LLM never gets credentials to the data sources.
- Use cases: chat, root cause, cluster summary, business summary.

**Findings**

| Category | Finding | Reference |
|---|---|---|
| Security | No auth on any endpoint; public Ingress over HTTP; **raw PromQL passthrough**; CORS `*` + credentials; Swagger public | `api/telemetry.py:27-35`, `main.py:70-83` |
| Identity | Static OpenAI API key; Azure Monitor and Log Analytics through an SP client secret (not Workload Identity); required Azure roles undocumented | `clients/openai_client.py`, `clients/azure_monitor_client.py:41-53` |
| Prompt safety | One concatenated string with no system/user role separation; chat `history` roles not validated (a client can forge assistant turns); no Prompt Shields or Content Safety; no PII redaction of logs and events sent to the LLM | `prompt_builder/builder.py:88-92`, `models/schemas.py:46-48` |
| Performance | Sync OpenAI client and sync K8s client inside async handlers on a **single uvicorn worker**, so one slow LLM call blocks every request; Prometheus queries are serial, not `asyncio.gather` | `telemetry_collector.py:44-63,107-127` |
| Resilience | No explicit timeouts or retries on OpenAI, no circuit breaker, no cache for summaries, no rate limit or token budget | |
| Correctness | Evidence count uses total facts instead of per-source (`root_cause_service.py:40`); `total_requests_last_hour` is actually a per-second rate (`prometheus_client.py:146-149`); `namespace` request field ignored; namespace hardcoded in PromQL; `OPENAI_API_VERSION` unused; broad keywords ("why", "slow") send most queries to root-cause | |
| Health | Probes hit `/health`, which calls downstreams every time and always returns 200; the LLM check only tests whether config is present | `deployment.yaml:65-82` |
| Self-observability | No `/metrics`, no token/latency/cost metrics, `request_id` never set in logs, no tracing, no prompt/response audit log | `utils/logging.py` |
| Quality | **No tests and no evaluation harness** (golden questions, groundedness checks) | |
| Delivery | Not in CI; `:latest`; 1 replica | |
| Scope | Azure Monitor and Log Analytics clients exist but are not configured live; no anomaly detection, forecasting, alert correlation or remediation (remediation is "future, not designed") | `CredAI-Architecture-Story.md:216-218`, `aiops/01-AIOps-Architecture.md:530-537` |

### 5.8 Security and compliance (cross-cutting)

| Control | State |
|---|---|
| Identity for users | None (C4, C5) |
| Identity for workloads | K8s SA for CredAI only; everything else uses static secrets |
| Secrets | Key Vault (access-policy model) for the DB password only; OpenAI key in a doc; SP secrets; Opaque K8s secrets |
| Encryption in transit | DB TLS enforced on the Spring side; FastAPI does not set `sslmode`; **no TLS at the edge** |
| Network segmentation | None (no NSGs, NetworkPolicies, private endpoints or private cluster) |
| Supply chain | Floating base-image tags, unpinned Python deps (payment-service), no SBOM or signing, non-blocking Trivy |
| Policy / governance | No Azure Policy, Defender, Kyverno or Gatekeeper, no admission control beyond PSA |
| Audit | No kube-audit logs, no app audit trail, no payment ledger |
| PCI-DSS awareness | Full PAN transits user-service and is logged at SQL level (`show-sql=true`); should be tokenised client-side by a PSP (simulated tokenisation is fine for a capstone) |
| Secret scanning | None (no gitleaks or detect-secrets) |

### 5.9 Documentation and repository hygiene

**Strengths**

- An unusually rich doc set: architecture, data contract, PromQL cheat sheets, runbooks, an Azure monitoring assessment and incident write-ups.

**Issues**

- **Stale or contradictory status docs:**
  - `PROJECT_TRACKER.md` still shows Day 2–4 unchecked.
  - `systemdesign.md` lists AKS, Terraform and CI/CD as "Upcoming".
  - `OBSERVABILITY-STATUS.md`, `observability/README.md` and `aiops/README.md` say AIOps is "not built".
  - Full list in Appendix B.
- **Mixed naming:**
  - `credpay` / `credpays2` / `credproj`.
  - `kv-credpay` / `credpays2kv`.
  - `CredProj` / `credpaybaserg`.
- **Personal identifiers in docs:** Foundry resource and project names, the subscription ID, and the service connection name `HDFC-Manual`.
- **Repo clutter:**
  - `terraform.zip`.
  - `user-service/target/` (build output).
  - Two scan pipelines that duplicate each other.
  - Placeholder `Dockerfileexplain.md` files mixed in with code.
- **Missing artefacts:**
  - No root `README.md` explaining the whole project.
  - No `docker-compose.yml` (planned for "Day 2").
  - No API Gateway (planned in `systemdesign.md`).
  - No `CONTRIBUTING`, ADRs, `CODEOWNERS`, PR template, LICENSE or `.editorconfig`.
  - No pre-commit config.

---

## 6. Target enterprise architecture

```
            Users ──► Azure Front Door (WAF, TLS, custom domain) ──► Private Link
                                       │
                                       ▼
   ┌──────────────────── AKS (Standard tier, private API / authorised IPs, AZs) ────────────────────┐
   │ system pool (D-series, tainted)        user pool (D-series, autoscale 2..N)                     │
   │                                                                                                 │
   │  Gateway: ingress-nginx or App Gateway for Containers + cert-manager, JWT validation,          │
   │           rate limiting                                                                         │
   │       │                                                                                         │
   │       ├─► frontend (nginx-unprivileged)      Argo Rollouts canary/blue-green for ALL services    │
   │       ├─► user-service  ──┐                  PDBs · topology spread · NetworkPolicies (deny-all) │
   │       ├─► payment-service ┼─ OTel SDK ──► OTel Collector ──► Managed Prometheus / App Insights / │
   │       └─► credai-service ─┘                                    Log Analytics (JSON logs)        │
   │                                                                                                 │
   │  Workload Identity (federated) ──► Key Vault (CSI driver) · PostgreSQL (Entra auth) ·           │
   │                                    Azure OpenAI (Entra auth)                                    │
   │  Argo CD / Flux (GitOps) · Kyverno/Azure Policy · Defender for Containers                       │
   └─────────────────────────────────────────────────────────────────────────────────────────────────┘
        │ private endpoints / VNet integration
        ▼
   PostgreSQL Flexible (GP, zone-redundant HA, geo backup, per-service DBs/roles)
   ACR Premium (private endpoint, signed images, retention) · Key Vault (RBAC mode, private endpoint)

   Identity: Entra External ID / Keycloak (OIDC + PKCE) for end users
   Delivery: Azure DevOps (or GitHub Actions) with OIDC federation → build/test/scan/sign →
             push immutable tag → update GitOps repo → Argo CD syncs dev → stg → prod (approvals)
   Ops:      Prometheus rules + SLO burn-rate alerts → Alertmanager/Action Groups → Teams/PagerDuty
             → CredAI incident enrichment (RCA summary attached to the alert) → runbook automation
             (human-approved)
```

---

## 7. Enhancement roadmap (phased)

Each phase is independently demoable. The effort estimates assume one engineer familiar with the codebase.

### Phase 0: Hygiene and secrets (1–2 days), **blocking**

- [ ] Rotate the Azure OpenAI key (C1). Scrub the docs. Use placeholders only.
- [ ] Delete `terraform.zip`. Remove the subscription ID from tfvars (C2). Restore `*.tfvars` in `.gitignore`. Commit `.terraform.lock.hcl`.
- [ ] Run `git init` at the project root (C3). Add `.gitignore` for `target/`, `node_modules/`, `.env`.
- [ ] Add `pre-commit` with gitleaks, trailing whitespace, terraform fmt, black/ruff, and prettier.
- [ ] Add a root `README.md` (overview, architecture diagram, quick start, doc map).
- [ ] Reconcile stale docs (Appendix B). Unify naming.

### Phase 1: Application security and correctness (1–2 weeks)

- [ ] BCrypt passwords plus a migration for existing rows (C4).
- [ ] OIDC authentication: Keycloak in-cluster or Entra External ID.
  - Frontend: PKCE flow with the token held in memory.
  - Backends: validate the JWT with Spring Security resource server and FastAPI `python-jose`/`authlib`.
  - Derive `userId` from the `sub` claim and remove `userId` from paths and bodies (C5).
- [ ] Card ownership check in payments (C6); ownership checks on every read.
- [ ] Payment hardening:
  - `Decimal`.
  - UUID/ULID transaction IDs (C10).
  - `Idempotency-Key` header with a UNIQUE column.
  - PENDING → SUCCESS/FAILED state machine (simulated failure rate).
  - An outbox table for future events.
- [ ] Input validation: Luhn check, month+year expiry, UPI regex, length limits. Generic 500 messages.
- [ ] Turn off `show-sql`/`echo`. Add JSON logging (Logback JSON encoder, `structlog`) with request IDs.
- [ ] Flyway (user-service) and Alembic (payment-service). Remove the schema-reset Job. Add per-service DB roles.
- [ ] Optional: Spring Cloud Gateway / ingress-level JWT validation and rate limiting (fulfils the planned API Gateway).

### Phase 2: Testing and quality gates (1–2 weeks, overlaps Phase 1)

- [ ] user-service: JUnit 5 + Mockito + MockMvc + **Testcontainers** Postgres; JaCoCo ≥ 70%.
- [ ] payment-service and ai-service: pytest + httpx + Testcontainers; coverage ≥ 70%; ruff + mypy.
- [ ] frontend: ESLint + Vitest/RTL; **Playwright** E2E (register → add card → pay → history).
- [ ] Contract tests between frontend and APIs (OpenAPI schema checks via Schemathesis or Pact).
- [ ] Load tests with **k6** (scripted, run in CI against staging; thresholds tied to SLOs).
- [ ] **CredAI eval harness:**
  - Golden question set with canned telemetry fixtures.
  - Assertions on groundedness (every number in the answer exists in the facts) and intent accuracy.
  - LLM-as-judge scoring; run in CI with regression thresholds.
- [ ] Add `docker-compose.yml` for a one-command local stack (Postgres, the three services, CredAI with mocks).

### Phase 3: CI/CD and supply-chain maturity (1–2 weeks)

- [ ] Split pipelines:
  - `infra` (Terraform).
  - `app` (per-service, path-filtered, templated via `templates/`).
  - `pr-validation`.
- [ ] PR validation: build → unit tests → lint → **CodeQL/SonarQube** → SCA (OWASP dep-check / `pip-audit` / `npm audit`) → **gitleaks**.
- [ ] Image stage:
  - Pinned base images by digest.
  - Trivy **blocking** on HIGH/CRITICAL (with an allow-list).
  - **SBOM** (Syft).
  - **cosign** signing.
  - Push **immutable tags only** (git SHA).
- [ ] Terraform: pinned version → fmt/validate/tflint/**checkov** → `plan -out` artifact → **manual approval (ADO Environment)** → `apply` the saved plan; plus drift detection on a schedule.
- [ ] Workload-identity-federated service connections (no SPN secrets). Separate infra and deploy identities. No `--admin` kubeconfig.
- [ ] Environments **dev → staging → prod** with approvals, checks and deployment history.
- [ ] Add **ai-service** to CI/CD.
- [ ] Package with **Helm** (or Kustomize base + overlays per environment). Adopt **GitOps** with Argo CD or Flux: CI bumps the image tag in the env repo, and Argo CD syncs.
- [ ] Progressive delivery with **Argo Rollouts**: canary for the backends, blue/green for the frontend, with Prometheus-based analysis and **automatic rollback**.

### Phase 4: Platform and infrastructure hardening (2–3 weeks)

- [ ] Terraform per environment (directories or workspaces plus per-env tfvars); full tag set (`env`, `owner`, `cost-center`, `data-classification`); `validation` blocks; bring **ACR, Key Vault and the state SA under Terraform** (bootstrap module).
- [ ] AKS:
  - Standard tier.
  - Availability zones.
  - System pool (tainted) + user pool on D-series with a real autoscale range.
  - `oidc_issuer_enabled` + `workload_identity_enabled`.
  - `key_vault_secrets_provider`.
  - `local_account_disabled = true`.
  - Authorised IP ranges or a private cluster.
  - Defender for Containers.
  - Azure Policy add-on.
  - Maintenance windows.
- [ ] Network:
  - NSGs.
  - PostgreSQL VNet integration (delegated subnet) or a private endpoint with private DNS.
  - Private endpoints for Key Vault and ACR (Premium).
  - Egress through NAT GW/Azure Firewall.
  - Front Door or App Gateway with **WAF**.
- [ ] TLS: custom domain, **cert-manager** + Let's Encrypt/Key Vault, HSTS, HTTP→HTTPS redirect.
- [ ] Kubernetes:
  - Default-deny **NetworkPolicies** with explicit allows.
  - **PDBs**.
  - Topology spread.
  - HTTP probes (actuator groups).
  - Dedicated ServiceAccounts with `automountServiceAccountToken: false`.
  - ResourceQuota and LimitRange.
  - PriorityClasses.
  - Frontend on `nginx-unprivileged`, then move PSA to `enforce: restricted`.
  - Kyverno/Gatekeeper policies (no `:latest`, signed images only, required limits).
- [ ] Secrets: Key Vault in RBAC mode with the CSI driver and Workload Identity for the DB, OpenAI and Grafana admin. PostgreSQL and Azure OpenAI with **Entra auth** (no passwords or keys).
- [ ] Data:
  - PostgreSQL General Purpose.
  - Zone-redundant HA.
  - Geo-redundant backup.
  - `prevent_destroy`.
  - A tested **backup/restore and DR runbook** with RPO/RTO targets.
- [ ] Cost: Azure budgets and alerts. Consider the cluster autoscaler + spot pool for non-prod.

### Phase 5: Observability and SRE practices (2 weeks)

- [ ] **OpenTelemetry**:
  - Java agent for user-service; `opentelemetry-instrumentation-fastapi` for the Python services.
  - An OTel Collector exporting to **Application Insights** (or Tempo).
  - Trace IDs in JSON logs.
- [ ] Decide on self-hosted vs. **Azure Managed Prometheus + Managed Grafana**. If staying self-hosted: Prometheus HA or a Thanos/remote-write target, `retention.size`, and the proper TLS config.
- [ ] **Alerting**:
  - PrometheusRules for nodes, pods (CrashLoop, OOMKilled), deployments, HPA at max, target down, 5xx rate, p95 latency, DB pool saturation, and certificate expiry.
  - Alertmanager or Azure Monitor action groups → Teams/PagerDuty.
  - Every alert links to a **runbook**.
- [ ] **SLOs**:
  - Availability, p95 latency, and payment success rate per service.
  - Recording rules.
  - Multi-window multi-burn-rate alerts.
  - Error-budget dashboards (Sloth or Pyrra can generate them).
- [ ] Business metrics:
  - `payments_total{status}`, `payment_amount_sum`, `cards_added_total`, `logins_total{outcome}`.
  - A business KPI dashboard.
- [ ] Azure: **Diagnostic Settings** (kube-audit, Key Vault, PostgreSQL, ACR) via Terraform; DCR-based Container Insights with AAD auth; Log Analytics retention and cost caps; Azure Monitor alert rules in Terraform.
- [ ] Grafana:
  - Admin credentials from Key Vault.
  - Entra SSO with role mapping.
  - Dashboards and alerting **provisioned as code**.
  - An Ingress behind auth.
- [ ] Incident process: severity matrix, on-call rotation, postmortem template (the existing incident write-ups make good seed examples).

### Phase 6: AIOps to enterprise grade (2–3 weeks)

- [ ] **Secure CredAI**:
  - JWT auth with an `ops` role.
  - Remove the public PromQL/K8s passthroughs (or restrict them to admins with a PromQL allow-list).
  - CORS tightened; `/docs` off; NetworkPolicy egress to Prometheus, the API server and Azure only.
- [ ] **Identity**: Workload Identity to Azure OpenAI, Azure Monitor and Log Analytics (no API key, no SP secret). Document the Monitoring Reader and Log Analytics Reader roles.
- [ ] **LLM guardrails**:
  - Proper system/user messages.
  - Validate history roles.
  - **Azure AI Content Safety / Prompt Shields**.
  - PII/secret redaction of facts before sending.
  - Output schema validation (JSON mode for RCA).
  - Token budget and per-user rate limits.
- [ ] **Performance and resilience**:
  - Async OpenAI client with timeouts and retries.
  - `asyncio.gather` for telemetry.
  - Threadpool for the K8s client.
  - Multiple workers or replicas (≥ 2) with a PDB.
  - Circuit breaker.
  - TTL cache for summaries.
  - Lightweight liveness probe; readiness checks real dependencies.
- [ ] **Self-observability**:
  - `/metrics` covering LLM latency, tokens in and out, cost, errors, intent distribution and cache hit rate.
  - OTel traces spanning collector → LLM.
  - A redacted prompt/response audit log.
  - A CredAI Grafana dashboard.
- [ ] **New AIOps capabilities** (this is the "AIOps" part of the capstone):
  1. **Alert-driven RCA**: an Alertmanager webhook makes CredAI build an incident summary and RCA and post it to Teams or the incident ticket.
  2. **Anomaly detection**: statistical baselines (seasonal z-score or Prophet) on latency, error rate and payment volume, exposed as metrics and alerts. The LLM explains them; it does not detect them.
  3. **Deployment correlation**: ingest ADO/Argo deployment events, then answer "did the last deploy cause this?" with diff and metric deltas.
  4. **Log intelligence**: Log Analytics KQL templates for error clustering and top exceptions, fed to RCA.
  5. **Capacity forecasting**: a linear or Holt-Winters projection of node memory and CPU, giving "nodes needed in N days" recommendations.
  6. **Runbook automation with human-in-the-loop**: CredAI *proposes* an action from an allow-list (restart a deployment, scale out, roll back). A human approves it in Teams or the UI. A **separate, narrowly scoped write identity** executes it, with a full audit trail.
  7. **Knowledge retrieval**: index runbooks and past postmortems (Azure AI Search vector index) so answers cite internal docs.
- [ ] **Evaluation** (from Phase 2): groundedness ≥ 95% on the golden set, intent accuracy, latency and cost budgets, all gated in CI.

---

## 8. Quick wins (under 1 day each)

| # | Change | File(s) |
|---|---|---|
| 1 | Rotate the OpenAI key and replace it with a placeholder | `observability/STEP-BY-STEP-DEPLOYMENT-GUIDE.md` |
| 2 | Delete `terraform.zip` and `user-service/target/` | repo root |
| 3 | Card ownership check | `payment-service/app/services.py` |
| 4 | UUID transaction IDs; `Optional[str]` in the history schema | `services.py`, `schemas.py` |
| 5 | `echo=False`, `show-sql=false` | `payment-service/app/database.py`, `user-service/.../application.properties` |
| 6 | Actuator HTTP probes for user-service | `k8s/user-service/deployment.yaml` |
| 7 | Remove `/api/ai/prometheus` from the public Ingress (or the router) | `ai-service/app/api/telemetry.py` |
| 8 | Grafana admin password from a Secret | `observability/grafana/01-installation/grafana.yaml` |
| 9 | Add PDBs for user, payment and frontend | `k8s/*/pdb.yaml` (new) |
| 10 | Trivy `--exit-code 1 --severity CRITICAL`; pin the template version | `azure-pipelines-2.yml` |
| 11 | Pin `terraformVersion` and commit `.terraform.lock.hcl` | `azure-pipelines.yml`, `.gitignore` |
| 12 | Security headers in nginx; `server_tokens off` | `frontend-react/nginx.conf` |
| 13 | Fix the CredAI evidence count and the `total_requests_last_hour` label | `ai-service/app/services/root_cause_service.py:40`, `clients/prometheus_client.py:146-149` |
| 14 | Add `VITE_AI_API_URL` to `.env.example` | `frontend-react/.env.example` |
| 15 | Update `PROJECT_TRACKER.md` and the status docs to reflect reality | see Appendix B |

---

## 9. Capacity and cost considerations

- **Current state:**
  - The node pool is 2× `Standard_B2s` (2 vCPU / 4 GiB, burstable) with autoscale fixed at 2/2.
  - Memory requests are about 90% committed (`OBSERVABILITY-STATUS.md`).
  - `ama-logs` is the single largest memory consumer.
  - HPA maximums cannot be honoured.
- **Before Phases 4–6**, resize to at least:
  - System pool: 2× `Standard_D2s_v5`.
  - User pool: autoscale 2–5× `Standard_D4s_v5`.
- **Alternatives:**
  - Retire self-hosted Prometheus and Grafana in favour of **Azure Managed Prometheus + Managed Grafana**. This frees in-cluster memory, at the cost of consumption-based pricing.
  - Or keep self-hosted and switch Container Insights to logs-only with a DCR to cut `ama-logs` overhead.
- **Cost governance:**
  - Budgets with alerts per resource group.
  - Auto-shutdown or stop/start of AKS and PostgreSQL for non-prod (`az aks stop`).
  - Spot node pool for non-prod.
  - Log Analytics daily cap.
  - Azure OpenAI token budget enforced in CredAI.

---

## Appendix A: Component inventory

| Component | Tech / version | Image | Replicas | Ports / endpoints | Metrics |
|---|---|---|---|---|---|
| frontend | React 18.3, Vite 5.4, MUI 6, axios | `credpayacrs1.azurecr.io/credpay/frontend:latest` (nginx:stable-alpine) | 2 blue + 2 green | 80; `/` | none |
| user-service | Spring Boot 3.5.3, Java 21, JPA, Lombok 1.18.46 | `.../user-service:latest` (temurin 21 JRE alpine) | 2 (HPA 2–6) | 8080; `/api/users/*`, `/api/cards/*`, actuator | `/actuator/prometheus` |
| payment-service | FastAPI, SQLAlchemy 2, psycopg 3, Python 3.14 | `.../payment-service:latest` (python:3.14-slim) | 2 (HPA 2–6) | 8000; `/api/payment/*`, `/health` | `/metrics` |
| credai-service | FastAPI 0.115.5, openai 1.109.1, kubernetes 31, azure-monitor-query | `.../ai-service:latest` | 1 (HPA 1–3) | 8000; `/api/ai/*` | none |
| PostgreSQL | Azure Flexible Server v16, B_Standard_B2s, 32 GB | managed | 1 (no HA) | 5432 public | Azure metrics |
| Prometheus | v2.55.1 | prom/prometheus | 1 | 9090 (ClusterIP) | self |
| Grafana | 11.3.1 | grafana/grafana | 1 | 3000 (ClusterIP) | — |
| node-exporter | v1.8.2 | prom/node-exporter | DaemonSet | 9100 | — |
| kube-state-metrics | v2.13.0 | registry.k8s.io | 1 | 8080 | — |
| ingress-nginx | Helm (unpinned) | — | — | public LB :80 | — |
| AKS | azurerm ~> 4.0, Free tier, Azure CNI + Azure NPM | — | 2× B2s | — | Container Insights |
| Terraform | >= 1.6, azurerm ~> 4.0, random ~> 3.6 | — | — | state: `credpaybaserg/credpaystatesa/statefile` | — |

---

## Appendix B: Doc vs. reality discrepancies

| Doc | Claim | Reality |
|---|---|---|
| `PROJECT_TRACKER.md:170-203` | Day 2–4 (Terraform, AKS, pipeline, Prometheus, Grafana, OpenAI) unchecked | All implemented |
| `systemdesign.md:464-483` | AKS, Terraform, CI/CD, monitoring "Upcoming" | Implemented |
| `systemdesign.md:243-251` | "complete card number is never stored" | True for storage, but the full PAN transits the API and can appear in SQL logs |
| `schema.sql:25` | "store a HASH, never plain text" | Plain text (`UserService.java:35`) |
| `observability/OBSERVABILITY-STATUS.md:10-13`, `observability/README.md`, `observability/aiops/README.md` | AIOps "not yet built" / "planned" / "no code implemented" | `ai-service/` exists and is deployed |
| `observability/README.md` | `labs/`, `interview/` folders; AlertManager "later"; auto-remediation "final phase" | Folders absent; AlertManager is a stub; remediation not designed |
| `terraform/README.md:29-30,45-47,108-110` | `Standard_DS2_v2`, 2–5 nodes, Workload Identity/OIDC enabled, backend `CredProj/credprojstate` | `Standard_B2s`, 2/2 nodes, OIDC/WI **not** enabled, backend `credpaybaserg/credpaystatesa` |
| `ai-service/docs/Architecture.md:104` | Prometheus "required – fails with a clear error" | Errors swallowed, returns `[]` (`telemetry_collector.py:35-42`) |
| `observability/CredAI-Architecture-Story.md:106-110,222-225` | Can't hallucinate; queries are hardcoded | Grounding reduces but does not eliminate hallucination; a public raw-PromQL endpoint exists |
| `PROJECT-SUMMARY-AND-INTERVIEW-GUIDE.md` §4 | "Real secret hygiene — nothing ever committed" | OpenAI key in a doc; subscription ID in tfvars and zip |
| `k8s/explained/02-configmap.md:22`, `tfvars.example` | `psql-credpay`, `kv-credpay`, `CredProj` | `credpays2` naming in the live config |
| `STAGE2-CHANGES.md` | References `PORTABILITY.md` | File not present in the repo |
