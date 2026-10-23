# CredPay Capstone: 3-Day Roadmap

| | |
|---|---|
| **Goal** | Extend the working CredPay project so students see how an organisation runs it: multiple services, a **multi-stage pipeline**, **Key Vault** secrets, **blue/green** releases, **alerting to Slack**, light **SRE** practice, and an **admin-only Ops Console with AIOps (Azure AI Foundry)**. |
| **Duration** | 3 days (instructor build), then teach |
| **Constraints** | **Microsoft-hosted agents only** (`ubuntu-latest`). No private networking, no self-hosted agents, no Helm migration, no GitOps (that is the next, AWS, project). Reuse the existing Terraform, pipeline, blue/green logic and `ai-service`. |
| **Out of scope** | Everything in `ROADMAP-ENTERPRISE-FUTURE.md` (Workload Identity / CSI driver, private endpoints, Entra SSO, staging environment, Helm, OpenTelemetry). Keep that file as a "what we'd do next" slide. |

---

## 1. What we are building

| # | Requirement | What we do (simple version) | Day |
|---|---|---|---|
| R1 | Secrets from Azure Key Vault | Store **all** secrets in Key Vault: DB, AI Foundry key, Slack webhook, admin credentials, JWT secret. The pipeline reads them with `AzureKeyVault@2` and creates the K8s Secrets at deploy time. **Nothing secret in git or in pipeline variables.** | 1 |
| R2 | Blue/green | Keep the existing frontend blue/green. Fix it to use **immutable image tags** (`$(Build.BuildId)`) so rollback really returns to the old version. Add a **manual approval before the traffic switch** and a **rollback** stage. | 1 |
| R3 | New admin-only service, not part of CredPay | **Ops Console** = new `ops-portal` web app + the existing `ai-service` acting as its API. It has its own login, page and URL path (`/ops`), and it **only reads telemetry**. The CredAI page is **removed** from the customer app. | 2 |
| R4 | Customers sign up and log in | Already working (`/register`, `/login`). No change needed. Optional 1-hour hardening: BCrypt passwords. | — |
| R5 | Admin login: logs, metrics and health from multiple sources + AIOps | The admin logs in to `/ops`. The dashboard shows **Prometheus** (metrics), **Kubernetes API** (pods, events, **logs**), **Alertmanager** (active alerts) and optionally **Log Analytics**. AIOps tab: chat, cluster/business summary, root-cause analysis, all powered by the **AI Foundry `gpt-5-mini` deployment**. | 2 |
| R6 | GitOps | Next project (AWS). Not used here. | — |
| R7 | Alerting | **Prometheus alert rules → Alertmanager → Slack (free)**. Bonus: Alertmanager also calls `ai-service`, which posts an **AI root-cause summary** into Slack. | 3 |

**Alerting tool choice:** Slack Free is the right choice here. It is free, takes about 10 minutes to set up, and needs no extra infrastructure; it has an incoming webhook per channel and 90 days of history, which is enough for a class. Use **Microsoft Teams** (Workflows webhook) instead only if your students' organisation is on M365. Skip PagerDuty and Opsgenie for this project.

---

## 2. Target design (what changes vs. today)

