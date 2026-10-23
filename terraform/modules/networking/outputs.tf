output "vnet_id" {
  description = "Virtual network resource ID."
  value       = azurerm_virtual_network.this.id
}

output "vnet_name" {
  description = "Virtual network name."
  value       = azurerm_virtual_network.this.name
}

output "subnet_ids" {
  description = "Map of subnet name -> subnet ID."
  value = {
    aks      = azurerm_subnet.aks.id
    postgres = azurerm_subnet.postgres.id
  }
}
