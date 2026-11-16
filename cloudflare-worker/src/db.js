// Lapisan data D1 (SQLite). Menggantikan seluruh call site PostgREST Supabase.
// Bentuk respons JSON dipertahankan persis agar kontrak API frontend tetap.
// Boolean disimpan INTEGER 0/1 dan JSON disimpan TEXT; keduanya dipetakan
// kembali ke boolean/object di batas modul ini.

const BOOLEAN_COLUMNS = {
  profiles: ['is_unlimited', 'is_active'],
  pricing_rules: ['active'],
  app_settings: ['is_public'],
  jobs: ['is_example_public'],
  signup_bonus_claims: ['bonus_granted'],
  interactive_qris_webhook_logs: ['secret_valid']
};

const JSON_COLUMNS = {
  credit_ledger: ['metadata'],
  jobs: ['settings', 'manifest'],
  app_settings: ['value'],
  payment_transactions: ['raw_create_response', 'raw_notification'],
  signup_bonus_claims: ['metadata'],
  interactive_qris_webhook_logs: ['amount_candidates']
};

const AUTOMATIC_PAYMENT_COLUMNS =
  'id,user_id,provider,order_id,external_transaction_id,amount_idr,base_amount_idr,unique_code,currency,status,payment_type,redirect_url,credited_ledger_id,paid_at,expired_at,created_at,updated_at';

const PROFILE_PUBLIC_COLUMNS = 'id,email,full_name,role,is_unlimited,is_active,deleted_at,created_at';

export function isDuplicateConstraintError(error) {
  const message = String(error?.message || '').toLowerCase();
  return message.includes('duplicate key') || message.includes('unique constraint');
}

function nowIso() {
  return new Date().toISOString();
}

function requireDb(env) {
  if (!env?.DB) throw new Error('Worker belum dikonfigurasi: binding D1 DB kosong.');
  return env.DB;
}

export async function dbAll(env, sql, params = []) {
  const result = await requireDb(env).prepare(sql).bind(...params).all();
  return result?.results || [];
}

export async function dbGet(env, sql, params = []) {
  return (await requireDb(env).prepare(sql).bind(...params).first()) || null;
}

export async function dbRun(env, sql, params = []) {
  return requireDb(env).prepare(sql).bind(...params).run();
}

function mapRow(table, row) {
  if (!row) return row;
  const mapped = { ...row };
  for (const column of BOOLEAN_COLUMNS[table] || []) {
    if (column in mapped) mapped[column] = mapped[column] === 1 || mapped[column] === true;
  }
  for (const column of JSON_COLUMNS[table] || []) {
    if (column in mapped && typeof mapped[column] === 'string') {
      try {
        mapped[column] = JSON.parse(mapped[column]);
      } catch {
        mapped[column] = {};
      }
    }
  }
  return mapped;
}

function mapRows(table, rows) {
  return (rows || []).map((row) => mapRow(table, row));
}

function toDbValue(table, column, value) {
  if ((BOOLEAN_COLUMNS[table] || []).includes(column)) return value ? 1 : 0;
  if ((JSON_COLUMNS[table] || []).includes(column)) {
    if (value === undefined || value === null) return '{}';
    return typeof value === 'string' ? value : JSON.stringify(value);
  }
  return value === undefined ? null : value;
}

async function getRowById(env, table, id, columns = '*') {
  const row = await dbGet(env, `SELECT ${columns} FROM ${table} WHERE id = ? LIMIT 1`, [id]);
  return mapRow(table, row);
}

