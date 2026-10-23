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

# PostgreSQL admin username
variable "admin_username" {
  type = string
}

# Database name
variable "database_name" {
  type = string
}

# PostgreSQL major version
variable "postgres_version" {
  type = string
}

# Tags to apply
variable "tags" {
  type    = map(string)
  default = {}
}
