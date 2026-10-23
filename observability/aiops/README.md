# AIOps

The final layer of CredPay's observability roadmap: an AI Service that
consumes the telemetry the platform already produces (Prometheus,
Grafana, Azure Monitor/Log Analytics, Kubernetes) to generate health
summaries, root-cause analysis, and operational insight - on top of an
observability platform that is now complete.

This phase is architecture and documentation first. No AI service,
API, or automation code is implemented until the design is agreed on.

## What's here

| File | Purpose |
|---|---|
| `architecture/01-Observability-Data-Contract.md` | What observability data actually exists today - sources, retention, queries, correlation matrix. Descriptive only; no AI design. |
| `01-AIOps-Architecture.md` | The AI Service's own architecture - components, data flow, prompt flow, supported use cases, and how it integrates with the existing platform without modifying it. |

## Relationship between the two documents

The Data Contract (`architecture/01-Observability-Data-Contract.md`)
answers *what data exists and how it's queried*. This is the input side
- a fixed, verified inventory, not a design.

`01-AIOps-Architecture.md` answers *what the AI Service does with that
data* - its components, its prompt-building flow, its supported use
cases. This is the design side, built strictly on top of what the Data
Contract already confirmed exists - it does not assume any telemetry
source beyond what that document lists.

## Status

Design and documentation only. Nothing in this folder deploys,
enables, or runs anything - no Kubernetes YAML, no Terraform, no Azure
CLI, no application code.
