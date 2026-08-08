alter table public.payment_transactions
  add column if not exists base_amount_idr integer,
  add column if not exists unique_code integer;

create unique index if not exists credit_ledger_interactive_qris_reference_unique_idx
on public.credit_ledger (reference_id, reason)
where reference_id is not null and reason = 'interactive_qris_payment';

create unique index if not exists payment_transactions_interactive_qris_pending_amount_unique_idx
on public.payment_transactions (amount_idr)
where provider = 'interactive_qris' and status = 'pending';

insert into public.app_settings (key, value, is_public, description)
values (
  'interactive_qris_payment',
  '{
    "enabled": false,
    "merchantName": "",
    "qrImageUrl": "",
    "instructions": "Scan QRIS merchant lalu bayar sesuai nominal unik yang muncul di billing.",
    "contact": ""
  }'::jsonb,
  true,
  'Konfigurasi QRIS otomatis dengan nominal unik'
)
on conflict (key) do update
set value = case
      when public.app_settings.value is null or public.app_settings.value = '{}'::jsonb then excluded.value
      else public.app_settings.value
    end,
    is_public = excluded.is_public,
    description = excluded.description,
    updated_at = now();
