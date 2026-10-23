output "key_vault_name" {
  description = "Name of the Key Vault the secrets were written to."
  value       = data.azurerm_key_vault.this.name
}
