# Midtrans Integration

Catatan:

- Dokumen ini khusus untuk jalur `Midtrans Snap Redirect`.
- Untuk jalur **gratis** berbasis merchant QRIS statis + notifikasi Android, lihat [`INTERACTIVE_QRIS_NOTIFICATION_FORWARDER.md`](./INTERACTIVE_QRIS_NOTIFICATION_FORWARDER.md).
- Midtrans sekarang opsional; repo ini juga mendukung `interactive_qris` sebagai jalur auto top-up tanpa Open API InterActive berbayar.

Panduan ini menjelaskan integrasi `Midtrans Snap Redirect + auto credit` untuk repo `cloudflare-free-tier` per 1 Juli 2026.

## Arsitektur

- `frontend/` menampilkan halaman billing, membuat checkout Midtrans, dan me-refresh status transaksi user.
- `cloudflare-worker/` membuat transaksi Snap, menerima webhook Midtrans, memverifikasi signature, sinkron status, lalu menambah credit ke `credit_ledger`.
- `supabase/` menyimpan transaksi gateway otomatis di tabel `public.payment_transactions`.
- Flow `Shopee` manual tetap terpisah di `manual_payments` dan tidak diganti.

## Env Worker

Tambahkan variabel ini ke Worker runtime:

- `MIDTRANS_SERVER_KEY`
  - Secret.
  - Isi dengan Server Key Midtrans Sandbox atau Production sesuai environment.
- `MIDTRANS_IS_PRODUCTION`
  - Bukan secret.
  - Gunakan `0` untuk sandbox dan `1` untuk production.
- `APP_BASE_URL`
  - Bukan secret.
  - URL aplikasi Pages yang akan menerima redirect balik dari Midtrans, misalnya `https://your-app.pages.dev`.

Variabel terkait Supabase yang tetap dibutuhkan:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Contoh kontrak lokal sudah ditambahkan ke [`.env.example`](./.env.example).

## Endpoint yang Ditambahkan

- `POST /api/payments/midtrans/checkout`
  - Auth user.
  - Body: `{ "amountIdr": 25000 }`
  - Membuat transaksi Snap dan mengembalikan `redirectUrl`.
- `GET /api/payments/midtrans`
  - Auth user.
  - Menampilkan riwayat transaksi Midtrans user.
- `POST /api/payments/midtrans/:orderId/refresh`
  - Auth user.
  - Mengambil status terbaru dari Midtrans Status API.
- `POST /api/payments/midtrans/webhook`
  - Public endpoint.
  - Dipanggil oleh Midtrans notification webhook.
- `GET /api/admin/midtrans-payments`
  - Auth admin.
  - Monitoring read-only transaksi Midtrans.

## Setup Sandbox

1. Isi `MIDTRANS_SERVER_KEY` dengan Sandbox Server Key.
2. Set `MIDTRANS_IS_PRODUCTION=0`.
3. Set `APP_BASE_URL` ke domain Pages aktif.
4. Deploy Worker dan frontend.
5. Jalankan migration Supabase terbaru.

## URL yang Dipasang di Midtrans Dashboard

Pasang URL publik berikut di Midtrans Merchant Administration Portal:

- Payment Notification URL
  - `https://YOUR-WORKER.workers.dev/api/payments/midtrans/webhook`
- Finish Redirect URL
  - `https://YOUR-PAGES-DOMAIN.pages.dev/`
- Unfinished Redirect URL
  - `https://YOUR-PAGES-DOMAIN.pages.dev/`
- Error Redirect URL
  - `https://YOUR-PAGES-DOMAIN.pages.dev/`

Catatan:

- Worker juga mengirim `callbacks.finish` spesifik per transaksi agar aplikasi tahu `order_id` yang harus di-refresh.
- Notification URL harus bisa diakses publik. Midtrans tidak bisa mengirim webhook ke `localhost`.

## Deploy

1. Deploy `cloudflare-worker/` dengan secret dan vars di atas.
2. Deploy `frontend/` ke Cloudflare Pages.
3. Jalankan migration baru dan pastikan tabel `payment_transactions` terbentuk.
4. Uji membuat top-up sandbox dari halaman billing user.
5. Setelah pembayaran sandbox selesai, cek:
   - row `payment_transactions` berubah status
   - `credited_ledger_id` terisi
   - saldo user bertambah

## Verifikasi Pasca Deploy

- Buka `GET /health` pada Worker dan pastikan `midtransConfigured: true`.
- Buat checkout nominal kecil, misalnya `Rp2.000`.
- Selesaikan pembayaran sandbox.
- Pastikan billing user menampilkan status terbaru.
- Pastikan admin melihat transaksi yang sama di tab `Pembayaran`.

## Go-Live Checklist

- Ganti `MIDTRANS_SERVER_KEY` ke production.
- Set `MIDTRANS_IS_PRODUCTION=1`.
- Pastikan URL Notification dan Redirect di dashboard mengarah ke domain production final.
- Uji satu transaksi production bernilai kecil.
- Pantau webhook dan pastikan tidak ada duplicate credit.

## Referensi Resmi

- Snap integration guide: https://docs.midtrans.com/docs/snap-snap-integration-guide
- Webhook notification: https://docs.midtrans.com/docs/https-notification-webhooks
- Transaction status API: https://docs.midtrans.com/reference/get-transaction-status
- Payment settings: https://docs.midtrans.com/docs/payment-settings
