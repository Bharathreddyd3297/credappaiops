

# ----- Generated admin password (never hardcoded) -----
resource "random_password" "admin" {
  length           = 24
  special          = true
  override_special = "!#$%&*()-_=+[]{}<>:?"
  min_lower        = 2
  min_upper        = 2
  min_numeric      = 2
  min_special      = 2
}

# ----- The server -----
resource "azurerm_postgresql_flexible_server" "this" {
  name                = "psql-${var.name_prefix}"
  resource_group_name = var.resource_group_name
  location            = var.location
  version             = var.postgres_version

  # Phase 1: public access (secured by SSL + firewall). No VNet integration.
  public_network_access_enabled = true

  administrator_login    = var.admin_username
  administrator_password = random_password.admin.result

  # Server size and storage (fixed for Phase 1)
  sku_name              = "B_Standard_B2s"
  storage_mb            = 32768
  backup_retention_days = 7

  tags = var.tags

  lifecycle {
    ignore_changes = [zone] # Azure may relocate the primary zone; don't churn.
  }
}

# ----- Application database -----
resource "azurerm_postgresql_flexible_server_database" "credpay" {
  name      = var.database_name
  server_id = azurerm_postgresql_flexible_server.this.id
  charset   = "UTF8"
  collation = "en_US.utf8"

  # lifecycle {
  #   prevent_destroy = true # guard the application database against accidental deletion
  # }
}

# ----- Enforce SSL/TLS for all client connections -----
resource "azurerm_postgresql_flexible_server_configuration" "require_ssl" {
  name      = "require_secure_transport"
  server_id = azurerm_postgresql_flexible_server.this.id
  value     = "ON"
}

# ----- Firewall: allow connections from Azure services (incl. AKS egress) -----
# The special 0.0.0.0 rule means "any Azure-internal service", which is the
# simplest way for the AKS pods to reach the DB in a Dev/Test setup.
resource "azurerm_postgresql_flexible_server_firewall_rule" "allow_azure" {
  name             = "AllowAzureServices"
  server_id        = azurerm_postgresql_flexible_server.this.id
  start_ip_address = "0.0.0.0"
  end_ip_address   = "0.0.0.0"
}