```
                          Internet  (HTTP, ingress-nginx public IP)
                                 │
         ┌───────────────────────┼─────────────────────────────┐
         │ /  /api/users  /api/cards  /api/payment             │ /ops          /api/ops/*
         ▼                                                     ▼
 ┌─ CredPay (customer app, UNCHANGED logic) ─┐     ┌─ Ops Console (NEW, admin only) ────────────┐
 │ frontend  blue ◄─► green  (BuildId tags)  │     │ ops-portal (React, nginx)                   │
 │ user-service      payment-service         │     │      │ JWT (admin login)                    │
 │        │                │                 │     │      ▼                                      │
 │        └──── PostgreSQL ┘                 │     │ ai-service  (renamed role: Ops API)         │
 └───────────────────────────────────────────┘     │  ├─► Prometheus      metrics                │
            ▲  /metrics scraped                    │  ├─► Kubernetes API  pods / events / logs   │
            │                                      │  ├─► Alertmanager    active alerts          │
 ┌─ monitoring ──────────────────────────────┐     │  ├─► Log Analytics   (optional)             │
 │ Prometheus ── alert rules ──► Alertmanager├──┐  │  └─► Azure AI Foundry gpt-5-mini  (AIOps)   │
 │ Grafana (existing 6 dashboards + SLO)     │  │  └─────────────────────────────────────────────┘
 └───────────────────────────────────────────┘  │             ▲ /internal/alerts (cluster-only)
                                                ├─────────────┘
                                                └──► Slack  #credpay-alerts   (+ AI RCA reply)

 Azure DevOps (Microsoft-hosted ubuntu-latest) ── reads ──► Azure Key Vault ──► K8s Secrets
```

**Key design choices (say these out loud to students):**

- **The Ops Console is isolated from CredPay.** It has a separate UI, a separate login, and touches no CredPay API or database. It only reads telemetry.
- **AI explains, deterministic tools detect.** Prometheus rules decide that something is wrong; AI Foundry summarises the evidence. The AI has **read-only** access and cannot change anything.
- **Secrets have a single source of truth (Key Vault).** The pipeline is the only thing that reads Key Vault, and pods get plain K8s Secrets. (The enterprise upgrade, CSI driver + Workload Identity, is in the future roadmap.)

---

## 3. Pre-flight (1 hour, before Day 1)

- [ ] **Rotate the AI Foundry API key.** The old one is in plaintext in `observability/STEP-BY-STEP-DEPLOYMENT-GUIDE.md` (~lines 218–224). Replace it there with `<your-api-key>`.
- [ ] Delete `terraform.zip` and `user-service/target/`.
- [ ] Run `git init` **inside** `CredAppStage1/` (the current git root is your whole home folder) and push to your Azure Repos / GitHub repo.
- [ ] Create a **Slack** workspace (free) with channel `#credpay-alerts`. Add an **Incoming Webhook** app and copy the webhook URL.
- [ ] In **AI Foundry**, confirm the `gpt-5-mini` deployment exists and copy the **endpoint** and **key**.
- [ ] **Capacity check:** the cluster is at about 90% memory requests on 2× B2s. Before Day 2, either set the node pool max to 3 in `terraform.tfvars` (`max_count = 3`), or reduce the **idle** frontend colour to 1 replica.

---

## Day 1: Key Vault secrets + multi-stage pipeline + blue/green fix

### 1.1 Put every secret in Key Vault (30 min)

Add these to the existing vault (the one already used for the `postgres-*` secrets):

| Key Vault secret | Used by |
|---|---|
| `postgres-password` (exists) | user-service, payment-service |
| `foundry-endpoint`, `foundry-key`, `foundry-deployment` | ai-service (AIOps) |
| `slack-webhook-url` | Alertmanager, ai-service, pipeline notifications |
| `ops-admin-username`, `ops-admin-password` | Ops Console login |
| `ops-jwt-secret` (random 64 chars) | ai-service signs admin tokens |

```bash
az keyvault secret set --vault-name <kv> --name foundry-key --value "<key>"
az keyvault secret set --vault-name <kv> --name ops-jwt-secret --value "$(openssl rand -hex 32)"
# ...repeat for the others
```

The pipeline service principal already has `get`/`list` through the vault access policy (STAGE2 §2.3), so no permission change is needed.

### 1.2 Restructure `azure-pipelines.yml` into a real multi-stage pipeline (3–4 h)

All stages run on `vmImage: ubuntu-latest`. Approvals use **Azure DevOps Environments**, which work with Microsoft-hosted agents. Create two environments in ADO (*Pipelines → Environments*):

- **`credpay-infra`**: add yourself as approver.
- **`credpay-prod`**: add yourself as approver.

