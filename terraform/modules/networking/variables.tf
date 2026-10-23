# Name added to the resources
variable "name_prefix" {
  type = string
}

# Resource group name
variable "resource_group_name" {
  type = string
}

# Azure region
variable "location" {
  type = string
}

# Virtual Network address range
variable "vnet_address_space" {
  type = string
}

# AKS subnet address range
variable "aks_subnet_prefix" {
  type = string
}

# PostgreSQL subnet address range
variable "postgres_subnet_prefix" {
  type = string
}

# Tags to apply
variable "tags" {
  type    = map(string)
  default = {}
}