async function insertRow(env, table, values) {
  const columns = Object.keys(values);
  const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`;
  await dbRun(env, sql, columns.map((column) => toDbValue(table, column, values[column])));
  return getRowById(env, table, values.id);
}

async function updateRowById(env, table, id, patch, { touchUpdatedAt = false } = {}) {
  const entries = Object.entries(patch).filter(([, value]) => value !== undefined);
  if (touchUpdatedAt) entries.push(['updated_at', nowIso()]);
  if (entries.length > 0) {
    const sql = `UPDATE ${table} SET ${entries.map(([column]) => `${column} = ?`).join(', ')} WHERE id = ?`;
    await dbRun(env, sql, [...entries.map(([column, value]) => toDbValue(table, column, value)), id]);
  }
  return getRowById(env, table, id);
}

// ---------------------------------------------------------------------------
// Profiles
// ---------------------------------------------------------------------------

export async function getProfile(env, userId) {
  const profile = await getRowById(env, 'profiles', userId, PROFILE_PUBLIC_COLUMNS);
  if (!profile || profile.is_active === false) throw new Error('Akun tidak aktif.');
  return profile;
}

export async function getProfileRaw(env, userId) {
  return getRowById(env, 'profiles', userId, PROFILE_PUBLIC_COLUMNS);
}

export async function getAuthProfileByEmail(env, email) {
  const row = await dbGet(env, 'SELECT * FROM profiles WHERE email = ? LIMIT 1', [String(email || '').trim().toLowerCase()]);
  return mapRow('profiles', row);
}

export async function getAuthProfileById(env, userId) {
  return getRowById(env, 'profiles', userId);
}

export async function createProfile(env, { id, email, fullName, role = 'user', isUnlimited = false, isActive = true, passwordHash = null, salt = null, authProvider = 'password' }) {
  const timestamp = nowIso();
  return insertRow(env, 'profiles', {
    id,
    email: String(email || '').trim().toLowerCase(),
    full_name: fullName || null,
    role,
    is_unlimited: isUnlimited,
    is_active: isActive,
    password_hash: passwordHash,
    salt,
    auth_provider: authProvider,
    deleted_at: null,
    created_at: timestamp,
    updated_at: timestamp
  });
}

export async function updateProfile(env, userId, patch) {
  return updateRowById(env, 'profiles', userId, patch, { touchUpdatedAt: true });
}

export async function listProfilesWithBalance(env) {
  const rows = await dbAll(
    env,
    `SELECT p.id, p.email, p.full_name, p.role, p.is_unlimited, p.is_active, p.deleted_at, p.created_at,
            COALESCE(SUM(l.amount_idr), 0) AS balance_sum
     FROM profiles p LEFT JOIN credit_ledger l ON l.user_id = p.id
     GROUP BY p.id ORDER BY p.created_at DESC`
  );
  return rows.map((row) => {
    const profile = mapRow('profiles', row);
    return { ...profile, balance: profile.is_unlimited ? null : Number(row.balance_sum) || 0 };
  });
}

export async function listProfileEmails(env) {
  return dbAll(env, 'SELECT id, email FROM profiles');
}

export async function listProfileRoles(env) {
  return dbAll(env, 'SELECT id, email, role FROM profiles');
}

export async function listAdminOverviewProfiles(env) {
  return mapRows('profiles', await dbAll(env, 'SELECT id, is_active, is_unlimited, deleted_at FROM profiles'));
}

export async function deleteUserCascade(env, userId) {
  const db = requireDb(env);
  await db.batch([
    db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(userId),
    db.prepare('DELETE FROM jobs WHERE user_id = ?').bind(userId),
    db.prepare('DELETE FROM payment_transactions WHERE user_id = ?').bind(userId),
    db.prepare('DELETE FROM manual_payments WHERE user_id = ? OR approved_by = ?').bind(userId, userId),
    db.prepare('DELETE FROM signup_bonus_claims WHERE user_id = ?').bind(userId),
    db.prepare('DELETE FROM business_finance_entries WHERE created_by = ?').bind(userId),
    db.prepare('DELETE FROM credit_ledger WHERE user_id = ? OR created_by = ?').bind(userId, userId),
    db.prepare('DELETE FROM profiles WHERE id = ?').bind(userId)
  ]);
}

// ---------------------------------------------------------------------------
// Credit ledger
// ---------------------------------------------------------------------------

export async function creditBalance(env, userId) {
  const row = await dbGet(env, 'SELECT COALESCE(SUM(amount_idr), 0) AS balance FROM credit_ledger WHERE user_id = ?', [userId]);
  return Number(row?.balance) || 0;
}

export async function insertLedger(env, { userId, amountIdr, kind, reason, referenceId, createdBy, metadata }) {
  const id = crypto.randomUUID();
  await insertRow(env, 'credit_ledger', {
    id,
    user_id: userId,
    amount_idr: amountIdr,
    kind,
    reason,
    reference_id: referenceId || null,
    created_by: createdBy || userId,
    metadata: metadata || {},
    created_at: nowIso()
  });
  return { id };
}

export async function findLedgerByReference(env, referenceId, reason) {
  const row = await dbGet(env, 'SELECT id FROM credit_ledger WHERE reference_id = ? AND reason = ? LIMIT 1', [referenceId, reason]);
  return row || null;
}

export async function getLedgerById(env, ledgerId) {
  return getRowById(env, 'credit_ledger', ledgerId, 'id,user_id,amount_idr,kind,reason,reference_id');
}

export async function listFinanceLedgerRows(env, { from, toExclusive }) {
  return mapRows(
    'credit_ledger',
    await dbAll(
      env,
      'SELECT id,user_id,amount_idr,kind,reason,reference_id,created_by,metadata,created_at FROM credit_ledger WHERE created_at >= ? AND created_at < ? ORDER BY created_at DESC LIMIT 5000',
      [from, toExclusive]
    )
  );
}

export async function listAdminOverviewLedger(env) {
  return dbAll(env, 'SELECT amount_idr,kind,reason,created_at FROM credit_ledger ORDER BY created_at DESC LIMIT 500');
}

// ---------------------------------------------------------------------------
// Jobs
// ---------------------------------------------------------------------------

export async function createJob(env, payload) {
  return insertRow(env, 'jobs', { id: crypto.randomUUID(), created_at: nowIso(), ...payload });
}

export async function getJobById(env, jobId) {
  return getRowById(env, 'jobs', jobId);
}

export async function updateJob(env, jobId, patch) {
  return updateRowById(env, 'jobs', jobId, patch);
}

export async function findJobByAiLedgerId(env, ledgerId) {
  const row = await dbGet(env, 'SELECT id FROM jobs WHERE ai_ledger_id = ? LIMIT 1', [ledgerId]);
  return row || null;
}

export async function listAdminJobs(env) {
  return mapRows(
    'jobs',
    await dbAll(
      env,
      'SELECT id,user_id,project_name,input_mode,production_type,status,price_idr,separation_film_count,created_at,manifest,is_example_public,example_published_at,deleted_at FROM jobs WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT 100'
    )
  );
}

export async function listExampleJobs(env) {
  return mapRows(
    'jobs',
    await dbAll(
      env,
      'SELECT id,user_id,project_name,input_mode,production_type,status,settings,manifest,created_at,is_example_public,example_published_at,deleted_at FROM jobs WHERE is_example_public = 1 AND status = ? AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 200',
      ['done']
    )
  );
}

export async function listJobsByIds(env, jobIds) {
  const ids = [...new Set((jobIds || []).filter(Boolean))];
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => '?').join(', ');
  return mapRows(
    'jobs',
    await dbAll(
      env,
      `SELECT id,user_id,project_name,input_mode,production_type,status,settings,manifest,created_at FROM jobs WHERE id IN (${placeholders}) AND status = ? ORDER BY created_at DESC LIMIT 50`,
      [...ids, 'done']
    )
  );
}

export async function listFinanceJobsRows(env, { from, toExclusive }) {
  return mapRows(
    'jobs',
    await dbAll(
      env,
      'SELECT id,user_id,project_name,input_mode,production_type,status,price_idr,separation_film_count,created_at FROM jobs WHERE created_at >= ? AND created_at < ? AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 5000',
      [from, toExclusive]
    )
  );
}

export async function listAdminOverviewJobs(env) {
  return mapRows(
    'jobs',
    await dbAll(env, 'SELECT id,price_idr,production_type,input_mode,created_at,deleted_at FROM jobs WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT 500')
  );
}

export async function unpublishOtherExampleJobs(env, job) {
  const rows = await dbAll(
    env,
    'SELECT id FROM jobs WHERE production_type = ? AND id <> ? AND is_example_public = 1',
    [job.production_type, job.id]
  );
  if (rows.length > 0) {
    await dbRun(
      env,
      'UPDATE jobs SET is_example_public = 0, example_published_at = NULL WHERE production_type = ? AND id <> ? AND is_example_public = 1',
      [job.production_type, job.id]
    );
  }
  return rows.map((row) => ({ id: row.id, is_example_public: false, example_published_at: null }));
}

// ---------------------------------------------------------------------------
// Pricing rules & app settings
// ---------------------------------------------------------------------------

export async function getPricing(env, defaultPricing) {
  try {
    const rows = await dbAll(env, 'SELECT key, amount_idr, active, description FROM pricing_rules ORDER BY key ASC');
    return rows.reduce(
      (pricing, row) => ({
        ...pricing,
        [row.key]: row.active === 0 ? pricing[row.key] : Number(row.amount_idr) || pricing[row.key]
      }),
      { ...defaultPricing }
    );
  } catch {
    return { ...defaultPricing };
  }
}

export async function listPricingRules(env) {
  return mapRows('pricing_rules', await dbAll(env, 'SELECT key,amount_idr,active,description,updated_at FROM pricing_rules ORDER BY key ASC'));
}

export async function upsertPricingRule(env, { key, amountIdr, active = true, description = '' }) {
  await dbRun(
    env,
    `INSERT INTO pricing_rules (key, amount_idr, active, description, updated_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET amount_idr = excluded.amount_idr, active = excluded.active, description = excluded.description, updated_at = excluded.updated_at`,
    [key, amountIdr, active ? 1 : 0, description, nowIso()]
  );
  return mapRow('pricing_rules', await dbGet(env, 'SELECT * FROM pricing_rules WHERE key = ?', [key]));
}

export async function getAppSetting(env, key) {
  return mapRow('app_settings', await dbGet(env, 'SELECT key,value,is_public,description,updated_at FROM app_settings WHERE key = ? LIMIT 1', [key]));
}

export async function listPublicAppSettings(env) {
  return mapRows('app_settings', await dbAll(env, 'SELECT key,value,is_public FROM app_settings WHERE is_public = 1 ORDER BY key ASC'));
}

export async function listAppSettings(env) {
  return mapRows('app_settings', await dbAll(env, 'SELECT key,value,is_public,description,updated_at FROM app_settings ORDER BY key ASC'));
}

export async function upsertAppSetting(env, { key, value, isPublic = true, description = '' }) {
  await dbRun(
    env,
    `INSERT INTO app_settings (key, value, is_public, description, updated_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, is_public = excluded.is_public, description = excluded.description, updated_at = excluded.updated_at`,
    [key, toDbValue('app_settings', 'value', value), isPublic ? 1 : 0, description, nowIso()]
  );
  return mapRow('app_settings', await dbGet(env, 'SELECT * FROM app_settings WHERE key = ?', [key]));
}

// ---------------------------------------------------------------------------
// Payment transactions
// ---------------------------------------------------------------------------

export async function getPaymentTransactionById(env, paymentId) {
  return getRowById(env, 'payment_transactions', paymentId);
}

export async function getPaymentTransactionByOrderId(env, orderId) {
  return mapRow(
    'payment_transactions',
    await dbGet(env, 'SELECT * FROM payment_transactions WHERE provider = ? AND order_id = ? LIMIT 1', ['midtrans', orderId])
  );
}

export async function listUserMidtransPayments(env, userId) {
  return mapRows(
    'payment_transactions',
    await dbAll(env, `SELECT ${AUTOMATIC_PAYMENT_COLUMNS} FROM payment_transactions WHERE provider = ? AND user_id = ? ORDER BY created_at DESC LIMIT 20`, ['midtrans', userId])
  );
}

export async function listAdminMidtransPaymentsRows(env) {
  return mapRows(
    'payment_transactions',
    await dbAll(env, `SELECT ${AUTOMATIC_PAYMENT_COLUMNS} FROM payment_transactions WHERE provider = ? ORDER BY created_at DESC LIMIT 100`, ['midtrans'])
  );
}

export async function listUserAutomaticPayments(env, userId) {
  return mapRows(
    'payment_transactions',
    await dbAll(env, `SELECT ${AUTOMATIC_PAYMENT_COLUMNS} FROM payment_transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`, [userId])
  );
}

export async function listAdminPaymentTransactionsRows(env) {
  return mapRows('payment_transactions', await dbAll(env, `SELECT ${AUTOMATIC_PAYMENT_COLUMNS} FROM payment_transactions ORDER BY created_at DESC LIMIT 200`));
}

export async function listActivePendingInteractiveQrisPayments(env) {
  return mapRows(
    'payment_transactions',
    await dbAll(
      env,
      `SELECT ${AUTOMATIC_PAYMENT_COLUMNS} FROM payment_transactions WHERE provider = ? AND status = ? AND expired_at > ? ORDER BY created_at DESC LIMIT 500`,
      ['interactive_qris', 'pending', nowIso()]
    )
  );
}

export async function expireStaleInteractiveQrisPayments(env) {
  const now = nowIso();
  const rows = await dbAll(
    env,
    'SELECT id,status,expired_at FROM payment_transactions WHERE provider = ? AND status = ? AND expired_at < ?',
    ['interactive_qris', 'pending', now]
  );
  if (rows.length > 0) {
    await dbRun(
      env,
      'UPDATE payment_transactions SET status = ?, updated_at = ? WHERE provider = ? AND status = ? AND expired_at < ?',
      ['expired', now, 'interactive_qris', 'pending', now]
    );
  }
  return rows.map((row) => ({ ...row, status: 'expired' }));
}

export async function createPaymentTransaction(env, payload) {
  const timestamp = nowIso();
  return insertRow(env, 'payment_transactions', { id: crypto.randomUUID(), created_at: timestamp, updated_at: timestamp, ...payload });
}

export async function updatePaymentTransactionById(env, paymentId, patch) {
  return updateRowById(env, 'payment_transactions', paymentId, patch, { touchUpdatedAt: true });
}

export async function insertInteractiveQrisWebhookLog(env, payload = {}) {
  try {
    return await insertRow(env, 'interactive_qris_webhook_logs', {
      id: crypto.randomUUID(),
      status_code: Number(payload.status_code) || 200,
      outcome: String(payload.outcome || 'unknown'),
      reason: payload.reason ? String(payload.reason) : null,
      secret_valid: Boolean(payload.secret_valid),
      package_name: payload.package_name ? String(payload.package_name).slice(0, 120) : null,
      amount_candidates: Array.isArray(payload.amount_candidates) ? payload.amount_candidates : [],
      matched_order_id: payload.matched_order_id ? String(payload.matched_order_id) : null,
      payload_preview: payload.payload_preview ? String(payload.payload_preview).slice(0, 600) : null,
      created_at: nowIso()
    });
  } catch {
    return null;
  }
}

export async function listInteractiveQrisWebhookLogs(env) {
  try {
    return mapRows(
      'interactive_qris_webhook_logs',
      await dbAll(
        env,
        'SELECT id,status_code,outcome,reason,secret_valid,package_name,amount_candidates,matched_order_id,payload_preview,created_at FROM interactive_qris_webhook_logs ORDER BY created_at DESC, rowid DESC LIMIT 30'
      )
    );
  } catch {
    return [];
  }
}

export async function listFinanceGatewayPaymentsRows(env, { from, toExclusive }) {
  return mapRows(
    'payment_transactions',
    await dbAll(
      env,
      'SELECT id,user_id,provider,order_id,external_transaction_id,amount_idr,currency,status,payment_type,credited_ledger_id,paid_at,created_at FROM payment_transactions WHERE paid_at >= ? AND paid_at < ? ORDER BY paid_at DESC LIMIT 5000',
      [from, toExclusive]
    )
  );
}

// ---------------------------------------------------------------------------
// Manual payments
// ---------------------------------------------------------------------------

export async function createManualPayment(env, payload) {
  const timestamp = nowIso();
  return insertRow(env, 'manual_payments', { id: crypto.randomUUID(), created_at: timestamp, updated_at: timestamp, ...payload });
}

export async function getManualPaymentById(env, paymentId) {
  return getRowById(env, 'manual_payments', paymentId);
}

export async function updateManualPayment(env, paymentId, patch) {
  return updateRowById(env, 'manual_payments', paymentId, patch, { touchUpdatedAt: true });
}

export async function listAdminManualPayments(env) {
  return mapRows(
    'manual_payments',
    await dbAll(env, 'SELECT id,user_id,marketplace,order_ref,amount_idr,status,notes,rejected_reason,approved_at,created_at,updated_at FROM manual_payments ORDER BY created_at DESC LIMIT 100')
  );
}

export async function listFinanceManualPaymentsRows(env, { from, toExclusive }) {
  return mapRows(
    'manual_payments',
    await dbAll(
      env,
      'SELECT id,user_id,marketplace,order_ref,amount_idr,status,notes,approved_by,approved_at,created_at FROM manual_payments WHERE status = ? AND approved_at >= ? AND approved_at < ? ORDER BY approved_at DESC LIMIT 5000',
      ['approved', from, toExclusive]
    )
  );
}

export async function listAdminOverviewManualPayments(env) {
  return dbAll(env, 'SELECT id,status,amount_idr,created_at FROM manual_payments ORDER BY created_at DESC LIMIT 500');
}

// ---------------------------------------------------------------------------
// Signup bonus claims
// ---------------------------------------------------------------------------

export async function getSignupBonusClaimByUserId(env, userId) {
  return mapRow('signup_bonus_claims', await dbGet(env, 'SELECT * FROM signup_bonus_claims WHERE user_id = ? LIMIT 1', [userId]));
}

export async function countGrantedSignupBonusClaims(env, { deviceIdHash = '', ipHash = '' } = {}) {
  const counts = { device: 0, ip: 0 };
  if (deviceIdHash) {
    const row = await dbGet(env, 'SELECT COUNT(*) AS total FROM signup_bonus_claims WHERE bonus_granted = 1 AND device_id_hash = ?', [deviceIdHash]);
    counts.device = Number(row?.total) || 0;
  }
  if (ipHash) {
    const row = await dbGet(env, 'SELECT COUNT(*) AS total FROM signup_bonus_claims WHERE bonus_granted = 1 AND ip_hash = ?', [ipHash]);
    counts.ip = Number(row?.total) || 0;
  }
  return counts;
}

export async function insertSignupBonusClaim(env, payload) {
  return insertRow(env, 'signup_bonus_claims', { id: crypto.randomUUID(), created_at: nowIso(), ...payload });
}

// ---------------------------------------------------------------------------
// Business finance & tax rules
// ---------------------------------------------------------------------------

export async function listBusinessFinanceEntriesRows(env, { from, to }) {
  return dbAll(
    env,
    'SELECT id,entry_date,entry_type,cash_direction,amount_idr,counterparty,document_ref,note,tax_treatment,created_by,created_at FROM business_finance_entries WHERE entry_date >= ? AND entry_date <= ? ORDER BY entry_date DESC LIMIT 5000',
    [from, to]
  );
}

export async function createBusinessFinanceEntry(env, payload) {
  return insertRow(env, 'business_finance_entries', { id: crypto.randomUUID(), created_at: nowIso(), ...payload });
}

export async function listTaxRulesRows(env) {
  return dbAll(env, 'SELECT id,tax_code,rate_percent,effective_from,effective_to,note,created_at FROM tax_rules ORDER BY effective_from DESC LIMIT 500');
}

export async function upsertTaxRule(env, payload) {
  if (payload.id) {
    const { id, ...patch } = payload;
    return updateRowById(env, 'tax_rules', id, patch);
  }
  return insertRow(env, 'tax_rules', { id: crypto.randomUUID(), created_at: nowIso(), ...payload });
}

// ---------------------------------------------------------------------------
// Sessions (refresh token)
// ---------------------------------------------------------------------------

export async function createSession(env, { id, userId, tokenHash, expiresAt }) {
  await insertRow(env, 'sessions', { id, user_id: userId, token_hash: tokenHash, expires_at: expiresAt, created_at: nowIso() });
}

export async function getSessionByTokenHash(env, tokenHash) {
  return dbGet(env, 'SELECT * FROM sessions WHERE token_hash = ? LIMIT 1', [tokenHash]);
}

export async function deleteSessionByTokenHash(env, tokenHash) {
  await dbRun(env, 'DELETE FROM sessions WHERE token_hash = ?', [tokenHash]);
}

export async function deleteSessionsByUserId(env, userId) {
  await dbRun(env, 'DELETE FROM sessions WHERE user_id = ?', [userId]);
}