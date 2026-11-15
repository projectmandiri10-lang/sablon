-- Skema D1 (SQLite) untuk sablon-db.
-- Konversi dari Postgres: uuid -> TEXT, timestamptz -> TEXT ISO-8601,
-- jsonb -> TEXT JSON, boolean -> INTEGER 0/1.
-- Tanpa RLS/trigger: D1 hanya diakses Worker; updated_at di-set Worker.

CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'superuser', 'superadmin')),
  is_unlimited INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  password_hash TEXT,
  salt TEXT,
  auth_provider TEXT NOT NULL DEFAULT 'password' CHECK (auth_provider IN ('password', 'google')),
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS credit_ledger (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  amount_idr INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('credit', 'debit')),
  reason TEXT NOT NULL,
  reference_id TEXT,
  created_by TEXT REFERENCES profiles(id),
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  project_name TEXT NOT NULL DEFAULT 'Project Vector',
  input_mode TEXT NOT NULL CHECK (input_mode IN ('ready_trace', 'ai_redraw')),
  production_type TEXT NOT NULL CHECK (production_type IN ('sticker', 'sablon')),
  status TEXT NOT NULL DEFAULT 'done',
  price_idr INTEGER NOT NULL DEFAULT 0,
  separation_film_count INTEGER NOT NULL DEFAULT 0,
  settings TEXT NOT NULL DEFAULT '{}',
  manifest TEXT NOT NULL DEFAULT '{}',
  ai_ledger_id TEXT REFERENCES credit_ledger(id),
  is_example_public INTEGER NOT NULL DEFAULT 0,
  example_published_at TEXT,
  deleted_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS manual_payments (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  marketplace TEXT NOT NULL DEFAULT 'shopee',
  order_ref TEXT,
  amount_idr INTEGER NOT NULL CHECK (amount_idr > 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  notes TEXT,
  rejected_reason TEXT,
  approved_by TEXT REFERENCES profiles(id),
  approved_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS pricing_rules (
  key TEXT PRIMARY KEY,
  amount_idr INTEGER NOT NULL CHECK (amount_idr >= 0),
  active INTEGER NOT NULL DEFAULT 1,
  description TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT '{}',
  is_public INTEGER NOT NULL DEFAULT 0,
  description TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS contact_messages (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'read', 'replied')),
  replied_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS payment_transactions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'midtrans',
  order_id TEXT NOT NULL,
  external_transaction_id TEXT,
  amount_idr INTEGER NOT NULL CHECK (amount_idr >= 2000),
  base_amount_idr INTEGER,
  unique_code INTEGER,
  currency TEXT NOT NULL DEFAULT 'IDR',
  status TEXT NOT NULL DEFAULT 'pending',
  payment_type TEXT,
  snap_token TEXT,
  redirect_url TEXT,
  raw_create_response TEXT NOT NULL DEFAULT '{}',
  raw_notification TEXT NOT NULL DEFAULT '{}',
  credited_ledger_id TEXT REFERENCES credit_ledger(id),
  paid_at TEXT,
  expired_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS signup_bonus_claims (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  email TEXT NOT NULL DEFAULT '',
  device_id_hash TEXT,
  ip_hash TEXT,
  country_code TEXT,
  bonus_granted INTEGER NOT NULL DEFAULT 0,
  reason TEXT NOT NULL DEFAULT 'limit_reached',
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS business_finance_entries (
  id TEXT PRIMARY KEY,
  entry_date TEXT NOT NULL,
  entry_type TEXT NOT NULL CHECK (entry_type IN ('owner_capital', 'operational_expense', 'tax_payment', 'owner_withdrawal', 'bank_fee', 'other')),
  cash_direction TEXT NOT NULL CHECK (cash_direction IN ('in', 'out')),
  amount_idr INTEGER NOT NULL CHECK (amount_idr > 0),
  counterparty TEXT,
  document_ref TEXT,
  note TEXT,
  tax_treatment TEXT NOT NULL DEFAULT 'other' CHECK (tax_treatment IN ('non_taxable', 'deductible', 'tax_payment', 'other')),
  created_by TEXT REFERENCES profiles(id),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tax_rules (
  id TEXT PRIMARY KEY,
  tax_code TEXT NOT NULL DEFAULT 'umkm_final_revenue',
  rate_percent REAL NOT NULL CHECK (rate_percent >= 0),
  effective_from TEXT NOT NULL,
  effective_to TEXT,
  note TEXT,
  created_at TEXT NOT NULL,
  CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- Indeks mengikuti migration Postgres.
CREATE INDEX IF NOT EXISTS credit_ledger_user_created_idx ON credit_ledger (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS jobs_user_created_idx ON jobs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS manual_payments_user_created_idx ON manual_payments (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS manual_payments_status_created_idx ON manual_payments (status, created_at DESC);
CREATE INDEX IF NOT EXISTS jobs_example_public_created_idx ON jobs (is_example_public, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS jobs_deleted_created_idx ON jobs (deleted_at, created_at DESC);
CREATE INDEX IF NOT EXISTS contact_messages_status_created_idx ON contact_messages (status, created_at DESC);
CREATE INDEX IF NOT EXISTS payment_transactions_user_created_idx ON payment_transactions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS payment_transactions_status_created_idx ON payment_transactions (status, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS payment_transactions_order_id_unique_idx ON payment_transactions (order_id);
CREATE UNIQUE INDEX IF NOT EXISTS credit_ledger_midtrans_reference_unique_idx ON credit_ledger (reference_id, reason) WHERE reference_id IS NOT NULL AND reason = 'midtrans_payment';
CREATE UNIQUE INDEX IF NOT EXISTS credit_ledger_interactive_qris_reference_unique_idx ON credit_ledger (reference_id, reason) WHERE reference_id IS NOT NULL AND reason = 'interactive_qris_payment';
CREATE UNIQUE INDEX IF NOT EXISTS payment_transactions_interactive_qris_pending_amount_unique_idx ON payment_transactions (amount_idr) WHERE provider = 'interactive_qris' AND status = 'pending';
CREATE UNIQUE INDEX IF NOT EXISTS signup_bonus_claims_user_id_key ON signup_bonus_claims (user_id);
CREATE INDEX IF NOT EXISTS signup_bonus_claims_device_hash_idx ON signup_bonus_claims (device_id_hash) WHERE device_id_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS signup_bonus_claims_ip_hash_idx ON signup_bonus_claims (ip_hash) WHERE ip_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS signup_bonus_claims_created_at_idx ON signup_bonus_claims (created_at DESC);
CREATE INDEX IF NOT EXISTS business_finance_entries_entry_date_idx ON business_finance_entries (entry_date DESC);
CREATE INDEX IF NOT EXISTS business_finance_entries_entry_type_idx ON business_finance_entries (entry_type, entry_date DESC);
CREATE INDEX IF NOT EXISTS business_finance_entries_created_by_idx ON business_finance_entries (created_by) WHERE created_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS tax_rules_code_effective_from_idx ON tax_rules (tax_code, effective_from DESC);
CREATE INDEX IF NOT EXISTS tax_rules_effective_to_idx ON tax_rules (effective_to) WHERE effective_to IS NOT NULL;
CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions (user_id);
CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions (expires_at);