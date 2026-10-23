# Stage 1 — Make CredPay Run on AKS (Manual Deployment)

> **Post-deployment incident (2026-07-08) — see §8 at the end of this
> document.** After the manifest fixes below were applied, live testing on
> the actual AKS cluster (`http://4.239.161.142`) surfaced two further
> issues: a stale-manifest problem (the cluster was still running
> `imagePullPolicy: IfNotPresent`, so new images were never pulled) and a
> **regression I introduced myself** in §3.4 (the restored frontend
> `securityContext` crash-loops `nginx:stable-alpine`). Both are now fixed
> and verified end-to-end against the live cluster. Read §8 first if you're
> reviewing what happened today.

This document records every change made to take CredPay from "pods are
running but the app doesn't work" to "fully functional inside AKS via manual
`kubectl apply`". It is written to double as teaching material: every change
states the **problem**, the **fix**, and **why** it matters for Kubernetes /
Docker / Azure DevOps students.

Scope: Stage 1 only. No CI/CD deployment, no Helm, no GitOps, no TLS, no
Key Vault, no Workload Identity — those are Stage 2/3.

---

## 1. Root cause of the AKS blocker

> "Frontend still calls localhost. Application does not function correctly
> inside AKS."

**Root cause:** [frontend-react/src/services/api.js](frontend-react/src/services/api.js)
built its axios `baseURL`s as:

```js
const USER_BASE_URL = import.meta.env.VITE_USER_API_URL || 'http://localhost:8080';
const PAYMENT_BASE_URL = import.meta.env.VITE_PAYMENT_API_URL || 'http://localhost:8000';
```

Vite inlines `import.meta.env.VITE_*` values **at build time**, not at
container runtime. The Docker build pipeline
([Pipelines/dockerstage.yml](Pipelines/dockerstage.yml)) never passes
`VITE_USER_API_URL` / `VITE_PAYMENT_API_URL` as build args, and `.env` files
are excluded from the Docker build context
([frontend-react/.dockerignore](frontend-react/.dockerignore)). So every
image built by CI got the `localhost` fallback **permanently baked into the
shipped JavaScript bundle**. Once that bundle runs in a user's browser, it
tries to call `http://localhost:8080` — the user's own laptop, not the AKS
cluster — and every API call fails.

The rest of the architecture (Ingress path-based routing, K8s Service names,
ConfigMap/Secret wiring) was already correctly designed for a same-origin,
Ingress-routed deployment. Only the frontend's fallback defaults were wrong.

---

## 2. Files modified

