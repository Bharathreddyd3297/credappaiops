# Azure Cloud Monitoring - Assessment Workbook

**This is an assessment guide. It enables nothing.** No Kubernetes YAML,
no Terraform, no Azure CLI deployment commands appear anywhere in this
document. Every chapter is about understanding, navigating, and
verifying what already exists in Azure - and clearly identifying what
doesn't - so that enabling anything later is a deliberate, informed
decision, not a guess.

## Why this workbook exists

CredPay already has a fully working, self-hosted observability stack:
Prometheus, Node Exporter, kube-state-metrics, cAdvisor, Grafana, and
custom application metrics from `user-service` and `payment-service`
(see `observability/OBSERVABILITY-STATUS.md` for the full inventory).
That stack sees everything *inside* the Kubernetes cluster.

The next phase of this project is AIOps - and AIOps needs more than
what's inside the cluster. It needs to correlate Prometheus metrics with
what's happening at the Azure platform level: logs, resource health,
control-plane activity, and the managed Azure services CredPay depends
on (AKS itself, Azure Database for PostgreSQL, Key Vault, Container
Registry). This workbook is the assessment that has to happen before any
of that integration work begins.

## How to use this workbook

- Read chapters in order - later chapters assume earlier ones.
- Every chapter follows the same shape: **Objective → Theory →
  Architecture → Azure Portal Navigation → Verification Steps →
  Expected Result → Troubleshooting → Interview Questions → Best
  Practices → Common Mistakes.**
- "Azure Portal Navigation" sections are meant to be followed live, in
  a real browser, against the real `portal.azure.com` for this project's
  subscription - every click is written out, nothing assumed.
- Nothing here assumes prior Azure experience. Every term is defined the
  first time it's used.
- This workbook produces a **gap analysis** (Chapter 13) and a
  **roadmap** (Chapter 14) - the actual enabling work happens later, as
  a separate, deliberate phase.

## Table of Contents

| Chapter | Title | Status |
|---|---|---|
| 1 | Introduction | In this document |
| 2 | Azure Monitoring Architecture | In this document |
| 3 | Current Project Assessment | In this document |
| 4 | Azure Portal Navigation | In this document |
| 5 | Verification Guide | In this document |
| 6 | Log Analytics Workspace | In this document |
| 7 | Container Insights | In this document |
| 8 | Azure Monitor Metrics | In this document |
| 9 | Diagnostic Settings | In this document |
| 10 | Data Collection Rules | In this document |
| 11 | Managed Identity | In this document |
| 12 | Preparing for AIOps | In this document |
| 13 | Gap Analysis | In this document |
| 14 | Implementation Roadmap | In this document |
| - | Interview Questions (77) | In this document |

---

# Chapter 1 - Introduction

## Objective

By the end of this chapter, you will be able to:

- Explain, concretely, three things Prometheus structurally cannot see
  about CredPay - not "it's missing a feature," but *why* its
  architecture can't see them.
- Name the main pieces of the Azure Monitor family at a high level
  (detailed in Chapter 2).
- Explain the relationship between Prometheus and Azure Monitor as
  layered, not competing.
- Navigate to CredPay's AKS resource in the Azure Portal as your
  starting point for every later chapter.

## Theory

### What Prometheus already gives you (recap)

CredPay's Prometheus stack (fully built - see
`observability/OBSERVABILITY-STATUS.md`) already collects:

- Real node-level CPU/memory/disk/network (Node Exporter)
- Per-container resource usage (cAdvisor)
- Kubernetes object state - Deployments, Pods, ReplicaSets, HPAs
  (kube-state-metrics)
- Business-level application metrics - request rates, error rates,
  latency percentiles (`user-service`, `payment-service`)

All of it is queryable via PromQL, all of it is in Grafana. This is a
complete, working, *inside-the-cluster* picture.

### Why Prometheus alone isn't enough

Three concrete, structural gaps - not bugs, not missing config, just
things Prometheus was never designed to do:

**1. Logs.** Prometheus is a metrics system - it stores numbers, not
text. When `payment-service`'s error-rate gauge climbs (a metric
Prometheus does have), Prometheus can tell you **that** something failed
and roughly **how often** - but not **why**. The actual exception
message, stack trace, or "connection refused" detail lives in the
container's stdout log, which Prometheus never touches. That's a logs
problem, and it needs a logs system.

**2. Anything outside the cluster.** Prometheus can only scrape what it
can reach and what exposes a `/metrics` endpoint. It has **zero**
visibility into:
- Whether Azure Database for PostgreSQL Flexible Server itself is
  healthy at the platform level (not "can the app connect" - "is Azure
  reporting a problem with this specific database instance right now")
- Whether there's a broader Azure outage in the region CredPay runs in
- Whether someone just changed a firewall rule on the Key Vault from the
  Azure Portal
None of that happens inside Kubernetes, so nothing inside Kubernetes -
including Prometheus - can see it happen.

**3. Kubernetes events that aren't metrics.** Recall the real incident
earlier in this project: a Pod stuck `Pending` with a `FailedScheduling`
event and a `NotTriggerScaleUp` event from the cluster-autoscaler. Those
were visible instantly via `kubectl describe pod` - but they are
**events**, not **metrics**. Prometheus's kube-state-metrics job reports
object *state* (a Pod's phase, a Deployment's replica count) - it does
not by default turn every Kubernetes Event into a queryable time series.
An AI system trying to explain "why did this fail" from Prometheus data
alone would be missing exactly this kind of evidence.

### What Azure Monitor provides

**Azure Monitor** is Microsoft's umbrella platform-monitoring service -
not one tool, but a family of related services (detailed one by one in
Chapter 2):

- **Metrics** - numeric time series, but for *Azure resources*
  (the AKS control plane, disks, the database), not Kubernetes internals
- **Logs** (via a Log Analytics Workspace) - free-text and structured
  logs, queried with a language called KQL (Kusto Query Language)
- **Activity Logs** - an audit trail of who changed what, and when, in
  the Azure control plane itself
- **Resource Health** - "is this specific Azure resource experiencing a
  platform-level problem right now," reported by Azure itself

### How Azure Monitor and Prometheus work together

This is **not** a replacement relationship - it's a **layered** one:

```
        ┌─────────────────────────────────────────────────────┐
        │                  Everything Azure                     │
        │   (subscription, resource group, every Azure resource) │
        │                                                        │
        │   Azure Monitor sees this whole layer:                 │
        │   - Activity Logs (control-plane changes)               │
        │   - Resource Health (platform-level status)             │
        │   - Azure Metrics (per-resource numeric time series)    │
        │                                                        │
        │        ┌──────────────────────────────────────┐        │
        │        │         Inside the AKS cluster         │       │
        │        │                                        │       │
        │        │   Prometheus sees this layer:           │      │
        │        │   - Node/container/pod metrics          │      │
        │        │   - Kubernetes object state              │      │
        │        │   - Application-level business metrics   │      │
        │        │                                        │       │
        │        │   Container Insights (Azure Monitor's   │      │
        │        │   AKS-specific feature) ALSO reaches     │      │
        │        │   into this layer, via an agent -        │      │
        │        │   covered in Chapter 7                   │      │
        │        └──────────────────────────────────────┘        │
        └─────────────────────────────────────────────────────┘
```

A real AIOps question needs both layers at once. Example: **"Why did
`payment-service`'s error rate spike at 2 AM?"**

- Prometheus has the *symptom*: the error-rate metric climbing, exactly
  when it happened.
- Azure Monitor Logs might have the *cause*: a log line showing a
  database connection timeout.
- Azure Resource Health might have the *root cause*: the PostgreSQL
  Flexible Server had a brief platform-level event at that exact time.

No single one of those three answers the question completely. That's
the whole reason this assessment - and eventually, this integration -
matters.

## Architecture

```
                     AIOps AI Service (future phase)
                              │
              ┌───────────────┼───────────────┐
              │               │               │
        Prometheus      Azure Monitor    Kubernetes Events /
        (already built)  (this phase's    Resource Health
                          assessment)      (this phase's assessment)
              │               │               │
      ┌───────┴───────┐   ┌───┴────────────┐  │
      │ Node Exporter │   │ Log Analytics   │  │
      │ kube-state-   │   │ Workspace       │  │
      │  metrics      │   │ Container       │  │
      │ cAdvisor      │   │  Insights       │  │
      │ App metrics   │   │ Activity Logs   │  │
      └───────────────┘   └────────────────┘  │
                                                │
                                     kubectl get events
                                     (not yet centralized -
                                      a gap, see Chapter 13)
```

## Azure Portal Navigation

Every later chapter starts from the same place - get comfortable with
this path now:

1. Open a browser and go to `portal.azure.com`.
2. Sign in with the account/credentials used for the CredPay Azure
   subscription.
3. Top-left corner: confirm the **Subscription** filter shows "Azure
   subscription 1" (or whichever subscription CredPay's resources live
   in) - if you have access to multiple subscriptions, this is the
   single most common beginner mistake (see Common Mistakes below).
4. In the top search bar, type the AKS cluster's name (from
   `terraform/main.tf`'s `name_prefix`, e.g. `aks-credpays1`) and select
   it from the results.
5. You should land on the AKS resource's **Overview** page.

## Verification Steps

1. Confirm the Overview page shows **Status: Running** (or similar
   healthy status).
2. Confirm the **Resource group** field matches what Terraform created
   (e.g. `rg-credpays1`).
3. Look at the left-hand navigation menu - confirm a **Monitoring**
   section exists, with sub-items beneath it (exact sub-items are
   explored in Chapter 4).

## Expected Result

A working AKS Overview page, healthy status, correct resource group,
and a visible Monitoring section in the left nav - that Monitoring
section is the doorway into everything the rest of this workbook covers.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Can't find the AKS resource at all | Wrong subscription selected - check the top-left subscription filter |
| AKS resource found, but "Monitoring" section is missing or greyed out | Your Azure AD account likely lacks at least **Reader** role on this resource - this is an Azure RBAC permission issue, unrelated to anything inside the cluster |
| Overview page loads but shows no status | Possible transient Azure Portal issue - refresh; if persistent, check Resource Health (Chapter 3) for a genuine platform problem |

## Interview Questions

1. **Q: Why can't Prometheus alone tell you *why* a request failed, only
   *that* it failed?**
   A: Prometheus stores numeric time series (metrics), not free-text
   data. The specific error detail (a stack trace, an exception message)
   is written to the container's log output, which Prometheus never
   reads - that requires a logs system.

2. **Q: Give an example of something that can affect CredPay that
   Prometheus has no way of ever detecting.**
   A: Anything happening outside the Kubernetes cluster at the Azure
   platform level - e.g. a regional Azure outage, a platform-level issue
   with the managed PostgreSQL server, or someone changing a firewall
   rule in the Azure Portal. Prometheus can only see what it scrapes
   inside the cluster.

3. **Q: Is Azure Monitor a replacement for Prometheus in this project?**
   A: No - they're layered, not competing. Prometheus owns
   inside-the-cluster telemetry (nodes, containers, Kubernetes objects,
   app metrics); Azure Monitor owns the platform layer (Azure resource
   health, control-plane activity, logs) that Prometheus structurally
   cannot reach.

4. **Q: Why does a Kubernetes Event like `FailedScheduling` matter for
   AIOps even though kube-state-metrics is already running?**
   A: kube-state-metrics reports object *state* (e.g. a Pod's current
   phase), not the individual *Events* Kubernetes emits during state
   transitions. The specific reason a Pod failed to schedule is carried
   in an Event, not turned into a persistent Prometheus metric by
   default - so it's invisible to a system that only reads Prometheus.

5. **Q: What are the four Azure Monitor components introduced in this
   chapter, at a high level?**
   A: Metrics (numeric time series for Azure resources), Logs (via Log
   Analytics Workspace, queried in KQL), Activity Logs (control-plane
   audit trail), and Resource Health (platform-level status per
   resource).

## Best Practices

- Always confirm the correct Azure subscription is selected *before*
  looking for anything - it's the single most common source of "I can't
  find it" confusion for beginners.
- Bookmark the AKS resource's Overview page in your browser - nearly
  every chapter in this workbook starts there.
- Treat this chapter's mental model (layered, not competing) as the lens
  for every later chapter - when a new Azure service is introduced, ask
  "what does this see that Prometheus can't," not "does this replace
  Prometheus."

## Common Mistakes

- **Assuming Azure Monitor and Prometheus are redundant** and picking
  one - they answer different questions and this project needs both,
  eventually, for AIOps.
- **Looking in the wrong subscription** - if a different Azure account
  or subscription is active, the AKS resource genuinely will not appear
  in search results, and it's easy to conclude something is broken when
  it's just a filter setting.
- **Confusing the AKS resource's own resource group with its "node
  resource group"** - AKS automatically creates a second resource group
  (typically prefixed `MC_`) to hold the actual VM scale sets, disks, and
  networking for the nodes. The AKS resource itself lives in the
  resource group Terraform created (e.g. `rg-credpays1`); the nodes'
  underlying infrastructure lives in the `MC_*` one. Both are real and
  both matter later in this workbook (especially Chapter 3), but
  confusing which is which is a very common beginner trip-up.

---

# Chapter 2 - Azure Monitoring Architecture

## Objective

By the end of this chapter, you will be able to name every major piece
of the Azure Monitor family, explain in one sentence what each one is
*for*, and - critically - state plainly whether each one is already in
use in CredPay, available for free but unused, needs explicit
configuration, or was deliberately not chosen for this project.

## Theory

"Azure Monitor" is not one service - it's an umbrella brand covering
several distinct backends and features, each with its own storage
model, its own access path, and its own reason to exist. Treating them
as one thing is the single most common source of confusion for
beginners. Ten pieces, one at a time:

### 1. Azure Monitor (the umbrella)

**What it is:** The overall platform-monitoring brand and portal
experience covering everything else in this chapter.
**Why it exists:** A single place to reason about the health and
performance of anything running in Azure, regardless of resource type.
**Used in this project?** Yes, implicitly - every other item below is
part of it.

### 2. Log Analytics Workspace

**What it is:** The actual *log storage backend* Azure Monitor uses -
a database purpose-built for large volumes of semi-structured log data,
queried with **KQL** (Kusto Query Language), not SQL.
**Why it exists:** Metrics (numbers) and logs (text/structured events)
need fundamentally different storage engines. This is the "logs" half
of Azure Monitor.
**Used in this project?** **Yes - already provisioned.** Terraform
creates one (`azurerm_log_analytics_workspace` in
`terraform/modules/monitoring/main.tf`). Chapter 6 covers it in depth.

### 3. Container Insights

**What it is:** An AKS-specific *feature* of Azure Monitor (not a
separate product) that deploys an agent into the cluster (you'll
recognize it as the `ama-logs` Pods, seen earlier in this project's own
capacity incident) which collects container logs, inventory, and
performance data, and ships them into the Log Analytics Workspace.
**Why it exists:** Out-of-the-box visibility into AKS - Pod/node
inventory, container stdout/stderr, performance counters - without
writing a single scrape config.
**Used in this project?** **Yes - already provisioned and running.**
Terraform enables it (`azurerm_log_analytics_solution "container_insights"`
in the same file). This is the component that was found consuming more
memory per node than this project's *entire* self-hosted observability
stack combined - a real, already-known fact about this cluster, not a
hypothetical. Chapter 7 covers it in depth.

### 4. Azure Metrics

**What it is:** Numeric time-series data Azure automatically collects
for almost every resource type, at the *platform* level - e.g. an AKS
node's CPU% as seen by the underlying VM, not by Kubernetes; a
PostgreSQL server's connection count as reported by the managed service
itself. Stored in a separate, purpose-built metrics database - **not**
the Log Analytics Workspace.
**Why it exists:** Lightweight, always-on, no-configuration telemetry
for every Azure resource, viewable in **Metrics Explorer**.
**Used in this project?** **Yes, automatically, right now** - this
exists for every Azure resource by default, with no setup and no cost
for the basic tier. Nobody has had to look at it yet. Chapter 8 covers
the difference between this, Prometheus metrics, and business metrics.

### 5. Azure Activity Log

