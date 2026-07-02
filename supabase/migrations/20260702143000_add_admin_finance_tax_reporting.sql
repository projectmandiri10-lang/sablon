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

alter table public.business_finance_entries enable row level security;
alter table public.tax_rules enable row level security;

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

create index if not exists business_finance_entries_entry_date_idx on public.business_finance_entries (entry_date desc);
create index if not exists business_finance_entries_entry_type_idx on public.business_finance_entries (entry_type, entry_date desc);
create index if not exists business_finance_entries_created_by_idx on public.business_finance_entries (created_by) where created_by is not null;
create index if not exists tax_rules_code_effective_from_idx on public.tax_rules (tax_code, effective_from desc);
create index if not exists tax_rules_effective_to_idx on public.tax_rules (effective_to) where effective_to is not null;

insert into public.tax_rules (tax_code, rate_percent, effective_from, effective_to, note)
values
  ('umkm_final_revenue', 0.5, '2018-07-01', null, 'Default awal PPh Final UMKM 0,5 persen. Verifikasi berkala dengan konsultan pajak bila aturan berubah.')
on conflict do nothing;
