# CredPay + CredAI: Project Summary & DevOps Interview Guide

One document, start to end: what was built, the actual journey it took to
get there, how to talk about it in a DevOps interview, and — at the
bottom, genuinely — how it stacks up against typical training-institute
capstone projects.

---

## 1. Executive summary

**CredPay** is a three-service fintech-style application — user
registration/login and card management (Spring Boot), bill payments
(FastAPI), and a React frontend — deployed on Azure Kubernetes Service
with Terraform-provisioned infrastructure and a fully automated Azure
DevOps CI/CD pipeline (blue/green frontend releases, zero-downtime,
gated by an automated smoke test).

**CredAI** is what was added on top: a self-hosted Prometheus/Grafana
observability stack, plus a genuinely working AIOps layer — a FastAPI
microservice that reads real cluster/application telemetry and answers
plain-English operational questions through Azure OpenAI, surfaced as a
new page inside the existing app.

Both halves were built, deployed, broken, debugged, and fixed against a
**real, live AKS cluster** — not a local demo, not slides. Every incident
described below actually happened and was fixed on this project's actual
infrastructure.

## 2. The journey: start to end

### Phase 0 — System design
Functional requirements, a 3-service architecture, and database design
were worked out before any infrastructure existed (`systemdesign.md`,
`PROJECT_TRACKER.md`). The decision to split into three services (auth/
cards, payments, frontend) rather than a single monolith was deliberate —
a microservices story is worth having ready to explain, even for a
project this size.

### Phase 1 — Manual deployment to AKS (`STAGE1-CHANGES.md`)
Got the app running on a real cluster by hand first, before automating
anything. This surfaced and fixed a real environment-portability bug: the
frontend had absolute backend URLs hardcoded, which only worked on one
laptop. Fixed to relative-URL + environment-variable driven config so the
same built image works behind any Ingress IP — a foundational fix that
every later automation phase depended on.

### Phase 2 — CI/CD automation (`STAGE2-CHANGES.md`)
Replaced the manual runbook with a real Azure DevOps pipeline: Terraform
apply → Docker build/push → Kubernetes deploy, with Key Vault-sourced
secrets and blue/green frontend rollouts. **This phase is where the
project stopped being "a deployment" and became "a pipeline"** — and it's
where the most interview-worthy incidents happened (see §6 for the
full stories):

- A blue/green rotation that silently deployed to the *same* color every
  time, because a "safe to re-apply" assumption about `kubectl apply`
  turned out to be wrong for that one field — caught and fixed by testing
  the exact `kubectl apply` behavior live, not by reasoning about it.
- A database schema Job that was **silently destroying real user data on
  every single deploy** — `DROP TABLE ... CASCADE` running unconditionally
  on every push. Found by actually reading a pipeline log line by line,
  not assumed safe because a doc said so.
- A Helm install step that failed because the ingress controller already
  existed but wasn't Helm-managed — Helm 3 correctly refuses to "adopt" a
  resource it didn't create.

### Phase 3 — Observability
A self-hosted Prometheus + Node Exporter + kube-state-metrics + Grafana
stack, deployed with plain `kubectl apply` (no Helm chart, no managed
Grafana Cloud) — six custom-built dashboards covering node status, pod
status, resource gauges, workload health, and container resource usage,
each backed by hand-written PromQL, not imported community defaults.

### Phase 4 — AIOps (CredAI)
Architecture-first: a documented design (data flow, sequence diagrams,
API contract) before a line of code, then a FastAPI microservice with
isolated telemetry clients (Prometheus, Kubernetes API, Azure Monitor, Log
Analytics), a normalization layer so the LLM never knows which system a
fact came from, a prompt builder, and an Azure OpenAI connector — deployed
to the same cluster with least-privilege RBAC and conservative resource
sizing.

Deploying it live surfaced a genuinely long, real debugging chain — an
Azure OpenAI endpoint shape mismatch, an SDK version missing the API
being called, a rejected query parameter, a deployment name confused with
a project name, a reasoning model silently spending its whole token
budget on hidden reasoning, ambiguous telemetry labels producing vague
answers, and a health check probing a permission its own RBAC deliberately
never grants. All nine are documented in full, with root cause and fix,
in `observability/AIOps-From-Prometheus-To-AI-Service.md` §7 — that
document alone is a strong interview asset (see §6).

### Phase 5 — Documentation and cleanup
A full teaching/reference doc set: the AIOps architecture and lessons
learned, a from-scratch `kubectl`-only deployment guide, a matching
removal guide, a Prometheus/Grafana/Azure verification runbook with a live
HPA load test, and a presentation-ready architecture story — plus a repo
cleanup pass removing stray files and consolidating duplicated docs.

