# CredPay — Fresh Fork Runbook (Zero to Live Blue/Green)

This is a **complete, start-from-nothing runbook**. It assumes you have
**never touched this project before**, have **no existing Azure resources**,
and are starting from a **brand-new laptop**. Follow it top to bottom and
you will end with:

- Your own copy of this repo, on your own GitHub account
- Your own Azure infrastructure (network, AKS, PostgreSQL, Key Vault, ACR)
- Your own Azure DevOps pipeline that builds, tests, and deploys automatically
- The app live on the internet, with blue/green frontend deploys you can
  watch flip on every push

No step here assumes prior Azure, Kubernetes, Terraform, or CI/CD
experience — every command is given in full, and every "why" is explained
inline. If you get stuck, the **Troubleshooting** section (near the bottom)
covers the real problems past students hit and exactly how they were fixed.

> **If you're joining a teammate who already has all of this running**
> (shared Azure infra, existing pipeline), you don't need most of this
> document — skip straight to [Appendix B](#appendix-b--joining-an-existing-environment).

---

## Table of contents

1. [What you're building](#1-what-youre-building)
2. [Prerequisites — install these first](#2-prerequisites--install-these-first)
3. [Fill in your own values](#3-fill-in-your-own-values)
4. [Step 1 — Lift and shift the repo to your own GitHub](#4-step-1--lift-and-shift-the-repo-to-your-own-github)
5. [Step 2 — Create your Azure bootstrap resources](#5-step-2--create-your-azure-bootstrap-resources)
6. [Step 3 — Edit the repo for your environment](#6-step-3--edit-the-repo-for-your-environment)
7. [Step 4 — Run Terraform once, from your laptop](#7-step-4--run-terraform-once-from-your-laptop)
8. [Step 5 — One-time cluster setup (ACR attach + Ingress controller)](#8-step-5--one-time-cluster-setup-acr-attach--ingress-controller)
9. [Step 6 — Set up Azure DevOps](#9-step-6--set-up-azure-devops)
10. [Step 7 — Push and watch it deploy](#10-step-7--push-and-watch-it-deploy)
11. [How blue/green works day-to-day](#11-how-bluegreen-works-day-to-day)
12. [Troubleshooting](#12-troubleshooting)
13. [Reference: every environment-specific value, in one table](#13-reference-every-environment-specific-value-in-one-table)
14. [Appendix A: Azure resource naming rules](#appendix-a--azure-resource-naming-rules)
15. [Appendix B: joining an existing environment](#appendix-b--joining-an-existing-environment)

---

## 1. What you're building

```
 Your GitHub repo (main branch)
        │  git push
        ▼
 Azure DevOps Pipeline (azure-pipelines.yml)
        │
        ├── Stage 1: Terraform  ─────► Resource Group, VNet, AKS, PostgreSQL,
        │                              Log Analytics + pushes DB secrets
        │                              into your Key Vault
        │
        ├── Stage 2: Docker Build ───► builds frontend / user-service /
        │                              payment-service images, pushes to
        │                              your ACR
        │
        └── Stage 3: Deploy to AKS ──► attaches your ACR to the cluster and
                                       ensures the Ingress controller is
                                       installed (both idempotent), reads
                                       secrets from Key Vault, creates the
                                       K8s Secret, deploys the DB schema
                                       Job, rolls out user-service &
                                       payment-service (rolling update),
                                       rolls out the frontend to whichever
                                       of blue/green is idle, smoke-tests
                                       it, and only then flips live traffic
                                       to it
```

Three kinds of Azure resources are involved, and it matters which ones
Terraform creates for you and which ones **you** create by hand once,
up front (the same pattern real companies use for a container registry —
you don't want your database and your image registry to have the same
lifecycle):

| Resource | Who creates it | When |
|---|---|---|
| Resource Group, VNet, AKS, PostgreSQL, Log Analytics | **Terraform** (`terraform apply`) | Step 4 below |
| Azure Container Registry (ACR) | **You**, manually, once | Step 2 below |
| Storage Account for Terraform's own state file | **You**, manually, once | Step 2 below |
| Azure Key Vault | **You**, manually, once | Step 2 below |

---

## 2. Prerequisites — install these first

| Tool | What it's for | Check it's installed |
|---|---|---|
| [Git](https://git-scm.com/downloads) | Cloning/pushing the repo | `git --version` |
| [Azure CLI](https://learn.microsoft.com/cli/azure/install-azure-cli) | Everything Azure-related | `az --version` |
| [Terraform CLI](https://developer.hashicorp.com/terraform/install) 1.6+ | Provisioning infra | `terraform --version` |
| [kubectl](https://kubernetes.io/docs/tasks/tools/) | Talking to the cluster | `kubectl version --client` |
| [Helm](https://helm.sh/docs/intro/install/) | Installing the Ingress controller (one-time) | `helm version` |
| Node.js 20+, Java 21 + Maven, Python 3.11+ | *Only* if you want to build/run the app locally before deploying (optional) | `node -v`, `java -version`, `python --version` |

`az aks install-cli` installs `kubectl` for you if it's missing.

You also need:
- A **GitHub account**.
- An **Azure subscription** (a free trial or student subscription is fine —
  the resources this project creates are small/cheap, but remember to
  `terraform destroy` when you're done to avoid ongoing charges).
- An **Azure DevOps organization** — create one free at
  [dev.azure.com](https://dev.azure.com) if you don't have one.

---

## 3. Fill in your own values

Every Azure resource name below must be **globally unique across all of
Azure**, not just unique to your subscription — if you reuse the exact
names from this repo's own working example (`credpay`, `credproj`, etc.),
your commands will fail with a "name already taken" error, because someone
already owns those names. Pick your own short, unique tag — your name,
initials, or student ID work well — and derive every name below from it.
See [Appendix A](#appendix-a--azure-resource-naming-rules) for the exact
character rules per resource type.

Fill in this table on paper (or a scratch file) before starting — every
step below refers back to it:

| Placeholder | Example value | What it becomes |
|---|---|---|
| `<PREFIX>` | `credpay-alex` | Terraform's `name_prefix` → resource group `rg-<PREFIX>`, AKS cluster `aks-<PREFIX>`, PostgreSQL server `psql-<PREFIX>` (must satisfy Postgres's own naming rules — lowercase letters, digits, hyphens — see Appendix A) |
| `<ACR_NAME>` | `alexcredpayacr` | Your Container Registry, e.g. `alexcredpayacr.azurecr.io` |
| `<STATE_RG>` | `alex-tfstate-rg` | Resource group holding Terraform's state storage account |
| `<STATE_STORAGE>` | `alextfstate001` | Storage account for the `.tfstate` file |
| `<KV_NAME>` | `kv-alex-credpay` | Your Key Vault |
| `<SUBSCRIPTION_ID>` | `11111111-2222-...` | `az account show --query id -o tsv` |
| `<LOCATION>` | `canadacentral` | Azure region — pick one close to you |
| `<GITHUB_USERNAME>` | `alexdev` | Your GitHub username |
| `<NEW_REPO_NAME>` | `credpay-alex` | The name of **your** new (empty) GitHub repo |
| `<ADO_ORG>` | `alexdev` | Your Azure DevOps organization name |
| `<ADO_PROJECT>` | `CredPay` | Your Azure DevOps project name |

---

## 4. Step 1 — Lift and shift the repo to your own GitHub

1. On GitHub, create a **new, empty repository** named `<NEW_REPO_NAME>`
   (do **not** initialize it with a README/.gitignore — it must be empty).

2. Clone the original project, strip its git history, and push it as a
   fresh repo of your own:

   ```powershell
   git clone https://github.com/Bharathreddyd3297/CredApp.git <NEW_REPO_NAME>
   cd <NEW_REPO_NAME>

   # Remove the original project's git history entirely
   Remove-Item -Recurse -Force .git

   # Start a brand-new history as your own repo
   git init
   git add .
   git commit -m "Initial import"
   git branch -M main
   git remote add origin https://github.com/<GITHUB_USERNAME>/<NEW_REPO_NAME>.git
   git push -u origin main
   ```

From here on, every `git push` you make goes to **your** repo, and (once
Step 6 is done) triggers **your** pipeline against **your** Azure
subscription. Nothing you do from here touches the original project.

---

## 5. Step 2 — Create your Azure bootstrap resources

Log in first:

```powershell
az login
az account list --output table
az account set --subscription "<SUBSCRIPTION_ID>"
az account show --output table
```

### 5.1 Resource group + storage account for Terraform's state file

Terraform needs somewhere to durably store its own state — this is a
one-time, manually-created "bootstrap" resource, deliberately **outside**
of what Terraform itself manages (so you can't accidentally destroy your
own state backend with `terraform destroy`).

```powershell
az group create --name <STATE_RG> --location <LOCATION>

az group create --name credpaybaserg --location canadacentral



az storage account create `
  --name <STATE_STORAGE> `
  --resource-group <STATE_RG> `
  --location <LOCATION> `
  --sku Standard_LRS `
  --encryption-services blob

az storage account create `
  --name credpaystatesa `
  --resource-group credpaybaserg `
  --location canadacentral `
  --sku Standard_LRS `
  --encryption-services blob

az storage container create `
  --name statefile `
  --account-name credpaystatesa `
  --auth-mode login
```

### 5.2 Azure Container Registry (ACR)

This is where your Docker images (frontend, user-service, payment-service)
live. Also created out-of-band, same reasoning as above.

```powershell
az acr create `
  --name credpayacrs1 `
  --resource-group credpaybaserg `
  --sku Basic
```

(It's fine to put the ACR in `<STATE_RG>` alongside the state storage
account — or any resource group you already have. It does **not** need to
be in the same resource group Terraform will create for the app.)

### 5.3 Azure Key Vault

This is where Terraform will push your PostgreSQL credentials, for the
pipeline to read back later. Also created out-of-band.

```powershell
az keyvault create `
  --name credpays2kv `
  --resource-group credpaybaserg `
  --location  canadacentral `
  --enable-rbac-authorization true
```

`--enable-rbac-authorization true` puts the vault in **Azure RBAC** mode
(the modern option) rather than the older "vault access policy" model.
**This matters** — see the Troubleshooting section if you ever get a `403
Forbidden ... does not have secrets get permission` error later; it almost
always means a vault is in the *other* mode than you expect.

Grant **yourself** permission to write secrets into it for now (you'll
grant the pipeline's identity the same permission in Step 6):

```powershell
az role assignment create `
  --assignee "$(az ad signed-in-user show --query id -o tsv)" `
  --role "Key Vault Secrets Officer" `
  --scope "$(az keyvault show --name credpays2kv)  
```

Role assignments can take a minute or two to propagate — if the next step
fails with a permissions error immediately after this, just wait a bit and
retry.

---

## 6. Step 3 — Edit the repo for your environment

This project deliberately hardcodes environment-specific values instead of
using placeholder templating (`k8s/README.md` calls this out explicitly) —
simpler to read, at the cost of needing a few find-and-replace edits when
moving to a new environment. Here is the exact, complete list.

### 6.1 `terraform/main.tf` — line 7

```hcl
locals {
  name_prefix = "credpay"   # <-- change to <PREFIX>
```

Every resource name Terraform creates derives from this one value.

### 6.2 `terraform/backend.tf` — the whole file

Terraform backend blocks cannot reference variables, so this must be
hand-edited:

```hcl
terraform {
  backend "azurerm" {
    resource_group_name  = "CredProj"        # <-- change to <STATE_RG>
    storage_account_name = "credprojstate"   # <-- change to <STATE_STORAGE>
    container_name       = "statefile"       # leave as-is
    key                  = "credpay.terraform.tfstate"  # leave as-is
  }
}
```

### 6.3 `terraform/terraform.tfvars`

This file is **committed to git in this repo** (intentionally, for
classroom simplicity — see `PORTABILITY.md` §A for the full reasoning and
trade-off). Replace these four values with your own:

```hcl
subscription_id = "<SUBSCRIPTION_ID>"
location        = "<LOCATION>"

key_vault_name                 = "<KV_NAME>"
key_vault_resource_group_name  = "<STATE_RG>"
```

(`postgres_admin_username`, `database_name`, node sizes, etc. can stay as
their defaults — they aren't globally unique and don't need to change.)

> **Heads up:** because this file is committed, your own Azure subscription
> ID will be visible in your own GitHub repo's history. That's an accepted
> trade-off for a personal/learning subscription — just don't leave real
> production credentials in a public repo this way.

### 6.4 `k8s/configmap/configmap.yaml`

The database hostname here is hardcoded and depends on `<PREFIX>` — but you
won't know its exact value until **after** Step 4 creates it. Come back to
this file after Step 4 and update:

```yaml
DB_HOST: "psql-credpay.postgres.database.azure.com"   # <-- your psql-<PREFIX> FQDN
...
SPRING_DATASOURCE_URL: "jdbc:postgresql://psql-credpay.postgres.database.azure.com:5432/credpay?sslmode=require"
```

Get the real value with `terraform output -raw postgres_fqdn` (Step 4
shows exactly when to run this).

### 6.5 Image references — 4 files

Replace `credproj.azurecr.io` with `<ACR_NAME>.azurecr.io` in:

- `k8s/frontend/deployment-blue.yaml`
- `k8s/frontend/deployment-green.yaml`
- `k8s/user-service/deployment.yaml`
- `k8s/payment-service/deployment.yaml`

(Only the `image:` line in each — the repository path after the hostname,
e.g. `credpay/frontend`, can stay the same.)

### 6.6 `azure-pipelines.yml` — the `variables:` block near the top

```yaml
variables:
  acrServiceConnection: 'CredPay-ACR-SC'   # <-- your ACR service connection name (Step 6)
  azureServiceConnection: 'scnew2'         # <-- your ARM service connection name (Step 6)
  acrName: 'credproj'                      # <-- <ACR_NAME> (the registry itself, not the connection above)

  tfStateRG: 'CredProj'                    # <-- <STATE_RG>
  tfStateStorage: 'credprojstate'          # <-- <STATE_STORAGE>
  tfStateContainer: 'statefile'            # leave as-is
  tfStateKey: 'credpay.terraform.tfstate'  # leave as-is

  aksResourceGroup: 'rg-credpay'           # <-- rg-<PREFIX>
  aksClusterName: 'aks-credpay'            # <-- aks-<PREFIX>
  k8sNamespace: 'credpay'                  # leave as-is, just a namespace name

  keyVaultName: 'kv-credpay'               # <-- <KV_NAME>
  keyVaultResourceGroup: 'CredProj'        # <-- <STATE_RG>
```

You won't have real service connection names until Step 6 — it's fine to
edit this file again after Step 6, before your first push.

---

## 7. Step 4 — Run Terraform once, from your laptop

Run this **from your own laptop first** (not via the pipeline yet). This
mirrors exactly how this project itself was originally built — get it
working manually and debuggably before automating it — and lets you fix
any typos from Step 3 quickly, with full error output in front of you,
rather than digging through CI logs.

```powershell
cd terraform
terraform init
terraform plan     # review what it's about to create
terraform apply    # type "yes" to confirm
```

If this succeeds, you'll see output including:

```
aks_cluster_name       = "aks-<PREFIX>"
aks_resource_group     = "rg-<PREFIX>"
key_vault_name         = "<KV_NAME>"
postgres_fqdn          = "psql-<PREFIX>.postgres.database.azure.com"
```

**Now go back and finish §6.4** — update `k8s/configmap/configmap.yaml`
with the real `postgres_fqdn` value shown above, then commit that change.

Verify the Key Vault actually received the four secrets:

```powershell
az keyvault secret list --vault-name <KV_NAME> --query "[].name" -o table
# expect: postgres-host, postgres-db-name, postgres-username, postgres-password
```

```powershell
cd ..
```

---

## 8. Step 5 — One-time cluster setup (ACR attach + Ingress controller)

Both of these are **cluster-level** settings, needed once ever, right after
the cluster is created — and **the pipeline now does both for you
automatically**, every run (the "Attach ACR to AKS" and "Ensure Ingress
Controller Installed" steps in `azure-pipelines.yml`, right after "Get AKS
Credentials"). Both are idempotent — `az aks update --attach-acr` and
`helm upgrade --install` are safe to re-run on every deploy, and only
actually change anything the first time. **You don't need to do anything
in this section for the pipeline to work.**

It's still worth connecting `kubectl` to your new cluster yourself, so you
can inspect it directly instead of only ever seeing it through pipeline
logs:

```powershell
az aks get-credentials --resource-group rg-<PREFIX> --name aks-<PREFIX> --overwrite-existing
kubectl get nodes
```

This cluster is created with **Azure RBAC for Kubernetes authorization**
enabled (`terraform/modules/aks/main.tf` sets `azure_rbac_enabled = true`),
so `kubectl` access is gated by an Azure role assignment on the cluster
*resource* — being subscription `Owner` does **not** grant it (same
control-plane vs. data-plane split as the Key Vault note above). If
`kubectl get nodes` comes back `Forbidden: ... does not have access to the
resource in Azure`, grant yourself a role on this specific cluster:

```powershell
az role assignment create `
  --assignee "$(az ad signed-in-user show --query id -o tsv)" `
  --role "Azure Kubernetes Service RBAC Cluster Admin" `
  --scope "$(az aks show --resource-group rg-<PREFIX> --name aks-<PREFIX> --query id -o tsv)"
```

**This is per-cluster** — if you already did this for an earlier
cluster (a previous stage, a renamed `<PREFIX>`), it does not carry over
to a new one; re-run the command above with the new cluster's `--scope`.
Role assignments can take a minute or two to propagate.

> **metrics-server** (needed by the HPAs) is already built into AKS — no
> installation step needed, by you or the pipeline.

> If you ever need to do the ACR-attach or Ingress-controller install
> manually (e.g. debugging outside the pipeline), here's what the pipeline
> itself runs:
> ```powershell
> az aks update --resource-group rg-<PREFIX> --name aks-<PREFIX> --attach-acr <ACR_NAME>
>
> helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
> helm repo update
> helm upgrade --install ingress-nginx ingress-nginx/ingress-nginx `
>   --namespace ingress-nginx --create-namespace
> ```

---

## 9. Step 6 — Set up Azure DevOps

### 9.1 Create the project and connect it to your GitHub repo

1. Go to [dev.azure.com](https://dev.azure.com), sign in, and create a new
   **Organization** (`<ADO_ORG>`) if you don't already have one.
2. Create a new **Project** named `<ADO_PROJECT>`.
3. In the project, go to **Pipelines → Create Pipeline → GitHub**, and
   authorize Azure DevOps to access your GitHub account if prompted.
4. Select your `<NEW_REPO_NAME>` repository.
5. Choose **Existing Azure Pipelines YAML file** → branch `main` → path
   `/azure-pipelines.yml`.
6. Click **Save** (the dropdown next to "Run") — don't run it yet, you
   still need the service connections below.

### 9.2 Create two service connections

Go to **Project Settings (bottom-left) → Service connections → New service
connection**:

**a) Azure Container Registry connection** (type: **Docker Registry** →
**Azure Container Registry**):
- Subscription: yours
- Azure container registry: `<ACR_NAME>`
- Service connection name: e.g. `MyCredPay-ACR-SC`
- ✅ Grant access permission to all pipelines

**b) Azure Resource Manager connection** (type: **Azure Resource Manager**
→ **Service principal (automatic)**):
- Scope level: **Subscription**
- Subscription: yours
- Service connection name: e.g. `my-arm-sc`
- ✅ Grant access permission to all pipelines

This second connection creates a new Azure AD **service principal** (an
identity for the pipeline itself, separate from your own user login) and
by default grants it **Contributor** on your subscription — enough for
Terraform to create the VNet/AKS/PostgreSQL/Log Analytics resources, but
**not** enough on its own for everything the pipeline does — see §9.3.

### 9.3 Grant that service principal the three extra permissions it needs

Find its Object ID: **Project Settings → Service connections → (your ARM
connection) → Manage Service Principal** (opens the App Registration in
the Azure Portal) → copy the **Application (client) ID**, then:

```powershell
$SP_OBJECT_ID = az ad sp show --id "<APPLICATION_CLIENT_ID>" --query id -o tsv
```

**Key Vault — write secrets:**

```powershell
az role assignment create `
  --assignee $SP_OBJECT_ID `
  --role "Key Vault Secrets Officer" `
  --scope "$(az keyvault show --name <KV_NAME> --query id -o tsv)"
```

> If your vault is in the older **access-policy** model instead of RBAC
> (you'd only see this if you skipped `--enable-rbac-authorization true` in
> §5.3), use this instead — RBAC role assignments are silently ignored on
> access-policy vaults:
> ```powershell
> az keyvault set-policy --name <KV_NAME> --object-id $SP_OBJECT_ID --secret-permissions get list set delete
> ```

> **This role assignment is scoped to one specific vault — it does not
> carry over if you ever point `key_vault_name` at a different vault**
> (a rename, a new environment/stage sharing the same pipeline, etc.).
> Subscription-level `Owner`/`Contributor` on the service principal does
> **not** substitute for it either: those built-in roles only grant Azure
> **control-plane** `actions`, while Key Vault secret read/write is a
> **data-plane** `dataAction` — a vault-scoped data role like `Key Vault
> Secrets Officer` is the only thing that grants it. Re-run the command
> above with the new vault's `--scope` any time `<KV_NAME>` changes.

**AKS — admin access for `kubectl` from the pipeline:**

```powershell
az role assignment create `
  --assignee $SP_OBJECT_ID `
  --role "Azure Kubernetes Service Cluster Admin Role" `
  --scope "$(az aks show --resource-group rg-<PREFIX> --name aks-<PREFIX> --query id -o tsv)"
```

This is a plain Azure RBAC role on the cluster *resource* itself (separate
from Kubernetes' own in-cluster permissions) — the pipeline's `az aks
get-credentials --admin` step needs it to fetch a working kubeconfig
non-interactively.

**ACR — permission to attach it to AKS:**

```powershell
az role assignment create `
  --assignee $SP_OBJECT_ID `
  --role "User Access Administrator" `
  --scope "$(az acr show --name <ACR_NAME> --query id -o tsv)"
```

This one is easy to miss: `az aks update --attach-acr` (which the pipeline
now runs automatically every deploy) works by creating a role assignment
under the hood — granting the AKS kubelet identity `AcrPull` on your
registry. Creating role assignments needs
`Microsoft.Authorization/roleAssignments/write`, a permission the default
**Contributor** role from §9.2 deliberately excludes. `User Access
Administrator`, scoped to just the ACR (not the whole subscription), is
the least-privilege way to grant exactly that.

### 9.4 Update `azure-pipelines.yml` with your real connection names

Go back to §6.6 and fill in `acrServiceConnection` /
`azureServiceConnection` with the exact names you gave the two service
connections above. Commit and push this change.

---

## 10. Step 7 — Push and watch it deploy

```powershell
git add .
git commit -m "Configure for my own Azure environment"
git push
```

In Azure DevOps, go to **Pipelines** and watch the run. It goes through
three stages — `Terraform` → `DockerBuild` → `DeployToAKS` — each takes a
few minutes. Expand the **Final Validation** step's log at the end; a
successful run ends with:

```
==================================================
 PROD ENVIRONMENT IS CURRENTLY RUNNING ON: BLUE
 BROWSE TO THE APP AT: http://<your ingress IP>/
==================================================
```

The **Final Validation** step already looks up the Ingress controller's
public IP and prints the exact URL — no separate `kubectl` command needed.
Open that URL in a browser and walk through: register → login → add card
→ pay a bill → payment history.

(If that line instead says the controller has no public IP yet, the
Azure Load Balancer is still provisioning — re-run the pipeline in a
couple of minutes, or check directly with
`kubectl get svc -n ingress-nginx ingress-nginx-controller`.)

---

## 11. How blue/green works day-to-day

After this first run, every future `git push` to `main`:

1. Rebuilds and pushes fresh Docker images.
2. Detects whichever frontend color (`blue`/`green`) is **not** currently
   live, and rolls the new image out to it only — the live color is left
   completely untouched, still serving real traffic.
3. Runs a smoke test directly against the new color's pods (`GET /`,
   `GET /api/users/health`, `GET /api/payment/health`) — **before** it
   receives any real traffic.
4. Only if all three pass does it flip the live Service to the new color.
   If the smoke test fails, the pipeline stops there — the previous color
   keeps serving traffic, nothing user-facing ever broke.

So a normal day-to-day loop is just: make a change, `git push`, watch the
pipeline, and check the closing banner to see which color is now live —
it alternates on every successful push.

**Your data is safe across every one of these pushes.** The "Run Database
Schema Job" step runs on every deploy too, but `schema.sql` is
non-destructive — `CREATE TABLE IF NOT EXISTS` plus seed rows that only
insert into an empty table — so any real user you register, card you add,
or payment you make through the live app survives every future push
untouched. Only a genuinely empty, fresh database ever gets the demo seed
data.

---

## 12. Troubleshooting

These are the real problems hit while building this exact pipeline —
in order of how early in the process they tend to show up.

**`Error: subscription ID could not be determined and was not specified`**
during `terraform apply` — you skipped or mistyped §6.3; double check
`subscription_id` in `terraform/terraform.tfvars` is your real subscription
ID, not the placeholder.

**`403 Forbidden ... does not have secrets get permission on key vault`**
— your vault is in access-policy mode, not RBAC mode, so the `Key Vault
Secrets Officer` role assignment silently does nothing. Check with:
```powershell
az keyvault show --name <KV_NAME> --query properties.enableRbacAuthorization
```
`false`/empty → use `az keyvault set-policy` (shown in §9.3) instead.

**PowerShell says `Missing expression after unary operator '--'`** when you
paste a multi-line `az` command — PowerShell doesn't support bash's `\`
line continuation. Either put the command on one line, or use PowerShell's
backtick `` ` `` continuation (every multi-line command in this document
already uses backticks for you).

**`terraform apply` fails on every `azurerm_key_vault_secret` resource**
with `403 Forbidden ... Action: 'Microsoft.KeyVault/vaults/secrets/getSecret/action' ...
Assignment: (not found)'` — the pipeline's service principal is missing
`Key Vault Secrets Officer` on **the vault your config currently points
at**. This bites people most often after switching `key_vault_name` in
§6.3 to a new/renamed vault (e.g. running this project again for a new
stage) — the role assignment from §9.3 was granted on the *old* vault and
doesn't automatically carry over. Check what the SP actually has:
```powershell
az role assignment list --assignee $SP_OBJECT_ID --all -o table
```
If the current `<KV_NAME>` isn't in the list, re-run the §9.3 `az role
assignment create` command with `--scope` pointed at the current vault.
Having `Owner`/`Contributor` on the subscription does **not** fix this —
those roles don't grant Key Vault `dataActions`, only a vault-scoped data
role does.

**`kubectl get nodes`/`get svc` fails with `Forbidden: ... nodes is
forbidden ... does not have access to the resource in Azure`** when you
run it yourself (as opposed to the pipeline) — your own account is missing
the `Azure Kubernetes Service RBAC Cluster Admin` role on **this specific
cluster**, per the note in §8. Just like the Key Vault 403 above, this is
scoped per-cluster and subscription `Owner`/`Contributor` doesn't cover
it — most commonly hit right after standing up a new cluster (new
`<PREFIX>`, new stage) when you already had access to an older one. Fix:
```powershell
az role assignment create `
  --assignee "$(az ad signed-in-user show --query id -o tsv)" `
  --role "Azure Kubernetes Service RBAC Cluster Admin" `
  --scope "$(az aks show --resource-group rg-<PREFIX> --name aks-<PREFIX> --query id -o tsv)"
```

**The pipeline's "Get AKS Credentials" step fails** — the service
principal from your ARM connection is missing the `Azure Kubernetes
Service Cluster Admin Role` from §9.3. This is a separate role from the
Key Vault one; both are required.

**The pipeline's "Attach ACR to AKS" step fails** with something like
`does not have authorization to perform action
'Microsoft.Authorization/roleAssignments/write'` — the service principal
is missing `User Access Administrator` on the ACR from §9.3. This is the
one gotcha that's easy to miss: `Contributor` (the default from §9.2)
deliberately cannot create role assignments, and attaching ACR to AKS
creates one internally.

**Pods stuck in `ErrImagePull` / `ImagePullBackOff`** — check with
`kubectl describe pod <name> -n credpay`. Usually means §6.5 was missed —
all four `image:` lines must point at `<ACR_NAME>.azurecr.io`, not
`credproj.azurecr.io`. Also confirm `acrName` in `azure-pipelines.yml`
(§6.6) matches your real ACR name — the pipeline's "Attach ACR to AKS"
step silently attaches the wrong (or a nonexistent) registry otherwise.

**"Ensure Ingress Controller Installed" step fails with `helm: command not
found`** — unlikely on Microsoft-hosted `ubuntu-latest` agents (Helm ships
preinstalled), but if your organization uses a different/custom agent pool,
add a `HelmInstaller@1` task immediately before that step.

**That same step fails with `ServiceAccount "ingress-nginx" ... cannot be
imported into the current release: invalid ownership metadata`** — this
means an ingress-nginx controller already exists in the cluster but wasn't
installed via Helm (e.g. someone applied its static YAML manifests by
hand). The pipeline checks for the controller's `Service` first and only
runs `helm upgrade --install` if it's missing, specifically to avoid this
— if you still hit it, the controller likely exists under a different
Service name than `ingress-nginx-controller`; check with
`kubectl get svc -n ingress-nginx`.

**Known issue: your subscription ID lives in `terraform/terraform.tfvars`,
committed on purpose** — Azure DevOps secret pipeline variables can't be
expanded into a `TerraformTask@5` `commandOptions` input (only into script
`env:` mappings), so passing `subscription_id` as a pipeline variable
silently resolves to empty and breaks `terraform apply` in CI. Committing
the real value in `terraform.tfvars` is the accepted tradeoff for this
classroom capstone (see §6.3). A subscription ID isn't a login credential,
but Azure treats it as sensitive (it's the target for resource enumeration)
— **if you ever fork this repo to make it public, that value stays in git
history even after you stop tracking the file going forward.** Fully
removing it requires rewriting history (`git filter-repo` or BFG
Repo-Cleaner) and a force-push, which is destructive to anyone else's clone
— do this only if you understand the tradeoff, and coordinate with anyone
else who has cloned the repo first.

**Full incident history:** `STAGE1-CHANGES.md` and `STAGE2-CHANGES.md`
document every issue hit building this project in detail, including root
cause and fix — worth a read if you hit something not listed above.

---



## Step 2: Log in to GoDaddy
Log in to your GoDaddy account.
Go to My Products.
Find your domain.
Click DNS or Manage DNS.

You'll see a table with DNS records.

Step 3: Add an A Record

If you want the root domain:

https://yourdomain.com

Create:

Type	Name	Value	TTL
A	@	4.239.161.142	600 seconds (or Default)


## 13. Reference: every environment-specific value, in one table

| File | What to change |
|---|---|
| `terraform/main.tf` | `locals.name_prefix` (line 7) |
| `terraform/backend.tf` | `resource_group_name`, `storage_account_name` |
| `terraform/terraform.tfvars` | `subscription_id`, `location`, `key_vault_name`, `key_vault_resource_group_name` |
| `k8s/configmap/configmap.yaml` | `DB_HOST`, `SPRING_DATASOURCE_URL` (after Step 4) |
| `k8s/frontend/deployment-blue.yaml` | `image:` |
| `k8s/frontend/deployment-green.yaml` | `image:` |
| `k8s/user-service/deployment.yaml` | `image:` |
| `k8s/payment-service/deployment.yaml` | `image:` |
| `azure-pipelines.yml` | `acrServiceConnection`, `azureServiceConnection`, `acrName`, `tfStateRG`, `tfStateStorage`, `aksResourceGroup`, `aksClusterName`, `keyVaultName`, `keyVaultResourceGroup` |

This mirrors (and supersedes, for a from-scratch setup) the checklist in
`PORTABILITY.md` — that document also covers the security reasoning behind
committing `terraform.tfvars` in more depth.

---

## Appendix A — Azure resource naming rules

These bit people every time — check before you pick names in §3:

| Resource | Rule |
|---|---|
| Storage Account (`<STATE_STORAGE>`) | 3–24 chars, **lowercase letters and digits only**, no hyphens, globally unique |
| ACR (`<ACR_NAME>`) | 5–50 chars, **alphanumeric only**, no hyphens/underscores, globally unique |
| Key Vault (`<KV_NAME>`) | 3–24 chars, letters/digits/hyphens, must start with a letter, globally unique |
| PostgreSQL server (derived from `<PREFIX>`) | 3–63 chars, **lowercase letters, digits, hyphens**, globally unique (exposed as a public hostname) |
| Resource Group, AKS cluster (derived from `<PREFIX>`) | Letters/digits/hyphens/underscores, unique only within *your* subscription (not globally) |

Because the PostgreSQL server name is the strictest of the ones derived
from `<PREFIX>` (lowercase + hyphens only, globally unique), pick a
`<PREFIX>` that satisfies that rule and the rest will automatically be
fine.

---

## Appendix B — joining an existing environment

If someone else has already run through this whole document (shared
Azure infra, existing Azure DevOps pipeline) and you're just getting a new
laptop set up to work on the same project:

1. Skip Steps 1–6 entirely.
2. Clone the **existing** repo (not a fresh one) and check out `main`.
3. `az login` with an account that has access to the existing subscription.
4. `az aks get-credentials --resource-group <existing RG> --name <existing AKS name> --overwrite-existing`.
5. `kubectl get pods -n credpay` — if you see pods Running, you're already
   looking at a live environment; just `git push` as normal to deploy
   changes through the existing pipeline.

You do **not** need your own ACR, Key Vault, or state storage account in
this scenario — you're using the ones the project already has.
