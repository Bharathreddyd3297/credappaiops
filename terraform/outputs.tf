# =====================================================================
# CredPay - Root outputs
# =====================================================================

# ----- Resource Group -----
output "resource_group_name" {
  description = "Name of the resource group."
  value       = module.resource_group.name
}

# ----- Networking -----
output "vnet_id" {
  description = "Virtual network resource ID."
  value       = module.networking.vnet_id
}

output "subnet_ids" {
  description = "Map of subnet name -> subnet ID."
  value       = module.networking.subnet_ids
}

# ----- AKS -----
output "aks_cluster_name" {
  description = "AKS cluster name."
  value       = module.aks.cluster_name
}

output "aks_resource_group" {
  description = "Resource group that contains the AKS cluster."
  value       = module.resource_group.name
}

output "aks_kubelet_identity_object_id" {
  description = "Object ID of the AKS kubelet (node) managed identity."
  value       = module.aks.kubelet_identity_object_id
}

output "aks_oidc_issuer_url" {
  description = "OIDC issuer URL (needed for workload identity federation)."
  value       = module.aks.oidc_issuer_url
}

output "aks_node_resource_group" {
  description = "Auto-generated node resource group (MC_...)."
  value       = module.aks.node_resource_group
}

output "get_credentials_command" {
  description = "Convenience command to fetch kubeconfig."
  value       = "az aks get-credentials --resource-group ${module.resource_group.name} --name ${module.aks.cluster_name} --overwrite-existing"
}

# ----- PostgreSQL -----
output "postgres_server_name" {
  description = "PostgreSQL Flexible Server name."
  value       = module.postgres.server_name
}

output "postgres_fqdn" {
  description = "PostgreSQL fully-qualified domain name (public in Phase 1)."
  value       = module.postgres.fqdn
}

output "postgres_database_name" {
  description = "Application database name."
  value       = module.postgres.database_name
}

output "postgres_admin_username" {
  description = "PostgreSQL administrator username."
  value       = module.postgres.admin_username
}

output "postgres_admin_password" {
  description = "PostgreSQL administrator password (generated)."
  value       = module.postgres.admin_password
  sensitive   = true
}

# ----- Monitoring -----
output "log_analytics_workspace_id" {
  description = "Log Analytics workspace resource ID."
  value       = module.monitoring.workspace_id
}

# ----- Key Vault -----
output "key_vault_name" {
  description = "Key Vault holding the PostgreSQL secrets (read by the pipeline's AzureKeyVault@2 task)."
  value       = module.keyvault.key_vault_name
}
