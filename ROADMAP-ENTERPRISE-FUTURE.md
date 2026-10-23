# CredPay Enterprise Capstone: Roadmap

| | |
|---|---|
| **Goal** | Turn CredPay into a capstone where students see how a real organisation runs software: multiple services, a multi-stage pipeline, Key Vault-managed secrets, blue/green releases, alerting, SRE practices, and an admin-only AIOps console. |
| **Cloud** | Azure (AKS, ACR, Key Vault, PostgreSQL Flexible Server, Log Analytics, Azure OpenAI) |
| **Delivery model** | Pipeline-driven deploys (Azure DevOps + Helm). **GitOps is deliberately out of scope**; it is the topic of the next (AWS) project. The Helm charts built here are designed so they can be reused there by Argo CD unchanged. |
| **Baseline** | `analysis.md` (current-state assessment, 2026-10-20) |
| **How to use this** | The instructor executes each phase end to end and ticks the **exit criteria**. Each phase then becomes a teaching module (§13). |

---

## Table of contents

1. [Requirements and how they map to phases](#1-requirements-and-how-they-map-to-phases)
2. [Decisions taken (with recommended defaults)](#2-decisions-taken-with-recommended-defaults)
3. [Target system design](#3-target-system-design)
4. [Phase 0: Clean-up and safety](#phase-0-clean-up-and-safety-12-days)
5. [Phase 1: System design and ADRs](#phase-1-system-design-and-adrs-23-days)
6. [Phase 2: Platform infrastructure (Terraform)](#phase-2-platform-infrastructure-terraform-57-days)
7. [Phase 3: Key Vault integration end to end](#phase-3-key-vault-integration-end-to-end-34-days)
8. [Phase 4: Customer app hardening (signup and login)](#phase-4-customer-app-hardening-signup-and-login-57-days)
9. [Phase 5: Helm, multi-stage pipeline and blue/green](#phase-5-helm-multi-stage-pipeline-and-bluegreen-710-days)
10. [Phase 6: Observability, alerting and Slack](#phase-6-observability-alerting-and-slack-57-days)
11. [Phase 7: Ops Console (admin-only service)](#phase-7-ops-console-admin-only-service-710-days)
12. [Phase 8: AIOps in the Ops Console](#phase-8-aiops-in-the-ops-console-710-days)
13. [Phase 9: SRE practices, game days and final dry run](#phase-9-sre-practices-game-days-and-final-dry-run-57-days)
14. [Teaching plan (modules for students)](#13-teaching-plan-modules-for-students)
15. [End-to-end demo script](#14-end-to-end-demo-script)
16. [Timeline, capacity and cost](#15-timeline-capacity-and-cost)
17. [Risks and mitigations](#16-risks-and-mitigations)

---

## 1. Requirements and how they map to phases

| # | Requirement | How it is met | Phase |
|---|---|---|---|
| R1 | Use Azure Key Vault to fetch keys and secrets | Key Vault (RBAC mode, Terraform-managed) + AKS **Secrets Store CSI driver** + **Workload Identity**. Pipeline reads Key Vault through a **variable group linked to Key Vault**. Alertmanager and Grafana also read their secrets from Key Vault. No secret lives in git, K8s YAML or pipeline variables. | 2, 3 |
| R2 | Blue/green deployment | Blue/green for **all customer-facing services** (frontend, user-service, payment-service) as one release: deploy the idle colour, test it through a preview host, flip all selectors, keep the old colour warm for instant rollback, and roll back automatically if post-deploy SLOs fail. | 5 |
| R3 | One new service, **not integrated with CredPay**, on its own web page, admin-only | **Ops Console**: a separate React app (`ops-portal`) and API (`ops-api`). It has its own namespace, host (`ops.<domain>`), identity provider, database, pipeline and Helm release. It only *observes* CredPay, through telemetry; it shares no code, DB, auth or ingress with it. The CredAI page is removed from the customer app. | 7 |
| R4 | Customers can sign up and log in | Existing signup/login pages kept. Backend hardened: BCrypt passwords, JWT issued by user-service (signing key in Key Vault), JWT validated by payment-service, ownership checks on all data. | 4 |
| R5 | Admin login to see logs, metrics and health from multiple sources, with AIOps on that page | Admins sign in with **Microsoft Entra ID** (App Roles `Ops.Admin` / `Ops.Viewer`). The portal combines **Prometheus** metrics, **Log Analytics** logs (container, K8s events, Azure diagnostic logs), **Azure Monitor** resource metrics, **Resource Health**, **Kubernetes API**, **Alertmanager** active alerts and **deployment history**. AIOps adds chat, alert-triggered RCA, anomaly detection, log pattern mining, deployment correlation and postmortem drafts. | 7, 8 |
| R6 | GitOps in the next (AWS) project | Not used here. Helm charts plus per-environment values files are structured to be GitOps-ready. | 5 |
| R7 | Alerting with Slack (free) or a better tool | **Slack Free + Prometheus Alertmanager** (recommended), with Azure Monitor alerts relayed through the Ops API. Optional PagerDuty free tier for on-call escalation, and healthchecks.io for a dead-man's switch. See §2 D5. | 6 |

---

## 2. Decisions taken (with recommended defaults)

Each of these can be changed. The roadmap assumes the default in **bold**.

| # | Decision | Default | Why | Alternative |
|---|---|---|---|---|
| D1 | Admin identity | **Microsoft Entra ID** (app registration + App Roles + security group) | This is how organisations do workforce SSO. It teaches the contrast between *customer identity* (app-managed JWT) and *workforce identity* (corporate IdP). It is free with any Azure tenant, and no admin password is stored anywhere. | A local `admins` table with BCrypt + JWT. Simpler, but less realistic. |
| D2 | Environments | **`staging` + `prod` namespaces on one AKS cluster**, with one Key Vault per environment | Students see promotion and approvals at reasonable cost. | A separate cluster per environment (realistic but expensive), or prod only (the idle blue/green colour acts as pre-prod). |
| D3 | Blue/green scope | **Release train**: all three customer services form one "colour", tested together and flipped together | This is the classic blue/green definition (two complete environments), easy to explain and to roll back. | Per-service blue/green (more microservice-pure, much harder to test end to end). |
| D4 | Deployment packaging | **Helm** (one reusable chart for backend services, one for frontends), deployed by the pipeline | Helm release values become the single source of truth for which colour is active, which avoids the `kubectl apply` selector-reset bug from Stage 2. The charts are reusable by Argo CD in the AWS project. | Kustomize overlays. |
| D5 | Alerting tool | **Slack Free + Alertmanager**, Azure Monitor → Ops API relay → Slack, **healthchecks.io** dead-man's switch | Free, students already know Slack, and it supports per-severity channels and threaded AI RCA replies. Limits: 90-day message history and 10 integrations on the free plan, which is fine for a capstone. | **Microsoft Teams** if the institute is on M365 (use Workflows webhooks; the old O365 connectors are retired). **PagerDuty free tier** to teach real paging and escalation. Avoid **Opsgenie** (Atlassian is ending the product) and **Grafana OnCall OSS** (being retired). |
| D6 | Monitoring stack | **kube-prometheus-stack (Helm)**, replacing the hand-written Prometheus/Grafana manifests | Industry standard. Prometheus Operator CRDs (`ServiceMonitor`, `PrometheusRule`), Alertmanager and Grafana come in one release. Keep the old manifests as "how it works under the hood" teaching material. | Azure Managed Prometheus + Managed Grafana. Less to run, but more cost and less to learn. |
| D7 | Logs | **Log Analytics** (Container Insights via AMA/DCR with `ContainerLogV2`) + **Diagnostic Settings** for AKS, Key Vault, PostgreSQL and ACR | It already exists, the Ops API queries it with KQL, and it covers Azure resource logs that Loki cannot. | Loki (cheaper in Azure terms, but more in-cluster memory). |
| D8 | Ops Console backend | **Evolve `ai-service` into `ops-api`** | Reuses the working Prometheus, K8s, Log Analytics, Azure Monitor and OpenAI clients and the hard-won lessons. | Start fresh. |
| D9 | Domain and TLS | **Your GoDaddy domain** → `app.<domain>`, `ops.<domain>`, `grafana.<domain>`, `preview.<domain>` (preview is IP-restricted); **cert-manager + Let's Encrypt** | Real HTTPS, free, automated renewal. | Azure DNS zone, delegated from GoDaddy (also lets cert-manager use DNS-01). |
| D10 | Write actions from AIOps | **Propose-only**. Any change (for example a rollback) is executed by **queuing an Azure DevOps pipeline** after a human clicks Approve. | The AI never holds write credentials. Every change is audited and goes through the same pipeline, with approvals. | Read-only only (simpler). |

---

## 3. Target system design

### 3.1 Context

```
  Customers ──HTTPS──► app.<domain>      CredPay (signup, login, cards, pay, history)
  Admins ────HTTPS──► ops.<domain>       Ops Console (health, metrics, logs, alerts, AIOps) — Entra ID SSO
  Engineers ─────────► Azure DevOps       PR → CI → staging → approval → prod blue/green
  On-call ◄──────────── Slack             #credpay-alerts-critical / -warning / #deployments / #incidents
```

### 3.2 Container view

```
                                   Internet
                                      │ HTTPS (Let's Encrypt via cert-manager)
                                      ▼
                     ingress-nginx (public LB)  ── rate limits, security headers
      ┌──────────────────┬─────────────────────────┬──────────────────────┬────────────────────────┐
      │ app.<domain>      │ preview.<domain>        │ ops.<domain>          │ grafana.<domain>        │
      │ (active colour)   │ (idle colour; IP allow) │ (IP allow + Entra)    │ (Entra SSO)             │
      ▼                   ▼                         ▼                       ▼
 ┌─ ns: credpay-prod ─────────────────────────┐ ┌─ ns: ops ─────────────────┐ ┌─ ns: monitoring ─────────┐
 │ frontend-blue   │ frontend-green           │ │ ops-portal (React+MSAL)   │ │ kube-prometheus-stack:    │
 │ user-svc-blue   │ user-svc-green           │ │ ops-api (FastAPI)         │ │  Prometheus, Alertmanager │
 │ payment-blue    │ payment-green            │ │  ├─ Prometheus  (PromQL)  │ │  Grafana, node-exporter,  │
 │ Services: stable selector → activeColor    │ │  ├─ Alertmanager API      │ │  kube-state-metrics       │
 │           *-preview selector → idle colour │ │  ├─ K8s API (read-only)   │ │ PrometheusRules (SLOs)    │
 │ traffic-simulator (CronJob, synthetic)     │ │  ├─ Log Analytics (KQL)   │ └────────────┬─────────────┘
 └──────────────┬─────────────────────────────┘ │  ├─ Azure Monitor/Health  │              │ webhooks
 ┌─ ns: credpay-staging (1 replica, rolling) ─┐ │  ├─ Azure OpenAI          │◄─────────────┘
 └──────────────┬─────────────────────────────┘ │  └─ opsdb (alerts, RCA,   │──► Slack (threaded RCA)
                │                               │      audit, deployments)  │
                │                               └────────────┬──────────────┘
                │   Workload Identity (federated, no secrets in pods)  │
                ▼                                                      ▼
   ┌───────────────────────────────── Azure ─────────────────────────────────────────┐
   │ Key Vault kv-credpay-stg / kv-credpay-prd / kv-ops  (RBAC, private endpoint)      │
   │ PostgreSQL Flexible (private endpoint): credpay_staging, credpay_prod, opsdb      │
   │ ACR (immutable tags)   Log Analytics + Diagnostic Settings   Azure OpenAI         │
   │ Azure Monitor alert rules → Action Group → ops-api webhook + email                │
   └──────────────────────────────────────────────────────────────────────────────────┘
```

### 3.3 Key flows to document as sequence diagrams (Phase 1 deliverables)

1. **Customer signup/login.** BCrypt hash → JWT (RS256) signed with a key from Key Vault → frontend stores the token in memory → payment-service validates it via JWKS.
2. **Payment.** JWT → card ownership check → idempotency key → transaction (PENDING → SUCCESS/FAILED) → metrics + JSON log with `trace_id`.
3. **Secret delivery.** Pod starts → kubelet → CSI driver → Workload Identity token exchange → Key Vault → mounted file (plus optional synced K8s Secret) → app. Includes rotation.
4. **Release.** PR → CI → staging → approval (with a "no active critical alerts" REST check) → deploy idle colour → preview tests → flip → post-deploy SLO watch → auto-rollback or keep → Slack.
5. **Admin login.** Ops portal → Entra ID (PKCE) → access token with `Ops.Admin` role → ops-api validates issuer, audience and role.
6. **Alert to RCA.** PrometheusRule fires → Alertmanager → Slack (direct) **and** ops-api webhook → context collection → LLM RCA → Slack thread reply + saved to opsdb → visible in Ops Console.
7. **Approved remediation.** The AI proposes "rollback" → admin approves → ops-api queues the ADO `rollback` pipeline → selector flip → Slack + audit log.

### 3.4 Namespaces and identities

| Namespace | Workloads | ServiceAccount → Managed Identity | Azure roles (scope) |
|---|---|---|---|
| `credpay-prod` / `credpay-staging` | frontend, user-service, payment-service | `sa-user-service` → `id-user-svc-<env>`; `sa-payment-service` → `id-payment-svc-<env>` | Key Vault Secrets User (env KV) |
| `ops` | ops-portal, ops-api | `sa-ops-api` → `id-ops-api` | Key Vault Secrets User (`kv-ops`), Monitoring Reader (RG), Log Analytics Reader (workspace), Cognitive Services OpenAI User (if using Entra auth to OpenAI) |
| `monitoring` | kube-prometheus-stack | `sa-alertmanager`, `sa-grafana` → `id-monitoring` | Key Vault Secrets User (`kv-ops`) for Slack webhooks + Grafana secrets |
| Pipeline | Azure DevOps | Workload-identity-federation service connections: `sc-infra` (Contributor + User Access Administrator on RG), `sc-deploy` (AKS RBAC Writer on namespaces, AcrPush) | |

---

## Phase 0: Clean-up and safety (1–2 days)

**Objective:** a safe, clean, versioned starting point.

- [ ] **Rotate the Azure OpenAI key** exposed in `observability/STEP-BY-STEP-DEPLOYMENT-GUIDE.md`, and replace it there with a placeholder.
- [ ] Delete `terraform.zip` and `user-service/target/`. Remove the subscription ID from `terraform/terraform.tfvars`.
- [ ] Run `git init` **inside** the project folder (the current git root is the home directory). Create the Azure Repos / GitHub repo and protect `main` (PR required, 1 reviewer, build validation).
- [ ] Add `.pre-commit-config.yaml` with gitleaks, terraform fmt, ruff/black, prettier and end-of-file fixers.
- [ ] Create the target folder layout (existing app folders stay where they are):

```
CredAppStage1/
├── frontend-react/  user-service/  payment-service/        # customer app (existing)
├── ops-console/
│   ├── ops-portal/            # NEW admin React app
│   └── ops-api/               # evolved from ai-service/
├── deploy/
│   ├── charts/                # credpay-backend, credpay-frontend, ops-console
│   ├── values/{staging,prod,ops}/
│   └── platform/              # ingress-nginx, cert-manager, kube-prometheus-stack values,
│                              # PrometheusRules, Alertmanager config, SecretProviderClasses
├── terraform/                 # bootstrap/ + modules/ + envs/
├── pipelines/                 # pr.yml, infra.yml, release.yml, rollback.yml, ops-console.yml, templates/
├── tests/                     # e2e (Playwright), load (k6), smoke
└── docs/
    ├── system-design/         # C4 diagrams + sequence diagrams
    ├── adr/                   # architecture decision records
    ├── runbooks/              # one per alert
    ├── postmortems/           # template + examples
    └── labs/                  # student exercises
```

- [ ] Archive outdated status docs into `docs/history/`: `PROJECT_TRACKER.md`, `STAGE1/2-CHANGES.md`, `OBSERVABILITY-STATUS.md`. They are still valuable as "how we got here".

**Exit criteria:** the repo is pushed; gitleaks is clean on full history; the old key is revoked.

---

## Phase 1: System design and ADRs (2–3 days)

**Objective:** design before building, so the design docs become the first student lecture.

**Deliverables in `docs/system-design/`:**

- [ ] Business requirements and **non-functional requirements** (availability, latency, security, cost, RPO/RTO).
- [ ] **C4 diagrams:** Context, Container, and Deployment (Mermaid or draw.io, versioned).
- [ ] **Sequence diagrams** for the 7 flows in §3.3.
- [ ] **Data model:** `credpay_*` DBs (users, cards, payments + idempotency) and `opsdb` (alerts, rca_reports, deployments, audit_log, chat_sessions).
- [ ] **API contracts** (OpenAPI) for user-service, payment-service and ops-api.
- [ ] **SLO document:**

| Service | SLI | SLO (28-day window) |
|---|---|---|
| user-service | Availability: non-5xx / total on `/api/users/*`, `/api/cards/*` | 99.5% |
| user-service | Latency: p95 `/api/users/login` | < 400 ms |
| payment-service | Availability | 99.5% |
| payment-service | **Payment success rate**: `status=SUCCESS` / all payments | ≥ 99% |
| payment-service | Latency: p95 `/api/payment/pay` | < 600 ms |
| frontend | Availability: 2xx/3xx on `/` | 99.9% |
| ops-api | Availability (internal) | 99% |

- [ ] **Threat model** (STRIDE, one page): customer data, admin plane, secrets, AI prompt injection.
- [ ] **ADRs** in `docs/adr/`, one per decision in §2 (D1–D10), plus "Release train blue/green with backward-compatible migrations" and "Why not GitOps in this project".

**Exit criteria:** diagrams and SLO doc reviewed; every later phase references them.

---

## Phase 2: Platform infrastructure (Terraform) (5–7 days)

**Objective:** everything in Azure created by code, including what is currently created by hand.

**Terraform structure**

```
terraform/
├── bootstrap/            # state RG + storage account (run once, local state, then migrated)
├── modules/
│   ├── network/          # VNet, subnets (aks, private-endpoints), NSGs
│   ├── aks/              # system + user pools, OIDC, Workload Identity, KV CSI add-on
│   ├── acr/              # ACR (Standard; Premium if private endpoint wanted)
│   ├── keyvault/         # KV in RBAC mode + private endpoint + diag settings
│   ├── postgres/         # Flexible Server + private endpoint + databases + diag settings
│   ├── identity/         # user-assigned MIs + federated credentials + role assignments
│   ├── monitoring/       # LAW, DCR Container Insights, diag settings, action groups, alert rules
│   ├── openai/           # Azure OpenAI account + model deployment (optional: import existing)
│   └── entra/            # azuread: Ops Console app registrations, App Roles, admin group
└── envs/
    └── main.tf           # composes modules; for_each over ["staging","prod"] for env-scoped resources
```

**Tasks**

- [ ] **Bootstrap:** state storage with versioning + soft delete; Entra auth to state (`use_azuread_auth = true`).
- [ ] **AKS:**
  - Standard tier.
  - System pool: 2× `Standard_D2as_v5`, tainted `CriticalAddonsOnly`.
  - User pool: autoscale 2–4× `Standard_D4as_v5`.
  - `oidc_issuer_enabled = true`, `workload_identity_enabled = true`.
  - `key_vault_secrets_provider { secret_rotation_enabled = true }`.
  - Azure CNI + network policy (Azure or Cilium).
  - `local_account_disabled = true`, Entra RBAC.
  - API server authorised IP ranges (your IP + ADO agent strategy; see the Risks section).
  - Maintenance window.
- [ ] **Key Vaults:**
  - `kv-credpay-stg`, `kv-credpay-prd` and `kv-ops`.
  - RBAC mode, soft delete + purge protection.
  - Private endpoint, with public access limited to the pipeline only.
  - Diagnostic logs to LAW.
- [ ] **PostgreSQL:**
  - Private endpoint + private DNS zone; disable public access; remove the `0.0.0.0` rule.
  - Databases `credpay_staging`, `credpay_prod` and `opsdb`.
  - `prevent_destroy`.
  - HA as a variable (off by default for cost; demo it once).
- [ ] **Identities:** a user-assigned MI per workload (§3.4) with federated credentials bound to `system:serviceaccount:<ns>:<sa>`, and least-privilege role assignments.
- [ ] **Terraform-generated secrets written to Key Vault:**
  - Per-service DB passwords: `user-svc-db-password`, `payment-svc-db-password`, `ops-api-db-password`, `migrator-db-password`.
  - JWT RSA private key: `jwt-signing-key` (via the `tls_private_key` resource).
  - `grafana-admin-password`.
- [ ] **Secrets added manually or by a script** (never in Terraform state if avoidable):
  - `openai-api-key`.
  - `slack-webhook-critical`, `slack-webhook-warning`, `slack-webhook-deployments`.
  - `healthchecks-ping-url`.
  - Optional `pagerduty-routing-key`.
- [ ] **Monitoring:**
  - LAW (30 days, daily cap).
  - DCR-based Container Insights with `ContainerLogV2`.
  - **Diagnostic Settings:** AKS (`kube-audit-admin`, `kube-apiserver`, `cluster-autoscaler`), Key Vault (`AuditEvent`), PostgreSQL (`PostgreSQLLogs`), ACR.
  - **Azure Monitor alert rules:** Postgres CPU / storage / connections failed, AKS node NotReady, KV throttling / access denied.
  - **Action Group:** email + webhook to `https://ops.<domain>/api/webhooks/azure-monitor`.
- [ ] **Entra (azuread provider):**
  - App registration `credpay-ops-portal` (SPA, redirect `https://ops.<domain>`).
  - App registration `credpay-ops-api` (exposes scope `Ops.Access`; App Roles `Ops.Admin` and `Ops.Viewer`).
  - Security group `CredPay-Ops-Admins` assigned to `Ops.Admin`.
- [ ] **Budgets:** an RG budget with 50/80/100% alerts.
- [ ] **Quality:** pin `.terraform.lock.hcl`, add tflint + checkov, and add `validation` blocks.

**Exit criteria:**

- `terraform plan` shows no drift.
- `kubectl get pods -n kube-system | grep secrets-store` shows the CSI driver running.
- Postgres is unreachable from the public internet.
- `az keyvault secret list` works for the pipeline identity only.

---

## Phase 3: Key Vault integration end to end (3–4 days)

**Objective (R1):** every secret, at every layer, comes from Key Vault.

| Consumer | Mechanism | Secrets |
|---|---|---|
| user-service pod | `SecretProviderClass` + CSI volume (files in `/mnt/secrets`) + Workload Identity | `user-svc-db-password`, `jwt-signing-key` |
| payment-service pod | same | `payment-svc-db-password` (JWT public key is fetched from the user-service JWKS, so it is not a secret) |
| ops-api pod | same | `ops-api-db-password`, `openai-api-key`, `slack-webhook-*` |
| Migration Jobs (Flyway/Alembic) | same, with the migrator identity | `migrator-db-password` |
| Alertmanager | CSI volume mounted via `alertmanagerSpec.volumes`; Slack config uses **`api_url_file`** | `slack-webhook-critical`, `slack-webhook-warning` |
| Grafana | CSI with `secretObjects` sync → `admin-password` K8s Secret | `grafana-admin-password` |
| Azure DevOps pipeline | **Variable group linked to Key Vault** (or the `AzureKeyVault@2` task) | `slack-webhook-deployments`, `healthchecks-ping-url` |
| Terraform | Writes generated secrets; reads nothing secret from git | — |

**Teaching points to demonstrate live**

- [ ] **Rotation:** change `openai-api-key` in Key Vault. The CSI driver refreshes the mounted file within the poll interval, and ops-api re-reads it. Contrast this with env vars, which need a pod restart.
- [ ] **Least privilege:** payment-service's identity gets `Forbidden` when it tries to read `jwt-signing-key`. Show the KV audit log entry in Log Analytics.
- [ ] **Failure mode:** remove the role assignment. The pod stays in `ContainerCreating` with a mount error. Diagnose it with `kubectl describe`.
- [ ] Delete `k8s/secrets/secret.yaml` and `k8s/ai-service/secret.yaml` from the repo. No K8s secret manifests remain.

**Exit criteria:** `grep -ri "password\|apikey\|webhook" deploy/` finds only Key Vault object names; pods start with secrets mounted; the rotation demo works.

---

## Phase 4: Customer app hardening (signup and login) (5–7 days)

**Objective (R4):** keep the existing signup/login UX and make it secure and production-shaped.

**user-service (Spring Boot)**

- [ ] **BCrypt** password hashing (`spring-security-crypto`) + a one-time migration for existing rows. Fix the seed users.
- [ ] **JWT issuance (RS256):**
  - Private key read from the CSI file.
  - `GET /.well-known/jwks.json` publishes the public key.
  - Claims: `sub=userId`, `email`, `exp` (15 min), plus a refresh token (httpOnly cookie) or a simple re-login for the capstone.
- [ ] **Spring Security resource server:** all `/api/cards/**` endpoints require a JWT. `userId` comes from the token. Remove it from paths and bodies (`GET /api/cards/me`).
- [ ] Validation: Luhn check, month+year expiry, case-insensitive email, generic error messages.
- [ ] Login rate limit (bucket4j, or at ingress-nginx level) + account lockout after N failures.
- [ ] Actuator `liveness`/`readiness` groups. JSON logs (logstash encoder) with `trace_id`. Custom metrics: `credpay_logins_total{outcome}`, `credpay_signups_total`, `credpay_cards_added_total`.
- [ ] **Flyway** migrations, run by a pre-deploy Job using the migrator identity. Delete the schema-reset Job.

**payment-service (FastAPI)**

- [ ] JWT validation against the user-service JWKS (`PyJWT` + cached JWKS).
- [ ] **Card ownership check**; `Decimal` amounts; UPI regex.
- [ ] UUID/ULID transaction IDs; **`Idempotency-Key`** header (UNIQUE column).
- [ ] Payment state machine PENDING → SUCCESS/FAILED, with a **configurable simulated failure rate and latency**. This drives the SRE labs in Phase 9.
- [ ] `sslmode=require`, `pool_pre_ping`, `echo=False`, URL-safe connection string.
- [ ] Readiness probe checks the DB. JSON logs (`structlog`) with `trace_id`.
- [ ] Business metrics: `credpay_payments_total{status}`, `credpay_payment_amount_sum`, `credpay_payment_duration_seconds`.
- [ ] **Alembic** migrations (payment-owned tables).

**frontend-react**

- [ ] Store the token in memory; an axios interceptor adds `Authorization`; a 401 sends the user to login.
- [ ] **Remove the `/credai` route, sidebar link and `CredAIPage`.** AIOps moves to the Ops Console (R3).
- [ ] Surface API errors (no silent empty lists); fix the card-number `maxLength`.
- [ ] `nginx-unprivileged` on port 8080; security headers (CSP, HSTS, X-Frame-Options and others); `/healthz`.

**Tests (each service): this is where quality gates come from**

- [ ] user-service: JUnit 5 + MockMvc + **Testcontainers**.
- [ ] payment-service: pytest + httpx + Testcontainers.
- [ ] frontend: Vitest + RTL.
- [ ] **Playwright E2E:** signup → login → add card → pay → history (`tests/e2e/`).
- [ ] **k6** smoke and load scripts (`tests/load/`), with thresholds equal to the SLOs.
- [ ] `traffic-simulator` CronJob that runs synthetic signups, logins and payments every minute, so dashboards and alerts always have data.

**Exit criteria:**

- Using another user's ID returns 403.
- Passwords are BCrypt in the DB.
- E2E passes locally (docker-compose) and against staging.
- The customer app has no AIOps page.

---

## Phase 5: Helm, multi-stage pipeline and blue/green (7–10 days)

**Objective (R2, multi-stage):** a release process that looks like a real organisation's.

### 5.1 Helm charts

- **`credpay-backend` chart** (reused by user-service and payment-service). It renders:
  - `Deployment <svc>-blue` and `<svc>-green`, each with its own `image.tag` and `replicas`.
  - `Service <svc>`, selector `version: {{ .Values.activeColor }}`.
  - `Service <svc>-preview`, selector `version: {{ idleColor }}`.
  - HPA per colour, **PDB**, **NetworkPolicy**, ServiceAccount (with the Workload Identity annotation), SecretProviderClass, ServiceMonitor.
- **`credpay-frontend` chart:** same pattern, plus the Ingress for `app.<domain>` (→ stable services) and `preview.<domain>` (→ `*-preview` services, `whitelist-source-range`).
- **`ops-console` chart:** rolling updates only. This is a deliberate teaching contrast: not every service needs blue/green.
- **Values:** `values/staging/*.yaml` and `values/prod/*.yaml`.
  - In **prod**, the colour state (`activeColor`, `blue.tag`, `green.tag`) is held in the **Helm release** and read with `helm get values`.
  - Helm alone owns the Service selectors, so there is no `kubectl patch` drift.
- **Platform releases** (`deploy/platform/`): ingress-nginx, cert-manager + ClusterIssuer, kube-prometheus-stack, PrometheusRules, Alertmanager config. All have pinned chart versions.

### 5.2 Pipelines (Azure DevOps, YAML templates)

| Pipeline | Trigger | Stages |
|---|---|---|
| `pr.yml` | Pull request to `main` | Per-service build → unit tests + coverage → lint → **SAST** (Semgrep OSS or SonarCloud) → dependency scan (`npm audit` / `pip-audit` / OWASP dependency-check) → **gitleaks** → `helm lint` + `kubeconform` → `terraform fmt/validate/tflint/checkov` (if `terraform/**` changed) |
| `infra.yml` | `main`, path `terraform/**` | **Plan** (artifact + summary in the run) → **Approval** (ADO Environment `infra-prod`) → **Apply the saved plan** → Slack #deployments |
| `release.yml` | `main`, app paths | see the flow below |
| `rollback.yml` | Manual or queued by ops-api (D10) | Approval → `helm upgrade --reuse-values --set activeColor=<previous>` → verify → Slack |
| `ops-console.yml` | `main`, path `ops-console/**` | Build/test/scan → deploy `ops` namespace (rolling) |
| `platform.yml` | `main`, path `deploy/platform/**` | Helm diff → approval → upgrade platform releases |

**`release.yml` stages**

```
 ┌────────┐  ┌──────────────┐  ┌──────────────┐  ┌────────────────┐  ┌────────────┐
 │ Build  │─►│ Security     │─►│ Publish      │─►│ Deploy STAGING │─►│ Test       │
 │ +Unit  │  │ Trivy (block │  │ push :<sha>  │  │ migrations Job │  │ E2E (Playw)│
 │ tests  │  │ HIGH/CRIT),  │  │ SBOM (Syft)  │  │ helm upgrade   │  │ k6 smoke   │
 │        │  │ SBOM, sign   │  │ cosign sign  │  │ (rolling)      │  │            │
 └────────┘  └──────────────┘  └──────────────┘  └────────────────┘  └─────┬──────┘
                                                                           ▼
 ┌──────────────────────────────── PROD (ADO Environment: credpay-prod) ───────────────────────┐
 │ Checks: manual approval + business hours + Invoke REST API → ops-api                        │
 │         "/api/gates/release" (fails if a critical alert is firing or the error budget is     │
 │         exhausted)                                                                           │
 │                                                                                              │
 │ 1 Migrations (expand-only, backward compatible)                                              │
 │ 2 Deploy IDLE colour with new tags, scale idle to full replicas, wait for rollout            │
 │ 3 Verify idle via preview.<domain>: smoke + E2E + k6 smoke                                   │
 │ 4 Create an Alertmanager silence for preview-only noise (optional)                           │
 │ 5 SWITCH: helm upgrade --set activeColor=<idle> (all 3 services together)                    │
 │ 6 Post-deploy watch (10 min): query Prometheus error rate + p95 vs SLO                       │
 │      breach → automatic switch back + Slack 🔴 + fail the run                                │
 │ 7 Record the deployment: POST ops-api /api/deployments + Grafana annotation + Slack 🟢       │
 │ 8 Soak: keep the old colour warm for 30 min, then scale it to 1 replica (instant rollback)   │
 └──────────────────────────────────────────────────────────────────────────────────────────────┘
```

**Rules students must learn here**

- **Images are immutable:** tagged by git SHA, never `:latest`. Each colour runs a known version.
- **Expand/contract migrations:** the old colour must keep working with the new schema. Show a "rename column" done safely across two releases.
- **One identity per job:** `sc-infra` for Terraform and `sc-deploy` for Helm. Both use workload-identity federation, with no SPN secrets.
- **Pipeline secrets** come from the Key Vault-linked variable group (R1).

**Exit criteria:**

- Two consecutive releases alternate colours.
- A deliberately broken build fails at step 3 and traffic never moves.
- An injected post-deploy error spike triggers the automatic switch-back.
- `rollback.yml` flips back in under 1 minute.

---

## Phase 6: Observability, alerting and Slack (5–7 days)

**Objective (R7 + SRE foundation):** measured SLOs, actionable alerts, and alerts that reach people.

### 6.1 Stack

- [ ] Install **kube-prometheus-stack**:
  - Prometheus 2 replicas (if capacity allows), 15-day retention, `retention.size`, PVC.
  - Alertmanager 2 replicas.
  - Grafana with **Entra SSO** and dashboards **provisioned from ConfigMaps**.
- [ ] Migrate the 6 existing dashboards and add:
  - **SLO / error budget** (one per service).
  - **Business KPIs:** payments per minute, success rate, amount.
  - **Release dashboard:** active colour, version, deploy annotations.
  - **Ops Console self-metrics:** LLM latency, tokens, cost.
- [ ] `ServiceMonitor`s for user-service, payment-service and ops-api (replacing annotation-based scraping).
- [ ] **SLO recording rules + multi-window burn-rate alerts** (Google SRE workbook):

| Burn rate | Long / short window | Budget consumed | Severity |
|---|---|---|---|
| 14.4× | 1 h / 5 m | 2% | critical (page) |
| 6× | 6 h / 30 m | 5% | critical |
| 1× | 3 d / 6 h | 10% | warning (ticket) |

  Generate these with **Sloth** or hand-write them. Hand-writing teaches more.

### 6.2 Alert catalogue (each alert has `runbook_url`, `dashboard_url` and `ops_console_url` annotations)

| Alert | Source | Severity |
|---|---|---|
| `SLOAvailabilityFastBurn` / `SlowBurn` (per service) | Prometheus | critical / warning |
| `PaymentSuccessRateLow` (< 97% over 5 m) | Prometheus | critical |
| `ServiceNoReadyPods` | kube-state-metrics | critical |
| `PodCrashLooping`, `PodOOMKilled` | KSM | warning |
| `HighLatencyP95` (vs SLO) | Prometheus | warning |
| `HPAMaxedOut` (15 m) | KSM | warning |
| `NodeNotReady`, `NodeMemoryPressure` (> 90%) | KSM / node-exporter | critical / warning |
| `DBConnectionPoolSaturated` (Hikari > 90%) | Prometheus | warning |
| `CertificateExpiringSoon` (< 14 d) | cert-manager metrics | warning |
| `PostDeployErrorSpike` | Prometheus (with deploy label) | critical |
| `AnomalyDetected` (from ops-api anomaly score, Phase 8) | Prometheus | warning |
| `PrometheusTargetDown`, `AlertmanagerFailedToSend` | Prometheus | warning |
| `Watchdog` (always firing → **healthchecks.io** dead-man's switch) | Prometheus | none |
| Postgres CPU / storage / failed connections | Azure Monitor | critical / warning |
| Key Vault access denied / throttled | Azure Monitor (KV logs) | warning |
| AKS node NotReady (platform view) | Azure Monitor | critical |

### 6.3 Routing (Alertmanager)

```
route:
  group_by: [alertname, service, namespace]
  receiver: slack-warning
  routes:
    - matchers: [severity="critical"]
      receiver: slack-critical          # #credpay-alerts-critical (+ PagerDuty if enabled)
      continue: true
    - matchers: [severity=~"critical|warning"]
      receiver: ops-api-webhook         # AI enrichment → threaded reply in Slack
    - matchers: [alertname="Watchdog"]
      receiver: healthchecks-io
      repeat_interval: 1m
inhibit_rules:
  - source_matchers: [alertname="NodeNotReady"]
    target_matchers: [severity="warning"]
    equal: [node]
```

- [ ] Slack workspace channels: `#credpay-alerts-critical`, `#credpay-alerts-warning`, `#credpay-deployments`, `#credpay-incidents`.
- [ ] Slack message templates: title, severity emoji, service, summary, **runbook link**, **Grafana link**, **Ops Console link**, and a resolved message.
- [ ] Azure Monitor Action Group → ops-api `/api/webhooks/azure-monitor`, which normalises the payload and posts to Slack in the same format. Email stays as a backup path in case ops-api is down.
- [ ] **Runbooks** in `docs/runbooks/<alert>.md`. Each follows the template: *What it means → Impact → Check (commands / Ops Console view) → Mitigate → Escalate*.

**Exit criteria:**

- Killing payment-service pods produces a Slack critical alert within about 2 minutes, then a resolved message.
- Stopping Alertmanager produces a healthchecks.io email.
- Every alert has a runbook.

---

## Phase 7: Ops Console (admin-only service) (7–10 days)

**Objective (R3, R5):** a separate admin web app that brings together health, metrics, logs and alerts from multiple sources.

### 7.1 Isolation from CredPay (what "not integrated" means)

| Concern | CredPay | Ops Console |
|---|---|---|
| Host | `app.<domain>` | `ops.<domain>` (+ ingress IP allow-list) |
| Namespace | `credpay-prod` / `-staging` | `ops` |
| Identity | Customer JWT from user-service | **Entra ID**, App Roles `Ops.Admin` / `Ops.Viewer` |
| Database | `credpay_*` | `opsdb` |
| Code / pipeline / Helm release | `release.yml` | `ops-console.yml` |
| Coupling | none | Reads **telemetry only** (Prometheus, Logs, K8s API, Azure). Never calls CredPay APIs or reads its DB. |
| NetworkPolicy | Denies ingress from `ops` | Egress only to Prometheus, Alertmanager, kube-apiserver, Azure endpoints, PostgreSQL |

### 7.2 ops-api (FastAPI, evolved from `ai-service`)

- **Auth:**
  - Validate the Entra access token (issuer, audience = `api://credpay-ops-api`, role).
  - `Ops.Viewer` gets read-only access.
  - `Ops.Admin` additionally gets raw query explorers, approvals and game-day controls.
  - Every request is written to `audit_log`.
- **Data source adapters** (async, with timeouts, retries and circuit breakers, using Workload Identity for Azure):

| Source | Used for |
|---|---|
| Prometheus | Golden signals, SLO / error budget, saturation, curated PromQL; admin-only free-form PromQL with an allow-list and limits |
| Alertmanager API | Active alerts, silences (create/expire silence = Admin) |
| Kubernetes API | Pods, restarts, events, deployments, **active colour per service** |
| Log Analytics (KQL) | `ContainerLogV2` (app errors by service), `KubeEvents`, AKS audit, Key Vault `AuditEvent`, PostgreSQL logs; curated queries, admin-only raw KQL |
| Azure Monitor metrics | PostgreSQL CPU / connections / storage, AKS node metrics |
| Azure Resource Health | AKS, PostgreSQL, Key Vault availability |
| opsdb | Alert history, RCA reports, deployment events (posted by the pipeline), chat sessions |

- **Endpoints (sketch):**
  - `/api/health/overview`, `/api/services/{svc}`
  - `/api/metrics/query`, `/api/logs/query`
  - `/api/alerts`, `/api/deployments`
  - `/api/webhooks/{alertmanager|azure-monitor}`
  - `/api/gates/release` (used by the ADO check)
  - `/api/ai/*` (Phase 8)
- **Self-observability:** `/metrics`, JSON logs, OTel traces.

### 7.3 ops-portal (React + Vite + MUI + MSAL)

| Page | Contents |
|---|---|
| **Overview** | Traffic-light tile per service (availability, p95, error rate, SLO budget left), active colour + version, firing alerts, Azure resource health, AI daily brief |
| **Service detail** | Golden-signal charts, pods / restarts / events, recent deployments, top error log patterns |
| **Metrics explorer** | Curated PromQL library + (Admin) free-form query with chart |
| **Logs explorer** | Filter by source (container / K8s events / AKS audit / Key Vault / PostgreSQL), service, severity and time; saved KQL queries |
| **Alerts** | Firing + history, linked runbook, AI RCA report, silence (Admin) |
| **Deployments** | Timeline of releases (colour, SHA, who, result), rollback proposals |
| **AIOps** | Chat assistant, RCA reports, anomalies, postmortem drafts (Phase 8) |
| **Audit** (Admin) | Who viewed, queried, approved and silenced what |

**Exit criteria:**

- A user outside `CredPay-Ops-Admins` gets 403 even with a valid tenant login.
- Every source in §7.2 renders data.
- The CredPay customer app cannot reach the `ops` namespace (NetworkPolicy test).

---

## Phase 8: AIOps in the Ops Console (7–10 days)

**Objective (R5):** AI that helps operators, grounded in real telemetry, safe and measurable.

**Principle (teach this explicitly):** *Deterministic systems detect; the LLM explains.* Metrics, rules and statistics decide that something is wrong. The LLM summarises evidence, correlates it and drafts text, and it never invents data or holds write credentials.

| # | Capability | How it works |
|---|---|---|
| A1 | **Ask CredAI** (chat) | Existing intent → facts → prompt flow, rebuilt with proper system/user messages, validated history, a facts budget, and citations ("based on: payment-service error rate 4.2%, 5 m") |
| A2 | **Alert-triggered RCA** | Alertmanager/Azure webhook → collect context (metric window around the alert, pod events, top error log patterns, deployments in the last 2 h, resource health) → LLM RCA (JSON schema: summary, likely cause, evidence, suggested runbook step, confidence) → **Slack thread reply** + opsdb + Alerts page |
| A3 | **Anomaly detection** | A scheduled job every 5 min computes rolling baselines (seasonal z-score / EWMA) for request rate, error rate, p95 and payment volume per service. It exposes `credpay_anomaly_score{service,signal}`, and a PrometheusRule alerts on it (feeds A2). |
| A4 | **Log intelligence** | KQL pulls error and warning lines → **Drain3** template mining groups them into patterns with counts and trend → the LLM explains the top patterns. Shown on the Service detail page. |
| A5 | **Deployment correlation** | The pipeline posts deploy events; RCA and chat always include "changes in the last N hours" and before/after golden-signal deltas per colour |
| A6 | **Remediation proposals (human-in-the-loop)** | The LLM may suggest an action from an **allow-list**: rollback, scale out, restart deployment, silence. An Admin clicks Approve → ops-api queues `rollback.yml` (or a scoped action pipeline) through the ADO REST API → the result is posted to Slack and the audit log. |
| A7 | **Daily ops brief + postmortem draft** | Daily summary posted to Slack. For any resolved critical alert, a blameless postmortem draft (timeline from alerts, deploys and actions) is created in `docs/postmortems/` format. |
| A8 | **Release gate input** | `/api/gates/release` blocks prod deploys while critical alerts fire or the error budget is exhausted (used by the ADO Environment check) |

**Guardrails (all required)**

- [ ] Admin-only access; no AI endpoints exposed publicly; no raw PromQL/KQL from the AI path.
- [ ] Redact PII and secrets (emails, UPI IDs, card fragments, tokens) from logs before they are sent to the LLM.
- [ ] **Azure AI Content Safety Prompt Shields** on user input; output schema validation for RCA.
- [ ] Per-user rate limit, daily token budget, TTL cache for summaries, OpenAI timeout + retries + circuit breaker.
- [ ] Prompts, responses, tokens and cost logged to opsdb (redacted). Metrics `ops_llm_tokens_total`, `ops_llm_latency_seconds`, `ops_llm_cost_usd_total`.
- [ ] **Evaluation harness** in CI (`ops-console/ops-api/evals/`):
  - 30+ golden scenarios with recorded telemetry fixtures.
  - Checks: **groundedness** (every number in the answer appears in the facts), intent accuracy, RCA picks the right cause in labelled scenarios.
  - Thresholds gate the `ops-console.yml` pipeline.

**Exit criteria:**

- A Phase 9 game-day fault produces a Slack alert, a correct RCA thread reply within 60 s, and an anomaly flagged.
- An approved rollback restores the SLO.
- The eval suite passes in CI.

---

## Phase 9: SRE practices, game days and final dry run (5–7 days)

**Objective:** run the platform the way an SRE team would, and rehearse the full story before teaching it.

- [ ] **Incident management:**
  - Severity matrix (SEV1–3).
  - Roles: Incident Commander, Ops Lead, Comms.
  - A `#credpay-incidents` channel per incident.
  - Status updates every 15 min.
  - A blameless postmortem template.
- [ ] **Error budget policy:** when the budget is exhausted, freeze feature releases (enforced by A8) and allow only reliability work.
- [ ] **On-call:** rotation document; optional PagerDuty free schedule + escalation.
- [ ] **Capacity review:** HPA behaviour under k6 load; node autoscaler; AIOps capacity forecast vs actual.
- [ ] **DR:** PostgreSQL point-in-time restore into a new server; measure the actual RTO/RPO against the NFRs; document the result.
- [ ] **Game days** (scripted in `docs/labs/`, run in staging first, then prod with the feature flags from Phase 4):

| # | Scenario | Injected by | Expected detection | Expected response |
|---|---|---|---|---|
| G1 | Bad release (500s on `/pay`) | Deploy a build with a fault flag on | Preview tests fail **or** `PostDeployErrorSpike` | Traffic never switches, or switches back automatically |
| G2 | Payment failure rate 20% | `PAYMENT_FAILURE_RATE=0.2` | `PaymentSuccessRateLow`, fast burn, anomaly | AI RCA → runbook → fix flag |
| G3 | Latency injection 1.5 s | `PAYMENT_LATENCY_MS=1500` | `HighLatencyP95`, burn rate | RCA links it to a deploy or config change |
| G4 | Pod crash loop | Bad env var | `PodCrashLooping` | Logs explorer shows the stack trace pattern |
| G5 | DB pool exhaustion | k6 spike + small pool | `DBConnectionPoolSaturated`, latency | Scale out / tune pool |
| G6 | Secret rotation gone wrong | Revoke the KV role for payment-service | Pod mount failure, KV `AccessDenied` alert | Restore the role assignment; postmortem |
| G7 | Node failure | `kubectl drain` a node | `NodeNotReady` + inhibition works | PDBs keep the service up |
| G8 | Monitoring down | Scale Alertmanager to 0 | healthchecks.io email (dead-man's switch) | Restore |

- [ ] **Final end-to-end dry run:** execute §14 on a freshly built environment from `terraform apply` onwards. Record the timings and every issue (it becomes the "known issues" doc for students).

**Exit criteria:** all 8 game days pass; the dry run completes from zero; postmortems are written for at least G2 and G6.

---

## 13. Teaching plan (modules for students)

| Module | Topic | Built in phase | Student lab |
|---|---|---|---|
| 1 | System design, NFRs, SLOs, ADRs, C4 | 1 | Write an ADR; draw the payment sequence |
| 2 | Terraform for a real platform (modules, state, identities) | 2 | Add a new KV secret + role assignment by code |
| 3 | Secrets the right way: Key Vault, Workload Identity, CSI, rotation | 3 | Rotate a secret; debug a denied mount |
| 4 | Secure microservices: BCrypt, JWT/JWKS, ownership, idempotency | 4 | Find and fix an IDOR |
| 5 | Testing pyramid: unit → Testcontainers → E2E → load | 4 | Write a Playwright test + k6 threshold |
| 6 | Helm packaging | 5 | Template a new service with the shared chart |
| 7 | Multi-stage CI/CD, quality and security gates, approvals | 5 | Break the build with a CVE; see the gate stop it |
| 8 | Blue/green, expand/contract migrations, automatic rollback | 5 | Ship a breaking change safely across two releases |
| 9 | Prometheus, PromQL, Grafana, Log Analytics/KQL | 6 | Build an SLO dashboard |
| 10 | Alerting design, Slack routing, runbooks, dead-man's switch | 6 | Write an alert + runbook |
| 11 | Workforce identity: Entra ID, App Roles, admin plane isolation | 7 | Grant/revoke admin access via a group |
| 12 | AIOps: grounding, RCA, anomaly detection, guardrails, evals | 8 | Add a golden eval scenario; tune an anomaly threshold |
| 13 | SRE: incidents, error budgets, postmortems, game days | 9 | Run G2 as Incident Commander; write the postmortem |
| 14 | Capstone wrap-up + preview of GitOps (AWS project) | — | Compare the pipeline push model vs the GitOps pull model |

---

## 14. End-to-end demo script

1. **Design:** walk through the C4 container diagram and the SLO table.
2. **Infra:** show the `infra.yml` run: plan → approval → apply. Show Key Vault (no secrets in git) and Workload Identity federation.
3. **Customer:** sign up and log in on `app.<domain>` (show the BCrypt hash in the DB). Add a card, pay, view history. Try to read another user's cards and get 403.
4. **Release:** merge a PR. PR checks → `release.yml` → staging E2E → prod approval (the gate checks ops-api) → idle colour deployed → preview tests → **switch** → post-deploy watch → Slack #deployments 🟢.
5. **Failure:** release a build with the payment fault flag on. Post-deploy spike → **automatic switch-back** → Slack 🔴.
6. **Incident:** inject G2 in prod. Slack critical alert → **AI RCA thread reply** → admin opens `ops.<domain>` (Entra SSO) → Overview shows red → Service detail: logs pattern + anomaly → AIOps proposes "roll back / disable flag" → Approve → `rollback.yml` → resolved message in Slack.
7. **SRE close-out:** error-budget dashboard shows the burn; AI drafts the postmortem; review it in class.
8. **Security:** show the Key Vault audit log, the ops-api audit log, and a non-admin getting 403 on `ops.<domain>`.

---

## 15. Timeline, capacity and cost

**Instructor build timeline** (working days, one person, phases partly parallel):

| Week | Phases |
|---|---|
| 1 | Phase 0, Phase 1 |
| 2–3 | Phase 2, Phase 3 |
| 3–4 | Phase 4 (tests start here) |
| 5–6 | Phase 5 |
| 6–7 | Phase 6 |
| 7–8 | Phase 7 |
| 9–10 | Phase 8 |
| 10–11 | Phase 9 + final dry run |

**Total: about 10–11 weeks part-time / 7–8 weeks full-time.**

**Capacity:** the current 2× B2s pool (about 90% memory committed) cannot hold blue + green + staging + kube-prometheus-stack + the Ops Console. Planned sizing:

- **System pool:** 2× D2as_v5.
- **User pool:** autoscale 2–4× D4as_v5.
- **PostgreSQL:** Burstable B2ms (HA off by default, enabled once for a demo).

**Cost control** (check exact figures in the Azure Pricing Calculator for your region):

- `az aks stop` / `az postgres flexible-server stop` when not teaching.
- Scale the idle colour to 1 replica after the soak period.
- Staging runs 1 replica per service.
- Log Analytics daily cap.
- An RG budget with alerts (Phase 2).
- An OpenAI token budget enforced in ops-api.

---

## 16. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Microsoft-hosted ADO agents have changing IPs, which conflicts with AKS authorised IP ranges and private Key Vault/PostgreSQL | Use a **self-hosted agent (VM Scale Set agent pool) inside the VNet**. That is also a good enterprise lesson. Interim: temporarily allow the agent IP in the pipeline (`az aks update --api-server-authorized-ip-ranges`), which is slower and noisier. |
| Let's Encrypt rate limits during repeated rebuilds | Use the LE **staging** issuer until stable, then switch to production. |
| Blue/green + DB schema changes break the old colour | Enforce expand/contract; a migration-review checklist in the PR template. |
| LLM cost or latency spikes | Token budget, caching, `reasoning.effort=low`, async calls, circuit breaker that falls back to "facts only" output. |
| Slack free plan history limit (90 days) | Alert history is also stored in opsdb and shown in the Ops Console. |
| Alerting depends on ops-api for Azure Monitor alerts | The Action Group also emails. Alertmanager → Slack is direct (it does not depend on ops-api). |
| Scope creep | Each phase has exit criteria. Tracing (OTel → App Insights) and PagerDuty are **stretch goals** and come only after Phase 9. |
| Secrets leak again in docs | gitleaks pre-commit + CI on every PR; docs use placeholders only. |

---

### Stretch goals (after Phase 9)

- OpenTelemetry tracing (Java agent + FastAPI instrumentation) → Application Insights; trace links from the Ops Console.
- Entra auth to Azure OpenAI and PostgreSQL ("the best secret is no secret") as an advanced Key Vault follow-up.
- Azure Chaos Studio for node and network faults.
- Kyverno policies (signed images only, no `:latest`, limits required).
- Per-service databases (payment-service calls user-service for card ownership) as an advanced microservices module.
