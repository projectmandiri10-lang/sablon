-- Supabase bootstrap for a fresh cloudflare-free-tier project.
-- Paste this into the Supabase SQL Editor and run it once.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  full_name text,
  role text not null default 'user' check (role in ('user', 'superuser', 'superadmin')),
  is_unlimited boolean not null default false,
  is_active boolean not null default true,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.credit_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  amount_idr integer not null,
  kind text not null check (kind in ('credit', 'debit')),
  reason text not null,
  reference_id uuid,
  created_by uuid references public.profiles(id),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  project_name text not null default 'Project Vector',
  input_mode text not null check (input_mode in ('ready_trace', 'ai_redraw')),
  production_type text not null check (production_type in ('sticker', 'sablon')),
  status text not null default 'done' check (status in ('queued', 'running', 'success', 'failed', 'interrupted', 'done')),
  price_idr integer not null default 0,
  separation_film_count integer not null default 0,
  settings jsonb not null default '{}'::jsonb,
  manifest jsonb not null default '{}'::jsonb,
  ai_ledger_id uuid references public.credit_ledger(id),
  is_example_public boolean not null default false,
  example_published_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.manual_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  marketplace text not null default 'shopee',
  order_ref text,
  amount_idr integer not null check (amount_idr > 0),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  notes text,
  approved_by uuid references public.profiles(id),
  approved_at timestamptz,
  rejected_reason text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.payment_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null default 'midtrans',
  order_id text not null,
  external_transaction_id text,
  amount_idr integer not null check (amount_idr >= 2000),
  currency text not null default 'IDR',
  status text not null default 'pending',
  payment_type text,
  snap_token text,
  redirect_url text,
  raw_create_response jsonb not null default '{}'::jsonb,
  raw_notification jsonb not null default '{}'::jsonb,
  credited_ledger_id uuid references public.credit_ledger(id),
  paid_at timestamptz,
  expired_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pricing_rules (
  key text primary key,
  amount_idr integer not null check (amount_idr >= 0),
  active boolean not null default true,
  description text,
  updated_at timestamptz not null default now()
);

