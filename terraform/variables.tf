# =====================================================================
# CredPay - Input Variables
# =====================================================================

# Azure Subscription ID
variable "subscription_id" {
  type = string
}

# Azure Region (e.g. eastus)
variable "location" {
  type    = string
  default = "canadacentral"
}

# ----- Networking -----

# Virtual Network address range
variable "vnet_address_space" {
  type    = string
  default = "10.0.0.0/16"
}

# AKS subnet address range
variable "aks_subnet_prefix" {
  type    = string
  default = "10.0.0.0/20"
}

# PostgreSQL subnet address range
variable "postgres_subnet_prefix" {
  type    = string
  default = "10.0.16.0/24"
}

# ----- AKS -----

# Number of nodes to start with
variable "node_count" {
  type    = number
  default = 2
}

# Minimum nodes for autoscaling
variable "node_min_count" {
  type    = number
  default = 2
}

# Maximum nodes for autoscaling
variable "node_max_count" {
  type    = number
  default = 2
}

# Size of each AKS node (VM)
variable "vm_size" {
  type    = string
  default = "Standard_D2alds_v6"
}

# ----- PostgreSQL -----

# PostgreSQL major version
variable "postgres_version" {
  type    = string
  default = "18"
}

# PostgreSQL admin username
variable "postgres_admin_username" {
  type    = string
  default = "credpayadmin"
}

# Database name
variable "database_name" {
  type    = string
  default = "credpay"
}

# ----- Monitoring -----

# Log Analytics retention in days
variable "log_retention_days" {
  type    = number
  default = 30
}

# ----- Key Vault -----
# The vault itself is created out-of-band (same pattern as the ACR) -
# Terraform only looks it up and writes the PostgreSQL secrets into it.

# Name of the existing Azure Key Vault
variable "key_vault_name" {
  type = string
}

# Resource group containing the existing Key Vault
variable "key_vault_resource_group_name" {
  type = string
}
