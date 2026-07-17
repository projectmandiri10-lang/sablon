import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

const migration = fs.readFileSync(path.join(import.meta.dirname, 'migrations/20260526000000_saas_credit_auth.sql'), 'utf8');
const superadminMigration = fs.readFileSync(path.join(import.meta.dirname, 'migrations/20260526001000_ensure_superadmin_whitelist.sql'), 'utf8');
const exampleJobsMigration = fs.readFileSync(path.join(import.meta.dirname, 'migrations/20260528091500_example_jobs_bucket.sql'), 'utf8');
const publishedExamplesMigration = fs.readFileSync(path.join(import.meta.dirname, 'migrations/20260528153000_publishable_example_jobs.sql'), 'utf8');
const bootstrapSql = fs.readFileSync(path.join(import.meta.dirname, 'SUPABASE_BOOTSTRAP.sql'), 'utf8');
const signupBonusGuardMigration = fs.readFileSync(path.join(import.meta.dirname, 'migrations/20260702110000_signup_bonus_device_ip_guard.sql'), 'utf8');
const pricingRefreshMigration = fs.readFileSync(path.join(import.meta.dirname, 'migrations/20260627123000_set_ai_redraw_5000_ready_trace_2000.sql'), 'utf8');
const pricingTenThousandMigration = fs.readFileSync(path.join(import.meta.dirname, 'migrations/20260709113000_set_ai_redraw_10000.sql'), 'utf8');
const midtransPaymentsMigration = fs.readFileSync(path.join(import.meta.dirname, 'migrations/20260701103000_add_midtrans_payment_transactions.sql'), 'utf8');
const adminFinanceMigration = fs.readFileSync(path.join(import.meta.dirname, 'migrations/20260702143000_add_admin_finance_tax_reporting.sql'), 'utf8');
const canonicalLiteLlmModelMigration = fs.readFileSync(path.join(import.meta.dirname, 'migrations/20260708101500_canonicalize_litellm_gemini_image_model.sql'), 'utf8');
const openAiImageModelMigration = fs.readFileSync(path.join(import.meta.dirname, 'migrations/20260708190000_set_litellm_openai_gpt_image_1.sql'), 'utf8');
const openAiImageModelOnePointFiveMigration = fs.readFileSync(path.join(import.meta.dirname, 'migrations/20260708193000_set_litellm_openai_gpt_image_1_5.sql'), 'utf8');
const stylizedRedrawPromptMigration = fs.readFileSync(path.join(import.meta.dirname, 'migrations/20260708195000_set_stylized_redraw_prompt_profile.sql'), 'utf8');
const photoLogoCleanupPromptMigration = fs.readFileSync(path.join(import.meta.dirname, 'migrations/20260708201000_set_photo_logo_cleanup_prompt_profile.sql'), 'utf8');
const logoPhotoCleanupShortPromptMigration = fs.readFileSync(path.join(import.meta.dirname, 'migrations/20260708203000_set_logo_photo_cleanup_short_prompt_profile.sql'), 'utf8');
const openAiDirectMigration = fs.readFileSync(path.join(import.meta.dirname, 'migrations/20260709100000_migrate_ai_redraw_to_openai_direct.sql'), 'utf8');
const interactiveQrisPaymentsMigration = fs.readFileSync(path.join(import.meta.dirname, 'migrations/20260711103000_add_interactive_qris_payment_support.sql'), 'utf8');
const interactiveQrisClosedHoursMigration = fs.readFileSync(path.join(import.meta.dirname, 'migrations/20260711120000_add_interactive_qris_closed_hours_defaults.sql'), 'utf8');
const mediumOpenAiQualityMigration = fs.readFileSync(path.join(import.meta.dirname, 'migrations/20260712103000_set_openai_redraw_medium_quality.sql'), 'utf8');
const aivenePrimaryMigration = fs.readFileSync(path.join(import.meta.dirname, 'migrations/20260716110000_switch_ai_redraw_to_aivene_primary_openai_fallback.sql'), 'utf8');
const inputTokenOptimizationMigration = fs.readFileSync(path.join(import.meta.dirname, 'migrations/20260716120000_optimize_ai_redraw_input_tokens.sql'), 'utf8');
const highInputFidelityMigration = fs.readFileSync(path.join(import.meta.dirname, 'migrations/20260716130000_force_ai_redraw_high_input_fidelity.sql'), 'utf8');
const gptImageTwoLocalTraceMigration = fs.readFileSync(path.join(import.meta.dirname, 'migrations/20260717100000_use_gpt_image_2_low_local_trace.sql'), 'utf8');
const gptImageTwoNoteMigration = fs.readFileSync(path.join(import.meta.dirname, 'migrations/20260717101000_update_gpt_image_2_note.sql'), 'utf8');

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
  for (const table of ['profiles', 'credit_ledger', 'jobs', 'manual_payments', 'payment_transactions', 'pricing_rules', 'signup_bonus_claims', 'business_finance_entries', 'tax_rules', 'app_settings', 'contact_messages']) {
    assert.match(bootstrapSql, new RegExp(`create table if not exists public\\.${table}`));
  }
  assert.match(bootstrapSql, /\('ai_redraw', 10000, 'AI Redesign Premium image-to-image termasuk pecah warna sablon', true\)/);
  assert.match(bootstrapSql, /"provider":"aivene_image"/);
  assert.match(bootstrapSql, /"primaryProvider":"aivene_image"/);
  assert.match(bootstrapSql, /"fallbackProvider":"openai_image"/);
  assert.match(bootstrapSql, /"aiveneImageModel":"gpt-image-2"/);
  assert.match(bootstrapSql, /"openAiImageModel":"gpt-image-2"/);
  assert.match(bootstrapSql, /"promptProfile":"logo_photo_cleanup_short"/);
  assert.match(bootstrapSql, /example-jobs/);
});

