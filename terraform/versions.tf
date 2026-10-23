# =====================================================================
# CredPay - Terraform & Provider version constraints
# =====================================================================
terraform {
  required_version = ">= 1.6.0"

  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 4.0" # latest stable AzureRM 4.x line
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }
}