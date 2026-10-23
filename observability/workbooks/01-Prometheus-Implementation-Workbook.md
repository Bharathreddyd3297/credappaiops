# CredPay Observability - Implementation Workbook

**Module scope: Prometheus Server → Node Exporter → kube-state-metrics → Grafana**

This is a certification-style, from-zero workbook covering the first
four technologies in the CredPay observability roadmap. It is written to
be used for classroom teaching, self-paced learning, interview
preparation, and as living GitHub documentation.

> **What this workbook is, precisely:** a teaching document. Chapters 3-6
> describe **Prometheus, which is already implemented** in this repository
> at `observability/prometheus/01-prometheus-server/` - every command in
> those chapters is real and runnable today. Chapters 7-9 (Node Exporter,
> kube-state-metrics, Grafana) **teach the concepts, architecture, and
> commands for technologies not yet deployed in this repository** - they
> are documented here so the full journey is understandable end-to-end,
> but the actual Kubernetes manifests for those phases will only be
> created when their turn comes, one phase at a time, per the project's
> roadmap (see `observability/README.md`). Nothing in this workbook
> modifies the `credpay` application namespace, Terraform, or the Azure
> DevOps pipeline.

This workbook deliberately stops after Grafana. AlertManager, Azure
Monitor / Cloud Monitoring, Application Metrics, and AIOps are separate,
later modules - not covered here.

## How to use this workbook

- Read chapters in order - each one builds on the last.
- Every chapter follows the same shape: **Objective → Theory →
  Architecture → Why We Need This → Hands-On Implementation →
  Verification → Troubleshooting → Interview Questions → Summary.**
- "Hands-On Implementation" sections are meant to be typed and run, not
  just read - use a real terminal with `kubectl` pointed at the CredPay
  AKS cluster.
- Nothing here assumes you've used Prometheus, Grafana, or even
  Kubernetes monitoring before. Every term is defined the first time it's
  used.

## Table of Contents

| Chapter | Title | Status |
|---|---|---|
| 1 | Introduction to Observability | In this document |
| 2 | Observability Architecture | Coming next |
| 3 | Prometheus Server (Theory) | Coming next |
| 4 | Deploy Prometheus | Coming next |
| 5 | Verify Prometheus | Coming next |
| 6 | PromQL (50 examples) | Coming next |
| 7 | Node Exporter | Coming next |
| 8 | kube-state-metrics | Coming next |
| 9 | Grafana | Coming next |
| 10 | End-to-End Flow | Coming next |
| 11 | Troubleshooting Guide | Coming next |
| 12 | Interview Preparation (100+ questions) | Coming next |
| 13 | Hands-on Labs | Coming next |

---

# Chapter 1 - Introduction to Observability

## 1.1 Objective

By the end of this chapter, you will be able to:

- Explain, in your own words, what "observability" means and how it
  differs from "monitoring".
- Name the three pillars of observability and give a one-sentence
  definition of each.
- Explain why a dynamic system like Kubernetes specifically needs a tool
  like Prometheus, more than a traditional static server would.
- Look at CredPay's existing Kubernetes manifests and identify which
  pillar(s) of observability - if any - already exist today, before this
  workbook's implementation work begins.

## 1.2 Theory

### What problem are we actually solving?

Imagine CredPay's payment-service starts failing 5% of payment requests
at 2 AM. Nobody is looking at a screen. By the time a user complains the
next morning, the failing pods may have already been restarted by
Kubernetes, rescheduled to different nodes, and the direct evidence is
gone. The question you'll be asked is: **"what happened, and why?"**

Answering that question - after the fact, without having predicted the
exact question in advance - is what observability is for.

### What is Observability?

**Observability** is a property of a system: how well can you understand
its *internal* state just by looking at the data it produces *externally*
(metrics, logs, traces), without having to add new instrumentation or
guess?

A system is "observable" if, when something unexpected breaks, you can
ask a brand-new question you never anticipated - "which specific pod, on
which node, was slow, and was it correlated with a memory spike?" - and
answer it using data that was already being collected, with no code
change and no redeploy.

### Monitoring vs. Observability

These two words get used interchangeably, but they mean different things:

| | **Monitoring** | **Observability** |
|---|---|---|
| **Core idea** | Watching for known problems | Being able to investigate unknown problems |
| **Built from** | A fixed set of predefined checks ("is CPU > 80%?", "is the pod Running?") | Rich, high-cardinality telemetry you can query freely, after the fact |
| **Answers** | Questions you thought to ask *before* the incident | Questions you only think of *during* the incident |
| **Analogy** | A smoke detector - alerts you to one specific, predefined condition | A flight data recorder - captures everything, so you can reconstruct *any* sequence of events afterward |
| **Fails when** | Something breaks in a way nobody predicted and wrote a check for | (Ideally) never - the raw data to investigate is already there |

**Key idea to remember:** monitoring is a subset of what observability
gives you. You cannot have good observability without first collecting
good telemetry - which is exactly what Prometheus, Node Exporter,
kube-state-metrics, and Grafana build toward in this workbook. But
collecting telemetry (this workbook) and acting on it automatically
(alerting rules, AlertManager) are two different, separate concerns - the
second is a later module.

### The Three Pillars

Almost everything in observability tooling falls into one of three
categories:

```
        ┌───────────────────────────────────────────────┐
        │                 OBSERVABILITY                   │
        │                                                 │
        │   METRICS          LOGS            TRACES        │
        │  "How much?      "What          "Which path      │
        │   How many?       happened,      did this one     │
        │   How fast?"      exactly?"      request take,    │
        │                                  across services?" │
        │                                                 │
        │  numeric,        discrete,       a tree of        │
        │  aggregated      timestamped     timed spans      │
        │  over time       text events     across hops      │
        │                                                 │
        │  e.g. Prometheus  e.g. Azure     e.g. distributed  │
        │  (this module)    Log Analytics   tracing (not in  │
        │                   (later module)  this roadmap yet)│
        └───────────────────────────────────────────────┘
```

