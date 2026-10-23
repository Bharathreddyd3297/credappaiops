# Cloud Monitoring

Azure-native monitoring **assessment** for CredPay - this phase is
currently assessment-only. Nothing here enables, deploys, or configures
any Azure service. No Kubernetes YAML, no Terraform, no Azure CLI.

## Scope of this phase

Before turning anything on, this phase answers three questions:

1. What Azure monitoring services already exist for this project (some
   were already provisioned by Terraform - see `terraform/modules/monitoring`)?
2. What's still missing that the upcoming AIOps phase will actually need?
3. How does Azure Monitor complement - not duplicate - the self-hosted
   Prometheus/Grafana stack already built in `prometheus/` and `grafana/`?

AlertManager has been dropped from this project's roadmap (assessed as
unnecessary). Cloud Monitoring is next; AIOps follows it, and is the
actual reason this assessment exists - the eventual AI Service needs
Prometheus metrics, Azure Monitor metrics, Log Analytics logs,
Kubernetes events, and Azure Resource Health together, and this
document maps what's already there against what needs to be built.

## What's here

| File | Purpose |
|---|---|
| `01-Azure-Cloud-Monitoring-Assessment.md` | The full assessment workbook - 14 chapters, beginner-friendly, heavy on exact Azure Portal navigation, ending in a gap analysis and a roadmap (not commands). |

## After this phase

Once the assessment is complete and gaps are identified, enabling the
missing pieces (Diagnostic Settings, Data Collection Rules, etc.) would
be a separate, later implementation phase - deliberately not part of
this one.
