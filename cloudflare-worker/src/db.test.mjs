import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  creditBalance,
  createJob,
  createProfile,
  deleteUserCascade,
  findLedgerByReference,
  getAppSetting,
  getPricing,
  getProfile,
  insertLedger,
  isDuplicateConstraintError,
  listProfilesWithBalance,
  unpublishOtherExampleJobs,
  updateProfile,
  upsertAppSetting
} from './db.js';
import { createTestEnv, createTestUser } from './test-helpers.mjs';

test('profile booleans are mapped back from SQLite integers', async () => {
  const env = createTestEnv();
  await createProfile(env, { id: 'user-1', email: 'user@example.com', fullName: 'User Test', isUnlimited: true });

  const profile = await getProfile(env, 'user-1');
  assert.equal(profile.is_unlimited, true);
  assert.equal(profile.is_active, true);
  assert.equal(typeof profile.is_unlimited, 'boolean');

  await updateProfile(env, 'user-1', { is_active: false });
  await assert.rejects(() => getProfile(env, 'user-1'), /Akun tidak aktif/);
});

test('credit balance is the SUM of ledger credits and debits', async () => {
  const env = createTestEnv();
  await createTestUser(env, { id: 'user-1', email: 'user@example.com' });

  assert.equal(await creditBalance(env, 'user-1'), 0);
  await insertLedger(env, { userId: 'user-1', amountIdr: 5000, kind: 'credit', reason: 'signup_bonus' });
  await insertLedger(env, { userId: 'user-1', amountIdr: 25000, kind: 'credit', reason: 'midtrans_payment', referenceId: 'payment-1' });
  await insertLedger(env, { userId: 'user-1', amountIdr: -5000, kind: 'debit', reason: 'ai_redraw' });
  assert.equal(await creditBalance(env, 'user-1'), 25000);

  const rows = await listProfilesWithBalance(env);
  assert.equal(rows.find((row) => row.id === 'user-1').balance, 25000);
});

test('ledger reference lookup and duplicate constraint detection use real SQLite errors', async () => {
  const env = createTestEnv();
  await createTestUser(env, { id: 'user-1', email: 'user@example.com' });
  const ledger = await insertLedger(env, { userId: 'user-1', amountIdr: 25000, kind: 'credit', reason: 'midtrans_payment', referenceId: 'payment-1' });

  const found = await findLedgerByReference(env, 'payment-1', 'midtrans_payment');
  assert.equal(found.id, ledger.id);
  assert.equal(await findLedgerByReference(env, 'payment-1', 'interactive_qris_payment'), null);

  await assert.rejects(
    () => insertLedger(env, { userId: 'user-1', amountIdr: 25000, kind: 'credit', reason: 'midtrans_payment', referenceId: 'payment-1' }),
    (error) => {
      assert.equal(isDuplicateConstraintError(error), true);
      return true;
    }
  );
});

test('app settings roundtrip JSON values and pricing reads seeded rules', async () => {
  const env = createTestEnv();
  await upsertAppSetting(env, { key: 'custom_setting', value: { enabled: true, nested: { list: [1, 2, 3] } }, isPublic: true });

  const setting = await getAppSetting(env, 'custom_setting');
  assert.deepEqual(setting.value, { enabled: true, nested: { list: [1, 2, 3] } });
  assert.equal(setting.is_public, true);

  const pricing = await getPricing(env, { ready_trace: 0, ai_redraw: 0, separation_film: 0 });
  assert.equal(pricing.ready_trace, 2000);
  assert.equal(pricing.ai_redraw, 5000);
  assert.equal(pricing.separation_film, 0);
});

test('unpublishOtherExampleJobs only touches the same production type', async () => {
  const env = createTestEnv();
  await createTestUser(env, { id: 'super-1', email: 'boss@example.com', role: 'superuser' });
  const oldSticker = await createJob(env, { user_id: 'super-1', input_mode: 'ai_redraw', production_type: 'sticker', status: 'done', is_example_public: true, example_published_at: '2026-07-01T00:00:00.000Z' });
  const oldSablon = await createJob(env, { user_id: 'super-1', input_mode: 'ai_redraw', production_type: 'sablon', status: 'done', is_example_public: true, example_published_at: '2026-07-01T00:00:00.000Z' });
  const newSticker = await createJob(env, { user_id: 'super-1', input_mode: 'ai_redraw', production_type: 'sticker', status: 'done', is_example_public: true });

  const replaced = await unpublishOtherExampleJobs(env, newSticker);
  assert.deepEqual(replaced.map((row) => row.id), [oldSticker.id]);

  const refreshedOldSticker = env.DB.sqlite.prepare('SELECT is_example_public, example_published_at FROM jobs WHERE id = ?').get(oldSticker.id);
  assert.equal(refreshedOldSticker.is_example_public, 0);
  assert.equal(refreshedOldSticker.example_published_at, null);
  const refreshedOldSablon = env.DB.sqlite.prepare('SELECT is_example_public FROM jobs WHERE id = ?').get(oldSablon.id);
  assert.equal(refreshedOldSablon.is_example_public, 1);
});

test('deleteUserCascade removes the profile and all owned rows in one batch', async () => {
  const env = createTestEnv();
  await createTestUser(env, { id: 'user-1', email: 'user@example.com' });
  await insertLedger(env, { userId: 'user-1', amountIdr: 5000, kind: 'credit', reason: 'signup_bonus' });
  await createJob(env, { user_id: 'user-1', input_mode: 'ready_trace', production_type: 'sticker', status: 'done' });
  env.DB.sqlite.prepare('INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)').run('session-1', 'user-1', 'hash-1', '2099-01-01T00:00:00.000Z', '2026-07-01T00:00:00.000Z');

  await deleteUserCascade(env, 'user-1');

  for (const table of ['profiles', 'credit_ledger', 'jobs', 'sessions']) {
    const row = env.DB.sqlite.prepare(`SELECT COUNT(*) AS total FROM ${table} WHERE ${table === 'profiles' ? 'id' : 'user_id'} = ?`).get('user-1');
    assert.equal(Number(row.total), 0, `rows left in ${table}`);
  }
});