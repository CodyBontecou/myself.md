-- Apply to the identity database before deploying explicit account linking.
-- Duplicate provider subjects must be investigated, never automatically merged.
CREATE UNIQUE INDEX IF NOT EXISTS account_provider_identity_unique ON account(providerId, accountId);
