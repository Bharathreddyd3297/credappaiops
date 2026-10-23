# CREDPAY - CI Pipeline (Azure DevOps)

Every merge to `main` is tested, analysed, scanned and - only if every gate passes - pushed
to Azure Container Registry as an immutable image. The CD pipeline (next phase) deploys
exactly those images to dev, then qa, then prod.

```
 Pull request ─► pr.yml   gitleaks · Trivy fs · tests · docker build · Trivy image      (no push)
      │ merge
      ▼
 main ────────► ci.yml   gitleaks · Trivy fs · tests · SonarQube gate · docker build
                          · Trivy image gate · push  creddemoacr.azurecr.io/credpay/<service>:1.0.<BuildId>
```

| File | Purpose |
| --- | --- |
| `pipelines/ci.yml` | Main-branch pipeline: builds and pushes images |
| `pipelines/pr.yml` | Pull-request validation: same checks, nothing pushed |
| `pipelines/templates/variables.yml` | ACR, service connection names, scanner versions - **the only file to edit for your environment** |
| `pipelines/templates/security-scans.yml` | gitleaks (blocking) and Trivy filesystem scan (report only) |
| `pipelines/templates/detect-changes.yml` | Builds only the services whose folder changed |
| `pipelines/templates/build-service.yml` | Per service: tests → SonarQube → build → Trivy → push |

---

## Quality and security gates

| Gate | Tool | Fails the build when | Where to see the result |
| --- | --- | --- | --- |
| Secrets | **gitleaks** 8.30 | Any secret in the git history | Artifact `gitleaks-report` (SARIF) |
| Dependencies and IaC | **Trivy** `fs` | *Report only for now* (blocking after the Kubernetes phase rewrites `k8s/` and `terraform/`) | Tests tab: *Trivy filesystem scan* |
| Unit tests | JUnit / pytest | Any test fails | Tests tab, Code Coverage tab |
| Code quality | **SonarQube** | The quality gate is red (bugs, vulnerabilities, coverage on new code, …) | SonarQube project `credpay-<service>` |
| Image vulnerabilities | **Trivy** `image` 0.76 | A HIGH or CRITICAL vulnerability **with a fix available** | Tests tab: *Trivy image scan - <service>* |

**Accepting a risk:** when a vulnerability cannot be fixed yet and does not affect the
service, add its ID with an expiry date and the reason to `<service>/.trivyignore`
(see `user-service/.trivyignore`). After the expiry date the build fails again.

---

## One-time setup in Azure DevOps

Prerequisites (created manually, outside Terraform):

| Item | Value in this course | Where |
| --- | --- | --- |
| Azure Container Registry | `creddemoacr.azurecr.io` | Azure portal |
| Service connection to the ACR | `cred-acr` (type *Docker Registry → Azure Container Registry*) | Project settings → Service connections |
| SonarQube server | container on a VM, reachable from the internet | your VM |
| Service connection to SonarQube | `sqsc` (type *SonarQube Server*, with a SonarQube token) | Project settings → Service connections |

If your names differ, change them in `pipelines/templates/variables.yml`.

### 1. Install the SonarQube extension

Organization settings → Extensions → Browse marketplace → **SonarQube Server**
(publisher SonarSource) → Get it free. The pipeline uses its v7 tasks
(`SonarQubePrepare@7`, `SonarQubeAnalyze@7`, `SonarQubePublish@7`).

### 2. SonarQube projects

The pipeline analyses four projects: `credpay-user-service`, `credpay-payment-service`,
`credpay-customer-portal`, `credpay-admin-portal`. They are created automatically on the
first analysis if the token's user may create projects (SonarQube → Administration →
Security → Global permissions → *Create Projects*). Otherwise create them by hand with
those keys.

> SonarQube Community Edition analyses only the main branch, so the quality gate runs in
> `ci.yml`, not in pull requests.

### 3. Create the CI pipeline

Pipelines → **New pipeline** → *Azure Repos Git* → `credwithaiops` → *Existing Azure
Pipelines YAML file* → branch `main`, path `/pipelines/ci.yml` → **Save**
(drop-down next to *Run*). Rename it **credpay-ci** (… → Rename/move).

Run it once with **Run pipeline** - a manual run builds all four services. The first run
asks to **permit** the pipeline to use `cred-acr` and `sqsc`: open the run and click
*View* → *Permit*.

### 4. Create the PR pipeline and protect main

1. Create a second pipeline the same way with `/pipelines/pr.yml`; name it **credpay-pr**.
2. Repos → Branches → `main` → … → **Branch policies**:
   * *Require a minimum number of reviewers*: 1
   * *Build validation* → **+** → pipeline `credpay-pr`, trigger *Automatic*, policy *Required*
   * *Limit merge types*: allow **Squash merge** (keeps one commit per pull request,
     which the change detection relies on)

From now on nobody can push to `main` directly; every change comes through a pull request
that `credpay-pr` must approve, and `credpay-ci` runs after the merge.

---

## What a run looks like

| Stage | Job | Typical time |
| --- | --- | --- |
| Prepare | gitleaks, Trivy filesystem, change detection (in parallel) | 1-2 min |
| Build | one job per changed service (parallel if your organization has parallel jobs) | 4-8 min each |

Images in ACR: `credpay/user-service`, `credpay/payment-service`, `credpay/customer-portal`,
`credpay/admin-portal`, tagged `1.0.<BuildId>`. Each run also publishes an `image-<service>`
artifact with the exact image reference, which the CD pipeline will use.

### Run everything manually

Pipelines → `credpay-ci` → **Run pipeline** (a manual run always builds all services), or tick
*Build all services* when you need a full rebuild.

---

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| *This pipeline needs permission to access a resource* | Open the run → *View* → *Permit* (once per service connection) |
| *A task is missing … SonarQubePrepare@7* | Install the SonarQube Server extension (step 1) |
| SonarQube step: *Not authorized* / project cannot be created | Give the token's user *Create Projects*, or create the four projects by hand |
| SonarQube step times out | The VM's port 9000 must be reachable from Microsoft-hosted agents (public IP / NSG rule) |
| *Quality gate failed* | Open the SonarQube project, fix the issues on new code, push again |
| Trivy step fails | The log shows a table of vulnerabilities and their fixed versions - upgrade the dependency or base image, or (if not exploitable) accept it in `.trivyignore` with an expiry date |
| gitleaks step fails | A secret was committed: remove it, **rotate it**, and clean it from history |
| Push fails with *unauthorized* | Check the `cred-acr` service connection and that `acrLoginServer` matches the registry |
| Nothing is built | Only changed service folders are built - run manually to build everything |
