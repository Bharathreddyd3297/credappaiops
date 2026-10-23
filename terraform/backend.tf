
terraform {
  backend "azurerm" {
    resource_group_name  = "credpaybaserg"
    storage_account_name = "credpaystatesa"
    container_name       = "statefile"
    key                  = "credpay.terraform.tfstate"
  }
}