| # | Stage | What it does | Gate |
|---|---|---|---|
| 1 | **Build** | Three parallel jobs (`frontend`, `user-service`, `payment-service`) + `ai-service` + `ops-portal`: build, run tests if present, `docker build` | — |
| 2 | **SecurityScan** | Trivy scan of each image (merge the logic from `azure-pipelines-1.yml`/`-2.yml`, then delete those files). **Fail on CRITICAL** (`--exit-code 1 --severity CRITICAL`). Publish HTML reports as artifacts. | fails the run |
| 3 | **PushImages** | Push to ACR tagged **`$(Build.BuildId)` only** (drop `latest`) | — |
| 4 | **TerraformPlan** | `init` → `validate` → `plan -out=tfplan` → publish `tfplan` as an artifact | — |
| 5 | **TerraformApply** | `deployment` job on environment **`credpay-infra`** → download artifact → `apply tfplan` | **manual approval** |
| 6 | **DeployBackend** | `AzureKeyVault@2` → create/refresh K8s Secrets → schema Job → `kubectl set image` user-service + payment-service to `$(Build.BuildId)` → `rollout status` | — |
| 7 | **DeployGreen** (idle colour) | Detect live colour → `kubectl set image frontend-<idle> ...:$(Build.BuildId)` → rollout → existing **smoke test** | smoke test must pass |
| 8 | **SwitchTraffic** | `deployment` job on environment **`credpay-prod`** → `kubectl patch svc frontend` to the new colour → curl the Ingress | **manual approval** |
| 9 | **DeployOpsConsole** | Apply `k8s/ops-console/` (ai-service + ops-portal) with `$(Build.BuildId)` images, plus the Ops secrets from Key Vault | — |
| 10 | **Notify** | `condition: always()` → read `slack-webhook-url` from Key Vault → post "✅ / ❌ Release $(Build.BuildId), live colour = X" to Slack | — |

Separate **`rollback.yml`** pipeline (manual trigger):
- Approval (environment `credpay-prod`).
- Patch the frontend Service back to the other colour.
- Post to Slack.

The old colour still runs the **previous immutable tag**, so rollback is instant and actually correct.

**Implementation notes**

- **Pass the live/idle colour between stages** with an output variable: `echo "##vso[task.setvariable variable=newColor;isOutput=true]$NEW_COLOR"`. Read it later with `stageDependencies.DeployGreen.<job>.outputs['<step>.newColor']`.
- **Set the image tag in the pipeline** with `kubectl set image deployment/<name> <container>=<acr>/<repo>:$(Build.BuildId)`. Keep `:latest` out of the manifests. Change `imagePullPolicy` to `IfNotPresent`.
- **Remove `kubectl rollout restart`.** Changing the image triggers the rollout.
- **Keep the existing one-time bootstraps** (attach ACR, ingress-nginx check). They are idempotent.
- **Add `trigger: [main]`** so pushes run the pipeline automatically. The approvals keep prod safe.

**Day 1 exit check**

- [ ] A push runs all stages. The run pauses for approval before Terraform apply and before the traffic switch.
- [ ] `kubectl get deploy -n credpay -o wide` shows **BuildId tags**, not `latest`.
- [ ] Two releases in a row alternate blue → green → blue.
- [ ] `rollback.yml` switches back in under a minute.
- [ ] Slack receives the release message.
- [ ] `grep -ri "password\|key" azure-pipelines.yml` shows only Key Vault secret *names*.

---

## Day 2: Ops Console (admin-only) with multi-source health + AIOps

### 2.1 Separate the AI from the customer app (30 min)

- Delete the `/credai` route, the Sidebar entry, and `CredAIPage.jsx` from `frontend-react/`. The `aiApi` functions in `api.js` also go.
- Remove `k8s/ai-service/ingress.yaml`. ai-service is now exposed only under `/api/ops` (below).

### 2.2 Admin login in `ai-service` (1–1.5 h)

