# =====================================================================
# Azure Kubernetes Service
#  - System-assigned identity, Azure CNI + Azure network policy
#  - OIDC + Workload Identity (enabled for future use), Azure RBAC
#  - Autoscaling node pool, Container Insights
# =====================================================================
data "azurerm_client_config" "current" {}

resource "azurerm_kubernetes_cluster" "this" {
  name                = "aks-${var.name_prefix}"
  location            = var.location
  resource_group_name = var.resource_group_name
  dns_prefix          = var.name_prefix

  # Separate, auto-managed RG for cluster infra (VMSS, disks, LBs).
  node_resource_group = "rg-${var.name_prefix}-aks-nodes"

  # Keep the cluster patched automatically on the stable channel.
  automatic_upgrade_channel = "stable"
  node_os_upgrade_channel   = "NodeImage"



  # Azure RBAC for Kubernetes authorization (manage access with Azure roles).
  azure_active_directory_role_based_access_control {
    azure_rbac_enabled = true
    tenant_id          = data.azurerm_client_config.current.tenant_id
  }

  default_node_pool {
    name                 = "system"
    vm_size              = var.vm_size
    node_count           = var.node_count
    auto_scaling_enabled = true
    min_count            = var.node_min_count
    max_count            = var.node_max_count
    vnet_subnet_id       = var.vnet_subnet_id
    os_sku               = "Ubuntu"
    max_pods             = 60
    type                 = "VirtualMachineScaleSets"

    upgrade_settings {
      max_surge = "33%"
    }
  }

  identity {
    type = "SystemAssigned"
  }

  network_profile {
    network_plugin    = "azure"
    network_policy    = "azure"
    load_balancer_sku = "standard"

    # Internal IP ranges used by Kubernetes services (kept separate from
    # the VNet so they never overlap).
    service_cidr   = "10.240.0.0/16"
    dns_service_ip = "10.240.0.10"
  }

  # Container Insights -> Log Analytics.
  oms_agent {
    log_analytics_workspace_id = var.log_analytics_workspace_id
  }

  tags = var.tags

  lifecycle {
    # The autoscaler owns node_count at runtime - don't fight it on apply.
    ignore_changes = [default_node_pool[0].node_count]
  }
}


