# CredPay — Terraform Infrastructure (Phase 1)

Terraform code to provision the **Azure infrastructure** for the CredPay project.
This phase provisions infrastructure only — application deployment happens in later phases.

- **Terraform:** 1.6+
- **AzureRM provider:** 4.x

---

## Project Overview

CredPay is a microservices application (React frontend, Spring Boot user-service,
FastAPI payment-service). This Terraform project builds the Azure platform it will
run on: a network, a Kubernetes cluster, a PostgreSQL database, and monitoring.

---

## Architecture Diagram

```
                 Resource Group: rg-credpay
 ┌──────────────────────────────────────────────────────────┐
 │  Virtual Network (10.0.0.0/16)                             │
 │  ┌───────────────────────┐   ┌────────────────────────┐   │
 │  │ AKS Subnet            │   │ PostgreSQL Subnet      │   │
 │  │  ┌─────────────────┐  │   └────────────────────────┘   │
 │  │  │ AKS Cluster     │  │                                │
 │  │  │ 2–5 nodes       │──┼───────► PostgreSQL Flexible    │
 │  │  │ Standard_DS2_v2 │  │  SSL    Server (public access) │
 │  │  └────────┬────────┘  │         DB: credpay            │
 │  └───────────┼───────────┘                                │
 │              │ Container Insights                         │
 │              ▼                                            │
 │      Log Analytics Workspace                              │
 └──────────────────────────────────────────────────────────┘
```

---

## Resources Created

- ✅ Resource Group
- ✅ Virtual Network + 2 subnets (AKS, PostgreSQL)
- ✅ AKS Cluster — Azure CNI, Azure RBAC, System-Assigned Identity, autoscaling (2–5),
  `Standard_DS2_v2`, Container Insights. OIDC and Workload Identity are **enabled for
  future enhancements**.
- ✅ Azure Database for PostgreSQL Flexible Server — database `credpay`, random password,
  SSL enabled, public access (Phase 1)
- ✅ Log Analytics Workspace + Container Insights
- ✅ PostgreSQL secrets written into an **existing** Azure Key Vault (`postgres-host`,
  `postgres-db-name`, `postgres-username`, `postgres-password`) — the vault itself is
  created out-of-band, same as the ACR below.

---

## Resources NOT Created

- ❌ Azure Container Registry (an ACR named **`credproj`** already exists)
- ❌ Azure Key Vault (an existing vault is looked up by name/RG — see `modules/keyvault`)
- ❌ Application Gateway / AGIC / Azure Firewall / WAF
- ❌ Azure Bastion / Private Endpoints / Private DNS
- ❌ Role Assignments (no AcrPull / ACR attach)
- ❌ NGINX Ingress, Kubernetes manifests, Secrets, ConfigMaps, Helm

This project provisions Azure infrastructure only.

---

## Folder Structure

```
terraform/
├── backend.tf                 # remote state backend
├── provider.tf                # azurerm + random providers
├── versions.tf                # Terraform & provider versions
├── variables.tf               # input variables
├── outputs.tf                 # outputs
├── main.tf                    # calls the modules
├── terraform.tfvars.example   # sample variable values
└── modules/
    ├── resource-group/
    ├── networking/
    ├── aks/
    ├── postgres/
    ├── monitoring/
    └── keyvault/               # writes Postgres secrets into an existing Key Vault
```

---

## Prerequisites

- [Terraform](https://developer.hashicorp.com/terraform/downloads) 1.6+
- [Azure CLI](https://learn.microsoft.com/cli/azure/install-azure-cli)
- [kubectl](https://kubernetes.io/docs/tasks/tools/)
- An Azure subscription

---

## Remote Backend Configuration

The state is stored in Azure Storage. These are **bootstrap resources**, created
**manually one time** — they are **not** managed by this Terraform project:

| Resource | Name |
|----------|------|
| Resource Group | `CredProj` |
| Storage Account | `credprojstate` |
| Blob Container | `statefile` |

They are already referenced in [`backend.tf`](backend.tf), so `terraform init`
connects to them automatically.

---

## Authentication

**Local development** — log in with the Azure CLI; Terraform uses it automatically:

```bash
az login --use-device-code
az account set --subscription <subscription-id>
```

**Azure DevOps** — use an Azure Resource Manager service connection with the
`AzureCLI` task and `TerraformTaskV4`.

---

## Terraform Commands

```bash
# 1. Initialize (connects to the remote backend + downloads providers)
terraform init

# 2. Preview the changes
terraform plan

# 3. Create the infrastructure
terraform apply

# 4. Destroy the infrastructure (when finished)
terraform destroy
```

> Copy `terraform.tfvars.example` to `terraform.tfvars` and set `subscription_id`
> before running `plan`/`apply`.
>
> `key_vault_name` / `key_vault_resource_group_name` must point at an **existing**
> Key Vault created out-of-band (like the ACR). The identity running Terraform
> (your `az login` user, or the Azure DevOps service connection's SPN) needs
> permission to set secrets on it — e.g. the **Key Vault Secrets Officer** RBAC
> role, or a classic access policy with Get/List/Set on secrets.

---

## Connecting to AKS

```bash
az aks get-credentials \
  --resource-group  "$(terraform output -raw aks_resource_group)" \
  --name            "$(terraform output -raw aks_cluster_name)"

kubectl get nodes
```

---

## Outputs

| Output | Description |
|--------|-------------|
| `resource_group_name` | Resource group name |
| `vnet_id` | Virtual network ID |
| `subnet_ids` | Map of subnet name → ID |
| `aks_cluster_name` | AKS cluster name |
| `aks_resource_group` | Resource group of the cluster |
| `aks_node_resource_group` | Node resource group (`MC_...`) |
| `aks_oidc_issuer_url` | OIDC issuer URL |
| `postgres_server_name` | PostgreSQL server name |
| `postgres_fqdn` | PostgreSQL host FQDN |
| `postgres_database_name` | Database name (`credpay`) |
| `postgres_admin_username` | DB admin username |
| `postgres_admin_password` | DB admin password (sensitive) |
| `log_analytics_workspace_id` | Log Analytics workspace ID |
| `key_vault_name` | Key Vault that now holds the Postgres secrets |

View them with `terraform output` (add `-raw <name>` for a single value).

---

## Roadmap

| Phase | Goal |
|-------|------|
| **Phase 1** | Terraform infrastructure (this project) |
| **Phase 2** | Connect to AKS + install NGINX Ingress Controller |
| **Phase 3** | Deploy Kubernetes manifests — frontend, user-service, payment-service |
| **Phase 4** | Update application configuration — ConfigMaps, Secrets |
| **Phase 5** | Integrate AKS with the existing ACR (`credproj`) |
| **Phase 6** | ✅ Push PostgreSQL secrets into Azure Key Vault (this phase) — Azure DevOps pipeline reads them via `AzureKeyVault@2` and creates the Kubernetes Secret |