1. **Metrics** - a number, measured at a point in time, usually with
   labels attached (e.g. "payment-service is using 340MB of memory, on
   pod `payment-service-7d9f`, right now"). Cheap to store, fast to
   query, excellent for trends and thresholds - but a metric alone can't
   tell you *which specific request* failed. This is what **Prometheus**
   collects, and what this entire workbook is about.

2. **Logs** - a discrete, timestamped record of a specific event (e.g.
   `"2026-07-14T02:03:11Z ERROR payment-service: transaction TXN123 failed:
   connection to database timed out"`). Verbose, expensive to store at
   scale, but they carry the specific detail metrics can't. CredPay
   already produces logs today via `kubectl logs` and Azure Log Analytics
   (via the `terraform/modules/monitoring` Container Insights setup) -
   but querying/correlating them at scale is a **later module**
   (Cloud Monitoring), not this one.

3. **Traces** - follows one single request as it travels across multiple
   services (e.g. Ingress → frontend → payment-service → PostgreSQL),
   recording how long each hop took. Traces answer "where exactly did
   the time go, for *this one* slow request?" Not part of this roadmap
   yet - CredPay has no distributed tracing today.

### Why does Kubernetes specifically need Prometheus?

A traditional, pre-Kubernetes server is *static*: it has one hostname,
one IP address, and it exists until someone decommissions it. You could
monitor it by hardcoding its address into a config file once and never
touching that file again.

Kubernetes is the opposite - **everything is dynamic and disposable:**

- Pods get new IP addresses every time they restart or reschedule.
- The Horizontal Pod Autoscaler (already running in CredPay - see
  `k8s/user-service/hpa.yaml`, `k8s/payment-service/hpa.yaml`) can create
  or destroy Pods automatically, at any time, based on load.
- A blue/green deployment (already running in CredPay's `frontend`) means
  there are frequently *two full sets* of Pods alive at once, only one of
  which is "live".
- Nodes themselves can be added, removed, or replaced by AKS.

A monitoring tool for this environment cannot use a static target list -
it must **continuously ask the cluster "what exists right now?"** and
adjust automatically. This is exactly what Prometheus's Kubernetes
service discovery (`kubernetes_sd_configs` - covered in depth in Chapter
3) does, and it's the specific reason Prometheus (rather than, say, a
traditional static Nagios-style checker) is the standard choice for
Kubernetes.

## 1.3 Architecture

At this introductory stage, the architecture is simply: *what produces
telemetry, and what pillar does it belong to?*

```
                     CredPay on AKS (today, before this workbook's work)
        ┌───────────────────────────────────────────────────────┐
        │                                                        │
        │   frontend (blue/green)   user-service   payment-service│
        │        │                      │                │       │
        │        │  produces            │  produces       │  produces
        │        ▼                      ▼                ▼       │
        │   kubectl logs           kubectl logs      kubectl logs │
        │   (LOGS pillar - exists today, manually viewed only)     │
        │                                                        │
        │   readinessProbe /       readinessProbe /  readinessProbe/│
        │   livenessProbe          livenessProbe     livenessProbe │
        │   (a PRIMITIVE, per-pod  health signal - not a metric    │
        │    you can query historically or graph)                 │
        │                                                        │
        └───────────────────────────────────────────────────────┘

                     After this workbook (the target state)
        ┌───────────────────────────────────────────────────────┐
        │  frontend, user-service, payment-service, AKS nodes,    │
        │  Kubernetes objects (Deployments, Pods, Services...)    │
        │        │              │                  │              │
        │        ▼              ▼                  ▼              │
        │   Node Exporter   kube-state-metrics   (app metrics -    │
        │   (Ch. 7)         (Ch. 8)               later module)    │
        │        │              │                                 │
        │        └──────┬───────┘                                 │
        │               ▼                                         │
        │          Prometheus (Ch. 3-6)  ◄── already implemented   │
        │               │                                         │
        │               ▼                                         │
        │            Grafana (Ch. 9)                               │
        │      (dashboards, humans look here)                     │
        └───────────────────────────────────────────────────────┘
```

Chapter 2 expands this into a full, labeled architecture diagram with
every data flow explained. For now, the only thing to internalize is:
**CredPay already produces some raw signal (logs, probe results) - this
workbook's job is to turn that into queryable, graphable metrics.**

## 1.4 Why We Need This

Concretely, for CredPay:

- **Blue/green deployments** mean two versions of the frontend run
  simultaneously. Without metrics, you cannot answer "is the *new* green
  deployment actually healthier than blue was, under real traffic?" -
  you'd be guessing from a handful of manual `kubectl logs` checks.
- **HPA autoscaling** on `user-service` and `payment-service` already
  exists - but today there's no way to *see* it happening, historically,
  as a graph. Did it scale up because of a genuine traffic spike, or a
  bug causing a CPU loop? Metrics answer this; today, nothing does.
- **Multiple independent services** (frontend, user-service,
  payment-service, PostgreSQL) mean a single user-facing failure (a
  failed payment) could originate in any of four places. Without
  metrics/dashboards, diagnosing this means SSH-adjacent guesswork
  (`kubectl logs`, one Deployment at a time); with them, it's a five
  second dashboard check.
- **This is a teaching capstone project** - the whole point of this
  module is that "the app works" and "the app is observable" are
  different achievements, and enterprise systems need both.

## 1.5 Hands-On Implementation

There is nothing to deploy yet in this chapter - but there is something
real to *observe*, using only tools CredPay already has. This grounds the
next 12 chapters in the actual state of the cluster before we change
anything.

**Step 1 - Look at what "logs" already exist:**

```bash
kubectl logs deployment/payment-service -n credpay --tail=20
```

Notice: this is raw text, one Pod at a time, with no aggregation, no
history beyond what the container has retained, and no way to ask "how
many errors occurred across all pods in the last hour?" That gap is
exactly what a proper logs pipeline (a later module) would close.

**Step 2 - Look at what a "probe" tells you, and what it doesn't:**

```bash
kubectl describe pod -n credpay -l app.kubernetes.io/name=payment-service
```

Find the `Liveness` / `Readiness` lines in the output. Notice: this tells
you **pass/fail right now**, for **this one pod** - it cannot tell you
"how has response latency trended over the last 24 hours?" That gap is
exactly what Prometheus metrics (Chapters 3-6) close.

**Step 3 - Confirm there are currently zero metrics being collected:**

```bash
kubectl get pods -A | grep -i prometheus
```

If you're doing this before Chapter 4's deployment work, this returns
nothing - confirming the starting point this workbook builds from.

## 1.6 Verification

Self-check before moving to Chapter 2 - you should be able to answer all
of these without looking back at the theory section:

| # | Question | You should be able to say... |
|---|---|---|
| 1 | What's the difference between monitoring and observability? | Monitoring = predefined checks; Observability = ability to answer *new* questions from existing data |
| 2 | Name the three pillars | Metrics, Logs, Traces |
| 3 | Which pillar does Prometheus collect? | Metrics |
| 4 | Which pillar(s) does CredPay already produce today, before this workbook? | Logs (via `kubectl logs`) and primitive per-pod health (probes) - not true metrics |
| 5 | Why can't a static target list work for Kubernetes monitoring? | Pods/IPs are ephemeral - autoscaling and blue/green mean the set of live targets constantly changes |

## 1.7 Troubleshooting

This chapter is conceptual, so "troubleshooting" here means **common
misunderstandings** to correct early, before they cause confusion later
in the workbook:

| Misconception | Why it's wrong |
|---|---|
| "We have Grafana, so we have observability." | Grafana only *displays* data someone else collected (Prometheus). A dashboard with no underlying metrics pipeline shows nothing. Observability is the whole pipeline, not the last screen. |
| "Monitoring and observability are the same thing, just different words." | Monitoring is necessarily built on predefined checks; observability specifically means you can investigate things nobody predefined a check for. Every observability system includes monitoring, but not every monitoring system provides observability. |
| "Logs are enough - we don't need metrics." | Logs don't aggregate well (you can't cheaply ask "average CPU across 50 pods over 24 hours" from log text) and are expensive to store at high volume. Metrics and logs are complementary, not substitutes. |
| "Kubernetes probes (`readinessProbe`/`livenessProbe`) are the same as monitoring." | Probes are binary, per-pod, right-now signals used by Kubernetes itself to manage traffic/restarts. They are not historical, not queryable, and not visible outside that one pod's current state. |