**What it is:** A subscription-wide audit trail of control-plane
operations - who created, modified, or deleted an Azure resource, and
when. Not performance data - an audit log of *changes*.
**Why it exists:** Answers "did someone change something in Azure
itself right before this incident started?" - a question no
in-cluster tool can ever answer, since the change happens at the Azure
control-plane, not inside Kubernetes.
**Used in this project?** **Yes, automatically** - every Azure
subscription has this by default, retained 90 days, no configuration
needed. Nobody has reviewed it yet as part of this project.

### 6. Resource Health

**What it is:** A per-resource health signal reported by Azure itself -
"is there a platform-level problem affecting this specific resource
right now" (e.g. the underlying Azure infrastructure hosting your AKS
nodes, independent of anything happening inside Kubernetes).
**Why it exists:** Distinguishes "my application has a bug" from "Azure
itself is having a problem with the infrastructure under my
application" - two very different incidents that look identical from
inside the cluster.
**Used in this project?** **Yes, automatically** - available for every
resource with no setup. Not yet incorporated into any dashboard or
alerting here.

### 7. Diagnostic Settings

**What it is:** Not a monitoring tool itself - the **pipe**. A
per-resource configuration that decides where that resource's own logs
and metrics get *sent*: a Log Analytics Workspace, a Storage Account, or
an Event Hub. Without a Diagnostic Setting, many resource-specific logs
(e.g. AKS control-plane logs like `kube-apiserver` audit logs) are
generated by Azure but go nowhere - they're not retained anywhere for
you to query.
**Why it exists:** Not every log a resource can produce is wanted or
affordable to retain by default - Diagnostic Settings make routing an
explicit, resource-by-resource decision.
**Used in this project?** **Needs verification - likely a gap.**
Container Insights (item 3) covers container-level logs, but AKS
control-plane logs specifically (audit, `kube-controller-manager`,
`kube-scheduler`) require their *own* Diagnostic Setting, separate from
Container Insights. Chapter 9 verifies this directly; Chapter 13 records
whatever gap is found.

### 8. Application Insights

**What it is:** Azure's Application Performance Monitoring (APM)
product - typically added via an SDK in application code, providing
distributed tracing, dependency maps, and detailed per-request timing.
**Why it exists:** To answer "as one single request moved through
multiple services, where exactly did the time go" - the same "traces"
pillar named as a gap back in
`observability/workbooks/01-Prometheus-Implementation-Workbook.md`
Chapter 1.
**Used in this project?** **Not currently, and not a straightforward
"yes" even later.** `user-service` and `payment-service` already expose
their own request-rate/latency/error metrics via Prometheus
instrumentation (Micrometer, `prometheus-fastapi-instrumentator`) -
adding Application Insights on top would duplicate that specific
coverage. Its genuinely unique value here would be **distributed
tracing**, which nothing in this project currently provides. Worth
revisiting specifically for tracing, not for metrics it would duplicate.

### 9. Azure Managed Prometheus

**What it is:** A fully-managed, Prometheus-compatible metrics service
offered directly by Azure Monitor - point it at a cluster and Azure
runs and scales the Prometheus backend for you.
**Why it exists:** For teams that want Prometheus-style querying
without operating Prometheus themselves (upgrades, storage, scaling all
handled by Azure).
**Used in this project?** **No, deliberately.** This entire project
self-hosts Prometheus on purpose - the point of Phases 1-3 was learning
to build and operate it directly, in plain Kubernetes YAML, not to
outsource it. Worth knowing this exists as the "managed" alternative,
not worth adopting here.

### 10. Azure Managed Grafana

**What it is:** A fully-managed Grafana instance hosted by Azure, with
built-in Azure AD authentication and native Azure Monitor data source
integration.
**Why it exists:** Same motivation as Managed Prometheus - managed
infrastructure instead of self-hosted.
**Used in this project?** **No, deliberately** - same reasoning as
above; this project self-hosts Grafana (`observability/grafana/`) with
its own PVC and provisioned datasource.

## Architecture

```
                         Azure Monitor (the umbrella)
        ┌───────────────────────────────────────────────────────────┐
        │                                                             │
        │  METRICS STORE                       LOGS STORE             │
        │  (separate backend,                  (Log Analytics          │
        │   automatic, no setup)                Workspace - KQL)       │
        │       ▲                                     ▲                │
        │       │                                     │                │
        │  Azure Metrics                       Container Insights      │
        │  (item 4 - already                   (item 3 - already      │
        │   available, unused                   running, the          │
        │   so far)                             ama-logs agent)        │
        │                                             ▲                │
        │                                             │                │
        │                                      Diagnostic Settings     │
        │                                      (item 7 - the pipe;     │
        │                                       AKS control-plane      │
        │                                       logs likely NOT        │
        │                                       yet routed here -      │
        │                                       verify in Ch. 9)       │
        │                                                             │
        │  SEPARATE, SUBSCRIPTION-WIDE, NOT IN LOG ANALYTICS:           │
        │  - Activity Log (item 5)     - Resource Health (item 6)      │
        │                                                             │
        │  APP-CODE-LEVEL, NOT CURRENTLY USED:                          │
        │  - Application Insights (item 8) - would add tracing only    │
        │                                                             │
        │  MANAGED ALTERNATIVES, DELIBERATELY NOT USED (self-hosted     │
        │  instead):                                                   │
        │  - Azure Managed Prometheus (item 9)                          │
        │  - Azure Managed Grafana (item 10)                            │
        └───────────────────────────────────────────────────────────┘
```

## Azure Portal Navigation

A guided tour - where each of the ten items actually lives:

1. **Azure Monitor itself:** top search bar → type `Monitor` → select
   **Monitor**. This is the standalone hub; most sub-items below are
   also reachable from inside it.
2. **Log Analytics Workspace:** top search bar → type `Log Analytics
   workspaces` → select the one Terraform created. Alternatively: AKS
   resource → left nav **Monitoring → Logs**.
3. **Container Insights:** AKS resource → left nav **Monitoring →
   Insights**.
4. **Azure Metrics:** AKS resource → left nav **Monitoring → Metrics**.
   (Or: Azure Monitor hub → **Metrics**, then pick the AKS resource.)
5. **Activity Log:** Azure Monitor hub → left nav **Activity log**
   (subscription-wide), or any individual resource → left nav
   **Activity log** (filtered to just that resource).
6. **Resource Health:** any individual resource → left nav **Resource
   Health**.
7. **Diagnostic Settings:** any individual resource → left nav
   **Diagnostic settings**.
8. **Application Insights:** top search bar → type `Application
   Insights` - it's its own resource type; none exists yet for CredPay.
9. **Azure Managed Prometheus:** Azure Monitor hub → **Metrics** →
   "Monitor managed service for Prometheus" appears as an option when
   configuring a workspace; also offered as a checkbox during AKS
   cluster creation/update.
10. **Azure Managed Grafana:** top search bar → type `Azure Managed
    Grafana` - its own resource type; none exists yet for CredPay.

## Verification Steps

1. Open the AKS resource → **Monitoring → Insights**. If Container
   Insights is active, this shows live data (Cluster/Nodes/Controllers/
   Containers tabs with real numbers) rather than a "not configured"
   prompt.
2. Open the AKS resource → **Monitoring → Metrics**. Confirm the metric
   picker offers real choices (e.g. "Node CPU Usage Percentage") -
   proves Azure Metrics is flowing with zero configuration.
3. Open the AKS resource → **Activity log**. Confirm real entries
   appear (at minimum, the cluster's own creation event from when
   Terraform applied it).
4. Open the AKS resource → **Resource Health**. Confirm it reports a
   status (typically "Available").

## Expected Result

Steps 1-2 should show real data immediately (Container Insights and
Azure Metrics are already active from Terraform/Azure defaults). Steps
3-4 should always work for any Azure resource, with no prior setup.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Insights tab shows a "configure monitoring" prompt instead of data | Container Insights isn't actually enabled on this cluster - would contradict Chapter 1's assumption; re-check the `azurerm_log_analytics_solution` resource in Terraform state |
| Metrics picker is empty or errors | Usually transient/permissions - confirm your account has at least Reader role (same as Chapter 1's troubleshooting) |
| Activity log shows nothing at all | Very unusual for any real resource - double check you're not filtering the time range too narrowly (default is often "last 24 hours," but the cluster may have last changed days ago) |

## Interview Questions

1. **Q: Is "Azure Monitor" one product or several?**
   A: An umbrella covering several distinct backends (a metrics store,
   a logs store via Log Analytics, Activity Log, Resource Health) and
   features (Container Insights, Diagnostic Settings, Application
   Insights) - not a single monolithic tool.

2. **Q: What's the difference between Azure Metrics and a Log Analytics
   Workspace, storage-wise?**
   A: Azure Metrics uses a separate, purpose-built numeric time-series
   store, automatic for every resource. Log Analytics is a different
   backend for logs/structured events, queried in KQL, and requires
   something (like Container Insights or a Diagnostic Setting) to
   actually send data into it.

3. **Q: What does a Diagnostic Setting actually do?**
   A: It's a routing configuration, not a monitoring feature by itself -
   it decides where a specific resource's logs/metrics get sent (Log
   Analytics, Storage Account, or Event Hub). Without one, some logs a
   resource is capable of producing are never retained anywhere.

4. **Q: Why might Application Insights be redundant for CredPay's
   backend services specifically?**
   A: `user-service` and `payment-service` already expose request rate,
   error rate, and latency metrics via Prometheus instrumentation.
   Application Insights would duplicate that specific metrics coverage;
   its unique value here would only be distributed tracing, which
   nothing else in this project currently provides.

5. **Q: Why does this project use self-hosted Prometheus/Grafana
   instead of Azure Managed Prometheus/Grafana?**
   A: A deliberate choice, not a limitation - the project's goal through
   Phases 1-4 was learning to build and operate the stack directly in
   plain Kubernetes YAML. Managed alternatives exist and are valid for
   teams that want to outsource that operational burden, but that
   wasn't this project's goal.

6. **Q: Which of the ten items in this chapter require zero
   configuration and are already active for any Azure resource?**
   A: Azure Metrics, Activity Log, and Resource Health - all automatic,
   by default, for every resource in the subscription.

## Best Practices

- Before assuming a gap, check whether the answer is "this already
  exists automatically" (Azure Metrics, Activity Log, Resource Health)
  versus "this genuinely needs to be configured" (Diagnostic Settings,
  Application Insights) - conflating the two wastes effort either
  enabling something already on, or assuming something is on that
  isn't.
- When introducing any new Azure Monitor feature to a project, ask what
  it sees that nothing else already deployed can see - avoid adding a
  service purely because it exists.
- Keep a clear mental separation between the **metrics store** and the
  **logs store** - they're genuinely different backends with different
  query languages, not two views onto the same data.

## Common Mistakes

- **Assuming "Azure Monitor" is a single toggle** - it's ten different
  things with ten different activation states, as this chapter just
  showed.
- **Assuming Container Insights being active means AKS control-plane
  logs are captured too** - they are two separate mechanisms
  (Container Insights vs. a Diagnostic Setting on the AKS resource
  itself); Chapter 9 verifies which one(s) are actually configured here.
- **Treating Application Insights as "the tracing answer" without
  checking for overlap** - adopting it wholesale would duplicate metrics
  this project already has from Prometheus instrumentation, when the
  actual gap is specifically tracing.

---

# Chapter 3 - Current Project Assessment

## Objective

By the end of this chapter, you will have a single checklist covering
every Azure monitoring component relevant to CredPay, with each one
marked by **how we know its status** (already confirmed via `kubectl`,
known from Terraform but not yet visually confirmed in the Portal, or
genuinely unverified) and **whether it's mandatory for the upcoming
AIOps phase** - not just "does it exist."

## Theory

This chapter is deliberately a checklist, not a narrative - assessment
work means separating three very different kinds of "yes":

