-- =====================================================================
-- CREDPAY - PostgreSQL schema (LEGACY bootstrap, kept for the AKS job)
-- =====================================================================
-- The schema is now owned by Flyway in user-service:
--   user-service/src/main/resources/db/migration/V*.sql
-- user-service applies those migrations on startup, locally and on AKS.
--
-- This file is still applied by k8s/postgres/schema-init-job.yaml on every
-- pipeline deploy. It is identical to V1__baseline.sql and only creates
-- tables that do not exist yet, so it never conflicts with Flyway (which
-- records an existing schema as version 1 and continues from V2).
-- Remove it together with the schema-init Job in the Kubernetes phase.
--
-- No sample data: accounts are created in Keycloak, and CredPay users are
-- created automatically on their first login.
-- =====================================================================

CREATE TABLE IF NOT EXISTS users (
    id            BIGSERIAL    PRIMARY KEY,
    full_name     VARCHAR(100) NOT NULL,
    email         VARCHAR(150) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cards (
    id           BIGSERIAL    PRIMARY KEY,
    user_id      BIGINT       NOT NULL,
    card_holder  VARCHAR(100) NOT NULL,
    card_number  VARCHAR(25)  NOT NULL,
    card_network VARCHAR(20),
    expiry_month SMALLINT     NOT NULL CHECK (expiry_month BETWEEN 1 AND 12),
    expiry_year  SMALLINT     NOT NULL CHECK (expiry_year >= 2024),
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_cards_user
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_cards_user_id ON cards (user_id);

CREATE TABLE IF NOT EXISTS payments (
    id             BIGSERIAL      PRIMARY KEY,
    user_id        BIGINT         NOT NULL,
    card_id        BIGINT,
    amount         NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
    upi_id         VARCHAR(100)   NOT NULL,
    transaction_id VARCHAR(30)    UNIQUE,
    status         VARCHAR(20)    NOT NULL DEFAULT 'PENDING'
                   CHECK (status IN ('PENDING', 'SUCCESS', 'FAILED')),
    created_at     TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_payments_user
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT fk_payments_card
        FOREIGN KEY (card_id) REFERENCES cards (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments (user_id);
