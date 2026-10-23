# =====================================================================
# Key Vault module - pushes PostgreSQL credentials into an existing vault
# =====================================================================
# The vault is created out-of-band (like the ACR) with its own RBAC /
# access policy already granting this Terraform identity permission to
# set secrets - "Key Vault Secrets Officer" (RBAC) or a Set/List/Get
# access policy. No CSI driver, no Managed Identity: the pipeline later
# reads these secrets with the AzureKeyVault@2 task and creates a plain
# Kubernetes Secret from them.
# =====================================================================
data "azurerm_key_vault" "this" {
  name                = var.key_vault_name
  resource_group_name = var.key_vault_resource_group_name
}

resource "azurerm_key_vault_secret" "postgres_host" {
  name         = "postgres-host"
  value        = var.postgres_fqdn
  key_vault_id = data.azurerm_key_vault.this.id
}

resource "azurerm_key_vault_secret" "postgres_database" {
  name         = "postgres-db-name"
  value        = var.postgres_database_name
  key_vault_id = data.azurerm_key_vault.this.id
}

resource "azurerm_key_vault_secret" "postgres_username" {
  name         = "postgres-username"
  value        = var.postgres_admin_username
  key_vault_id = data.azurerm_key_vault.this.id
}

resource "azurerm_key_vault_secret" "postgres_password" {
  name         = "postgres-password"
  value        = var.postgres_admin_password
  key_vault_id = data.azurerm_key_vault.this.id
}