create table if not exists public.signup_bonus_claims (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  email text not null default '',
  device_id_hash text,
  ip_hash text,
  country_code text,
  bonus_granted boolean not null default false,
  reason text not null default 'limit_reached',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.business_finance_entries (
  id uuid primary key default gen_random_uuid(),
  entry_date date not null,
  entry_type text not null check (entry_type in ('owner_capital', 'operational_expense', 'tax_payment', 'owner_withdrawal', 'bank_fee', 'other')),
  cash_direction text not null check (cash_direction in ('in', 'out')),
  amount_idr integer not null check (amount_idr > 0),
  counterparty text,
  document_ref text,
  note text,
  tax_treatment text not null default 'other' check (tax_treatment in ('non_taxable', 'deductible', 'tax_payment', 'other')),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.tax_rules (
  id uuid primary key default gen_random_uuid(),
  tax_code text not null default 'umkm_final_revenue',
  rate_percent numeric(6,3) not null check (rate_percent >= 0),
  effective_from date not null,
  effective_to date,
  note text,
  created_at timestamptz not null default now(),
  check (effective_to is null or effective_to >= effective_from)
);

create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  is_public boolean not null default false,
  description text,
  updated_at timestamptz not null default now()
);

create table if not exists public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  subject text not null,
  message text not null,
  status text not null default 'pending' check (status in ('pending', 'read', 'replied')),
  replied_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create schema if not exists private;

grant usage on schema private to anon, authenticated, service_role;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  user_email text := lower(coalesce(new.email, ''));
begin
  insert into public.profiles (id, email, full_name, role, is_unlimited, is_active, deleted_at)
  values (
    new.id,
    user_email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', user_email),
    case when user_email = 'jho.j80@gmail.com' then 'superuser' else 'user' end,
    user_email = 'jho.j80@gmail.com',
    true,
    null
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(public.profiles.full_name, excluded.full_name),
        role = case when excluded.email = 'jho.j80@gmail.com' then 'superuser' else public.profiles.role end,
        is_unlimited = case when excluded.email = 'jho.j80@gmail.com' then true else public.profiles.is_unlimited end,
        is_active = coalesce(public.profiles.is_active, true),
        deleted_at = case when excluded.email = 'jho.j80@gmail.com' then null else public.profiles.deleted_at end;
  return new;
end;
$$;

create or replace function private.is_superuser(target_user_id uuid default auth.uid())
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = target_user_id
      and role in ('superuser', 'superadmin')
      and is_active = true
      and deleted_at is null
  );
$$;

revoke all on function private.handle_new_user() from public, anon, authenticated;
revoke all on function private.is_superuser(uuid) from public;
grant execute on function private.is_superuser(uuid) to anon, authenticated, service_role;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
before update on public.profiles
for each row execute function public.touch_updated_at();

drop trigger if exists manual_payments_touch_updated_at on public.manual_payments;
create trigger manual_payments_touch_updated_at
before update on public.manual_payments
for each row execute function public.touch_updated_at();

drop trigger if exists payment_transactions_touch_updated_at on public.payment_transactions;
create trigger payment_transactions_touch_updated_at
before update on public.payment_transactions
for each row execute function public.touch_updated_at();

drop trigger if exists app_settings_touch_updated_at on public.app_settings;
create trigger app_settings_touch_updated_at
before update on public.app_settings
for each row execute function public.touch_updated_at();

drop trigger if exists contact_messages_touch_updated_at on public.contact_messages;
create trigger contact_messages_touch_updated_at
before update on public.contact_messages
for each row execute function public.touch_updated_at();

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_user();

insert into public.profiles (id, email, full_name, role, is_unlimited, is_active, deleted_at)
select
  id,
  lower(coalesce(email, '')),
  coalesce(raw_user_meta_data->>'full_name', raw_user_meta_data->>'name', email),
  case when lower(coalesce(email, '')) = 'jho.j80@gmail.com' then 'superuser' else 'user' end,
  lower(coalesce(email, '')) = 'jho.j80@gmail.com',
  true,
  null
from auth.users
where email is not null
on conflict (id) do update
set email = excluded.email,
    full_name = coalesce(public.profiles.full_name, excluded.full_name),
    role = case when excluded.email = 'jho.j80@gmail.com' then 'superuser' else public.profiles.role end,
    is_unlimited = case when excluded.email = 'jho.j80@gmail.com' then true else public.profiles.is_unlimited end,
    is_active = coalesce(public.profiles.is_active, true),
    deleted_at = case when excluded.email = 'jho.j80@gmail.com' then null else public.profiles.deleted_at end;

insert into public.pricing_rules (key, amount_idr, description, active)
values
('ready_trace', 2000, 'Vector Siap Proses SVG tanpa AI', true),
('ai_redraw', 5000, 'AI Redesign Premium image-to-image', true),
('separation_film', 0, 'Download film separasi gratis', true)
on conflict (key) do update
set amount_idr = excluded.amount_idr,
    description = excluded.description,
    active = excluded.active,
    updated_at = timezone('utc', now());

insert into public.app_settings (key, value, is_public, description)
values
  ('shopee_payment', '{"url":"https://shopee.co.id/","note":"Checkout nominal credit di Shopee, lalu kirim email akun Design Mudah melalui chat Shopee. Admin top up manual 5-15 menit pada jam kerja.","contact":""}'::jsonb, true, 'Konfigurasi pembayaran manual Shopee'),
  ('app_status', '{"maintenance":false,"message":""}'::jsonb, true, 'Status aplikasi publik'),
  ('example_jobs', '{"sticker":null,"sablon":null}'::jsonb, true, 'Contoh gambar aktif untuk sticker dan sablon'),
  ('ai_redraw_model', '{"mode":"quality","preset":"quality","label":"Kualitas","provider":"openai_image","primaryProvider":"openai_image","fallbackProvider":"openrouter_image","openAiImageModel":"gpt-image-1.5","analysisModel":"","generationModel":"black-forest-labs/flux.2-klein-4b","fallbackModel":"sourceful/riverflow-v2-fast","safetyModel":"nvidia/nemotron-3.5-content-safety:free","promptProfile":"logo_photo_cleanup_short","generationQuality":"high","imageSize":"1K","reasoningEffort":"medium","backgroundMode":"transparent","safetyEnabled":true,"aspectPolicy":"match_source","resolutionPolicy":"high","preprocess":"node_heuristic","persistPrompt":true,"retryOnLowConfidence":false,"estimatedUsdPerImage":0.05,"note":"Default OpenAI GPT Image 1.5 short logo cleanup dengan OpenRouter fallback otomatis."}'::jsonb, false, 'Pipeline OpenAI primary + OpenRouter fallback untuk AI redraw')
on conflict (key) do update
set value = case
      when public.app_settings.value is null or public.app_settings.value = '{}'::jsonb then excluded.value
      else public.app_settings.value
    end,
    is_public = excluded.is_public,
    description = excluded.description,
    updated_at = now();

insert into public.tax_rules (tax_code, rate_percent, effective_from, effective_to, note)
values
  ('umkm_final_revenue', 0.5, '2018-07-01', null, 'Default awal PPh Final UMKM 0,5 persen. Verifikasi berkala dengan konsultan pajak bila aturan berubah.')
on conflict do nothing;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'example-jobs',
  'example-jobs',
  true,
  26214400,
  array[
    'image/png',
    'image/jpeg',
    'image/svg+xml',
    'application/pdf',
    'application/zip',
    'application/json'
  ]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

alter table public.profiles enable row level security;
alter table public.credit_ledger enable row level security;
alter table public.jobs enable row level security;
alter table public.manual_payments enable row level security;
alter table public.payment_transactions enable row level security;
alter table public.pricing_rules enable row level security;
alter table public.signup_bonus_claims enable row level security;
alter table public.business_finance_entries enable row level security;
alter table public.tax_rules enable row level security;
alter table public.app_settings enable row level security;
alter table public.contact_messages enable row level security;

drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin"
on public.profiles for select
to authenticated
using (id = (select auth.uid()) or private.is_superuser((select auth.uid())));

drop policy if exists "profiles_update_admin_only" on public.profiles;
create policy "profiles_update_admin_only"
on public.profiles for update
to authenticated
using (private.is_superuser((select auth.uid())))
with check (private.is_superuser((select auth.uid())));

drop policy if exists "credit_select_own_or_admin" on public.credit_ledger;
create policy "credit_select_own_or_admin"
on public.credit_ledger for select
to authenticated
using (user_id = (select auth.uid()) or private.is_superuser((select auth.uid())));

drop policy if exists "jobs_select_own_or_admin" on public.jobs;
create policy "jobs_select_own_or_admin"
on public.jobs for select
to authenticated
using (user_id = (select auth.uid()) or private.is_superuser((select auth.uid())));

drop policy if exists "manual_payments_select_own_or_admin" on public.manual_payments;
create policy "manual_payments_select_own_or_admin"
on public.manual_payments for select
to authenticated
using (user_id = (select auth.uid()) or private.is_superuser((select auth.uid())));

drop policy if exists "manual_payments_insert_own" on public.manual_payments;
create policy "manual_payments_insert_own"
on public.manual_payments for insert
to authenticated
with check (user_id = (select auth.uid()));

drop policy if exists "payment_transactions_select_own_or_admin" on public.payment_transactions;
create policy "payment_transactions_select_own_or_admin"
on public.payment_transactions for select
to authenticated
using (user_id = (select auth.uid()) or private.is_superuser((select auth.uid())));

drop policy if exists "pricing_rules_read" on public.pricing_rules;
create policy "pricing_rules_read"
on public.pricing_rules for select
to authenticated
using (active = true or private.is_superuser((select auth.uid())));

drop policy if exists "signup_bonus_claims_select_own_or_admin" on public.signup_bonus_claims;
create policy "signup_bonus_claims_select_own_or_admin"
on public.signup_bonus_claims for select
to authenticated
using (user_id = (select auth.uid()) or private.is_superuser((select auth.uid())));

drop policy if exists "business_finance_entries_admin_read" on public.business_finance_entries;
create policy "business_finance_entries_admin_read"
on public.business_finance_entries for select
to authenticated
using (private.is_superuser((select auth.uid())));

drop policy if exists "business_finance_entries_admin_insert" on public.business_finance_entries;
create policy "business_finance_entries_admin_insert"
on public.business_finance_entries for insert
to authenticated
with check (private.is_superuser((select auth.uid())));

drop policy if exists "business_finance_entries_admin_update" on public.business_finance_entries;
create policy "business_finance_entries_admin_update"
on public.business_finance_entries for update
to authenticated
using (private.is_superuser((select auth.uid())))
with check (private.is_superuser((select auth.uid())));

drop policy if exists "business_finance_entries_admin_delete" on public.business_finance_entries;
create policy "business_finance_entries_admin_delete"
on public.business_finance_entries for delete
to authenticated
using (private.is_superuser((select auth.uid())));

drop policy if exists "tax_rules_admin_read" on public.tax_rules;
create policy "tax_rules_admin_read"
on public.tax_rules for select
to authenticated
using (private.is_superuser((select auth.uid())));

drop policy if exists "tax_rules_admin_insert" on public.tax_rules;
create policy "tax_rules_admin_insert"
on public.tax_rules for insert
to authenticated
with check (private.is_superuser((select auth.uid())));

drop policy if exists "tax_rules_admin_update" on public.tax_rules;
create policy "tax_rules_admin_update"
on public.tax_rules for update
to authenticated
using (private.is_superuser((select auth.uid())))
with check (private.is_superuser((select auth.uid())));

drop policy if exists "tax_rules_admin_delete" on public.tax_rules;
create policy "tax_rules_admin_delete"
on public.tax_rules for delete
to authenticated
using (private.is_superuser((select auth.uid())));

drop policy if exists "pricing_rules_admin_write" on public.pricing_rules;
drop policy if exists "pricing_rules_admin_insert" on public.pricing_rules;
drop policy if exists "pricing_rules_admin_update" on public.pricing_rules;
drop policy if exists "pricing_rules_admin_delete" on public.pricing_rules;
create policy "pricing_rules_admin_insert"
on public.pricing_rules for insert
to authenticated
with check (private.is_superuser((select auth.uid())));
create policy "pricing_rules_admin_update"
on public.pricing_rules for update
to authenticated
using (private.is_superuser((select auth.uid())))
with check (private.is_superuser((select auth.uid())));
create policy "pricing_rules_admin_delete"
on public.pricing_rules for delete
to authenticated
using (private.is_superuser((select auth.uid())));

drop policy if exists "app_settings_public_read" on public.app_settings;
create policy "app_settings_public_read"
on public.app_settings for select
to anon, authenticated
using (is_public = true or private.is_superuser((select auth.uid())));

drop policy if exists "app_settings_admin_write" on public.app_settings;
drop policy if exists "app_settings_admin_insert" on public.app_settings;
drop policy if exists "app_settings_admin_update" on public.app_settings;
drop policy if exists "app_settings_admin_delete" on public.app_settings;
create policy "app_settings_admin_insert"
on public.app_settings for insert
to authenticated
with check (private.is_superuser((select auth.uid())));
create policy "app_settings_admin_update"
on public.app_settings for update
to authenticated
using (private.is_superuser((select auth.uid())))
with check (private.is_superuser((select auth.uid())));
create policy "app_settings_admin_delete"
on public.app_settings for delete
to authenticated
using (private.is_superuser((select auth.uid())));

drop policy if exists "contact_messages_admin_read" on public.contact_messages;
create policy "contact_messages_admin_read"
on public.contact_messages for select
to authenticated
using (private.is_superuser((select auth.uid())));

drop policy if exists "contact_messages_admin_write" on public.contact_messages;
drop policy if exists "contact_messages_admin_insert" on public.contact_messages;
drop policy if exists "contact_messages_admin_update" on public.contact_messages;
drop policy if exists "contact_messages_admin_delete" on public.contact_messages;
create policy "contact_messages_admin_insert"
on public.contact_messages for insert
to authenticated
with check (private.is_superuser((select auth.uid())));
create policy "contact_messages_admin_update"
on public.contact_messages for update
to authenticated
using (private.is_superuser((select auth.uid())))
with check (private.is_superuser((select auth.uid())));
create policy "contact_messages_admin_delete"
on public.contact_messages for delete
to authenticated
using (private.is_superuser((select auth.uid())));

create index if not exists credit_ledger_user_created_idx on public.credit_ledger (user_id, created_at desc);
create index if not exists credit_ledger_created_by_idx on public.credit_ledger (created_by) where created_by is not null;
create unique index if not exists credit_ledger_midtrans_reference_unique_idx on public.credit_ledger (reference_id, reason) where reference_id is not null and reason = 'midtrans_payment';
create unique index if not exists signup_bonus_claims_user_id_key on public.signup_bonus_claims (user_id);
create index if not exists signup_bonus_claims_device_hash_idx on public.signup_bonus_claims (device_id_hash) where device_id_hash is not null;
create index if not exists signup_bonus_claims_ip_hash_idx on public.signup_bonus_claims (ip_hash) where ip_hash is not null;
create index if not exists signup_bonus_claims_created_at_idx on public.signup_bonus_claims (created_at desc);
create index if not exists business_finance_entries_entry_date_idx on public.business_finance_entries (entry_date desc);
create index if not exists business_finance_entries_entry_type_idx on public.business_finance_entries (entry_type, entry_date desc);
create index if not exists business_finance_entries_created_by_idx on public.business_finance_entries (created_by) where created_by is not null;
create index if not exists tax_rules_code_effective_from_idx on public.tax_rules (tax_code, effective_from desc);
create index if not exists tax_rules_effective_to_idx on public.tax_rules (effective_to) where effective_to is not null;
create index if not exists jobs_user_created_idx on public.jobs (user_id, created_at desc);
create unique index if not exists jobs_ai_ledger_id_unique_idx on public.jobs (ai_ledger_id) where ai_ledger_id is not null;
create index if not exists jobs_example_public_created_idx on public.jobs (is_example_public, created_at desc) where deleted_at is null;
create index if not exists jobs_deleted_created_idx on public.jobs (deleted_at, created_at desc);
create index if not exists manual_payments_user_created_idx on public.manual_payments (user_id, created_at desc);
create index if not exists manual_payments_approved_by_idx on public.manual_payments (approved_by) where approved_by is not null;
create index if not exists manual_payments_status_created_idx on public.manual_payments (status, created_at desc);
create unique index if not exists payment_transactions_order_id_unique_idx on public.payment_transactions (order_id);
create index if not exists payment_transactions_user_created_idx on public.payment_transactions (user_id, created_at desc);
create index if not exists payment_transactions_status_created_idx on public.payment_transactions (status, created_at desc);
create index if not exists contact_messages_status_created_idx on public.contact_messages (status, created_at desc);

drop function if exists public.handle_new_user();
drop function if exists public.is_superuser(uuid);
drop function if exists public.credit_balance(uuid);