1. **Confirmed directly** - we have hard evidence (e.g. we've already
   seen the Container Insights agent Pods running via `kubectl`, in this
   very project's own capacity-incident investigation).
2. **Believed true, not yet visually confirmed** - Terraform code says
   a resource was created, but nobody has opened the Azure Portal to
   look at it since.
3. **Unknown** - genuinely not yet checked either way.

Conflating these three is how assessments produce false confidence.
Every row below states which of the three applies.

## Verification Checklist

| # | Component | Why it exists | Status (how we know) | Mandatory for AIOps? |
|---|---|---|---|---|
| 1 | ✓ AKS Cluster | The compute platform everything else in this workbook monitors | **Confirmed directly** - `kubectl get nodes` already works against it throughout this project | Yes - the subject being monitored |
| 2 | ✓ Log Analytics Workspace | The logs backend Azure Monitor uses | **Confirmed live** (updated after Chapter 13's verification) - real, high-volume data present | Yes - this is where Azure-side logs would live for AI correlation |
| 3 | ✓ Azure Monitor | The umbrella platform - not something you "turn on" separately | Always active for any Azure subscription | Yes, implicitly |
| 4 | ✓ Container Insights | AKS-specific log/inventory/perf collection | **Confirmed directly** - the `ama-logs` DaemonSet and `ama-logs-rs` Deployment are visibly `Running` in `kube-system` (found during this project's own capacity investigation) | Yes - primary source of Kubernetes-side logs for AI |
| 5 | ✓ Diagnostic Settings | Routes a resource's own logs/metrics to a destination | **Confirmed missing** (updated after Chapter 13's verification) - empty on AKS, Key Vault, PostgreSQL, and ACR alike; the one real, confirmed gap in this whole workbook | Likely yes - control-plane logs are exactly the kind of evidence AIOps root-cause analysis needs |
| 6 | ✓ Azure Metrics | Automatic per-resource numeric telemetry | Always active by default for any Azure resource | Yes - platform-level metrics Prometheus cannot see |
| 7 | ✓ Activity Logs | Subscription-wide control-plane audit trail | **Confirmed live** (updated after Chapter 13's verification) - real entries present | Yes - "did someone change something in Azure" is a real AIOps root-cause question |
| 8 | ✓ Resource Health | Per-resource platform status | **Confirmed `Available`** (updated after Chapter 13's verification) | Yes - distinguishes app bugs from Azure platform incidents |
| 9 | ✓ Managed Identity | How the monitoring agent authenticates to send data | **Confirmed** (updated after Chapter 13's verification) - a dedicated identity (`omsagent-aks-credpays1`) exists with the correct role, though actual ingestion currently uses the workspace's legacy shared key rather than this identity's AAD auth | Yes - if this is wrong, Container Insights data silently stops flowing |
| 10 | ✓ Azure Monitor Agent (AMA) | The actual agent collecting data for Container Insights | **Confirmed directly** - this *is* the `ama-logs`/`ama-logs-rs` Pods from row 4; same evidence | Yes - it's the collection mechanism itself |
| 11 | ✓ Data Collection Rules (DCR) | Defines *what* AMA collects and *where* it sends it | **Confirmed: does not exist** (updated after Chapter 13's verification) - this cluster uses the older, direct workspace-link model instead; the original assumption in this row was wrong, and Chapter 10 now documents the correction | Not applicable to this cluster's actual architecture |
| 12 | ✓ Data Collection Endpoints (DCE) | The ingestion endpoint a DCR sends data to | **Confirmed: does not exist** (updated after Chapter 13's verification) - consistent with row 11, since this cluster has no DCR to reference one | Not applicable to this cluster's actual architecture |

> **See Chapter 13 for the full live-verification writeup**, including
> the single most important finding in this workbook (Kubernetes Events
> are already captured, `KubeEvents` table, 88 rows/24h - resolving the
> Chapter 1 gap directly) and the one confirmed real gap (Diagnostic
> Settings, empty on all four key resources).

## Architecture

```
   CONFIRMED DIRECTLY (kubectl evidence already exists)
   ┌─────────────────────────────────────────┐
   │  AKS Cluster                              │
   │  Container Insights (ama-logs Pods)       │
   │  Azure Monitor Agent (same Pods)          │
   └─────────────────────────────────────────┘

   BELIEVED TRUE FROM TERRAFORM, NOT YET PORTAL-CONFIRMED
   ┌─────────────────────────────────────────┐
   │  Log Analytics Workspace                  │
   └─────────────────────────────────────────┘

   ALWAYS ON BY DEFAULT, NO ACTION EVER TAKEN
   ┌─────────────────────────────────────────┐
   │  Azure Monitor (umbrella)                  │
   │  Azure Metrics                            │
   │  Activity Logs                            │
   │  Resource Health                           │
   └─────────────────────────────────────────┘

   GENUINELY UNKNOWN - THIS CHAPTER'S REAL OUTPUT
   ┌─────────────────────────────────────────┐
   │  Diagnostic Settings (AKS control plane)   │
   │  Managed Identity (correct permissions?)   │
   │  Data Collection Rules                     │
   │  Data Collection Endpoints                 │
   └─────────────────────────────────────────┘
```

## Azure Portal Navigation

Detailed, click-by-click navigation for each unverified item is provided
in Chapter 4 - this chapter's job is the checklist itself, not yet the
walkthrough.

## Verification Steps

1. For every row marked "Confirmed directly" - no further action needed,
   evidence already exists.
2. For every row marked "Believed true, not visually confirmed" - open
   the Azure Portal and visually confirm the resource exists (Chapter 4
   provides the exact path).
3. For every row marked "Unknown" - this is the actual investigation
   work of Chapters 6-11; each has its own dedicated chapter.

## Expected Result

A checklist where every row has moved from its current status to
"confirmed" - by the end of Chapter 11, every "Unknown" row above should
have a definite yes/no answer, which becomes the input to Chapter 13's
Gap Analysis.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| A component believed to exist from Terraform doesn't appear in the Portal | Check you're looking in the correct resource group (`rg-credpays1`, not the `MC_*` node resource group) and correct subscription |
| Unsure whether a Data Collection Rule was auto-created or needs to be | This is precisely what Chapter 10 resolves - don't guess, verify |

## Interview Questions

1. **Q: What's the difference between "confirmed" and "believed true"
   in an assessment like this one?**
   A: "Confirmed" means direct evidence was observed (e.g. a running
   Pod via `kubectl`); "believed true" means an authoritative source
   (like Terraform code) says it should exist, but nobody has visually
   verified it in the actual system yet. Assessments should never
   silently treat these as equivalent.

2. **Q: Why is Managed Identity marked "Unknown" in this checklist even
   though AKS clusters always have *some* identity?**
   A: Having an identity at all isn't the same as having the *correct*
   identity with the *correct* permissions for Azure Monitor Agent
   specifically to authenticate and push data - that association hasn't
   been checked yet.

3. **Q: Why does a Data Collection Rule matter for AIOps specifically?**
   A: It defines exactly what telemetry exists at all - if a DCR doesn't
   collect a particular log or metric, no downstream AI system can ever
   see it, no matter how sophisticated the AI is.

## Best Practices

- Never mark an assessment item "done" based on what a config file says
  *should* exist - verify the live resource.
- Keep the three-way status distinction (confirmed / believed /
  unknown) visible in any real assessment document - it's more honest
  and more useful than a flat checkbox.

## Common Mistakes

- **Treating Terraform code as proof of live state** - Terraform
  describes desired state at the time it was last applied; drift,
  partial failures, or manual changes since then are all possible.
- **Skipping the "Unknown" rows because they're harder to verify** -
  those are exactly the rows this whole assessment exists to resolve.

---

# Chapter 4 - Azure Portal Navigation

## Objective

By the end of this chapter, you will be able to reach every Azure
Monitor feature relevant to CredPay by exact click path, with no
guessing.

## Theory

Azure's Portal reorganizes monitoring features contextually - the same
underlying feature (e.g. Metrics) is reachable both from a specific
resource's own menu *and* from the global Azure Monitor hub. Knowing
both paths matters: the resource-scoped path is faster for "check this
one thing," the hub path is better for "compare across resources."

## Architecture

```
portal.azure.com
   │
   ├── Global hub: search "Monitor" → Azure Monitor
   │      ├── Metrics (cross-resource)
   │      ├── Logs (cross-workspace KQL queries)
   │      ├── Activity log (subscription-wide)
   │      └── Alerts (not used - AlertManager/Azure alerting both dropped for now)
   │
   └── Resource-scoped: search the resource name directly
          (AKS cluster / Log Analytics workspace / Key Vault / etc.)
          └── each resource's own left-nav menu repeats the same
              features, scoped to just that resource
```

## Azure Portal Navigation

**A. Container Insights - the full tab tour**

```
Azure Portal
  └─ Search: your AKS cluster name (e.g. aks-credpays1)
      └─ Monitoring
          └─ Insights
              ├─ Cluster       (cluster-wide CPU/memory/pod count trend)
              ├─ Nodes         (per-node CPU/memory, drill into a node)
              ├─ Controllers   (Deployments/DaemonSets/StatefulSets health)
              ├─ Containers    (per-container CPU/memory, drill into logs)
              └─ Live Logs     (a live, streaming view of a chosen Pod's logs -
                                requires the AKS cluster's Kubernetes RBAC to
                                permit it; different mechanism from the stored
                                logs in Log Analytics)
```

**B. Azure Metrics**

```
Azure Portal → AKS cluster → Monitoring → Metrics
  → "Metric Namespace" dropdown (choose e.g. "Node" or the AKS-specific namespace)
  → "Metric" dropdown (choose e.g. "CPU Usage Percentage")
  → "Aggregation" dropdown (Avg/Min/Max/Sum)
```

**C. Log Analytics query (KQL)**

```
Azure Portal → AKS cluster → Monitoring → Logs
  (opens a Log Analytics query editor pre-scoped to this cluster's workspace)
  → query editor pane → type a KQL query → Run
```
or, workspace-first:
```
Azure Portal → search "Log Analytics workspaces" → select the workspace
  → Logs (left nav) → same query editor, not pre-scoped to one resource
```

**D. Activity Log**

```
Azure Portal → AKS cluster → Activity log
```
or subscription-wide:
```
Azure Portal → search "Monitor" → Activity log
```

**E. Resource Health**

```
Azure Portal → AKS cluster → Resource Health
```

**F. Diagnostic Settings**

```
Azure Portal → AKS cluster → Diagnostic settings
  → "+ Add diagnostic setting" (do NOT click this in this phase -
     assessment only; just observe whether any setting already exists
     in the list above this button)
```

**G. Data Collection Rules**

```
Azure Portal → search "Data Collection Rules"
  → look for one associated with this AKS cluster (often named with an
    "MSCI-" or "MSProm-" prefix if auto-created by Container Insights
    onboarding)
```

**H. Data Collection Endpoints**

```
Azure Portal → search "Data Collection Endpoints"
  → look for one referenced by the DCR found above (not all DCRs need one)
```

**I. Managed Identity check**

```
Azure Portal → AKS cluster → Settings → Cluster configuration
  → look for "Identity" section (System-assigned vs. User-assigned)
```
or:
```
Azure Portal → AKS cluster → Security configuration → Identity
```

## Verification Steps

Work through paths A-I above in order, one at a time, confirming each
one actually loads a real page (not a "feature not available" or
permission-denied message).

## Expected Result

All nine paths load successfully. Paths A, B, D, E should show live
data immediately (per Chapter 2/3's known-active items). Paths F, G, H,
I are where this workbook's real open questions live - what you see
there directly feeds Chapter 13's Gap Analysis.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| "Live Logs" tab shows a permissions error | Live Logs requires specific Kubernetes RBAC (a ClusterRoleBinding for the Azure AD user/group) separate from Azure RBAC - a different permission system than everything else in this chapter |
| Logs query editor loads but every query returns zero rows | Time range picker (top of the query editor) may be set too narrow - widen it before concluding data isn't flowing |
| Diagnostic Settings page loads but the list is empty | This is itself a finding, not an error - record it plainly in Chapter 13, don't assume it's a permissions problem without checking the "+ Add" button is at least clickable |

## Interview Questions

1. **Q: Name two different ways to reach the Metrics blade for the same
   AKS cluster.**
   A: Resource-scoped (AKS cluster → Monitoring → Metrics) or via the
   global Azure Monitor hub → Metrics, then selecting the AKS resource
   from a picker.

2. **Q: Why might "Live Logs" fail even when Container Insights is
   fully working otherwise?**
   A: Live Logs depends on Kubernetes-level RBAC permissions (a
   ClusterRoleBinding), which is a separate authorization system from
   the Azure RBAC that governs everything else in the Portal.

## Best Practices

- Always check the time-range picker before concluding a "Logs" or
  "Metrics" view has no data - it's the most common false negative.
- Bookmark the Diagnostic Settings and Data Collection Rules search
  results now - they're used repeatedly in Chapters 9-10.

## Common Mistakes

- **Assuming an empty Diagnostic Settings list means broken monitoring**
  - Container Insights (already active) doesn't require a Diagnostic
  Setting on the AKS resource itself; an empty list here specifically
  means "AKS control-plane logs aren't separately routed," not "nothing
  is being monitored at all."
- **Confusing Live Logs with the stored logs in Log Analytics** - Live
  Logs is a real-time stream with no retention; Log Analytics Logs is
  the durable, queryable store. Different data paths, different
  purposes.

---

# Chapter 5 - Verification Guide

## Objective

By the end of this chapter, for every Azure monitoring component in
this workbook, you will know exactly what "healthy" looks like versus
what "broken" or "not configured" looks like - not just how to find the
page.

## Theory

"I opened the page" and "I confirmed it's healthy" are different
outcomes. This chapter is the difference - a purpose/verify/expected/
healthy/unhealthy table for every component, meant to be used as a
quick reference while doing the actual Chapter 3 checklist work.

## Verification Reference Table

| Component | Purpose | Verify via (see Ch.4) | Expected output | Healthy state | Unhealthy / not-configured state |
|---|---|---|---|---|---|
| Container Insights | Cluster/node/container/pod telemetry | Path A | Live charts with real numbers | Charts populate within seconds, recent timestamps | "Configure monitoring for this cluster" prompt instead of charts |
| Azure Metrics | Per-resource platform metrics | Path B | A chart after picking a metric | Non-flat-zero values matching real cluster activity | Metric picker is empty, or every value is a flat zero with no cluster activity to explain it |
| Log Analytics Logs | Durable KQL-queryable log/inventory data | Path C | Query editor with autocomplete for table names like `ContainerLog`, `KubePodInventory` | Typing `KubePodInventory \| take 10` returns real rows | Query editor loads but table names don't autocomplete, or every query errors |
| Activity Log | Control-plane audit trail | Path D | A timeline of entries | At minimum, the cluster's own creation/update events from Terraform runs | Genuinely empty list (very unusual - would itself be a finding) |
| Resource Health | Platform-level status | Path E | A status banner | "Available" | "Unavailable" or "Degraded" (a real incident, not a config gap) |
| Diagnostic Settings | Log/metric routing configuration | Path F | A list (possibly empty) of configured settings | At least one setting routes AKS control-plane logs somewhere | Empty list - confirmed gap, not an error state |
| Data Collection Rules | What AMA collects and where it sends it | Path G | A DCR resource, likely auto-named | A DCR exists and is associated with this cluster | No DCR found associated with this cluster at all |
| Data Collection Endpoints | Ingestion endpoint for a DCR | Path H | A DCE resource, if the DCR in use needs one | Either a DCE exists and matches the DCR, or the DCR's collection method doesn't require one (also fine) | A DCR references a DCE that doesn't exist (broken reference) |
| Managed Identity | Authentication for AMA | Path I | Identity type and details | System-assigned or user-assigned identity present, with monitoring-related role assignments (verified in Ch.11) | No identity configured, or an identity with no relevant role assignments |

`[screenshot placeholder: screenshots/container-insights-healthy.png]`
`[screenshot placeholder: screenshots/diagnostic-settings-empty-list.png]`
`[screenshot placeholder: screenshots/resource-health-available.png]`

## Azure Portal Navigation

See Chapter 4 - this chapter intentionally reuses those same paths
rather than repeating them, to avoid two documents drifting out of sync.

## Verification Steps / Expected Result

Combined into the single reference table above - that table *is* this
chapter's verification guide.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| A component shows "unhealthy" but only *just* started existing (e.g. cluster created minutes ago) | Give it time - Container Insights and Log Analytics ingestion both have a short delay (typically a few minutes) before first data appears; don't conclude "broken" too quickly on a brand-new resource |
| Genuinely unsure whether something is "unhealthy" or "not configured" | Check the exact wording on screen - Azure is usually explicit about the difference ("Configure monitoring" = not configured; a red/degraded banner = unhealthy) |

## Interview Questions

1. **Q: What's the practical difference between a component being
   "unhealthy" versus "not configured"?**
   A: "Not configured" means the feature was never set up (e.g. an
   empty Diagnostic Settings list) - not a failure, just an unmade
   decision. "Unhealthy" means something that *was* set up is now
   reporting a problem (e.g. Resource Health showing "Degraded"). They
   require completely different responses.

2. **Q: Why give a newly-created resource time before checking its
   monitoring health?**
   A: Telemetry pipelines (agent → collection → ingestion → storage)
   all have propagation delay - checking too early produces false
   "unhealthy" readings for a system that simply hasn't had time to
   report yet.

## Best Practices

- Use this chapter's table as a live reference *while* doing Chapter 3's
  checklist, not as separate homework afterward.
- When in doubt about a status, read the exact on-screen wording before
  guessing - Azure's Portal is usually precise about the distinction
  between "not configured" and "unhealthy."

## Common Mistakes

- **Panicking over a brand-new resource's empty charts** - propagation
  delay, not a real problem, in most cases.
- **Treating this table as a substitute for actually opening the
  Portal** - it's a companion reference, not a replacement for doing
  Chapter 3's verification work.

---

# Chapter 6 - Log Analytics Workspace

## Objective

By the end of this chapter, you will understand what a Log Analytics
Workspace actually is, how data gets into it from AKS, how long that
data is kept and what it costs, and what each of the specific tables
this project should expect to see actually stores.

## Theory

### What it is

A Log Analytics Workspace is a **container for log data** - technically
built on Azure Data Explorer's Kusto engine, the same technology behind
KQL. It's schema-flexible (tables can have different columns per row,
unlike a rigid SQL table) which suits the wildly different shapes of
data different sources send it (a container log line looks nothing like
a Pod inventory snapshot).

### Why it exists

Metrics (Azure Metrics) and logs need different storage engines - a
time-series numeric store is wrong for free-text/structured event data
at scale, and vice versa. The workspace is the "logs" half of that
split described in Chapter 2's architecture diagram.

### How AKS sends data into it

Not directly - through an intermediary. The Container Insights agent
(`ama-logs`, confirmed running in this project) collects data from the
cluster and sends it, governed by a Data Collection Rule (Chapter 10),
into this workspace's tables. No component in this cluster writes to
Log Analytics on its own; it's always agent → DCR → workspace.

### How retention works

Log Analytics Workspaces have a **retention period** setting (commonly
30 days by default, configurable up to 730 days) - data older than the
retention period is automatically purged. Different tables *can* have
different retention overrides on the same workspace, though most
projects use one workspace-wide setting unless there's a specific reason
not to.

### How pricing works

Billed primarily on **data ingested** (GB/day) plus **retention beyond
the included period**. There is a free daily allowance in many
subscription types, and the "Pay-as-you-go" model charges per GB after
that. This matters directly for this project: Container Insights (via
`ama-logs`) is already ingesting data continuously, which is a real,
ongoing cost - not a one-time setup cost. (Chapter 13's Gap Analysis
should treat "how much are we actually spending on this" as a genuine
open question, not just a technical one.)

### What tables are expected

| Table | What it stores |
|---|---|
| `ContainerLog` / `ContainerLogV2` | Raw stdout/stderr text output from every container - the actual log lines your application (or its runtime) printed |
| `ContainerInventory` | Point-in-time snapshots of every container: image, image tag, container state, container ID |
| `KubePodInventory` | Point-in-time snapshots of every Pod: namespace, Pod name, phase, owning controller, node it's scheduled on |
| `KubeNodeInventory` | Point-in-time snapshots of every node: status, labels, allocatable CPU/memory |
| `InsightsMetrics` | Normalized performance metrics Container Insights collects (CPU%, memory%, and similar), in a generic metric-name/value shape |
| `Perf` | Generic performance counter data - broader Azure Monitor concept shared with VM-based monitoring, less central to AKS specifically than `InsightsMetrics` |
| `Heartbeat` | A periodic "the agent is alive and reporting" record - if this table stops receiving new rows, the agent itself has stopped working, independent of whether anything else looks wrong |
| `AzureDiagnostics` | The generic destination table many Azure resources' Diagnostic Settings write into when configured to send here - this is specifically where AKS **control-plane** logs (`kube-audit`, `kube-controller-manager`, `kube-scheduler`) would land, *if* a Diagnostic Setting routes them here (the open question from Chapters 2-3) |

## Architecture

```
   ama-logs (DaemonSet, confirmed running)
   ama-logs-rs (Deployment, confirmed running)
            │
            │  governed by a Data Collection Rule (Ch.10)
            ▼
   Log Analytics Workspace
            │
   ┌────────┼────────┬───────────┬──────────────┬───────────┐
   ▼        ▼        ▼           ▼              ▼           ▼
ContainerLog ContainerInventory KubePodInventory KubeNodeInventory InsightsMetrics Heartbeat

   AzureDiagnostics (separate path - only populated if a
   Diagnostic Setting on the AKS resource itself routes
   control-plane logs here; NOT populated by ama-logs)
```

## Azure Portal Navigation

```
Azure Portal → search "Log Analytics workspaces" → select the workspace
  → Logs (left nav)
  → query editor: type a table name (e.g. KubePodInventory) and
    Azure's autocomplete should suggest it if the table has ever
    received data
```

## Verification Steps

1. Open the Logs query editor (path above).
2. Run: check whether `KubePodInventory` autocompletes and returns rows
   when queried with a broad time range.
3. Repeat for `ContainerLog` (or `ContainerLogV2`), `KubeNodeInventory`,
   `InsightsMetrics`, and `Heartbeat`.
4. Specifically check `AzureDiagnostics` - **this table existing with
   real rows is the direct answer to the open Diagnostic Settings
   question from Chapters 2-3.** If it doesn't exist or returns nothing,
   that's a confirmed gap, not a mistake in your query.

## Expected Result

`ContainerLog`/`ContainerLogV2`, `ContainerInventory`,
`KubePodInventory`, `KubeNodeInventory`, `InsightsMetrics`, and
`Heartbeat` should all autocomplete and return real, recent rows -
Container Insights is already confirmed running, so these are expected
to be populated. `AzureDiagnostics` may or may not have data - that
outcome is itself the finding this chapter exists to produce.

> **Live verification result (2026-07-14):** ran directly against this
> project's real workspace (`log-credpays1`) via `az monitor
> log-analytics query`. Confirmed populated with real, substantial
> volume: `KubePodInventory` - 103,231 rows; `ContainerInventory` -
> 103,172 rows; `Heartbeat` - 5,465 rows; `KubeNodeInventory` - 3,640
> rows. `AzureDiagnostics` - **0 rows**, confirming no Diagnostic
> Setting anywhere is currently routing data into this workspace (see
> the live-verified finding in Chapter 9). This is no longer an
> "expected result" - it's now a confirmed one.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| No tables autocomplete at all | Wrong workspace selected, or the query editor's time range is too narrow |
| `Heartbeat` has no recent rows but other tables do | The agent stopped reporting very recently - a real, current problem worth investigating immediately, not a config gap |
| `AzureDiagnostics` doesn't exist as a suggestion at all | Expected if no Diagnostic Setting has ever routed anything here - confirms the Chapter 2/3 open question rather than indicating an error |

## Interview Questions

1. **Q: Why can't a single database table efficiently store both a
   container's inventory snapshot and its raw log lines?**
   A: Wildly different shapes and query patterns - inventory data is
   structured and queried by filtering columns (namespace, phase);
   log lines are largely free text queried by substring/pattern
   matching. Log Analytics' schema-flexible table model accommodates
   both without forcing one rigid structure.

2. **Q: What does the `Heartbeat` table specifically prove, that
   `ContainerLog` having recent rows does not?**
   A: `Heartbeat` proves the collection *agent itself* is alive and
   checking in, independent of whether any particular workload produced
   log output recently. A quiet `ContainerLog` could mean "nothing
   happened" or "the agent is broken" - `Heartbeat` disambiguates that.

3. **Q: What specifically would prove that AKS control-plane logs are
   being captured, versus just container-level logs?**
   A: Real rows in the `AzureDiagnostics` table - `ama-logs` (Container
   Insights) populates the container-level tables, but control-plane
   logs only reach Log Analytics via a separate Diagnostic Setting
   writing into `AzureDiagnostics`.

## Best Practices

- Check `Heartbeat` first when something seems wrong - it tells you
  whether the whole pipeline is alive before debugging any specific
  table.
- Treat retention and pricing as first-class assessment questions, not
  an afterthought - ingestion cost is ongoing, not one-time.

## Common Mistakes

- **Assuming all tables in this chapter are populated just because
  Container Insights is confirmed running** - true for the
  container/pod/node tables, but explicitly *not* true for
  `AzureDiagnostics`, which depends on a completely separate mechanism.
- **Forgetting that different tables can have different retention
  settings** - assuming one workspace-wide number applies everywhere
  without checking for per-table overrides.

---

# Chapter 7 - Container Insights

## Objective

By the end of this chapter, you will be able to explain Container
Insights' architecture end-to-end - from the agent Pod actually running
in this cluster, to the dashboards it powers in the Portal - and verify
it directly.

## Theory

### Architecture

Container Insights is not a single Pod - it's two components working
together, both of which this project has already directly observed
running:

- **`ama-logs`** - a **DaemonSet** (one Pod per node, same pattern as
  this project's own Node Exporter) that collects node- and
  container-level data locally on each node.
- **`ama-logs-rs`** - a single-replica **Deployment** that collects
  cluster-wide data that doesn't make sense to duplicate per-node (e.g.
  Kubernetes object inventory, which is a cluster-wide concept, not a
  per-node one).

This split mirrors a distinction this project already made deliberately
for its own stack: Node Exporter (per-node, DaemonSet) versus
kube-state-metrics (cluster-wide, single Deployment). Azure independently
arrived at the same architectural split for the same reason.

### How it works

Unlike this project's own Prometheus (which actively **pulls** metrics
via `scrape_configs`), Container Insights is **agent-push**: `ama-logs`
and `ama-logs-rs` actively collect data locally and push it out,
governed by a Data Collection Rule (Chapter 10) telling them what to
collect and where to send it. No scrape configuration exists to read or
edit - it's config-as-a-managed-resource (the DCR), not config-as-a-file
the way `prometheus.yml` is.

### What the agent collects

- Container stdout/stderr logs
- Container/Pod/Node inventory (image, phase, labels, allocatable
  resources)
- Performance metrics (CPU%, memory%, and similar) at container, Pod,
  and node granularity
- (Depending on configuration) Kubernetes Events - **this is
  potentially significant for the AIOps gap identified in Chapter 1**:
  if Container Insights is already capturing Events like
  `FailedScheduling`, that specific gap may already be partially closed
  without any additional work - confirmed or ruled out in this
  chapter's verification steps.

### How data reaches Log Analytics

`ama-logs`/`ama-logs-rs` → Data Collection Rule → Log Analytics
Workspace tables (Chapter 6's table list) - the same pipeline described
there, from the collection side this time.

### What dashboards are available

The built-in **Insights** experience (Chapter 4, Path A: Cluster / Nodes
/ Controllers / Containers / Live Logs tabs) is the primary, no-setup
dashboard. Additionally, pre-built **Workbooks** (a Portal-native
reporting feature) are often available for AKS out of the box, offering
different visual breakdowns of the same underlying data.

## Architecture Diagram

```
   Node 1                          Node 2
   ┌─────────────┐                 ┌─────────────┐
   │ ama-logs Pod │                 │ ama-logs Pod │
   │ (DaemonSet)  │                 │ (DaemonSet)  │
   └──────┬──────┘                 └──────┬──────┘
          │  node/container-level data            │
          └───────────────┬───────────────────────┘
                           │
                  ama-logs-rs Pod (Deployment)
                  cluster-wide inventory data
                           │
                Data Collection Rule (Ch.10)
                           │
                Log Analytics Workspace (Ch.6)
                           │
              ┌────────────┴────────────┐
              ▼                         ▼
     Insights tabs in Portal      Workbooks (pre-built reports)
     (Cluster/Nodes/Controllers/
      Containers/Live Logs)
```

## Azure Portal Navigation

Reuses Chapter 4 Path A exactly - Cluster / Nodes / Controllers /
Containers / Live Logs tabs under AKS cluster → Monitoring → Insights.

## Verification Steps

1. Open Path A (Chapter 4) and click through all five tabs - confirm
   each shows real, current data (node names, container names, and
   numbers matching what's actually running - cross-check against
   `kubectl get pods -n credpay` / `-n monitoring` for a sanity check).
2. Specifically check whether Kubernetes **Events** appear anywhere in
   this view or in a related Workbook - this directly answers whether
   the Chapter 1 "Kubernetes Events aren't queryable metrics" gap is
   already partially covered by Container Insights.
3. Look for a "Workbooks" option near the Insights tabs - open one and
   confirm it renders real data.

## Expected Result

All five Insights tabs populate with real, current data matching the
actual cluster state. Whether Events are captured is a genuine open
question this chapter's verification should settle either way - record
the answer plainly, don't assume.

> **Live verification result (2026-07-14) - the single most important
> finding in this entire workbook:** queried the `KubeEvents` table
> directly (`az monitor log-analytics query`) - **confirmed populated,
> 88 rows in the last 24 hours.** Among them, this exact row:
> ```
> Reason: FailedScheduling
> Namespace: credpay
> Name: payment-service-5b49dd5dd5-4689k
> Message: "0/2 nodes are available: 2 Insufficient memory..."
> ```
> That is the **exact same event**, on the **exact same incident**, this
> project diagnosed manually via `kubectl describe pod` during its real
> capacity crisis earlier in this project. **The Chapter 1/12/13
> "Kubernetes Events aren't centralized" gap is resolved - Container
> Insights was already capturing this the whole time.** This is not a
> future gap to close; it's a capability that already exists and has
> already proven itself against a real incident.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Containers tab shows containers that no longer exist | Normal, briefly - inventory data is point-in-time snapshots, not real-time; there's a short lag |
| Numbers in Insights don't exactly match `kubectl get pods` at this exact second | Also normal for the same reason - Container Insights samples periodically, it isn't a live mirror |
| Live Logs tab specifically fails when everything else works | Separate Kubernetes RBAC requirement, as noted in Chapter 4 - not a sign Container Insights itself is broken |

## Interview Questions

1. **Q: Why does Container Insights use two different Kubernetes
   workload types (`ama-logs` DaemonSet and `ama-logs-rs` Deployment)
   instead of just one?**
   A: Node/container-level data collection needs to happen locally on
   every node (DaemonSet, one per node), while cluster-wide inventory
   data is a single logical concept that shouldn't be duplicated per
   node (single Deployment) - the same split this project made itself
   between Node Exporter and kube-state-metrics.

2. **Q: How does Container Insights' collection model differ
   fundamentally from this project's own Prometheus setup?**
   A: Prometheus pulls - it actively scrapes targets on a schedule
   defined in a config file. Container Insights pushes - the agent
   actively sends data out, governed by a managed Azure resource (a
   Data Collection Rule), not a file you edit directly.

3. **Q: Why might inventory numbers in the Insights tabs briefly
   disagree with a live `kubectl get pods`?**
   A: Container Insights collects point-in-time snapshots on an
   interval, not a continuous live stream - there's an inherent, normal
   lag between "what's true right now" and "what was last collected."

## Best Practices

- Cross-check Container Insights numbers against `kubectl` output when
  possible - not because Container Insights is unreliable, but because
  understanding the expected lag matters for interpreting it correctly
  later during a real incident.
- Explicitly check for Kubernetes Event capture rather than assuming
  it's either present or absent - this single fact meaningfully changes
  what Chapter 13's Gap Analysis needs to recommend.

## Common Mistakes

- **Expecting Container Insights to be real-time** - it's near-real-time
  at best, sampled on an interval; treating a brief mismatch with
  `kubectl` as a bug.
- **Assuming Container Insights and this project's own Prometheus stack
  collect data the same way** - push vs. pull are genuinely different
  operational models, not just different branding on the same idea.

---

# Chapter 8 - Azure Monitor Metrics

## Objective

By the end of this chapter, you will be able to state, precisely, what
Azure collects automatically with zero configuration, and clearly
distinguish it from what this project's own Prometheus stack collects
and what CredPay's application-level business metrics represent - three
genuinely different things that are easy to blur together.

## Theory

### What Azure collects automatically

For essentially every Azure resource type, Azure Monitor Metrics
collects platform-level numeric telemetry with **no configuration
required and no agent to install** - it's built into the resource
provider itself. For AKS specifically, this includes node-level metrics
as seen *by the underlying VM scale set* (CPU%, memory%, disk I/O,
network I/O) and some cluster-level metrics (API server request
latency/count in some AKS SKUs/versions).

### Azure Metrics vs. Prometheus Metrics vs. Business Metrics

| | Azure Metrics | Prometheus Metrics (this project) | Business Metrics (this project) |
|---|---|---|---|
| **Collected by** | Azure platform itself, automatically | Node Exporter, kube-state-metrics, cAdvisor, all scraped by our Prometheus | `user-service` / `payment-service` own instrumentation |
| **Sees** | The Azure *resource* from the outside (VM-level CPU, not container-level) | Everything *inside* the cluster - nodes, containers, K8s objects | Actual business events - a login, a payment, a specific endpoint's latency |
| **Setup required** | None - always on | Self-hosted stack this project built (Phases 1-4) | Code changes (`spring-boot-starter-actuator` + Micrometer; `prometheus-fastapi-instrumentator`) |
| **Query language** | Metrics Explorer UI / Azure Monitor Metrics REST API | PromQL | PromQL (scraped by the same Prometheus, same query language) |
| **Example question it answers** | "What's this VM's CPU utilization as Azure sees it?" | "What's this container's actual CPU usage right now?" (cAdvisor) | "What's `payment-service`'s error rate on `/api/payment/pay` specifically?" |
| **Granularity** | Per Azure resource (a node, a disk) | Per Pod/container/K8s object | Per business operation (per endpoint, per outcome) |

The key insight: **Azure Metrics and this project's cAdvisor-based
container metrics can look superficially similar (both report "CPU
usage") while measuring fundamentally different things** - Azure sees
the VM from outside Kubernetes' awareness; cAdvisor sees each container
from inside it. A node showing low CPU% in Azure Metrics while a
specific container on it shows CPU throttling in cAdvisor is not a
contradiction - they're answering different questions at different
layers.

## Architecture

```
                    "How busy is this node?"
                              │
              ┌───────────────┴───────────────┐
              ▼                               ▼
      Azure Metrics                    Prometheus (Node Exporter/cAdvisor)
      (VM-level view,                  (in-cluster view, per-node
       zero config,                     AND per-container granularity,
       always on)                       self-hosted, PromQL)
              │                               │
              └───────────────┬───────────────┘
                     Both correct, both partial -
                     neither alone tells the whole story

                    "Is the business logic healthy?"
                              │
                    Business Metrics only
                    (user-service / payment-service
                     instrumentation - neither Azure
                     Metrics nor node/container
                     metrics can answer this)
```

## Azure Portal Navigation

Reuses Chapter 4 Path B (AKS cluster → Monitoring → Metrics).
Additionally, to see the breadth of what's collected: open the "Metric"
dropdown after selecting a namespace and scroll the full list - this is
the fastest way to see everything Azure offers without documentation.

## Verification Steps

1. Open Path B, select a Node-level metric namespace, and pick "CPU
   Usage Percentage" (or equivalent).
2. In a separate tab, open this project's own Grafana
   `credpay-node-resource-gauges.json` dashboard, which shows the same
   general concept (node CPU) via Node Exporter.
3. Compare the two - they should be in the same general ballpark but
   are not expected to match exactly (different measurement layers, as
   explained in Theory).

## Expected Result

Both sources report plausible, non-contradictory node CPU figures. An
extreme mismatch (one reporting near-zero while the other reports
high load) would be worth investigating, but close alignment is not
required for both to be "correct."

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Azure Metrics for the AKS resource shows very few available metrics compared to expectations | Some AKS-specific control-plane metrics require a specific AKS SKU/version or additional configuration (e.g. Azure Managed Prometheus integration, deliberately not used here per Chapter 2) |
| Azure Metrics and Prometheus/cAdvisor numbers disagree significantly | Expected to some degree (different layers) - only worth deeper investigation if the disagreement is extreme and unexplained |

## Interview Questions

1. **Q: Give a concrete example of a question Azure Metrics can answer
   that this project's Prometheus stack cannot, and vice versa.**
   A: Azure Metrics can answer "what does the underlying VM's disk I/O
   look like" without any in-cluster agent. Prometheus (via cAdvisor)
   can answer "which specific container on that node is responsible for
   the load" - a question Azure Metrics, being VM-scoped, structurally
   cannot answer.

2. **Q: Why might a node show low CPU usage in Azure Metrics while a
   Prometheus/cAdvisor dashboard shows a specific container on that same
   node under CPU pressure?**
   A: Not a contradiction - Azure Metrics reports the VM's overall usage
   from outside Kubernetes' awareness, while cAdvisor reports
   per-container usage from inside it. A node can have low overall
   utilization while one specific container is still hitting its own
   CPU limit.

3. **Q: Where do "business metrics" fit in this three-way comparison,
   and why can't either Azure Metrics or generic Prometheus infra
   metrics substitute for them?**
   A: Business metrics (request rate/error rate/latency by endpoint)
   require instrumenting the *application code itself* - neither the
   Azure platform nor generic infrastructure scraping can ever produce
   "how many logins failed" or "what's the payment error rate," because
   neither has any visibility into application-level logic.

## Best Practices

- When comparing a "similar-sounding" metric across Azure Metrics and
  Prometheus, explicitly note which layer each one measures before
  drawing conclusions from a discrepancy.
- Keep all three categories (Azure Metrics, Prometheus Metrics, Business
  Metrics) in mind when designing any future AIOps correlation logic -
  each answers a different class of question.

## Common Mistakes

- **Assuming a discrepancy between Azure Metrics and Prometheus numbers
  means one of them is broken** - usually neither is; they measure
  different layers.
- **Trying to get "business" answers from Azure Metrics** - it
  structurally cannot know anything about `/api/payment/pay`'s error
  rate; that only exists because `payment-service` was explicitly
  instrumented to expose it.

---

# Chapter 9 - Diagnostic Settings

## Objective

By the end of this chapter, you will be able to explain exactly what a
Diagnostic Setting does, verify whether one exists for CredPay's AKS
cluster and other key resources, and understand precisely which
destinations are available and how each connects to Log Analytics.

## Theory

### What Diagnostic Settings are

Recall from Chapter 2: not a monitoring feature itself - a **routing
configuration**. Nearly every Azure resource type is *capable* of
producing its own detailed logs (for AKS: `kube-audit`,
`kube-controller-manager`, `kube-scheduler`, `cluster-autoscaler`, and
more), but capable of producing them is not the same as those logs
being captured anywhere. A Diagnostic Setting is the explicit decision
"send this resource's logs/metrics *here*."

### Where they are configured

Per-resource, individually. There is no subscription-wide "turn on all
diagnostics everywhere" switch - each resource (the AKS cluster, the
Key Vault, the PostgreSQL server, the Container Registry) needs its own
Diagnostic Setting if you want its logs captured.

### Which destinations are available

- **Log Analytics Workspace** - the destination relevant to this
  workbook; lands in `AzureDiagnostics` or resource-specific tables
  (Chapter 6).
- **Storage Account** - durable, cheap, cold storage; not queryable with
  KQL directly.
- **Event Hub** - a streaming destination, typically used to forward
  data to a third-party SIEM or a custom pipeline.
- **Partner solution** - forwards to a specific supported third-party
  integration.

### How they connect to Log Analytics

When "Send to Log Analytics workspace" is selected as a destination,
the resource's chosen log categories get written into that workspace -
typically the generic `AzureDiagnostics` table (some resource types use
dedicated resource-specific tables instead; behavior varies by resource
type).

## Architecture

```
   AKS Cluster's own control-plane logs
   (kube-audit, kube-scheduler, kube-controller-manager, ...)
              │
              │  NOT automatically captured - requires an explicit
              │  Diagnostic Setting on the AKS resource itself
              ▼
   Diagnostic Setting (if one exists)
              │
      ┌───────┼────────┬─────────────┐
      ▼       ▼        ▼             ▼
  Log        Storage  Event Hub   Partner
  Analytics  Account              solution
  Workspace
      │
      ▼
  AzureDiagnostics table (Ch.6)
```

Contrast with Container Insights (Chapter 7), which reaches
container/Pod/node-level data through its own agent-based path,
entirely separate from Diagnostic Settings. **These are two independent
pipelines into the same workspace** - one does not substitute for the
other.

## Azure Portal Navigation

Reuses Chapter 4 Path F. Repeat for each resource worth checking:

```
Azure Portal → AKS cluster → Diagnostic settings
Azure Portal → Key Vault (credpaykvs1) → Diagnostic settings
Azure Portal → PostgreSQL Flexible Server → Diagnostic settings
Azure Portal → Container Registry (credpayacrs1) → Diagnostic settings
```

## Verification Steps

1. For each resource listed above, open its Diagnostic Settings page.
2. Record, per resource: does at least one setting exist? If so, which
   log categories are selected, and which destination(s)?
3. Cross-reference against Chapter 6's `AzureDiagnostics` table check -
   do they agree (a setting exists and the table has data, or no
   setting exists and the table is empty)? A mismatch between these two
   checks would itself be worth investigating.

## Expected Result

Based on this project's known Terraform configuration (which provisions
Container Insights but does not appear to separately configure
resource-level Diagnostic Settings for AKS control-plane logs, Key
Vault, PostgreSQL, or ACR), the most likely finding is an **empty list**
for most or all of these resources. That is a legitimate, expected
assessment outcome - not a sign anything is broken - and it directly
becomes an entry in Chapter 13's Gap Analysis.

> **Live verification result (2026-07-14):** ran `az monitor
> diagnostic-settings list` directly against all four resources.
> **Confirmed empty (`[]`) on every single one** - the AKS cluster, the
> Key Vault (`credpaykvs1`), the PostgreSQL Flexible Server
> (`psql-credpays1`), and the Container Registry (`credpayacrs1`). This
> is no longer a prediction - it's a confirmed, real gap. AKS
> control-plane logs (`kube-audit`, `kube-scheduler`,
> `kube-controller-manager`) are not being routed anywhere and are not
> retained. This is the one genuinely open, real gap this entire
> workbook identified.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Diagnostic Settings page won't load for a resource | Check Azure RBAC permissions on that specific resource - access is per-resource, not inherited automatically from access to the AKS cluster |
| A setting exists but its target workspace looks unfamiliar | Possible it's pointing at a different Log Analytics Workspace than the one Terraform created - worth confirming which workspace by name |

## Interview Questions

1. **Q: Is a Diagnostic Setting the same thing as Container Insights?**
   A: No - two independent pipelines. Container Insights uses its own
   agent (`ama-logs`) to collect container/Pod/node data. A Diagnostic
   Setting is a separate, resource-level configuration for that
   resource's *own* logs (e.g. AKS control-plane logs), unrelated to
   what's happening inside the workload Pods.

2. **Q: Name all four possible destinations for a Diagnostic Setting.**
   A: Log Analytics Workspace, Storage Account, Event Hub, and Partner
   solution.

3. **Q: If `AzureDiagnostics` in Log Analytics is empty, what does that
   specifically tell you - and what does it NOT tell you?**
   A: It tells you no Diagnostic Setting is currently routing anything
   to this workspace. It does **not** tell you Container Insights is
   broken (different pipeline) or that the resource isn't producing
   logs at all (it may be producing them, just not routing them anywhere
   retained).

## Best Practices

- Check Diagnostic Settings on every resource individually - there is
  no shortcut or inherited setting across resources.
- When a Diagnostic Setting exists, always confirm *which* workspace it
  targets - a setting pointing at an unexpected or orphaned workspace is
  a common real-world misconfiguration.

## Common Mistakes

- **Assuming Container Insights being active means Diagnostic Settings
  are unnecessary** - they cover genuinely different data (workload
  telemetry vs. the AKS resource's own control-plane logs).
- **Checking only the AKS cluster's Diagnostic Settings and stopping
  there** - Key Vault, PostgreSQL, and ACR are equally relevant to
  CredPay and each needs its own check.

---

# Chapter 10 - Data Collection Rules

## Objective

By the end of this chapter, you will understand what a Data Collection
Rule is, why the modern Azure Monitor Agent architecture depends on one
existing, and be able to verify whether CredPay's cluster already has
one (very likely, but not yet confirmed).

## Theory

### What a DCR is

A **Data Collection Rule (DCR)** is an Azure resource - not a file, not
a Kubernetes object - that defines two things: **what** data an agent
should collect (which log categories, which performance counters) and
**where** it should send that data (which Log Analytics Workspace, via
which Data Collection Endpoint if one is used).

### How Azure Monitor Agent uses it

This is a genuinely different model from the legacy Log Analytics agent
(the older "MMA"/"OMS" agent, now retired), which had collection
behavior largely baked into the agent's own configuration on the
machine. The modern **Azure Monitor Agent (AMA)** - which is exactly
what `ama-logs`/`ama-logs-rs` are, per Chapter 7 - has **no built-in
collection logic of its own**. It is entirely driven by whichever DCR(s)
it's associated with. Change the DCR, change what AMA collects - no
agent reconfiguration or redeployment needed.

This is directly analogous to something this project already
understands well: Prometheus's `prometheus.yml` ConfigMap (mounted, then
Prometheus reads it) defines what Prometheus scrapes. A DCR plays the
same conceptual role for AMA - except a DCR is a managed Azure resource
you'd view/edit in the Portal or via Azure Resource Manager, not a file
in this repository.

### Do we currently have one? How to check

Not yet confirmed - genuinely one of this workbook's open questions
(flagged since Chapter 3). Onboarding Container Insights through the
standard AKS "enable monitoring" path **typically auto-creates** a DCR,
often named with a recognizable prefix (commonly starting with `MSCI-`
for Container Insights, or `MSProm-` if Managed Prometheus is involved -
not the case here per Chapter 2). Whether this project's specific
Terraform-driven setup went through that auto-creation path, or whether
a DCR was created some other way (or is missing entirely), is exactly
what this chapter's verification step settles.

## Architecture

```
   ama-logs / ama-logs-rs (the Azure Monitor Agent Pods)
              │
              │  "what do I collect, and where does it go?"
              ▼
   Data Collection Rule (DCR)
      - log categories to collect
      - performance counters to collect
      - target Log Analytics Workspace
      - (optionally) a Data Collection Endpoint (Ch. this chapter's
        sibling concept - the ingestion URL the DCR's data flows through)
              │
              ▼
   Log Analytics Workspace (Ch.6)
```

Compare directly to this project's own architecture:

```
   Prometheus Pod
              │
              │  "what do I scrape, and where do results live?"
              ▼
   prometheus.yml (ConfigMap, mounted into the Pod)
              │
              ▼
   Prometheus's own TSDB (10Gi PVC)
```

Same conceptual role (a "what and where" definition separate from the
agent/collector itself), completely different implementation
(a managed Azure resource vs. a Kubernetes ConfigMap).

## Azure Portal Navigation

Reuses Chapter 4 Path G:

```
Azure Portal → search "Data Collection Rules"
  → look through the list for one associated with this AKS cluster
  → open it → check "Configuration" (what's collected) and
    "Resources" (which resources/clusters use it)
```

## Verification Steps

1. Search "Data Collection Rules" and list everything found in the
   subscription.
2. For each result, open it and check the "Resources" tab - does it
   list CredPay's AKS cluster as an associated resource?
3. If found, open "Configuration" - confirm it includes the log
   categories expected from Chapter 6/7 (container logs, inventory,
   performance counters).
4. If a Data Collection Endpoint is referenced, note its name for
   cross-reference (see Verification Steps in Chapter 3, row 12).

## Expected Result

A DCR should exist and be associated with the AKS cluster, given
Container Insights is already confirmed active (Chapter 7) - AMA cannot
function without one. Finding **no** DCR at all associated with this
cluster would directly contradict the Chapter 7 finding and would be a
significant, surprising result worth immediately double-checking (wrong
subscription filter, wrong resource group) before concluding it's a
genuine gap.

> **Live verification result (2026-07-14) - this chapter's prediction
> was wrong, and that's an important, real lesson.** Queried the
> subscription directly (`az resource list --resource-type
> "Microsoft.Insights/dataCollectionRules"` and
> `dataCollectionEndpoints`) - **zero of either exist, anywhere in the
> subscription.** Yet Chapter 6/7 already confirmed real data flowing.
> The resolution: this cluster's Container Insights (`omsagent` addon
> profile) was provisioned using the **older, direct workspace-link
> model** - the addon config carries a `logAnalyticsWorkspaceResourceID`
> property pointing straight at the workspace, with no DCR/DCE in the
> path at all. This is a **different, older, still fully-supported
> architecture** from the DCR-based model described earlier in this
> chapter - both are real, both work, and assuming the newer one is in
> use without checking would have been a genuine, confidently-wrong
> assumption. The `prometheus.yml`-analogy above still holds
> conceptually for the *modern* DCR-based path; it just isn't the path
> this specific cluster happens to use.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| No DCR found anywhere in the subscription | Check subscription/resource-group filters first - if genuinely absent despite Container Insights clearly running (Chapter 7), this is a meaningful anomaly worth flagging prominently in Chapter 13 |
| A DCR exists but isn't associated with this specific AKS cluster | Possible it's associated with a *different* cluster or resource entirely - re-verify the "Resources" tab carefully |

## Interview Questions

1. **Q: What's the single biggest architectural difference between the
   legacy Log Analytics agent and the modern Azure Monitor Agent, from a
   configuration standpoint?**
   A: The legacy agent had collection behavior largely built into its
   own local configuration. The modern Azure Monitor Agent has no
   built-in collection logic at all - it's entirely driven by whichever
   Data Collection Rule(s) it's associated with.

2. **Q: Draw the analogy between a DCR and something in this project's
   own Prometheus setup.**
   A: A DCR plays the same conceptual role as `prometheus.yml` - it
   separates "what to collect and where to send it" from the agent/
   collector process itself. The DCR is a managed Azure resource; the
   ConfigMap is a Kubernetes object - different implementations of the
   same idea.

3. **Q: Why would finding zero DCRs associated with this cluster be
   surprising, given what earlier chapters already confirmed?**
   A: Chapter 7 already confirmed Container Insights (the Azure Monitor
   Agent, `ama-logs`/`ama-logs-rs`) is actively running and collecting
   data. Since AMA cannot collect anything without a DCR telling it
   what to collect, finding none would contradict already-observed
   evidence and should prompt re-checking filters before accepting it
   as a real gap.

## Best Practices

- Always check the "Resources" tab of a candidate DCR before assuming
  it applies to this project's cluster - a similarly-named DCR
  associated with an unrelated cluster is a realistic false match in any
  subscription with more than one AKS cluster.
- Note the DCR's exact name once found - it's referenced again when
  reconciling Chapter 3's checklist and Chapter 13's Gap Analysis.

## Common Mistakes

- **Assuming a DCR is a Kubernetes-side thing you'd find via `kubectl`**
  - it's purely an Azure Resource Manager resource, invisible to the
  Kubernetes API entirely.
- **Confusing "no DCR configured for a specific extra thing" (e.g. no
  DCR set up for Application Insights, which isn't in use per Chapter
  2) with "no DCR at all"** - be specific about which pipeline a given
  DCR does or doesn't serve.

---

# Chapter 11 - Managed Identity

## Objective

By the end of this chapter, you will understand why the Azure Monitor
Agent needs an identity at all, what kind of identity is expected, and
how to verify - directly in the Portal - that the right one is actually
in place for CredPay's cluster.

## Theory

### Why Azure Monitor Agent requires Managed Identity

AMA needs to authenticate to Azure's ingestion endpoints before it's
allowed to write a single row of data into a Log Analytics Workspace -
Azure does not accept anonymous or unauthenticated writes. The modern,
recommended way for an agent running *inside* Azure infrastructure to
prove who it is - without a password or secret stored anywhere - is a
**Managed Identity**: an identity Azure itself manages and rotates,
tied directly to the resource (here, the AKS cluster) rather than to a
human user or a stored credential.

This project already has direct, hands-on familiarity with a *different*
managed identity serving a *different* purpose: the AKS kubelet identity
used for `AcrPull` access, described in `k8s/README.md` - "AKS must be
attached to it once, out-of-band: `az aks update --attach-acr ...`,"
which grants the kubelet identity pull access without any
`imagePullSecrets`. AMA's authentication need is the same *pattern*
(identity instead of a stored secret) applied to a *different* problem
(pushing monitoring data instead of pulling container images) - and,
critically, it is typically a **separate identity** from the kubelet
identity, with its own, different role assignment.

### What role assignment matters

For AMA to successfully push data, its identity typically needs a role
like **Monitoring Metrics Publisher** (for metrics) and appropriate
permissions tied to the Data Collection Rule (Chapter 10) it's
associated with. Simply having *an* identity is not sufficient - the
identity needs the *correct* role assignment, scoped correctly.

## Architecture

```
   AKS Cluster
      │
      ├── Kubelet identity ──────► AcrPull role ────► Azure Container Registry
      │   (already confirmed working - k8s/README.md)
      │
      └── AMA-related identity ──► Monitoring Metrics    ► Data Collection Rule
          (System-assigned or       Publisher role          (Ch.10) ──► Log
           user-assigned - to be    (or equivalent)          Analytics Workspace
           confirmed this chapter)
```

Two structurally similar but functionally independent identity/role
pairs on the same cluster - confirming one works (kubelet/ACR, already
known-good) says nothing about whether the other (AMA/Monitor) is
correctly set up. Each must be checked on its own.

## Azure Portal Navigation

Reuses Chapter 4 Path I:

```
Azure Portal → AKS cluster → Settings → Cluster configuration
  → "Identity" section: note System-assigned vs. User-assigned, and the
    identity's name/principal ID
```
Then, to check the role assignment specifically:
```
Azure Portal → Subscription (or the specific Log Analytics Workspace /
  Data Collection Rule resource) → Access control (IAM)
  → "Role assignments" tab → search for the identity name/principal ID
    found above
  → confirm a role like "Monitoring Metrics Publisher" (or equivalent)
    is listed for it
```

## Verification Steps

1. Note the AKS cluster's identity type and name (first navigation
   block above).
2. Check that identity's role assignments on the Log Analytics
   Workspace and/or the Data Collection Rule found in Chapter 10
   (second navigation block above).
3. Confirm a monitoring-relevant role (e.g. Monitoring Metrics
   Publisher) is present - absence of this role, combined with data
   *still* flowing (per Chapters 6-7's confirmed evidence), would be
   worth a second look, since it could mean a different identity
   (perhaps a separate one specifically provisioned for AMA) is the one
   actually in use.

## Expected Result

Given Chapters 6-7 already confirmed real data flowing into Log
Analytics via Container Insights, *some* identity with *some* correct
role assignment must already be working correctly - the goal of this
chapter is to identify exactly which one, by name, so it's documented
rather than inferred.

> **Live verification result (2026-07-14):** `az aks show` confirms the
> AKS cluster's own identity is **SystemAssigned**
> (`principalId: 7d9586c1-...`), with **Contributor** on the node
> resource group (`rg-credpays1-aks-nodes`) only - unrelated to
> monitoring. Separately, the `omsagent` addon profile carries its
> **own, distinct, user-assigned identity** named
> `omsagent-aks-credpays1` (exactly the "separate identity" this chapter
> predicted might exist) - confirmed via role assignment lookup to hold
> **Monitoring Metrics Publisher**, scoped to the AKS cluster resource
> itself. One more real, notable detail: the addon's config carries
> `"useAADAuth": "false"` - meaning actual log/inventory *ingestion*
> into Log Analytics currently authenticates via the workspace's legacy
> shared key, not this identity's Azure AD-based auth. The identity and
> its role assignment are real and correctly scoped for what they're
> used for (consistent with the DCR-less, legacy-workspace-link
> architecture found in Chapter 10) - but they are not the mechanism
> actually authenticating the bulk log ingestion happening today. Worth
> noting for a security-conscious future pass: Microsoft has been
> steering customers toward AAD-based ingestion auth over shared keys
> industry-wide; this is a legitimate, low-urgency modernization
> opportunity, not a broken configuration.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Can't find any role assignment for the cluster's main identity | AMA sometimes uses a distinct, separate managed identity from the cluster's primary one specifically for monitoring - check for an additional identity resource, not just the one on the Cluster configuration page (confirmed true for this project - see the live verification result above) |
| Everything about identity looks correctly configured but data still isn't flowing | Identity/role is necessary but not sufficient - also re-verify whichever path applies: the DCR (if the modern model is in use) or the addon's direct `logAnalyticsWorkspaceResourceID` config (if the legacy model is in use, as confirmed for this project in Chapter 10) |

## Interview Questions

1. **Q: Why does Azure Monitor Agent need a Managed Identity instead of
   just a stored credential/secret?**
   A: Managed Identities are provisioned and rotated by Azure itself,
   removing the need to store, distribute, or rotate a secret manually
   - the same security benefit (no stored credentials) this project
   already relies on for ACR image pulls via the kubelet identity.

2. **Q: Is the identity AKS uses for ACR image pulls (`AcrPull`) the
   same one AMA uses to push monitoring data?**
   A: Not necessarily, and shouldn't be assumed to be - they serve
   different purposes and typically carry different role assignments;
   each needs to be verified independently.

3. **Q: What specific role should be checked for on the identity
   responsible for pushing metrics/logs to Azure Monitor?**
   A: A role along the lines of "Monitoring Metrics Publisher" (for
   metrics specifically), verified via Access Control (IAM) on the
   target Log Analytics Workspace or Data Collection Rule, not just on
   the AKS cluster resource itself.

## Best Practices

- Verify identity *and* role assignment together - confirming an
  identity exists without confirming its role assignment answers only
  half the question.
- Document the exact identity name/principal ID found, not just "yes, it
  has an identity" - specific enough to hand to someone else for review
  or to revisit later without repeating the investigation.

## Common Mistakes

- **Assuming the ACR-pull identity and the monitoring identity are the
  same thing** because they're both "the cluster's identity" in a loose
  sense - verify each independently rather than assuming.
- **Concluding identity/permissions must be correct just because data is
  flowing today** - a role assignment could have been broader than
  necessary, or could change/expire; "it works right now" isn't the same
  as "it's correctly and minimally configured," which matters for a
  proper security-conscious assessment.

---

# Chapter 12 - Preparing for AIOps

## Objective

This is the most important chapter in this workbook. By the end of it,
you will be able to explain, for each of six distinct data sources,
what it uniquely provides, why an AI system specifically needs it (not
just "more data is good"), and give a concrete example of a question
only that source can answer.

## Theory

An AI system trying to explain "why did this happen" or predict "what's
about to happen" is only as good as the telemetry it can see. Feeding it
one source (even a rich one, like Prometheus) means it can only ever
reason within that source's blind spots. The whole point of this
Cloud Monitoring assessment phase was mapping out every source that
*should* eventually feed the AI Service - this table is that map.

## The Six Data Sources

| Data Source | What it provides | Why AI needs it | Example AI question it uniquely answers |
|---|---|---|---|
| **Prometheus** (already built) | Node/container resource usage, Kubernetes object state, application request/error/latency metrics - all inside the cluster | The primary, high-resolution, real-time signal for "what is this system doing right now, precisely" | *"Did payment-service's p95 latency exceed 500ms in the last 10 minutes, and on which pod specifically?"* |
| **Azure Monitor (Metrics)** | Platform-level numeric telemetry for Azure resources themselves (VM-level node metrics, database server metrics) | Sees the infrastructure *underneath* Kubernetes' own awareness - a class of failure Prometheus structurally cannot detect | *"Is the underlying VM hosting this node experiencing throttling that wouldn't show up as a Kubernetes-level metric?"* |
| **Log Analytics (Logs)** | Free-text and structured logs - container stdout/stderr, and (if Diagnostic Settings are configured, per Chapter 9's open question) AKS control-plane logs | Metrics tell you *that* something is wrong; only logs carry the specific error message, stack trace, or audit trail explaining *why* | *"What was the exact exception message in payment-service when the error-rate metric spiked at 2 AM?"* |
| **Kubernetes Events** | Discrete, transient signals Kubernetes itself emits during state transitions (`FailedScheduling`, `BackOff`, `Unhealthy`) - not persisted as metrics by default | This project's own real incident (a Pod stuck `Pending` with a `FailedScheduling`/`NotTriggerScaleUp` event) is *exactly* the shape of evidence an AI root-cause system needs, and it doesn't reliably exist as a queryable metric today | *"Was this Pod's failure to start caused by a scheduling/capacity problem, and has this exact event pattern happened before?"* |
| **Azure Resource Health** | Per-resource, Azure-reported platform health status, independent of anything happening inside the workload | Distinguishes "our application/config has a bug" from "Azure's own infrastructure is degraded" - two incidents that look identical from inside the cluster but require completely different responses | *"Was the payment failure spike caused by our code, or was Azure Database for PostgreSQL itself reporting degraded health at that time?"* |
| **Business Metrics** (already built, technically scraped by Prometheus but conceptually distinct - see Chapter 8) | Application-level, business-meaningful events - a login, a payment, a specific endpoint's behavior | The only source that can answer questions in *business* terms rather than infrastructure terms - "did payments succeed," not "was the pod healthy" | *"What percentage of actual payment attempts failed in the last hour, regardless of whether any infrastructure metric looked abnormal?"* |

## Architecture

```
                         AIOps AI Service (future phase)
                                    │
        ┌──────────┬──────────┬────┴─────┬──────────────┬─────────────┐
        ▼          ▼          ▼          ▼              ▼             ▼
   Prometheus  Business    Azure      Log Analytics  Kubernetes    Azure
   (infra)     Metrics     Monitor    (Logs)         Events        Resource
               (business)  (Metrics)                 (not yet      Health
                                                       centralized -
                                                       Ch.13 gap)
```

No single arrow above is sufficient by itself - a real AIOps answer
typically needs at least two of these six correlated together (as the
`payment-service` 2 AM example has shown throughout this workbook).

## Azure Portal Navigation

No new navigation - this chapter is a synthesis of every source already
covered in Chapters 4-11.

## Verification Steps

For each of the six sources, confirm (using the earlier chapters'
verification steps) whether it is: **available today**, **available but
unused**, or **not yet centralized/available**. This table becomes the
direct input to Chapter 13.

## Expected Result

A clear status for all six sources, feeding directly into the Gap
Analysis - this chapter does not resolve anything new, it organizes
what's already been found.

## Troubleshooting

Not applicable in the usual sense - this chapter is synthesis, not a
new system to debug. If any of the six sources' status is unclear,
that's a signal to revisit its dedicated chapter (Prometheus status:
`OBSERVABILITY-STATUS.md`; the other five: Chapters 6-11 of this
document).

## Interview Questions

1. **Q: Why isn't Prometheus alone sufficient input for an AIOps
   system, even though it's the richest single source available?**
   A: Prometheus only sees inside the Kubernetes cluster. It cannot see
   Azure platform-level health, cannot carry free-text log detail, and
   (by default) doesn't persist Kubernetes Events as queryable metrics -
   three structurally separate blind spots covered by the other five
   sources.

2. **Q: Why are Kubernetes Events called out as their own data source,
   separate from Prometheus, even though kube-state-metrics is already
   scraped?**
   A: kube-state-metrics reports object *state* (a Pod's current phase),
   not the individual *Events* generated during a state transition. The
   specific reason something failed (e.g. `FailedScheduling`) lives in
   an Event, which isn't automatically turned into a persistent metric.

3. **Q: Give an example (from this table) of two sources that would
   need to be correlated together to fully answer a single incident
   question.**
   A: Prometheus (shows the error-rate metric spiking) + Log Analytics
   Logs (shows the specific exception message causing it) - or
   Prometheus + Azure Resource Health, to distinguish an application bug
   from an underlying platform incident.

## Best Practices

- When designing any future AI correlation logic, explicitly map which
  of these six sources each planned use case depends on - a use case
  that silently assumes a source no one has actually enabled (e.g.
  centralized Kubernetes Events) will fail quietly rather than loudly.
- Revisit this table whenever a new data source is considered for the
  AIOps phase - it's meant to be a living reference, not a one-time
  exercise.

## Common Mistakes

- **Treating "more data sources" as inherently better without asking
  what specific question each one answers** - this table exists
  precisely to force that question for each source individually.
- **Assuming Business Metrics are redundant with Prometheus because
  they're scraped by the same Prometheus server** - the *storage
  mechanism* is shared, but the *category of question* they answer
  (business outcomes vs. infrastructure health) is genuinely different,
  as Chapter 8 already established.

---

# Chapter 13 - Gap Analysis

## Objective

By the end of this chapter, you will have a single, honest statement of
current state versus required state for AIOps readiness, with every gap
named specifically enough to act on later - **without acting on any of
them now.**

## Theory

A gap analysis is only useful if it resists the temptation to either
overstate readiness ("it's basically done") or understate it ("nothing
works"). This chapter was originally written from speculation and
inference; it has since been **re-verified live, directly against the
real Azure subscription**, via `az` CLI (read-only queries only -
nothing was enabled or changed). Every row below states plainly whether
it's a live-confirmed fact or still an inference - and several rows
turned out differently than the original prediction, which is itself an
important, honest finding: **assessment work should expect to be wrong
sometimes, and the point is finding out, not being right on the first
guess.**

## Current State (live-verified 2026-07-14)

| Area | Status | Basis |
|---|---|---|
| Prometheus, Node Exporter, kube-state-metrics, cAdvisor, Grafana, Application Metrics | **Fully implemented** | Built and verified across Phases 1-5 of this project; see `OBSERVABILITY-STATUS.md` |
| AlertManager | **Dropped for now** | Explicit decision - assessed as not currently needed |
| Log Analytics Workspace (`log-credpays1`) | **Confirmed working, live-verified** | Queried directly - `KubePodInventory` (103,231 rows), `ContainerInventory` (103,172 rows), `Heartbeat` (5,465 rows), `KubeNodeInventory` (3,640 rows) all populated |
| Container Insights (`ama-logs`/`ama-logs-rs`) | **Confirmed working, live-verified** | Pods confirmed `Running` via `kubectl`; real, high-volume data confirmed in the workspace above |
| Azure Monitor Agent | **Confirmed working, live-verified** | Same evidence as Container Insights - it's the same agent, provisioned via the AKS `omsagent` addon profile |
| **Kubernetes Events centralization** | **CONFIRMED WORKING - not a gap** | `KubeEvents` table queried directly: 88 rows in the last 24h, including the exact `FailedScheduling` event from this project's own real capacity incident. **This was the workbook's single biggest open question, and it resolved in the best possible direction.** |
| Data Collection Rule / Data Collection Endpoint | **CONFIRMED: neither exists, anywhere in the subscription** | `az resource list` for both resource types returned empty. This cluster does **not** use the modern DCR-based AMA architecture - it uses the **older, direct workspace-link model** (the `omsagent` addon's `logAnalyticsWorkspaceResourceID` config). A real, informative correction to Chapter 10's original assumption. |
| Managed Identity (for the monitoring addon) | **Confirmed, with a specific real detail** | A dedicated user-assigned identity (`omsagent-aks-credpays1`, distinct from the cluster's own SystemAssigned identity) holds **Monitoring Metrics Publisher** on the AKS resource. However, `useAADAuth: false` on the addon means actual log ingestion currently authenticates via the workspace's legacy shared key, not this identity - a real, minor modernization opportunity, not a broken configuration. |
| Azure Metrics | **Available, default-on** | Always active; not yet incorporated into any dashboard or AI-facing use case |
| Activity Log | **Confirmed populated, live-verified** | Queried directly - real entries present (e.g. policy audit actions) for the resource group |
| Resource Health | **Confirmed `Available`, live-verified** | Queried directly via the Resource Health API for the AKS resource |
| **Diagnostic Settings (AKS, Key Vault, PostgreSQL, ACR)** | **CONFIRMED EMPTY on all four - a real, genuine gap** | `az monitor diagnostic-settings list` returned `[]` for every one of the four key resources. `AzureDiagnostics` table independently confirmed at 0 rows, consistent with this. **This is the one real, confirmed gap this entire workbook identified.** |
| Application Insights / distributed tracing | **Not implemented, not yet planned** | Deliberately out of scope so far (Chapter 2); the one gap this whole project has *never* addressed, in any phase |
| A correlation/ingestion layer joining Prometheus + Azure Monitor + Events + Resource Health for actual AI consumption | **Does not exist** | This is the AIOps phase itself, not a Cloud Monitoring gap - listed here for completeness, not as something this phase should build |

## Required State (for AIOps readiness)

All six data sources from Chapter 12, each independently verified and
either already flowing somewhere queryable or explicitly decided as
out of scope - with no source left in a genuinely ambiguous state. As
of this chapter's live verification, **five of six are now confirmed**
(Prometheus, Azure Monitor Metrics, Log Analytics Logs, Kubernetes
Events, Resource Health); Business Metrics were already confirmed in
earlier project phases. Only the control-plane-logs slice of "Log
Analytics Logs" remains a genuine, confirmed gap.

## Missing Components (the real, current gap list - post-verification)

Only one item survived live verification as a genuine, confirmed gap:

1. **AKS control-plane log routing** - confirmed missing. No Diagnostic
   Setting exists on the AKS resource (or on Key Vault, PostgreSQL, or
   ACR). `kube-audit`, `kube-scheduler`, and `kube-controller-manager`
   logs are not being captured anywhere today.

Two items initially listed as open gaps were **resolved by
verification, not by enabling anything**:

2. ~~Kubernetes Event capture~~ - **already working**, confirmed via
   direct query of `KubeEvents` (88 rows/24h, including this project's
   own real incident).
3. ~~Data Collection Rule / Endpoint existence~~ - **not applicable to
   this architecture** - this cluster's monitoring doesn't use the
   DCR-based model at all, so "missing DCR" was never really the right
   question; the correct question (is data flowing via *whichever*
   model is in use) was already answered yes.

One item remains a genuine, deliberate scope decision rather than an
oversight:

4. **Distributed tracing** - no mechanism exists anywhere in this
   project today to answer "where did the time go across services for
   one specific request." Application Insights is the most obvious
   candidate, specifically for this purpose, not for metrics it would
   duplicate (Chapter 2).

And one item is explicitly the next phase, not a gap in this one:

5. **An actual AI Service / correlation layer** - every source in
   Chapter 12's table now being confirmed is a *prerequisite*, not the
   AIOps implementation itself.

## What needs to be enabled next (identification only - not enabled here)

- A Diagnostic Setting on the AKS resource, targeting the existing
  `log-credpays1` workspace, for control-plane log categories - the one
  confirmed, real gap. (Worth deciding at the same time whether Key
  Vault, PostgreSQL, and ACR should get their own Diagnostic Settings
  too, given all three were also confirmed empty.)
- A scoped decision on Application Insights (or an alternative tracing
  approach) purely for the tracing gap - not as a general metrics
  addition, which would duplicate existing Prometheus instrumentation.
- Optionally, and lower urgency: revisit `useAADAuth: false` on the
  monitoring addon as a security modernization item - not because
  anything is currently broken, but because AAD-based ingestion auth is
  the direction Microsoft has been steering the platform overall.

## Architecture

```
   CONFIRMED WORKING, LIVE-VERIFIED
   ┌───────────────────────────────────────────┐
   │  Log Analytics Workspace (real row counts)   │
   │  Container Insights / Azure Monitor Agent    │
   │  Kubernetes Events (KubeEvents, 88 rows/24h) │
   │  Activity Log · Resource Health (Available)  │
   │  Managed Identity + role (legacy auth path)  │
   └───────────────────────────────────────────┘

   AVAILABLE BY DEFAULT, NOT YET USED IN ANY DASHBOARD/AI CONTEXT
   ┌───────────────────────────────────────────┐
   │  Azure Metrics                                │
   └───────────────────────────────────────────┘

   CONFIRMED REAL GAP (the only one that survived verification)
   ┌───────────────────────────────────────────┐
   │  Diagnostic Settings - empty on AKS, Key      │
   │   Vault, PostgreSQL, and ACR, all confirmed   │
   │  → AzureDiagnostics table: 0 rows             │
   └───────────────────────────────────────────┘

   DELIBERATE SCOPE DECISIONS, NOT OVERSIGHTS
   ┌───────────────────────────────────────────┐
   │  Distributed tracing - not implemented        │
   │  AI correlation layer - next phase, not this  │
   │   one                                         │
   └───────────────────────────────────────────┘
```

## Azure Portal Navigation / Verification Steps / Expected Result

Not new content - this chapter is the synthesis of every verification
step across Chapters 3-12, now confirmed live via direct `az` CLI
queries rather than Portal clicking alone (both are valid verification
paths; CLI was simply faster for confirming many resources in one
session).

## Troubleshooting

Not applicable - see the dedicated chapter for whichever specific gap
needs closing (Chapter 9 for Diagnostic Settings - the one confirmed
real gap).

## Interview Questions

1. **Q: Which of this workbook's originally "unknown" items turned out
   to already be working, once actually verified?**
   A: Kubernetes Event centralization (confirmed via `KubeEvents`
   having 88 rows including a real, previously-diagnosed incident) and
   the general Log Analytics/Container Insights pipeline (confirmed via
   real row counts in `KubePodInventory`, `ContainerInventory`,
   `Heartbeat`, and `KubeNodeInventory`).

2. **Q: Which originally-assumed architecture turned out to be wrong,
   and what was actually found instead?**
   A: Chapter 10 assumed the modern, DCR-based Azure Monitor Agent
   model. Live verification found **zero** Data Collection Rules or
   Endpoints anywhere in the subscription - this cluster actually uses
   the older, direct workspace-link model instead, which is a
   different but equally valid, fully-supported configuration.

3. **Q: What is the one gap that survived full live verification, and
   what specifically confirms it?**
   A: AKS control-plane log routing. `az monitor diagnostic-settings
   list` returned an empty list for the AKS cluster (and also for Key
   Vault, PostgreSQL, and ACR), and the `AzureDiagnostics` table
   independently confirmed 0 rows - two independent checks agreeing.

4. **Q: Why is finding out an original assumption was wrong (the DCR
   question) still a successful outcome for this workbook?**
   A: Because the goal was never to guess correctly - it was to reach a
   confirmed, accurate picture of the real system. A corrected
   assumption, backed by real evidence, is more valuable than an
   unverified guess that happened to sound plausible.

## Best Practices

- Prefer live verification over inference whenever real access is
  available - this chapter's most valuable findings (Kubernetes Events
  working, the DCR assumption being wrong) only emerged from actually
  querying the system, not from reasoning about what "should" be true.
- Keep "confirmed," "available by default," and "genuine gap" visually
  distinct, as this chapter does - conflating them is how gap analyses
  become either falsely reassuring or needlessly alarming.
- When live verification contradicts an earlier assumption, correct the
  earlier material explicitly (as Chapters 10-11 now do) rather than
  quietly overwriting it - the correction itself is valuable teaching
  content.

## Common Mistakes

- **Treating an educated guess as equivalent to a verified fact** -
  this chapter's own Chapter 10 prediction (a DCR "should" exist) is a
  direct example of a reasonable, well-justified guess that turned out
  incomplete once actually checked.
- **Scope-creeping this Gap Analysis into starting the AIOps build
  itself** - identifying that the AI correlation layer doesn't exist is
  in scope; building it is not.
- **Assuming a general "data is flowing" statement resolves every
  specific sub-question automatically** - it took direct, targeted
  queries against `KubeEvents`, `AzureDiagnostics`, and the DCR resource
  type specifically to actually close out each open item individually.

---

# Chapter 14 - Implementation Roadmap

## Objective

By the end of this chapter, you will have an ordered plan for closing
Chapter 13's gaps - described step by step, in plain language, with **no
commands of any kind**. Executing this roadmap is deliberately a future,
separate phase.

## Theory

A roadmap written *after* a real assessment (Chapters 1-13) looks
different from one written speculatively - it can skip steps already
proven unnecessary (most of the "enable Azure Monitor" work, since it's
already confirmed working) and focus effort precisely on the real gaps.
That's the entire value of having done the assessment first.

## The Roadmap

### Step 1 - Verify Existing Resources

Already substantially done by this workbook (Chapters 3-11) and
reinforced by direct confirmation that data is flowing. What remains
under this step, specifically: individually confirm the exact Diagnostic
Settings state (Chapter 9) and Kubernetes Event capture state (Chapter
7) that this workbook left open - not because anything is assumed
broken, but because "probably fine" isn't the same as "confirmed,"
and both feed directly into Step 2's scope.

### Step 2 - Enable Missing Azure Monitoring Components

Only after Step 1 produces a definitive answer for each open item. If
(and only if) confirmed missing:
- A Diagnostic Setting on the AKS resource, routing control-plane log
  categories to the existing Log Analytics Workspace.
- Whatever specific gap Kubernetes Event verification reveals (this
  could range from "nothing needed, it's already captured" to "a
  dedicated Event-forwarding mechanism is required" - Step 1's outcome
  determines which).
- A scoped decision (not a default "yes") on Application Insights or an
  alternative, purely for the tracing gap.

This step is described here as *what* would need enabling, in what
order, and why - not *how*, since that's implementation work belonging
to a later phase.

### Step 3 - Verify Data Flow

After anything from Step 2 is actually enabled (in a later phase), the
same category of verification this workbook already modeled in Chapters
6, 7, and 9 - confirm new data actually appears in the expected Log
Analytics tables, at the expected volume, before assuming success.

### Step 4 - Validate Metrics

Confirm Azure Metrics, Prometheus metrics, and business metrics all
remain internally consistent with each other post-change (the same
cross-checking approach modeled in Chapter 8) - a new Diagnostic Setting
or agent change should never silently alter existing metric behavior.

### Step 5 - Validate Logs

Confirm log data (both container-level, already working, and any newly
enabled control-plane logs from Step 2) is queryable, complete, and
retained as expected (revisiting Chapter 6's retention/pricing
understanding against real, current data volume once new sources are
added).

### Step 6 - Integrate with AI Service

The actual AIOps phase - only once every data source in Chapter 12's
table has a confirmed, working state (whether "actively flowing," "
available by default," or "deliberately out of scope"), design and
build the correlation layer that lets an AI system query across all of
them together. Explicitly the *next project phase*, not part of Cloud
Monitoring.

## Architecture

```
Step 1: Verify              (mostly done - 2 specific items remain open)
   │
   ▼
Step 2: Enable missing       (scoped only to whatever Step 1 confirms
        components            is actually missing - not a blanket "turn
                              everything on")
   │
   ▼
Step 3: Verify data flow     (same rigor as this workbook already used)
   │
   ▼
Step 4: Validate metrics     ┐
Step 5: Validate logs        ┘  (cross-check against Chapters 6-8's
                                  established expectations)
   │
   ▼
Step 6: Integrate with AI    (the AIOps phase itself - a new,
        Service               separate body of work)
```

## Azure Portal Navigation / Verification Steps

Not new - Steps 1, 3, 4, and 5 reuse this workbook's own Chapters 4-11
navigation and verification patterns directly; this chapter sequences
*when* to apply them, not *how*.

## Expected Result

A team (or a future version of this same assessment) picking up this
roadmap should be able to start at Step 1, already knowing most of it is
done, and reach Step 6 with full confidence that every data source
Chapter 12 identified is genuinely ready for AI consumption - not
assumed ready.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Tempted to skip straight to Step 6 because "the data's already flowing" | Confuses "the core pipeline works" (confirmed) with "every source needed for AIOps is ready" (not yet fully confirmed, per Chapter 13) - Steps 1-5 exist specifically to close that gap safely |
| Unsure whether a given change belongs in Step 2 or Step 6 | If it's about *collecting* a data source, it's Step 2; if it's about *reasoning across* already-collected data sources, it's Step 6 |

## Interview Questions

1. **Q: Why does this roadmap's Step 1 say "already substantially
   done" instead of starting fresh?**
   A: Because this entire workbook (Chapters 1-13) already performed
   that verification - a roadmap that ignores completed assessment work
   would waste the exact effort this phase existed to produce.

2. **Q: Why is Step 2 conditional ("only if confirmed missing") rather
   than a fixed list of things to enable?**
   A: Enabling something not actually missing (e.g. re-enabling
   Container Insights, which already works) wastes effort and can
   introduce duplicate data/cost. Step 2's scope is entirely determined
   by Step 1's findings, not decided in advance.

3. **Q: Why is "Integrate with AI Service" Step 6 and not folded into
   this Cloud Monitoring phase directly?**
   A: Phase boundaries matter for exactly the reason this project's
   roadmap has consistently maintained them - Cloud Monitoring's job is
   making sure every data source *exists and is verified*; building the
   thing that *reasons across* them is a distinct body of work with its
   own design questions, deliberately scoped as the next phase.

## Best Practices

- Never begin Step 2 without a definitive Step 1 answer - "probably
  fine" is exactly the ambiguity this whole workbook was built to
  eliminate.
- Re-run Steps 3-5's validation approach after *any* future change to
  what's collected, not just the first time - regressions in telemetry
  pipelines are easy to introduce silently.

## Common Mistakes

- **Jumping to Step 6 because the underlying data sources sound ready**
  - "sound ready" and "individually confirmed ready, per Chapter 13's
  distinctions" are not the same claim.
- **Treating this roadmap as a batch of work to do all at once** - it's
  explicitly sequential, and Step 2's very existence depends on what
  Step 1 finds.

---

# Interview Questions - Azure Monitoring (75+)

Organized by topic. Answers are intentionally concise (1-2 sentences) -
for the fuller, discussion-style treatment of the most important
concepts, see each chapter's own Interview Questions section above.

## A. Azure Monitor Fundamentals (1-10)

1. **Q: Is Azure Monitor a single product?**
   A: No - an umbrella brand over several distinct backends (a metrics
   store, Log Analytics for logs, Activity Log, Resource Health) and
   features (Container Insights, Diagnostic Settings, Application
   Insights).

2. **Q: What are the two fundamentally different types of telemetry
   Azure Monitor handles, and why do they need different storage?**
   A: Metrics (numeric time series) and logs (structured/free-text
   events) - different access patterns and volumes make a single
   storage engine wrong for both.

3. **Q: Where do Azure Metrics live, storage-wise?**
   A: A separate, purpose-built metrics time-series store - not the Log
   Analytics Workspace.

4. **Q: Is Azure Metrics collection automatic, or does it require
   configuration?**
   A: Automatic, for essentially every Azure resource type, with no
   agent or setup required.

5. **Q: What query language is used against a Log Analytics Workspace?**
   A: KQL (Kusto Query Language).

6. **Q: Name the four Azure Monitor family members that are active by
   default with zero configuration for any resource.**
   A: Azure Metrics, Activity Log, Resource Health, and (at the
   subscription level) the Azure Monitor umbrella itself.

7. **Q: What's the relationship between Prometheus and Azure Monitor in
   a project like CredPay?**
   A: Layered, not competing - Prometheus covers inside-the-cluster
   telemetry; Azure Monitor covers the Azure platform layer Prometheus
   cannot see.

8. **Q: Can Azure Monitor see inside a container's application logic
   (e.g. a specific business error)?**
   A: Only if that data is captured as a log line (via Container
   Insights) or explicit custom telemetry (e.g. Application Insights) -
   it has no automatic insight into application-level business logic.

9. **Q: What does "platform-level" mean when describing what Azure
   Monitor sees that Prometheus cannot?**
   A: The Azure infrastructure underneath Kubernetes' own awareness -
   e.g. the VM hosting a node, the managed database service, or a
   region-wide Azure incident - none of which is visible from inside the
   cluster.

10. **Q: Why is it a mistake to assume "Azure Monitor" and "Prometheus"
    are redundant?**
    A: They answer fundamentally different classes of questions -
    infrastructure/cluster-internal (Prometheus) versus
    platform/control-plane/audit (Azure Monitor) - and a real
    incident often needs both.

## B. Log Analytics Workspace (11-20)

11. **Q: What is a Log Analytics Workspace, technically?**
    A: A log data container built on the Kusto (Azure Data Explorer)
    engine, schema-flexible, queried in KQL.

12. **Q: How does data actually get from an AKS cluster into a Log
    Analytics Workspace?**
    A: Via an agent (Container Insights' `ama-logs`/`ama-logs-rs`),
    governed by a Data Collection Rule that defines what to collect and
    where to send it - never written directly by the cluster itself.

13. **Q: What does the `ContainerLog`/`ContainerLogV2` table store?**
    A: Raw stdout/stderr text output from every container.

14. **Q: What does `KubePodInventory` store, and how is it different
    from a live `kubectl get pods`?**
    A: Point-in-time snapshots of every Pod (namespace, phase,
    controller, node) - collected on an interval, not a real-time
    mirror.

15. **Q: What does `KubeNodeInventory` store?**
    A: Point-in-time snapshots of every node - status, labels, allocatable
    resources.

16. **Q: What does `InsightsMetrics` store?**
    A: Normalized performance metrics collected by Container Insights
    (CPU%, memory%, and similar), in a generic metric-name/value shape.

17. **Q: What does the `Heartbeat` table prove that other tables don't?**
    A: That the collection agent itself is alive and actively reporting
    - independent of whether any specific workload produced other data
    recently.

18. **Q: What does `AzureDiagnostics` store, and what's the one
    condition required for it to have any data?**
    A: Logs from resources whose Diagnostic Settings route data to this
    workspace - it only receives data if such a Diagnostic Setting
    actually exists; Container Insights does not populate it.

19. **Q: How does retention work on a Log Analytics Workspace?**
    A: A configurable retention period (commonly defaulting around 30
    days, extendable up to 730 days); data older than the retention
    period is automatically purged, and specific tables can sometimes
    have retention overrides.

20. **Q: What's the primary cost driver for a Log Analytics Workspace?**
    A: Data ingested (GB/day), plus any retention kept beyond the
    included free period.

## C. Container Insights (21-30)

21. **Q: What two Kubernetes workload types make up Container Insights'
    agent, and why two?**
    A: `ama-logs` (a DaemonSet, one per node, for node/container-level
    data) and `ama-logs-rs` (a single-replica Deployment, for
    cluster-wide inventory data that shouldn't be duplicated per node).

22. **Q: Is Container Insights' collection model push-based or
    pull-based?**
    A: Push-based - the agent actively collects and sends data out,
    unlike Prometheus's pull-based scraping model.

23. **Q: What Portal experience does Container Insights power directly?**
    A: The "Insights" tabs under an AKS resource's Monitoring section -
    Cluster, Nodes, Controllers, Containers, and Live Logs.

24. **Q: What's the difference between the "Live Logs" tab and logs
    stored in Log Analytics?**
    A: Live Logs is a real-time stream with no retention and requires
    separate Kubernetes RBAC; Log Analytics logs are the durable,
    KQL-queryable store.

25. **Q: Why might Container Insights' reported Pod count briefly
    disagree with a live `kubectl get pods`?**
    A: Container Insights collects inventory as point-in-time snapshots
    on an interval, not a continuous live mirror - a short lag is
    expected, not a bug.

26. **Q: Does Container Insights automatically capture AKS
    control-plane logs (e.g. `kube-audit`)?**
    A: No - that requires a separate Diagnostic Setting on the AKS
    resource itself; Container Insights covers workload-level data only.

27. **Q: What is a Workbook, in the context of Container Insights?**
    A: A Portal-native reporting feature offering pre-built or
    customizable visual reports over the same underlying Log Analytics
    data Container Insights collects.

28. **Q: What data does the `ama-logs` DaemonSet specifically collect,
    that `ama-logs-rs` does not?**
    A: Per-node, per-container data (logs, local performance counters) -
    things that genuinely differ machine-to-machine, which is why it
    runs once per node rather than once cluster-wide.

29. **Q: Can Container Insights potentially capture Kubernetes Events
    (like `FailedScheduling`)?**
    A: Possibly, depending on configuration - this is exactly the kind
    of thing that needs direct verification rather than being assumed
    either way.

30. **Q: Why does this project draw an analogy between Container
    Insights' two-workload-type split and its own Node
    Exporter/kube-state-metrics split?**
    A: Both independently arrived at the same architectural pattern -
    per-node data via a DaemonSet, cluster-wide data via a single
    Deployment - for the same underlying reason.

## D. Azure Metrics (31-38)

31. **Q: What granularity does Azure Metrics typically report AKS node
    CPU at?**
    A: The VM level, as seen by the underlying infrastructure - not the
    per-container granularity cAdvisor provides.

32. **Q: Where in the Portal do you view Azure Metrics for a specific
    resource?**
    A: That resource's own Monitoring → Metrics blade, or the global
    Azure Monitor hub's Metrics view with the resource selected.

33. **Q: Can two "CPU usage" numbers - one from Azure Metrics, one from
    Prometheus/cAdvisor - legitimately disagree without either being
    wrong?**
    A: Yes - they measure different layers (VM-level vs.
    container-level); disagreement is expected, not necessarily an
    error.

34. **Q: What's the tool called for interactively exploring Azure
    Metrics in the Portal?**
    A: Metrics Explorer.

35. **Q: Does viewing Azure Metrics require any agent installed in the
    cluster?**
    A: No - it's collected by the Azure platform itself, independent of
    anything running inside the cluster.

36. **Q: What kind of question can Azure Metrics answer that no amount
    of in-cluster Prometheus scraping ever could?**
    A: Anything about the underlying infrastructure's own behavior as
    Azure itself sees it - e.g. VM-level throttling invisible to
    Kubernetes.

37. **Q: What kind of question can business metrics answer that neither
    Azure Metrics nor generic infrastructure metrics ever could?**
    A: Anything phrased in business terms - "how many payments failed" -
    since neither Azure nor generic infra metrics have any visibility
    into application-level logic.

38. **Q: Are Azure Metrics, Prometheus metrics, and business metrics
    three names for the same data, or three genuinely different
    categories?**
    A: Three genuinely different categories, distinguished by what layer
    they observe (platform, cluster-internal, business-logic) - not
    interchangeable.

## E. Activity Log & Resource Health (39-45)

39. **Q: What does the Azure Activity Log record?**
    A: A subscription-wide audit trail of control-plane operations - who
    created, changed, or deleted a resource, and when.

40. **Q: Is the Activity Log the same thing as application or container
    logs?**
    A: No - it's specifically about changes to Azure resources
    themselves, not anything happening inside a running workload.

41. **Q: What question can the Activity Log answer that nothing inside
    the cluster ever could?**
    A: "Did someone change something in Azure itself right before this
    incident started?"

42. **Q: What does Resource Health report?**
    A: Whether a specific Azure resource is experiencing a
    platform-level problem right now, as reported by Azure itself.

43. **Q: How does Resource Health help distinguish two similar-looking
    incidents?**
    A: It separates "our application/configuration has a bug" from
    "Azure's own infrastructure is degraded" - two different problems
    that can look identical from inside the cluster.

44. **Q: Do the Activity Log and Resource Health require any setup?**
    A: No - both are available by default for every resource, with zero
    configuration.

45. **Q: Are Activity Log entries stored in the Log Analytics
    Workspace?**
    A: Not by default - it's a separate store, though it can optionally
    be routed into Log Analytics via a Diagnostic Setting if desired.

## F. Diagnostic Settings (46-53)

46. **Q: What does a Diagnostic Setting actually do?**
    A: Routes a specific resource's own logs/metrics to a chosen
    destination - it's a configuration, not a monitoring feature by
    itself.

47. **Q: Name all four possible Diagnostic Setting destinations.**
    A: Log Analytics Workspace, Storage Account, Event Hub, and Partner
    solution.

48. **Q: Is a Diagnostic Setting configured subscription-wide, or
    per-resource?**
    A: Per-resource, individually - there's no single switch that
    applies to every resource at once.

49. **Q: If an AKS cluster has Container Insights active, does it also
    need a Diagnostic Setting?**
    A: Only if you want AKS control-plane logs (e.g. `kube-audit`)
    captured - Container Insights covers workload-level data through a
    completely separate mechanism.

50. **Q: What table does data typically land in when a Diagnostic
    Setting routes it to Log Analytics?**
    A: Commonly `AzureDiagnostics`, though some resource types use
    dedicated resource-specific tables instead.

51. **Q: What does an empty Diagnostic Settings list for a resource
    mean?**
    A: That resource's own logs/metrics are not currently being routed
    anywhere for retention - a gap to note, not necessarily an error.

52. **Q: Besides the AKS cluster itself, name three other CredPay
    resources worth checking for Diagnostic Settings.**
    A: Key Vault, the PostgreSQL Flexible Server, and the Container
    Registry.

53. **Q: Can a single resource have more than one Diagnostic Setting,
    sending to different destinations?**
    A: Yes - multiple settings on the same resource, each with its own
    chosen categories and destination(s), are supported.

## G. Data Collection Rules & Endpoints (54-61)

54. **Q: What is a Data Collection Rule (DCR)?**
    A: An Azure resource defining what data an agent (like AMA) should
    collect and where it should send it.

55. **Q: How does the modern Azure Monitor Agent's reliance on DCRs
    differ from the legacy Log Analytics agent?**
    A: The legacy agent had collection behavior largely built into its
    own local configuration; the modern agent has no built-in collection
    logic at all - it's entirely driven by whichever DCR(s) it's
    associated with.

56. **Q: Draw a parallel between a DCR and something already built in
    this project.**
    A: A DCR plays the same conceptual role as this project's own
    `prometheus.yml` ConfigMap - separating "what to collect and where
    to send it" from the collector process itself.

57. **Q: Is a DCR visible via `kubectl`?**
    A: No - it's purely an Azure Resource Manager resource, entirely
    outside the Kubernetes API's visibility.

58. **Q: How is a DCR commonly named when auto-created by AKS
    monitoring onboarding?**
    A: Often with a recognizable prefix like `MSCI-` (Container
    Insights) or `MSProm-` (if Managed Prometheus is involved).

59. **Q: What is a Data Collection Endpoint (DCE), and is it always
    required alongside a DCR?**
    A: The ingestion URL a DCR's data flows through - not every DCR
    configuration requires a separate DCE resource.

60. **Q: If Container Insights is confirmed actively collecting data,
    what does that imply about the existence of a DCR?**
    A: A DCR must exist and be correctly associated with the cluster -
    the Azure Monitor Agent cannot collect anything without one.

61. **Q: Where would you check which resources a specific DCR applies
    to?**
    A: That DCR's own "Resources" tab in the Azure Portal.

## H. Managed Identity (62-68)

62. **Q: Why does the Azure Monitor Agent need an identity at all?**
    A: To authenticate to Azure's ingestion endpoints before it's
    permitted to write data - Azure does not accept unauthenticated
    writes.

63. **Q: What kind of identity is typically used, and why is it
    preferred over a stored secret?**
    A: A Managed Identity - Azure itself manages and rotates it, so no
    secret needs to be stored, distributed, or manually rotated.

64. **Q: Is the identity AKS uses for ACR image pulls necessarily the
    same one used for pushing monitoring data?**
    A: Not necessarily - they typically serve different purposes and
    should be verified independently, not assumed to be the same.

65. **Q: What specific role should be checked for on the identity
    responsible for pushing metrics to Azure Monitor?**
    A: Something like "Monitoring Metrics Publisher," verified via
    Access Control (IAM) on the target Log Analytics Workspace or DCR.

66. **Q: If monitoring data is confirmed flowing today, does that
    guarantee the identity/role setup is minimally and correctly
    configured?**
    A: No - it confirms it currently works, not that permissions are
    scoped minimally or correctly for the long term; those are
    different claims.

67. **Q: Where in the Portal would you find an AKS cluster's identity
    type (System-assigned vs. User-assigned)?**
    A: AKS cluster → Settings → Cluster configuration → Identity
    section.

68. **Q: Why might AMA use a separate identity from the cluster's
    "main" one shown on the Cluster configuration page?**
    A: Some onboarding paths provision a distinct identity specifically
    for monitoring purposes, separate from the cluster's primary
    identity used for other purposes like ACR pulls.

## I. Architecture, AIOps Readiness & Assessment Method (69-75+)

69. **Q: Name the six data sources this project identified as relevant
    to future AIOps readiness.**
    A: Prometheus, Azure Monitor (Metrics), Log Analytics (Logs),
    Kubernetes Events, Azure Resource Health, and Business Metrics.

70. **Q: Why is Kubernetes Event centralization called out as its own
    gap, separate from kube-state-metrics already being scraped?**
    A: kube-state-metrics reports object *state*; Events capture the
    specific *reason* for a state transition (e.g.
    `FailedScheduling`) - not automatically the same data.

71. **Q: Give a concrete example (from this project's own history) of
    why Kubernetes Events matter for AIOps.**
    A: This project's real capacity incident - a Pod stuck `Pending`
    with a `FailedScheduling`/`NotTriggerScaleUp` event - is exactly the
    shape of evidence an AI root-cause system would need, and that
    evidence lives in Events, not in a persisted metric.

72. **Q: Why does this workbook distinguish "confirmed directly,"
    "believed true from Terraform," and "genuinely unknown" as three
    separate assessment states?**
    A: Because treating them as equivalent produces false confidence -
    a config file describing intended state is not the same evidence as
    directly observing live state.

73. **Q: What specifically changed in this workbook's Gap Analysis once
    "data is flowing in the Azure Portal" was confirmed?**
    A: The core pipeline (Log Analytics Workspace, Container Insights,
    the DCR, the Managed Identity) moved from "unknown" to "confirmed
    working" - but two more specific items (control-plane log routing,
    Kubernetes Event capture) remained open, since the general
    confirmation didn't specifically cover them.

74. **Q: Why does this workbook's roadmap place "Integrate with AI
    Service" as its own final step rather than folding it into earlier
    steps?**
    A: Verifying/enabling data *sources* and building the layer that
    *reasons across* them are different bodies of work with different
    design questions - collapsing them risks starting AI integration on
    top of unverified data.

75. **Q: What is the single biggest risk of skipping a structured
    assessment phase like this one before starting an AIOps
    implementation?**
    A: Building AI logic that silently assumes a data source exists,
    is complete, or is correctly configured - when it was never
    actually verified - producing an AI system that fails quietly or
    gives confidently wrong answers rather than failing loudly.

76. **Q: Why does this project deliberately avoid Azure Managed
    Prometheus and Azure Managed Grafana, given they exist as
    alternatives?**
    A: A deliberate learning choice - the project's goal through Phases
    1-4 was building and operating the observability stack directly, in
    plain Kubernetes YAML, not outsourcing that operational work to a
    managed service.

77. **Q: What would be the very first thing to check if Log Analytics
    data suddenly stopped updating after previously working correctly?**
    A: The `Heartbeat` table - if it also stopped, the agent itself has
    a problem; if `Heartbeat` is still current but other tables aren't,
    the problem is more likely in the DCR's specific collection
    configuration.
