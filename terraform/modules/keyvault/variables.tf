# =====================================================================
# Key Vault module - inputs
# =====================================================================

# The Key Vault itself is created OUT-OF-BAND (same pattern as the ACR) -
# this module only looks it up and writes secrets into it.
variable "key_vault_name" {
  type        = string
  description = "Name of the existing Azure Key Vault that receives the PostgreSQL secrets."
}

variable "key_vault_resource_group_name" {
  type        = string
  description = "Resource group that contains the existing Key Vault."
}

variable "postgres_fqdn" {
  type        = string
  description = "PostgreSQL Flexible Server FQDN."
}

variable "postgres_database_name" {
  type        = string
  description = "Application database name."
}

variable "postgres_admin_username" {
  type        = string
  description = "PostgreSQL administrator username."
}

variable "postgres_admin_password" {
  type        = string
  description = "PostgreSQL administrator password."
  sensitive   = true
}
