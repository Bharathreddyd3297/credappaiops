-- =====================================================================
-- V3 - idempotent payments (used by payment-service)
-- =====================================================================
-- The client sends an Idempotency-Key header with each payment attempt.
-- A retry with the same key returns the original payment instead of
-- charging again. Keys are unique per user.
-- =====================================================================

ALTER TABLE payments ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(64);

CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_user_idempotency_key
    ON payments (user_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL;
