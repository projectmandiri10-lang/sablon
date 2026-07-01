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

drop trigger if exists payment_transactions_touch_updated_at on public.payment_transactions;
create trigger payment_transactions_touch_updated_at
before update on public.payment_transactions
for each row execute function public.touch_updated_at();

alter table public.payment_transactions enable row level security;

drop policy if exists "payment_transactions_select_own_or_admin" on public.payment_transactions;
create policy "payment_transactions_select_own_or_admin"
on public.payment_transactions for select
to authenticated
using (user_id = (select auth.uid()) or private.is_superuser((select auth.uid())));

create unique index if not exists credit_ledger_midtrans_reference_unique_idx
on public.credit_ledger (reference_id, reason)
where reference_id is not null and reason = 'midtrans_payment';

create unique index if not exists payment_transactions_order_id_unique_idx
on public.payment_transactions (order_id);

create index if not exists payment_transactions_user_created_idx
on public.payment_transactions (user_id, created_at desc);

create index if not exists payment_transactions_status_created_idx
on public.payment_transactions (status, created_at desc);
