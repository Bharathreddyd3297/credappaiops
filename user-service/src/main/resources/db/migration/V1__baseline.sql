-- =====================================================================
-- V1 - baseline: the schema as it was before Flyway (schema.sql)
-- =====================================================================
-- Existing databases already have these tables: Flyway records them as
-- version 1 (spring.flyway.baseline-on-migrate) and only runs V2 onwards.
-- New, empty databases run this script first.
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
