insert into public.app_settings (key, value, is_public, description)
values (
  'interactive_qris_payment',
  '{
    "enabled": false,
    "merchantName": "",
    "qrImageUrl": "",
    "instructions": "Scan QRIS merchant lalu bayar sesuai nominal unik yang muncul di billing.",
    "contact": "",
    "closedHours": {
      "enabled": true,
      "timezone": "Asia/Jakarta",
      "start": "22:00",
      "end": "05:00",
      "message": "Pembayaran QRIS tutup pukul 22:00 sampai 05:00 WIB. Silakan pilih metode lain atau kembali saat jam operasional."
    }
  }'::jsonb,
  true,
  'Konfigurasi QRIS otomatis dengan nominal unik'
)
on conflict (key) do update
set value = coalesce(public.app_settings.value, '{}'::jsonb) || jsonb_build_object(
      'closedHours',
      coalesce(public.app_settings.value->'closedHours', excluded.value->'closedHours')
    ),
    is_public = excluded.is_public,
    description = excluded.description,
    updated_at = now();
