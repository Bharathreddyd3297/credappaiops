variable "name_prefix" {
  description = "Naming prefix (project-environment)."
  type        = string
}

variable "resource_group_name" {
  description = "Resource group name."
  type        = string
}

variable "location" {
  description = "Azure region."
  type        = string
}

variable "node_count" {
  description = "Initial node count."
  type        = number
}

variable "node_min_count" {
  description = "Autoscaler minimum node count."
  type        = number
}

variable "node_max_count" {
  description = "Autoscaler maximum node count."
  type        = number
}

variable "vm_size" {
  description = "Node VM size."
  type        = string
}

variable "vnet_subnet_id" {
  description = "Subnet ID for AKS nodes/pods."
  type        = string
}

variable "log_analytics_workspace_id" {
  description = "Log Analytics workspace ID for Container Insights."
  type        = string
}

variable "tags" {
  description = "Tags to apply."
  type        = map(string)
  default     = {}
}