test('latest pricing migration sets ready trace to 2000 and ai redraw to 5000', () => {
  assert.match(pricingRefreshMigration, /select 'ready_trace', 2000/);
  assert.match(pricingRefreshMigration, /amount_idr = 5000/);
  assert.match(pricingRefreshMigration, /select 'ai_redraw', 5000/);
});

test('latest pricing migration raises ai redraw to 10000 with color separation included', () => {
  assert.match(pricingTenThousandMigration, /amount_idr = 10000/);
  assert.match(pricingTenThousandMigration, /select 'ai_redraw', 10000/);
  assert.match(pricingTenThousandMigration, /termasuk pecah warna sablon/);
});

test('canonical LiteLLM model migration upgrades legacy Gemini image identifiers', () => {
  assert.match(canonicalLiteLlmModelMigration, /jsonb_build_object\('liteLlmImageModel', 'gemini\/gemini-3\.1-flash-image-preview'\)/);
  assert.match(canonicalLiteLlmModelMigration, /'gemini-3\.1-flash-image'/);
  assert.match(canonicalLiteLlmModelMigration, /'gemini-3\.1-flash-image-preview'/);
});

test('latest LiteLLM model migration moves redraw defaults to OpenAI GPT Image 1', () => {
  assert.match(openAiImageModelMigration, /jsonb_build_object\('liteLlmImageModel', 'openai\/gpt-image-1'\)/);
  assert.match(openAiImageModelMigration, /jsonb_build_object\('geminiGenerationModel', ''\)/);
});

test('latest LiteLLM model migration moves redraw defaults to OpenAI GPT Image 1.5', () => {
  assert.match(openAiImageModelOnePointFiveMigration, /'liteLlmImageModel', 'openai\/gpt-image-1\.5'/);
  assert.match(openAiImageModelOnePointFiveMigration, /Default LiteLLM GPT Image 1\.5 trace-clone/);
});

test('latest prompt profile migration moves redraw defaults to stylized redraw', () => {
  assert.match(stylizedRedrawPromptMigration, /'promptProfile', 'stylized_redraw'/);
  assert.match(stylizedRedrawPromptMigration, /stylized redraw/);
});