## 1.8 Interview Questions

1. **Q: What is observability, in one sentence?**
   A: The ability to understand a system's internal state from the
   external data it produces, well enough to answer new, previously
   unplanned questions without shipping new code.

2. **Q: How is observability different from monitoring?**
   A: Monitoring checks for predefined, known failure conditions;
   observability is a broader property that lets you investigate
   failures nobody specifically anticipated, using already-collected
   telemetry.

3. **Q: Name and briefly define the three pillars of observability.**
   A: Metrics (numeric measurements over time), Logs (discrete timestamped
   event records), Traces (the path and timing of one request across
   multiple services).

4. **Q: Why is a pull-based metrics system particularly well-suited to
   Kubernetes, compared to a static, push-based one?**
   A: Kubernetes workloads are ephemeral - Pods get new IPs on every
   restart/reschedule, and autoscaling/blue-green mean the set of live
   targets is constantly changing. A system that actively discovers
   targets via the API server (pull + service discovery) adapts
   automatically; a static push target list would require manual updates
   every time the cluster topology changed.

5. **Q: Give a concrete example of a question observability can answer
   that monitoring alone cannot.**
   A: "Was last Tuesday's payment failure spike correlated with a
   memory pressure event on one specific node?" - nobody wrote a
   predefined check for that exact combination in advance; observability
   lets you construct that answer after the fact from existing metrics.

6. **Q: Why can't Kubernetes liveness/readiness probes substitute for a
   metrics pipeline?**
   A: Probes are binary (pass/fail), scoped to one Pod, and reflect only
   the current instant - they have no history, can't be graphed over
   time, and can't be aggregated across many Pods or correlated with
   other signals.

7. **Q: Why are metrics cheaper to store at scale than logs, generally?**
   A: Metrics are pre-aggregated numeric time series with a bounded set
   of label combinations (cardinality); logs are unbounded free-text
   events, one per occurrence, which grow linearly with traffic and carry
   much more (often redundant) data per entry.

8. **Q: In the CredPay project specifically, what real operational
   question is unanswerable today, before this workbook's work begins?**
   A: Any question requiring historical trends or cross-pod aggregation -
   e.g. "did the HPA scale `payment-service` up because of legitimate
   traffic growth, or a CPU-bound bug?" - since no metrics pipeline
   exists yet, only point-in-time logs and probe states.

## 1.9 Summary

- **Observability** = being able to answer new questions about a
  system's internal state from data it already exposes; **monitoring** =
  a fixed set of predefined checks. Observability is the larger goal;
  monitoring is one part of achieving it.
- The three pillars are **Metrics**, **Logs**, and **Traces** - this
  workbook is entirely about the Metrics pillar.
- Kubernetes's dynamic, ephemeral nature (autoscaling, blue/green,
  ever-changing Pod IPs) is precisely why a service-discovery-driven,
  pull-based tool like Prometheus fits it far better than a static
  target list would.
- CredPay today has logs (`kubectl logs`) and primitive per-pod health
  signals (probes) - but zero queryable, historical metrics. That gap is
  what Chapters 3-9 close.
- **Next: Chapter 2** builds a complete, labeled architecture diagram
  showing exactly how Node Exporter, kube-state-metrics, Prometheus, and
  Grafana fit together and hand data to one another.