- `POST /api/ops/auth/login {username, password}`:
  - Compare with `OPS_ADMIN_USERNAME` / `OPS_ADMIN_PASSWORD` (from Key Vault) using `hmac.compare_digest`.
  - Return a **JWT** (HS256, `PyJWT`, 60 min, `role=admin`) signed with `OPS_JWT_SECRET`.
- A FastAPI dependency `require_admin` on **every** router except `/health`.
- Move all routes from the `/api/ai` prefix to **`/api/ops`**.
- **Delete** the raw `/prometheus?query=` passthrough. It is replaced by the curated endpoints below.
- CORS: no wildcard. Same-origin through the Ingress.
- Add a simple login rate limit (in-memory counter, 5 attempts per minute per IP).

### 2.3 New "multi-source" endpoints in `ai-service` (2–3 h)

Most of the client code already exists in `app/clients/`.

| Endpoint | Source(s) | Returns |
|---|---|---|
| `GET /api/ops/overview` | Prometheus + K8s API + Alertmanager | Per service: up/down, request rate, 5xx %, p95 latency, pod ready count, restarts. Plus node CPU/memory, firing alert count, and the **live frontend colour + image tag**. |
| `GET /api/ops/metrics/{service}` | Prometheus | Time series (last 1 h) of request rate, error rate and p95, for charts |
| `GET /api/ops/logs/{service}?lines=200&level=error` | **K8s API pod logs** | Recent log lines of that service's pods, filterable by "error" |
| `GET /api/ops/events` | K8s API | Recent warning events (OOMKilled, BackOff, FailedScheduling, …) |
| `GET /api/ops/alerts` | **Alertmanager API** `/api/v2/alerts` | Firing alerts with severity, start time and runbook |
| `GET /api/ops/azure-logs` *(optional)* | Log Analytics (existing client; needs SP creds in Key Vault) | Container error logs via KQL |
| existing: `/chat`, `/root-cause`, `/cluster-summary`, `/business-summary` | **AI Foundry** + all of the above | AIOps answers |

**RBAC change** (`k8s/ai-service/rbac.yaml`): add `pods/log` with verb `get`. It stays **read-only**, which is a good teaching point.

**AI Foundry integration**

- Point `OPENAI_ENDPOINT` / `OPENAI_KEY` / `OPENAI_DEPLOYMENT` at the **Key Vault values** `foundry-endpoint`, `foundry-key` and `foundry-deployment`. The pipeline creates the `credai-secrets` Secret from them.
- **Add log lines + firing alerts to the facts the root-cause prompt receives** (the `TelemetryCollector.collect_root_cause_facts` step). This one change makes the RCA noticeably smarter.
- Set an explicit `timeout=30` and `max_retries=2` on the OpenAI client.

### 2.4 `ops-portal` web app (3 h)

A new folder `ops-portal/`: Vite + React + MUI. Copy the theme, the `Navbar`, and the chat UI from `CredAIPage.jsx`. It is served by nginx with `base: '/ops/'`.

| Page | Shows |
|---|---|
| **Login** | Username/password → stores the JWT in `sessionStorage` → redirects to the dashboard |
| **Health Overview** | Service tiles (🟢/🔴), node gauges, live blue/green colour, firing-alert count, auto-refresh every 30 s |
| **Metrics** | Per-service charts (request rate / errors / p95) using `recharts`, plus a link to Grafana |
| **Logs & Events** | Service picker, error-only toggle, K8s warning events table |
| **Alerts** | Firing alerts from Alertmanager, with severity colours |
| **AIOps (CredAI)** | Chat, "Summarise cluster", "Business summary", and "Analyse root cause" (pre-filled from a selected alert) |

**K8s:** add `k8s/ops-console/` with:
- `ops-portal` Deployment + Service, non-root `nginx-unprivileged`.
- An Ingress for `/ops` → ops-portal and `/api/ops` → ai-service.
- The ai-service manifests (moved from `k8s/ai-service/`).

**Day 2 exit check**