test('latest prompt profile migration moves redraw defaults to photo logo cleanup', () => {
  assert.match(photoLogoCleanupPromptMigration, /'promptProfile', 'photo_logo_cleanup'/);
  assert.match(photoLogoCleanupPromptMigration, /photo logo cleanup/);
});

test('latest prompt profile migration moves redraw defaults to short logo cleanup', () => {
  assert.match(logoPhotoCleanupShortPromptMigration, /'promptProfile', 'logo_photo_cleanup_short'/);
  assert.match(logoPhotoCleanupShortPromptMigration, /short logo cleanup/);
});

test('latest direct OpenAI migration upgrades legacy LiteLLM redraw rows', () => {
  assert.match(openAiDirectMigration, /'provider',\s*case[\s\S]*'openai_image'/);
  assert.match(openAiDirectMigration, /'primaryProvider',\s*case[\s\S]*'openai_image'/);
  assert.match(openAiDirectMigration, /'openAiImageModel'/);
  assert.match(openAiDirectMigration, /- 'liteLlmImageModel'/);
  assert.match(openAiDirectMigration, /logo_photo_cleanup_short/);
});

test('latest redraw quality migration switches default OpenAI redraw quality to medium', () => {
  assert.match(mediumOpenAiQualityMigration, /'generationQuality', 'medium'/);
  assert.match(mediumOpenAiQualityMigration, /quality medium untuk testing/);
  assert.match(bootstrapSql, /"generationQuality":"medium"/);
});

test('latest AIVene migration moves redraw defaults to AIVene primary with OpenAI fallback', () => {
  assert.match(aivenePrimaryMigration, /'provider', 'aivene_image'/);
  assert.match(aivenePrimaryMigration, /'primaryProvider', 'aivene_image'/);
  assert.match(aivenePrimaryMigration, /'fallbackProvider', 'openai_image'/);
  assert.match(aivenePrimaryMigration, /'aiveneImageModel', 'gpt-image-1\.5'/);
  assert.match(aivenePrimaryMigration, /Pipeline AIVene primary \+ OpenAI fallback untuk AI redraw/);
});

test('historical redraw optimization migration recorded the old low-fidelity input', () => {
  assert.match(inputTokenOptimizationMigration, /'mode', 'standard'/);
  assert.match(inputTokenOptimizationMigration, /'inputFidelity', 'low'/);
  assert.match(inputTokenOptimizationMigration, /'inputMaxEdge', 1080/);
  assert.match(inputTokenOptimizationMigration, /'retryOnLowConfidence', false/);
  assert.match(bootstrapSql, /"inputFidelity":"low"/);
  assert.match(bootstrapSql, /"inputMaxEdge":1080/);
});

test('latest redraw migration forces high input fidelity', () => {
  assert.match(highInputFidelityMigration, /jsonb_set/);
  assert.match(highInputFidelityMigration, /inputFidelity/);
  assert.match(highInputFidelityMigration, /high/);
});

test('latest redraw migration selects GPT Image 2 low fidelity with browser trace', () => {
  assert.match(gptImageTwoLocalTraceMigration, /gpt-image-2/);
  assert.match(gptImageTwoLocalTraceMigration, /inputFidelity/);
  assert.match(gptImageTwoLocalTraceMigration, /low/);
  assert.match(gptImageTwoLocalTraceMigration, /browser/);
});

test('GPT Image 2 migration refreshes the visible admin note', () => {
  assert.match(gptImageTwoNoteMigration, /GPT Image 2/);
  assert.match(gptImageTwoNoteMigration, /fidelity low/);
  assert.match(gptImageTwoNoteMigration, /lokal di browser/);
});

test('bootstrap sql hardens helper functions and policy indexes', () => {
  assert.match(bootstrapSql, /create schema if not exists private/);
  assert.match(bootstrapSql, /create or replace function private\.handle_new_user/);
  assert.match(bootstrapSql, /create or replace function private\.is_superuser/);
  assert.doesNotMatch(bootstrapSql, /create or replace function public\.credit_balance/);
  assert.match(bootstrapSql, /payment_transactions_select_own_or_admin/);
  assert.match(bootstrapSql, /credit_ledger_created_by_idx/);
  assert.match(bootstrapSql, /credit_ledger_midtrans_reference_unique_idx/);
  assert.match(bootstrapSql, /credit_ledger_interactive_qris_reference_unique_idx/);
  assert.match(bootstrapSql, /jobs_ai_ledger_id_unique_idx/);
  assert.match(bootstrapSql, /manual_payments_approved_by_idx/);
  assert.match(bootstrapSql, /payment_transactions_order_id_unique_idx/);
  assert.match(bootstrapSql, /payment_transactions_interactive_qris_pending_amount_unique_idx/);
});