| # | File | Why |
|---|------|-----|
| 1 | `frontend-react/src/services/api.js` | **The fix.** Default to relative URLs instead of `localhost`. |
| 2 | `frontend-react/.env.example` | Document when `localhost` values are (and aren't) appropriate. |
| 3 | `frontend-react/README.md` | Correct stale docs that described `localhost` as the default. |
| 4 | `k8s/frontend/deployment.yaml` | Restore dropped container `securityContext`; fix `imagePullPolicy`. |
| 5 | `k8s/user-service/deployment.yaml` | Fix `imagePullPolicy`. |
| 6 | `k8s/payment-service/deployment.yaml` | Fix `imagePullPolicy`. |
| 7 | `k8s/README.md` | Correct stale placeholder docs; document `imagePullPolicy` change. |

Files reviewed and found already correct — **no changes made** (see §3):
`k8s/configmap/configmap.yaml`, `k8s/secrets/secret.yaml`,
`k8s/namespace/namespace.yaml`, `k8s/ingress/ingress.yaml`,
`k8s/*/service.yaml`, `k8s/*/hpa.yaml`, `k8s/postgres/schema-init-job.yaml`,
`user-service/src/.../CorsConfig.java`, `user-service/.../application.properties`,
`payment-service/app/main.py`, `payment-service/app/database.py`,
`frontend-react/vite.config.js`, `frontend-react/nginx.conf`, all three
`Dockerfile`s, `azure-pipelines.yml`, `Pipelines/dockerstage.yml`, `terraform/`.

> Note: `k8s/configmap|secrets|namespace|ingress/*.yaml` show as "modified" in
> `git diff` because they were already mid-edit in the working tree before
> this session started (simplifying away Workload Identity/TLS placeholders
> that Terraform doesn't provision, and filling in the real ACR/Postgres
> hostnames). Those edits were reviewed, found correct, and left as-is.

---

## 3. Detailed changes

### 3.1 `frontend-react/src/services/api.js` — the fix

**Before:**
```js
const USER_BASE_URL = import.meta.env.VITE_USER_API_URL || 'http://localhost:8080';
const PAYMENT_BASE_URL = import.meta.env.VITE_PAYMENT_API_URL || 'http://localhost:8000';
```

**After:**
```js
const USER_BASE_URL = import.meta.env.VITE_USER_API_URL || '';
const PAYMENT_BASE_URL = import.meta.env.VITE_PAYMENT_API_URL || '';
```

**Why this works:** `axios.create({ baseURL: '' })` resolves requests
(`/api/users/login`, `/api/payment/pay`, ...) against the page's own origin.
Behind the Ingress, the frontend and both backends are reached through the
**same origin** (the Ingress LoadBalancer IP), and `k8s/ingress/ingress.yaml`
already path-routes `/api/payment` → payment-service, `/api/users` and
`/api/cards` → user-service, `/` → frontend. No CORS is needed because the
browser never makes a cross-origin request. Local `npm run dev` is
unaffected: a developer who copies `.env.example` to `.env` still gets
absolute `localhost` URLs for the Vite dev server workflow.

### 3.2 `frontend-react/.env.example`

Added a comment block clarifying that this file is for **local development
only** (`npm run dev`), and that Docker/CI must never see a real `.env` (this
was already true — `.dockerignore` excludes `.env*` — but wasn't documented,
inviting someone to "fix" the AKS issue by reintroducing a baked-in
`localhost` value).

### 3.3 `frontend-react/README.md`

Updated the "Backend configuration" and "Docker" sections, which described
`localhost:8080` / `localhost:8000` as defaults. They now state that relative
URLs are the default (needed for Docker/AKS) and `localhost` is the opt-in
override for local dev via `.env`.

### 3.4 `k8s/frontend/deployment.yaml`

**Problem 1 — dropped security hardening.** A prior in-progress edit in this
repo removed Azure Workload Identity from this file (correct — Terraform
doesn't provision the identity resources it needs) but accidentally deleted
the container-level `securityContext` in the same edit:

```yaml
# deleted by mistake:
securityContext:
  allowPrivilegeEscalation: false
  capabilities:
    drop: ["ALL"]
    add: ["NET_BIND_SERVICE"]
```

This pod must run as root (`runAsNonRoot: false` at the pod level) because
`nginx:stable-alpine`'s master process binds port 80. But "runs as root"
doesn't have to mean "has every Linux capability" — dropping all capabilities
and adding back only `NET_BIND_SERVICE` (the one needed to bind a privileged
port) is the standard least-privilege pattern for this exact scenario, and is
explicitly allowed under the namespace's `pod-security.kubernetes.io/enforce:
baseline` label. **Restored.**

**Problem 2 — stale image risk.** `imagePullPolicy: IfNotPresent` was paired
with the mutable `:latest` tag. `IfNotPresent` only checks whether a node
already has an image with that tag cached — it does **not** compare digests.
On a manual-deployment workflow (`kubectl apply` + `kubectl rollout restart`),
a node that already ran `credpay/frontend:latest` before would silently keep
serving the **old** code after a fresh push, even though ACR has the new
image. Changed to `imagePullPolicy: Always`.

> **Correction (2026-07-08, see §8):** the `securityContext` restored above
> (`capabilities: drop: ["ALL"], add: ["NET_BIND_SERVICE"]`) turned out to
> crash-loop the container against the real `nginx:stable-alpine` image —
> confirmed live on the AKS cluster. It has since been **removed** and
> replaced with `allowPrivilegeEscalation: false` only. The analysis above
> (that dropping capabilities is safe alongside `runAsNonRoot: false`) was
> wrong for this specific image; §8 explains why.

### 3.5 / 3.6 `k8s/user-service/deployment.yaml`, `k8s/payment-service/deployment.yaml`

Same `imagePullPolicy: IfNotPresent` → `Always` fix, same reasoning — both
images are also pushed to the mutable `:latest` tag.

### 3.7 `k8s/README.md`

- Replaced the "one placeholder you must replace" section (which pointed at
  `<POSTGRES_FQDN>` in the ConfigMap) with a "hardcoded values" table, since
  that file was already filled in with the real hostname
  (`psql-credpay.postgres.database.azure.com`) and ACR
  (`credproj.azurecr.io`) — the doc was out of date.
- Documented the new `imagePullPolicy: Always` behavior under "Notes /
  current limitations".
- (Follow-up audit pass) Fixed a second, missed reference to the same stale
  placeholder in the "Deployment order" section — step 2 said
  `kubectl apply -f configmap/configmap.yaml  (after replacing <POSTGRES_FQDN>)`,
  which no longer applies.

### 3.8 `k8s/configmap/configmap.yaml` (follow-up audit pass)

The file's own header comment still said `Replace <POSTGRES_FQDN> with:
terraform output -raw postgres_fqdn` directly above data values that were
**already** the real hostname — a leftover instruction contradicting the
line right below it. Reworded to state the FQDN is already set, with the
`terraform output` command kept only as guidance for if the server is ever
recreated under a different name. No functional change (the ConfigMap's
`data:` values were untouched) — comment accuracy only.

---

## 4. Reviewed, no change needed (and why)

Being thorough means also recording what was checked and found correct:

- **`user-service/.../CorsConfig.java`** and **`payment-service/app/main.py`**
  hardcode `http://localhost:5173` as the only allowed CORS origin. This is
  correct for local dev (Vite dev server calling backends cross-origin) and
  **harmless in AKS**: once the frontend calls relative URLs (§3.1), the
  browser's request `Origin` header equals the page's own origin, so it's a
  same-origin request — CORS middleware is never invoked by the browser.
- **`user-service/.../application.properties`**
  (`spring.datasource.url=jdbc:postgresql://localhost:5432/credpay`) and
  **`payment-service/app/database.py`** (`DB_HOST` default `"localhost"`) are
  local-dev fallback defaults, not bugs. Spring Boot's environment-variable
  precedence ranks OS env vars above `application.properties`, and both
  Deployments inject `SPRING_DATASOURCE_URL` / `DB_HOST` via
  `envFrom: configMapRef: credpay-config` — the K8s value always wins in the
  cluster.
- **`k8s/ingress/ingress.yaml`, `k8s/configmap/configmap.yaml`,
  `k8s/secrets/secret.yaml`, `k8s/namespace/namespace.yaml`** — already
  correctly simplified to match what Terraform actually provisions (no TLS,
  no host, no Workload Identity, real ACR/Postgres hostnames). Reviewed and
  left as-is.
- **`frontend-react/nginx.conf`, `vite.config.js`, all three `Dockerfile`s,
  `.dockerignore`s** — multi-stage builds, non-root runtime users (backends),
  SPA fallback routing, gzip, and asset caching are all already correct for
  AKS. No changes needed.
- **`azure-pipelines.yml`** (Terraform stage) and
  **`Pipelines/dockerstage.yml`** (Docker build/push stage) — these are two
  separate Azure DevOps pipeline definitions in this repo. Neither references
  `VITE_*` build args, so the api.js fix in §3.1 changes their *output*
  (relative URLs baked in) without requiring any pipeline edit. Per the
  instructions for this task, pipelines were **not** redesigned.
- **`terraform/`** — `postgres_fqdn` output resolves to
  `psql-credpay.postgres.database.azure.com` (from `name_prefix = "credpay"`
  in `terraform/main.tf`), matching the hardcoded ConfigMap value exactly.
  Reviewed only, not modified.

---

## 5. Manual deployment guide

### 5.1 Verify locally (optional, before pushing)

```powershell
# Frontend
cd frontend-react
npm install
npm run build          # must succeed with NO .env file present
npm run preview

# User service
cd ../user-service
mvn -B clean package -DskipTests

# Payment service
cd ../payment-service
pip install -r requirements.txt
```

### 5.2 Build Docker images

```powershell
cd frontend-react
docker build -t credproj.azurecr.io/credpay/frontend:latest .

cd ../user-service
docker build -t credproj.azurecr.io/credpay/user-service:latest .

cd ../payment-service
docker build -t credproj.azurecr.io/credpay/payment-service:latest .
```

### 5.3 Push images to ACR

```powershell
az acr login --name credproj

docker push credproj.azurecr.io/credpay/frontend:latest
docker push credproj.azurecr.io/credpay/user-service:latest
docker push credproj.azurecr.io/credpay/payment-service:latest
```

(In practice this is what `Pipelines/dockerstage.yml` does automatically on
every push to `main` — these are the manual equivalents for local testing.)

### 5.4 Verify ACR

```powershell
az acr repository list --name credproj --output table
az acr repository show-tags --name credproj --repository credpay/frontend --output table
az acr repository show-tags --name credproj --repository credpay/user-service --output table
az acr repository show-tags --name credproj --repository credpay/payment-service --output table
```

### 5.5 Connect kubectl to the AKS cluster

```powershell
az aks get-credentials `
  --resource-group $(terraform -chdir=terraform output -raw resource_group_name) `
  --name $(terraform -chdir=terraform output -raw aks_cluster_name) `
  --overwrite-existing

# One-time only, if not already attached:
az aks update --resource-group <rg-name> --name <aks-name> --attach-acr credproj
```

### 5.6 Deploy to AKS (order matters)

```powershell
# 1. Namespace
kubectl apply -f k8s/namespace/namespace.yaml

# 2. ConfigMap (already has real values - no edits needed)
kubectl apply -f k8s/configmap/configmap.yaml

# 3. Secret - create OUT-OF-BAND from the Terraform output (never commit a real password)
kubectl create secret generic credpay-db `
  --namespace credpay `
  --from-literal=DB_PASSWORD="$(terraform -chdir=terraform output -raw postgres_admin_password)" `
  --from-literal=SPRING_DATASOURCE_PASSWORD="$(terraform -chdir=terraform output -raw postgres_admin_password)"

# 4. Schema Job - create the schema ConfigMap, then run the Job once
kubectl create configmap db-schema `
  --namespace credpay `
  --from-file=schema.sql=schema.sql
kubectl apply -f k8s/postgres/schema-init-job.yaml
kubectl wait --for=condition=complete job/db-schema-init -n credpay --timeout=120s

# 5. Backends
kubectl apply -f k8s/user-service/
kubectl apply -f k8s/payment-service/

# 6. Frontend
kubectl apply -f k8s/frontend/

# 7. Ingress
kubectl apply -f k8s/ingress/ingress.yaml
```

### 5.7 Redeploying after a code change (the normal loop)

```powershell
# ... after pushing new code and the pipeline pushes new :latest images ...
kubectl rollout restart deployment/frontend -n credpay
kubectl rollout restart deployment/user-service -n credpay
kubectl rollout restart deployment/payment-service -n credpay

kubectl rollout status deployment/frontend -n credpay
kubectl rollout status deployment/user-service -n credpay
kubectl rollout status deployment/payment-service -n credpay
```

Thanks to `imagePullPolicy: Always` (§3.4–3.6), this is now guaranteed to
pick up the freshly-pushed `:latest` image on every node.

### 5.8 Diagnostics toolkit

```powershell
kubectl get pods -n credpay
kubectl get svc -n credpay
kubectl get ingress -n credpay
kubectl get hpa -n credpay

kubectl describe pod <pod-name> -n credpay
kubectl logs deployment/frontend -n credpay
kubectl logs deployment/user-service -n credpay
kubectl logs deployment/payment-service -n credpay
kubectl logs job/db-schema-init -n credpay

kubectl exec -it deployment/user-service -n credpay -- sh
```

---

## 6. End-to-end validation checklist

```powershell
$INGRESS_IP = kubectl get svc -n ingress-nginx ingress-nginx-controller `
  -o jsonpath='{.status.loadBalancer.ingress[0].ip}'
echo $INGRESS_IP
```

Browse to `http://<INGRESS_IP>/` and confirm:

- [ ] **Pods healthy** — `kubectl get pods -n credpay` shows all pods
      `Running` / `2/2` or `1/1` Ready, no `CrashLoopBackOff`.
- [ ] **Ingress has an address** — `kubectl get ingress -n credpay` shows the
      LoadBalancer IP under `ADDRESS`.
- [ ] **Frontend loads** — `http://<INGRESS_IP>/` renders the CredPay login
      page (not a blank page or nginx 404).
- [ ] **No localhost calls** — open browser DevTools → Network tab; confirm
      XHR requests go to `http://<INGRESS_IP>/api/...`, **not**
      `localhost:8080` / `localhost:8000`.
- [ ] **Register User** — `/register` creates a new account and shows a
      success message (proves user-service ↔ PostgreSQL works end-to-end).
- [ ] **Login** — log in with the account just created; redirects to
      `/dashboard` and session persists in `localStorage`.
- [ ] **Add Card** — `/add-card` submits successfully and the card appears
      on the dashboard.
- [ ] **Payment** — `/pay-bill` completes a payment and redirects to
      `/success` (proves payment-service ↔ PostgreSQL works end-to-end).
- [ ] **Payment History** — `/payment-history` lists the transaction just
      made.
- [ ] **Database verification** — confirm rows actually landed in Postgres:
      ```powershell
      kubectl run psql-client -n credpay --rm -it --restart=Never `
        --image=postgres:16-alpine -- `
        psql "host=psql-credpay.postgres.database.azure.com port=5432 dbname=credpay user=credpayadmin sslmode=require" `
        -c "select count(*) from users;" -c "select count(*) from payments;"
      ```
- [ ] **Ingress path routing** — verify each backend is reachable only
      through its intended path:
      ```powershell
      curl http://$INGRESS_IP/api/users/login -Method POST -Body '{}' -ContentType 'application/json'
      curl http://$INGRESS_IP/api/payment/history/1
      ```
- [ ] **Redeploy picks up new code** — push a trivial UI text change, wait
      for the pipeline to push a new `:latest` image, run
      `kubectl rollout restart deployment/frontend -n credpay`, and confirm
      the change is visible after `kubectl rollout status` completes (proves
      `imagePullPolicy: Always` is working).

---

## 7. Summary — how each change contributes to a working AKS deployment

| Change | Contribution |
|--------|--------------|
| `api.js` relative URLs | **The actual fix.** Lets one image work behind any Ingress IP, with no absolute backend URL ever baked into the bundle. |
| `.env.example` / README docs | Prevents the fix from being silently undone by someone adding a `.env` with `localhost` values for "convenience". |
| Frontend `securityContext` (`allowPrivilegeEscalation: false` only) | Least-privilege hardening that doesn't fight `nginx:stable-alpine`'s need for `CAP_CHOWN` at startup — see §8. |
| `imagePullPolicy: Always` (all 3 Deployments) | Guarantees `kubectl rollout restart` actually deploys the image just pushed to ACR, instead of silently reusing a stale cached one — critical for a manual-deploy workflow. |
| `k8s/README.md` accuracy fixes | Keeps the runbook trustworthy for whoever deploys next (a teammate, a student, or future-you in Stage 2). |

---

## 8. Post-deployment incident — live AKS diagnosis (2026-07-08)

**Symptom reported:** manifests applied, all pods `Running`, but creating a
new user from the browser at `http://4.239.161.142/register` failed.

### 8.1 Investigation

With direct `kubectl`/`az` access to the live cluster and ACR:

1. `kubectl get pods -n credpay` — all 6 pods `Running`/`1/1` Ready. Not a
   crash or scheduling problem.
2. `kubectl logs deployment/user-service` — started cleanly, HikariCP
   connected to PostgreSQL successfully. No errors.
3. Direct `curl -X POST http://4.239.161.142/api/users/register` (bypassing
   the browser) — **succeeded**, `200 {"message":"User registered
   successfully"}`. This immediately proved the Ingress → user-service →
   PostgreSQL path was healthy, and pointed at something **browser-specific**
   — i.e., the frontend JS bundle itself.
4. Downloaded the live JS bundle actually being served
   (`curl http://4.239.161.142/assets/index-*.js`) and grepped it:
   found `A3="http://localhost:8080"` and `j3="http://localhost:8000"` —
   the pre-fix code, still live.
5. Compared image digests: `kubectl get pods -o jsonpath='{...imageID}'`
   showed the running frontend pods on digest `sha256:d96b2c4c...`
   (built **2026-06-30**), while `az acr repository show-manifests` showed
   the latest pushed digest was `sha256:9b14b625...` (built **today**,
   09:42 UTC, and confirmed via `git show HEAD:frontend-react/src/services/api.js`
   to contain the relative-URL fix).
6. Checked the **live** Deployment spec (not the repo file):
   `kubectl get deployment frontend -o jsonpath='{...imagePullPolicy}'` →
   `IfNotPresent`. Same check on `user-service` and `payment-service`
   showed the identical problem — all three were still running their
   2026-06-30 images.

### 8.2 Root cause #1 — cluster manifests were out of sync with the repo

The `imagePullPolicy: Always` fix from §3.4/3.5/3.6 existed in the Git
repo, but **had never been re-applied to the cluster** with `kubectl apply`.
The live Deployments still had the old `IfNotPresent` policy from an earlier
`kubectl apply`, so even though the pipeline pushed fresh `:latest` images
today, the nodes kept serving their locally-cached June 30 images. This is
exactly the failure mode §3.4 predicted — it just hadn't been re-deployed
yet to take effect.

**Fix applied live:** `kubectl apply -f k8s/frontend/deployment.yaml`,
same for `user-service` and `payment-service`. This changed the pod template
(pull policy), which triggered an automatic rolling restart.

### 8.3 Root cause #2 — a bug in this session's own fix

Applying the frontend Deployment triggered a new rollout, which immediately
**crash-looped**:

```
2026/07/08 10:10:55 [emerg] 1#1: chown("/var/cache/nginx/client_temp", 101) failed (1: Operation not permitted)
nginx: [emerg] chown("/var/cache/nginx/client_temp", 101) failed (1: Operation not permitted)
```

This was caused by the `securityContext` restored in §3.4 of this same
document:

```yaml
securityContext:
  allowPrivilegeEscalation: false
  capabilities:
    drop: ["ALL"]
    add: ["NET_BIND_SERVICE"]
```

**Why it broke:** `nginx:stable-alpine`'s master process runs as root
(UID 0, per the pod-level `runAsNonRoot: false`) specifically so it can
`chown()` its cache directories (`/var/cache/nginx/client_temp` and
friends) to the unprivileged `nginx` user before forking worker processes.
Linux capability checks apply **even to UID 0** — dropping `ALL` capabilities
strips `CAP_CHOWN` along with everything else, so that `chown()` call is
denied regardless of the process's UID. Adding back only `NET_BIND_SERVICE`
(for binding port 80) was not enough; `CAP_CHOWN` was also needed and was
not restored. The original in-progress edit that this session "restored"
had actually removed this block for a good, if undocumented, reason.

**Fix:** removed the `capabilities` block entirely, keeping only
`allowPrivilegeEscalation: false` (which is unrelated to the chown behavior
and safe to keep). Re-applied and confirmed the new pod reached
`Running` / `1/1 Ready` with no restarts.

### 8.4 Verification performed against the live cluster

- `kubectl rollout status` — all three Deployments reported
  `successfully rolled out`.
- `kubectl get pods -o jsonpath='{...imageID}'` — frontend pods now report
  digest `sha256:9b14b625...`, matching today's fixed build.
- Old and intermediate (crash-looping) ReplicaSets confirmed scaled to
  `0/0/0` by `kubectl get rs` — no stray pods left behind.
- Downloaded the **new** live JS bundle and grepped it: zero `localhost`
  matches.
- Ran the full flow directly against `http://4.239.161.142` (same path a
  browser takes through the Ingress): **register → login → add card → pay
  → payment history** — every step returned a correct, successful response
  (`TXN20260708001`, `SUCCESS`, `250.5`), and the history read-back
  correctly returned the transaction just created.
- Data persistence in PostgreSQL was confirmed **indirectly**: the login
  call in a separate HTTP request found the user created by the register
  call moments earlier, and the payment-history call found the payment just
  created — both required a round trip through the shared Postgres database,
  not per-pod memory. A direct `psql` query against the production database
  was intentionally **not** run in this session (it would require decoding
  the live `credpay-db` Secret to query production data, which needs your
  explicit go-ahead) — see §8.5 if you'd like to run that check yourself.

### 8.5 Optional: verify directly in PostgreSQL

If you want to confirm at the database layer yourself:

```powershell
$DBPASS = kubectl get secret credpay-db -n credpay -o jsonpath='{.data.DB_PASSWORD}' | ... base64 -d
kubectl run psql-verify --rm -it --restart=Never -n credpay `
  --image=postgres:16-alpine --env="PGPASSWORD=$DBPASS" -- `
  psql "host=psql-credpay.postgres.database.azure.com port=5432 dbname=credpay user=credpayadmin sslmode=require" `
  -c "select id, full_name, email from users order by id desc limit 5;" `
  -c "select id, user_id, transaction_id, amount, status from payments order by id desc limit 5;"
```

### 8.6 Files changed in this incident (in addition to §2's list)

| File | Change |
|---|---|
| `k8s/frontend/deployment.yaml` | Removed `capabilities: drop: ["ALL"], add: ["NET_BIND_SERVICE"]`; kept `allowPrivilegeEscalation: false`. |
| *(live cluster only, not a file)* | Re-applied `k8s/frontend/deployment.yaml`, `k8s/user-service/deployment.yaml`, `k8s/payment-service/deployment.yaml` to sync the running cluster with the repo. |

### 8.7 Action item for you

**The cluster now matches the repo and is verified working end-to-end via
curl.** Please do a final check in an actual browser at
`http://4.239.161.142/register` to confirm the UI itself behaves correctly
(this session validated the API/Ingress/DB path directly; it did not drive
a real browser). Also worth remembering going forward: **any time the K8s
YAML in the repo changes, it must be re-applied with `kubectl apply`** —
pushing to Git and rebuilding images alone does not update a running
cluster.