- [ ] The customer app has no AI page.
- [ ] `http://<ingress-ip>/ops` shows a login. A wrong password gives 401.
- [ ] `curl /api/ops/overview` without a token gives 401.
- [ ] After login, all pages show live data from **Prometheus + K8s API + Alertmanager** (Alertmanager is installed on Day 3; until then it shows "not configured").
- [ ] An AIOps question returns a grounded answer from AI Foundry.

---

## Day 3: Alerting to Slack + AI alert summaries + SRE + dry run

### 3.1 Prometheus alert rules (1 h)

Add `rule_files` + `alerting` to `observability/prometheus/01-prometheus-server/prometheus.yaml`, with the rules in a new ConfigMap `observability/prometheus/04-alert-rules/rules.yaml`:

| Alert | Expression (sketch) | For | Severity |
|---|---|---|---|
| `ServiceDown` | `kube_deployment_status_replicas_available{namespace="credpay"} == 0` | 1m | critical |
| `PodCrashLooping` | `increase(kube_pod_container_status_restarts_total{namespace="credpay"}[10m]) > 3` | 0m | warning |
| `HighErrorRate` | 5xx / total > 5% for payment-service or user-service | 5m | critical |
| `HighLatencyP95` | p95 > 1 s | 5m | warning |
| `NodeMemoryHigh` | node memory used > 90% | 10m | warning |
| `SLOErrorBudgetBurn` | availability error rate > 14.4 × (1 − 0.995) over 1 h **and** 5 m | 2m | critical |
| `Watchdog` | `vector(1)` (always firing; shows the pipeline works) | — | none |

Each rule gets `annotations: summary, description, runbook_url` (pointing to `docs/runbooks/<alert>.md`).

### 3.2 Alertmanager → Slack (1 h)

- **New** `observability/alertmanager/alertmanager.yaml`: a single-replica Deployment + Service in `monitoring`, image `prom/alertmanager:v0.27.0`.
- The config is a **K8s Secret created by the pipeline from Key Vault** (`slack-webhook-url`). Two receivers:
  - **`slack`**: `slack_configs` to `#credpay-alerts`, with `send_resolved: true` and a readable title/text template (severity emoji, summary, runbook link).
  - **`ai-rca`**: `webhook_configs` to `http://credai-service.credpay.svc:8000/internal/alerts`. This is cluster-internal only and **not routed by the Ingress**.
- Route: everything goes to `slack` (`continue: true`) and then to `ai-rca` for `severity=critical`.

### 3.3 AI root-cause message in Slack (1 h)

`POST /internal/alerts` in ai-service:
1. Reads the alert labels.
2. Runs the existing root-cause flow (Prometheus + K8s events + recent error logs + AI Foundry).
3. Posts a **"🤖 CredAI analysis"** message to Slack containing the likely cause, the evidence and the suggested next step.
4. Caches the result per alert fingerprint for 15 min, so an alert storm cannot burn tokens.

### 3.4 Light SRE layer (1 h)

- **`docs/sre/slo.md`:**
  - SLOs: user-service and payment-service availability 99.5% (28 days); payment p95 < 1 s.
  - The error budget math (0.5% = about 3.4 h per 28 days).
  - The burn-rate alert explained.
- **Grafana:** add one "SLO & Error Budget" panel row to `credpay-application-metrics.json`.
- **`docs/runbooks/`:** one short runbook per alert, following *Meaning → Check (Ops Console page / kubectl) → Fix → Escalate*.
- **`docs/sre/postmortem-template.md`:** blameless; timeline, impact, root cause, action items.
- **Fault injection for demos.** Add to payment-service an env var `FAULT_ERROR_RATE` (default 0) that returns a 500 for that fraction of `/pay` calls. It takes about 10 lines of code. Toggle it with:

  ```bash
  kubectl set env deploy/payment-service FAULT_ERROR_RATE=0.3 -n credpay
  ```

- **Traffic for demos:** a small k6 script or a `while curl` loop in `tests/load/`, so the graphs and alerts have data.

### 3.5 Full end-to-end dry run (2 h)

