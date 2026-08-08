# MacroDroid Import - InterActive QRIS Relay

Panduan ini menyiapkan MacroDroid sebagai relay gratis dari notifikasi aplikasi InterActive QRIS ke Worker production.

## File Import

File macro:

```text
macrodroid/interactive-qris-relay.macro
```

Macro ini sudah diset untuk:

- trigger: notifikasi dari app `com.interactive.qrisid`
- action: HTTP Request `POST`
- webhook: `https://sablon.jho-j80.workers.dev/api/payments/interactive-qris/webhook`
- payload:

```json
{
  "packageName": "{not_app_package}",
  "title": "{not_title}",
  "text": "{notification}",
  "raw": "{not_text_big}"
}
```

## Secret Yang Harus Sama

Pasang secret ini di Cloudflare Worker:

```env
INTERACTIVE_QRIS_WEBHOOK_SECRET=qris_whsec_8kR4mN2pV7xL1sQa6tH9cD3yB5uF0wZe
```

Isi juga nilai yang sama di MacroDroid secure variable:

```text
IQRIS_WEBHOOK_SECRET=qris_whsec_8kR4mN2pV7xL1sQa6tH9cD3yB5uF0wZe
```

Catatan: MacroDroid export/import biasanya tidak membawa nilai secure variable. Setelah import, buka variable `IQRIS_WEBHOOK_SECRET` dan paste secret di atas satu kali.

## Cara Import

1. Pindahkan file `macrodroid/interactive-qris-relay.macro` ke HP Android.
2. Buka MacroDroid.
3. Masuk ke menu import macro.
4. Pilih file `interactive-qris-relay.macro`.
5. Setelah macro muncul, cek bagian `Variables`.
6. Isi secure variable `IQRIS_WEBHOOK_SECRET`.
7. Pastikan macro aktif.

## Permission Android

Aktifkan izin berikut untuk MacroDroid:

- `Notification Access`
- Battery: `Unrestricted`
- Auto-start atau background run jika tersedia di ROM Android
- Kunci MacroDroid di recent apps jika vendor Android menyediakan opsi itu

## Cek Konfigurasi Macro

Pastikan macro berisi:

- Trigger: `Notification Received`
- App/package: `InterActive QRIS` / `com.interactive.qrisid`
- HTTP method: `POST`
- URL: `https://sablon.jho-j80.workers.dev/api/payments/interactive-qris/webhook`
- Header:

```text
Content-Type: application/json
x-interactive-qris-secret: {v=IQRIS_WEBHOOK_SECRET}
```

Jika MacroDroid di versi HP Anda tidak mengenali `{v=IQRIS_WEBHOOK_SECRET}`, buka action HTTP Request lalu pilih magic text variable `IQRIS_WEBHOOK_SECRET` dari picker MacroDroid.

## Test End-to-End

1. Pastikan `GET /health` di Worker menampilkan `interactiveQrisConfigured: true`.
2. Buat instruksi QRIS dari halaman Billing.
3. Bayar nominal unik yang tampil.
4. Tunggu notifikasi sukses dari aplikasi InterActive QRIS.
5. MacroDroid harus menampilkan toast status webhook.
6. Cek transaksi:
   - `payment_transactions.status` menjadi `settlement`
   - `credited_ledger_id` terisi
   - saldo user bertambah

## Troubleshooting

- Jika Worker mengembalikan `401`, secret di Cloudflare Worker dan MacroDroid belum sama.
- Jika webhook diterima tapi di-ignore, cek `packageName` harus `com.interactive.qrisid`.
- Jika nominal tidak terdeteksi, cek isi `{notification}` atau `{not_text_big}` harus memuat teks nominal seperti `Rp 10.237`.
- Jika macro tidak jalan, cek lagi `Notification Access`, battery unrestricted, dan filter app InterActive QRIS.