## 3. Complete architecture & technology inventory

| Layer | Technology | What it does here |
|---|---|---|
| IaC | Terraform (6 modules: `aks`, `networking`, `postgres`, `keyvault`, `monitoring`, `resource-group`) | Provisions AKS, VNet, PostgreSQL Flexible Server, Key Vault, Log Analytics |
| Orchestration | Kubernetes on AKS | Namespaces, Deployments, Services, Ingress, HPA, RBAC — plain manifests, no Helm/Kustomize |
| CI/CD | Azure DevOps (`azure-pipelines.yml`) | Terraform apply → Docker build/push → K8s deploy → blue/green traffic switch, gated by an automated smoke test |
| Frontend | React + Vite + MUI | The single web client for the whole app, including the new CredAI page |
| User service | Spring Boot 3.5 / Java 21 | Registration, login, card management, backed by PostgreSQL |
| Payment service | FastAPI / Python | Bill payment simulation against the shared PostgreSQL DB |
| Database | Azure PostgreSQL Flexible Server | Shared relational store for users/cards/payments |
| Registry | Azure Container Registry | Every service's Docker image |
| Secrets | Azure Key Vault + Kubernetes Secrets | PostgreSQL password (Terraform → Key Vault → pipeline → K8s Secret); Azure OpenAI credentials (out-of-band, never committed) |
| Metrics | Prometheus + Node Exporter + kube-state-metrics | Self-hosted, scraping infrastructure and application metrics |
| Dashboards | Grafana, 6 custom dashboards | Visualizes everything Prometheus collects |
| AIOps | FastAPI `ai-service` + Azure OpenAI (`gpt-5-mini`) | Reads Prometheus/Kubernetes telemetry, answers operational questions in plain English |

## 4. What makes this stand out in a DevOps interview

Specific, concrete points — not "we used Kubernetes," but what was
actually *done* with it:

- **Zero-downtime releases, actually verified, not just configured.** The
  blue/green pipeline smoke-tests the new color's Pods directly (bypassing
  the live Service) before switching traffic — a broken build never
  reaches a real user. Most training projects stop at "the pipeline
  deploys"; this one proves the deploy is safe before it goes live.
- **A real incident log, not a polished-over one.** §2 and §6 aren't
  hypothetical — they're specific bugs, root-caused and fixed against a
  live cluster, with the exact commands used to confirm each fix. That's
  a fundamentally different interview answer than "I learned Kubernetes."
- **A working AIOps layer**, end to end, deployed and answering real
  questions from real telemetry — genuinely uncommon even in professional
  environments, let alone training projects. This alone is usually the
  most memorable thing in the room.
- **Least-privilege RBAC applied as a real design constraint, not an
  afterthought** — `credai-service`'s namespaced Role was scoped to
  exactly the three verbs on exactly the three resources the code
  actually calls, and when a health check asked for more than that, the
  health check was fixed, not the RBAC loosened.
- **Real secret hygiene** — nothing ever committed, an explicit
  out-of-band creation/rotation runbook, and a documented decision (with
  tradeoffs) about the one deliberate exception (`terraform.tfvars`).
- **Capacity-aware engineering under a genuine constraint** — a small
  2-node cluster that has actually hit memory ceilings before shaped real
  decisions (1 replica not 2, `maxSurge: 0`) instead of copy-pasting
  defaults.

## 5. The role of AIOps in this project

The short version: **Prometheus and Kubernetes already know everything
about the cluster's health — CredAI's only job is to read what they
already know and say it in a sentence, instead of making a human open five
dashboards to piece it together themselves.**

The pattern is "RAG for operations" — retrieve real facts first (from
Prometheus, the Kubernetes API, optionally Azure Monitor/Log Analytics),
normalize them so the LLM never knows or cares which system a fact came
from, then ask the model to summarize *only* what it was given. Azure
OpenAI (`gpt-5-mini`) never queries anything itself — it has no
credentials to any of these systems — which is exactly what keeps it from
inventing a number that isn't real.

This matters for a DevOps interview specifically because AIOps is an
active, real industry direction (every major observability vendor is
shipping something like this), and being able to say "I built a small,
working version of that pattern myself, and can explain exactly how it's
grounded" is a materially stronger answer than describing it abstractly.
Full depth: `observability/AIOps-From-Prometheus-To-AI-Service.md` and
`observability/CredAI-Architecture-Story.md`.

## 6. How to present this in an interview

### The 60-second pitch