Run the demo script (§4) from a clean push. Fix anything that breaks and record the timings.

**Day 3 exit check**

- [ ] Setting `FAULT_ERROR_RATE=0.3` gives a Slack 🔴 `HighErrorRate` alert within about 5–6 min, **plus** a 🤖 CredAI analysis message.
- [ ] Setting it back to 0 gives a ✅ resolved message.
- [ ] The Ops Console Alerts page shows the alert, and "Analyse root cause" works from it.
- [ ] The release → approval → switch → rollback cycle works end to end.

---

## 4. Demo script for students (≈ 30 min)

1. **Architecture:** the §2 diagram covers the customer app vs. the Ops Console, Key Vault as the single source of secrets, and why the AI is read-only.
2. **Customer journey:** sign up, log in, add a card, pay, view history.
3. **Release:** push a visible frontend change. Walk through each pipeline stage:
   - Build → Trivy gate → push (BuildId tag) → Terraform plan → **approve** → apply → backends → idle colour + smoke test → **approve switch** → Slack ✅.
   - Refresh the site to see the new version, then run `rollback.yml` to show the instant rollback.
4. **Secrets:** show Key Vault, the `AzureKeyVault@2` step (values masked in logs), and that no secret exists in the repo.
5. **Incident:**
   - Inject `FAULT_ERROR_RATE=0.3`.
   - Slack alert → **AI analysis in Slack**.
   - Admin logs in to `/ops`: overview is red → metrics → error logs → AIOps root-cause.
   - Fix the flag → resolved.
6. **SRE wrap-up:** error-budget panel burn, runbook, and writing the postmortem together.

---

## 5. Files that change

| Area | Files |
|---|---|
| Pipeline | `azure-pipelines.yml` (restructured), **new** `pipelines/rollback.yml`; delete `azure-pipelines-1.yml`, `azure-pipelines-2.yml` |
| Customer frontend | `src/routes/AppRoutes.jsx`, `src/components/Sidebar.jsx`, `src/services/api.js`; delete `src/pages/CredAIPage.jsx` |
| payment-service | `app/routes.py` or `services.py` (`FAULT_ERROR_RATE`) |
| ai-service | `app/api/*` (prefix `/api/ops`, `require_admin`), **new** `app/api/auth.py`, `app/api/ops.py`, `app/api/alerts_webhook.py`, `app/clients/alertmanager_client.py`, `app/clients/slack_client.py`; `kubernetes_client.py` (+ pod logs); `config/settings.py`; `requirements.txt` (+ `PyJWT`) |
| New app | `ops-portal/` (Vite + React + MUI, Dockerfile, nginx.conf) |
| K8s | **new** `k8s/ops-console/` (ai-service moved here + ops-portal + ingress); `rbac.yaml` (+ `pods/log`); deployments: `imagePullPolicy: IfNotPresent` |
| Observability | `prometheus.yaml` (rules + alerting), **new** `04-alert-rules/rules.yaml`, **new** `alertmanager/alertmanager.yaml`, Grafana SLO panels |
| Docs | **new** `docs/sre/slo.md`, `docs/sre/postmortem-template.md`, `docs/runbooks/*.md`; update `README` / tracker |

---

## 6. Risks (and the simple answer)

| Risk | Answer |
|---|---|
| Not enough cluster memory for the new pods | `max_count = 3` on the node pool, or run the idle frontend colour at 1 replica |
| Alerts take too long to fire in the demo | Use `for: 1m` and a 5 m rate window during class |
| AI Foundry slow or rate-limited during a live demo | Cache the summaries for 60 s; have a recorded screenshot as backup |
| Public HTTP for the admin page | Acceptable for a class. Mention TLS (cert-manager) and SSO as the "next step" from the future roadmap. Optionally add `nginx.ingress.kubernetes.io/whitelist-source-range` with your IP on the `/ops` Ingress. |
| Approvals slow the pipeline during practice | Approvals are per environment, so remove the approver temporarily while rehearsing |
