# =====================================================================
# CredPay - Root module: composition of all infrastructure modules
# =====================================================================

locals {
  # Name added to every resource (e.g. rg-credpay, aks-credpay)
  name_prefix = "credpays2"

  # Tags applied to every resource
  tags = {
    project    = "credpay"
    managed_by = "terraform"
  }
}

# ---------------------------------------------------------------------
# 1. Resource Group
# ---------------------------------------------------------------------
module "resource_group" {
  source = "./modules/resource-group"

  name     = "rg-${local.name_prefix}"
  location = var.location
  tags     = local.tags
}

# ---------------------------------------------------------------------
# 2. Networking (VNet + subnets)
# ---------------------------------------------------------------------
module "networking" {
  source = "./modules/networking"

  name_prefix            = local.name_prefix
  resource_group_name    = module.resource_group.name
  location               = module.resource_group.location
  vnet_address_space     = var.vnet_address_space
  aks_subnet_prefix      = var.aks_subnet_prefix
  postgres_subnet_prefix = var.postgres_subnet_prefix
  tags                   = local.tags
}

# ---------------------------------------------------------------------
# 3. Monitoring (Log Analytics + Container Insights)
# ---------------------------------------------------------------------
module "monitoring" {
  source = "./modules/monitoring"

  name_prefix         = local.name_prefix
  resource_group_name = module.resource_group.name
  location            = module.resource_group.location
  retention_days      = var.log_retention_days
  tags                = local.tags
}

# ---------------------------------------------------------------------
# 4. PostgreSQL Flexible Server (Phase 1: public access, SSL enforced)
# ---------------------------------------------------------------------
module "postgres" {
  source = "./modules/postgres"

  name_prefix         = local.name_prefix
  resource_group_name = module.resource_group.name
  location            = module.resource_group.location
  admin_username      = var.postgres_admin_username
  database_name       = var.database_name
  postgres_version    = var.postgres_version
  tags                = local.tags
}

# ---------------------------------------------------------------------
# 5. Azure Kubernetes Service
# ---------------------------------------------------------------------
module "aks" {
  source = "./modules/aks"

  name_prefix                = local.name_prefix
  resource_group_name        = module.resource_group.name
  location                   = module.resource_group.location
  node_count                 = var.node_count
  node_min_count             = var.node_min_count
  node_max_count             = var.node_max_count
  vm_size                    = var.vm_size
  vnet_subnet_id             = module.networking.subnet_ids["aks"]
  log_analytics_workspace_id = module.monitoring.workspace_id
  tags                       = local.tags
}

# ---------------------------------------------------------------------
# 6. Key Vault secrets (vault itself is created out-of-band, like the ACR)
# ---------------------------------------------------------------------
module "keyvault" {
  source = "./modules/keyvault"

  key_vault_name                = var.key_vault_name
  key_vault_resource_group_name = var.key_vault_resource_group_name
  postgres_fqdn                 = module.postgres.fqdn
  postgres_database_name        = module.postgres.database_name
  postgres_admin_username       = module.postgres.admin_username
  postgres_admin_password       = module.postgres.admin_password
}
