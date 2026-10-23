-- =====================================================================
-- V2 - identity moves to Keycloak
-- =====================================================================
-- Passwords are no longer stored here: Keycloak owns credentials and
-- each CredPay user is linked to its Keycloak account by keycloak_id
-- (the token's "sub" claim). Rows are created on first login.
-- =====================================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS keycloak_id VARCHAR(64);
ALTER TABLE users ADD CONSTRAINT uq_users_keycloak_id UNIQUE (keycloak_id);

-- Plain-text passwords from the old login are deleted, not migrated
ALTER TABLE users DROP COLUMN IF EXISTS password_hash;

-- Payments created before transaction_id existed get a stable legacy id
UPDATE payments
   SET transaction_id = 'TXN-LEGACY-' || id
 WHERE transaction_id IS NULL;
