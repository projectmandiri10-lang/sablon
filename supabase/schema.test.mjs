import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

const migration = fs.readFileSync(path.join(import.meta.dirname, 'migrations/20260526000000_saas_credit_auth.sql'), 'utf8');
const superadminMigration = fs.readFileSync(path.join(import.meta.dirname, 'migrations/20260526001000_ensure_superadmin_whitelist.sql'), 'utf8');
const exampleJobsMigration = fs.readFileSync(path.join(import.meta.dirname, 'migrations/20260528091500_example_jobs_bucket.sql'), 'utf8');
const publishedExamplesMigration = fs.readFileSync(path.join(import.meta.dirname, 'migrations/20260528153000_publishable_example_jobs.sql'), 'utf8');
const bootstrapSql = fs.readFileSync(path.join(import.meta.dirname, 'SUPABASE_BOOTSTRAP.sql'), 'utf8');
const signupBonusMigration = fs.readFileSync(path.join(import.meta.dirname, 'migrations/20260621103000_signup_bonus_three_credit.sql'), 'utf8');

test('migration creates SaaS credit/auth tables', () => {
  for (const table of ['profiles', 'credit_ledger', 'jobs', 'manual_payments', 'pricing_rules']) {
    assert.match(migration, new RegExp(`create table if not exists public\\.${table}`));
  }
});

test('migration whitelists superuser email as unlimited', () => {
  assert.match(migration, /jho\.j80@gmail\.com/);
  assert.match(migration, /then 'superuser'/);
  assert.match(migration, /is_unlimited/);
});

test('superadmin backfill keeps whitelist unlimited', () => {
  assert.match(superadminMigration, /jho\.j80@gmail\.com/);
  assert.match(superadminMigration, /role = 'superuser'/);
  assert.match(superadminMigration, /is_unlimited = true/);
  assert.match(superadminMigration, /is_active = true/);
});

test('migration enables RLS and credit balance function', () => {
  assert.match(migration, /alter table public\.profiles enable row level security/);
  assert.match(migration, /create or replace function public\.credit_balance/);
  assert.match(migration, /profiles_select_own_or_admin/);
  assert.match(migration, /profiles_update_admin_only/);
});

test('superadmin app management migration adds settings and payment admin support', () => {
  const appManagementMigration = fs.readFileSync(path.join(import.meta.dirname, 'migrations/20260526002000_superadmin_app_management.sql'), 'utf8');
  assert.match(appManagementMigration, /create table if not exists public\.app_settings/);
  assert.match(appManagementMigration, /shopee_payment/);
  assert.match(appManagementMigration, /pricing_rules_admin_write/);
  assert.match(appManagementMigration, /manual_payments_status_created_idx/);
});

test('example jobs migration provisions storage bucket and public setting seed', () => {
  assert.match(exampleJobsMigration, /storage\.buckets/);
  assert.match(exampleJobsMigration, /example-jobs/);
  assert.match(exampleJobsMigration, /example_jobs/);
  assert.match(exampleJobsMigration, /"sticker":null/);
  assert.match(exampleJobsMigration, /"sablon":null/);
});

test('published example migration adds job publish and delete columns', () => {
  assert.match(publishedExamplesMigration, /is_example_public boolean not null default false/);
  assert.match(publishedExamplesMigration, /example_published_at timestamptz/);
  assert.match(publishedExamplesMigration, /deleted_at timestamptz/);
  assert.match(publishedExamplesMigration, /jobs_example_public_created_idx/);
});

test('bootstrap sql includes the core tables and settings seed', () => {
  for (const table of ['profiles', 'credit_ledger', 'jobs', 'manual_payments', 'pricing_rules', 'app_settings', 'contact_messages']) {
    assert.match(bootstrapSql, new RegExp(`create table if not exists public\\.${table}`));
  }
  assert.match(bootstrapSql, /huggingface_pix2pix/);
  assert.match(bootstrapSql, /nunchaku-tech\/nunchaku-flux\.1-schnell-pix2pix-turbo/);
  assert.match(bootstrapSql, /gemini-3\.1-flash-image/);
  assert.match(bootstrapSql, /black-forest-labs\/flux\.2-klein-4b/);
  assert.match(bootstrapSql, /example-jobs/);
});

test('bootstrap sql hardens helper functions and policy indexes', () => {
  assert.match(bootstrapSql, /create schema if not exists private/);
  assert.match(bootstrapSql, /create or replace function private\.handle_new_user/);
  assert.match(bootstrapSql, /create or replace function private\.is_superuser/);
  assert.doesNotMatch(bootstrapSql, /create or replace function public\.credit_balance/);
  assert.match(bootstrapSql, /credit_ledger_created_by_idx/);
  assert.match(bootstrapSql, /jobs_ai_ledger_id_unique_idx/);
  assert.match(bootstrapSql, /manual_payments_approved_by_idx/);
});

test('signup bonus migration grants 3 free credits to new and existing users', () => {
  assert.match(signupBonusMigration, /create or replace function public\.handle_new_user/);
  assert.match(signupBonusMigration, /6000/);
  assert.match(signupBonusMigration, /'signup_free_credit'/);
  assert.match(signupBonusMigration, /'freeCredits', 3/);
  assert.match(signupBonusMigration, /from public\.profiles/);
});