test('signup bonus guard migration provisions guarded claim storage without auto-credit trigger grants', () => {
  assert.match(signupBonusGuardMigration, /create table if not exists public\.signup_bonus_claims/);
  assert.match(signupBonusGuardMigration, /signup_bonus_claims_user_id_key/);
  assert.match(signupBonusGuardMigration, /signup_bonus_claims_device_hash_idx/);
  assert.match(signupBonusGuardMigration, /signup_bonus_claims_ip_hash_idx/);
  assert.match(signupBonusGuardMigration, /create or replace function public\.handle_new_user/);
  assert.doesNotMatch(signupBonusGuardMigration, /signup_free_credit/);
  assert.doesNotMatch(signupBonusGuardMigration, /6000/);
  assert.doesNotMatch(signupBonusGuardMigration, /freeCredits', 3/);
});

test('midtrans payment migration provisions automatic payment transaction storage', () => {
  assert.match(midtransPaymentsMigration, /create table if not exists public\.payment_transactions/);
  assert.match(midtransPaymentsMigration, /provider text not null default 'midtrans'/);
  assert.match(midtransPaymentsMigration, /credited_ledger_id uuid references public\.credit_ledger\(id\)/);
  assert.match(midtransPaymentsMigration, /payment_transactions_select_own_or_admin/);
  assert.match(midtransPaymentsMigration, /credit_ledger_midtrans_reference_unique_idx/);
  assert.match(midtransPaymentsMigration, /payment_transactions_order_id_unique_idx/);
});

test('interactive qris payment migration extends automatic payments and seeds settings', () => {
  assert.match(interactiveQrisPaymentsMigration, /add column if not exists base_amount_idr integer/);
  assert.match(interactiveQrisPaymentsMigration, /add column if not exists unique_code integer/);
  assert.match(interactiveQrisPaymentsMigration, /credit_ledger_interactive_qris_reference_unique_idx/);
  assert.match(interactiveQrisPaymentsMigration, /payment_transactions_interactive_qris_pending_amount_unique_idx/);
  assert.match(interactiveQrisPaymentsMigration, /interactive_qris_payment/);
});

test('interactive qris closed-hours migration seeds overnight closure defaults', () => {
  assert.match(interactiveQrisClosedHoursMigration, /interactive_qris_payment/);
  assert.match(interactiveQrisClosedHoursMigration, /closedHours/);
  assert.match(interactiveQrisClosedHoursMigration, /Asia\/Jakarta/);
  assert.match(interactiveQrisClosedHoursMigration, /22:00/);
  assert.match(interactiveQrisClosedHoursMigration, /05:00/);
  assert.match(bootstrapSql, /closedHours/);
  assert.match(bootstrapSql, /Asia\/Jakarta/);
});

test('admin finance migration provisions business ledger and tax rules with admin policies', () => {
  assert.match(adminFinanceMigration, /create table if not exists public\.business_finance_entries/);
  assert.match(adminFinanceMigration, /create table if not exists public\.tax_rules/);
  assert.match(adminFinanceMigration, /business_finance_entries_admin_read/);
  assert.match(adminFinanceMigration, /tax_rules_admin_insert/);
  assert.match(adminFinanceMigration, /business_finance_entries_entry_date_idx/);
  assert.match(adminFinanceMigration, /tax_rules_code_effective_from_idx/);
  assert.match(adminFinanceMigration, /umkm_final_revenue/);
  assert.match(bootstrapSql, /business_finance_entries_admin_read/);
  assert.match(bootstrapSql, /tax_rules_admin_update/);
});