> "I built and deployed a fintech-style app — auth, card management, bill
> payments, a React frontend — on Azure Kubernetes Service, with Terraform
> provisioning the infrastructure and a full Azure DevOps pipeline doing
> zero-downtime blue/green releases gated by an automated smoke test. On
> top of that, I built a self-hosted Prometheus/Grafana observability
> stack, and then an AIOps layer — a microservice that reads that same
> telemetry and answers operational questions in plain English through
> Azure OpenAI. Everything was debugged against a real, live cluster —
> I can walk through several specific production incidents I found and
> fixed, not just the happy path."

### STAR-format stories, ready to tell

**"Tell me about a critical bug you found."**
*Situation:* a database schema initialization Job was designed to be
"safe to re-run." *Task:* investigate an unremarkable-looking pipeline
log. *Action:* read the Job's actual output line by line and noticed
`DROP TABLE` executing on every single deploy, not just the first one —
because the schema script unconditionally dropped and recreated every
table, and "safe" had only ever meant "doesn't error," never "doesn't
destroy data." *Result:* rewrote it to `CREATE TABLE IF NOT EXISTS` with
guarded seed inserts, verified against a throwaway Postgres instance by
simulating a real user, re-running the schema, and confirming their row
survived. Every real user's data had been silently wiped on every push
until this was caught.

**"Tell me about a tricky Kubernetes problem."**
*Situation:* blue/green frontend releases were supposed to alternate
colors every deploy. *Task:* figure out why two consecutive "correct"
runs both landed on the same color. *Action:* rather than reasoning about
it, tested the exact suspect command directly against the live cluster —
`kubectl apply` on a byte-for-byte unchanged Service manifest — and
watched the Service's selector field reset anyway, overwriting the
previous traffic-switch's `kubectl patch`. *Result:* stopped re-applying
the Service manifest after its one-time bootstrap, making the `kubectl
patch` step the sole owner of that field going forward — confirmed
correct over two subsequent real deploys.

**"Tell me about debugging a hard-to-diagnose failure."**
*Situation:* a newly deployed AIOps assistant returned "could not
respond" with no useful detail. *Task:* find the actual root cause rather
than guessing. *Action:* read the real exception from the Pod's own logs
at each step, which surfaced four distinct, sequential bugs — an endpoint
URL shape mismatch, an SDK version predating the API being called, a
query parameter rejected by that specific endpoint shape, and a
Foundry *project* name mistaken for the *model deployment* name (resolved
by asking the Azure CLI directly what deployments actually existed,
rather than re-reading the portal more carefully). *Result:* fixed one
layer at a time, re-testing after each fix, until a real chat request
returned a real, correct, telemetry-grounded answer.

**"Tell me about a security-conscious decision you made."**
*Situation:* a live Azure OpenAI API key was shared in plaintext during
development. *Task:* handle it without ever letting it reach a committed
file. *Action:* used placeholder values in every tracked manifest, created
the real Kubernetes Secret out-of-band via a direct `kubectl create
secret` command, and proactively flagged that the key should be rotated
since it had been shared in a chat/session. *Result:* the real value
never touched git, matching the same out-of-band pattern already
established for the database password.

### Questions you'll likely get, and strong honest answers

- **"What would you improve?"** — see §7 below; have that list ready, it
  reads as maturity, not a weakness.
- **"Is the AI making autonomous decisions?"** — no, it only summarizes
  facts a deterministic telemetry collector already fetched; it can't
  query anything itself.
- **"Why didn't you use Helm/ArgoCD/Kustomize?"** — a deliberate scope
  decision to keep every manifest plain and explicit for a project this
  size; the tradeoffs are understood, not accidental.

## 7. Is this a good project? — a genuine assessment

Yes — meaningfully above what most DevOps training-institute capstones
cover, for specific, concrete reasons, and it's worth being able to say
*why* rather than just asserting it:

**Where it genuinely stands out:**
- Most training projects deploy an app once and call it done. This one has
  a real CI/CD pipeline with zero-downtime releases *and* a documented
  trail of production-grade incidents actually found and fixed on a live
  system — that combination (automation + real incident response) is
  closer to what a working DevOps engineer actually does day to day than
  a one-time deployment exercise is.
- The AIOps layer is a genuine differentiator. The overwhelming majority
  of bootcamp/training projects that mention "AIOps" or "AI in DevOps" do
  it as a slide, a concept, or a call to a hosted chatbot with no real
  data behind it. This project has an actual, working, deployed pipeline
  from live Prometheus/Kubernetes data through to a grounded LLM answer —
  that's a materially different (and rarer) achievement.
- The discipline around RBAC, secrets, and capacity planning reflects
  real production concerns, not just "make it work."
