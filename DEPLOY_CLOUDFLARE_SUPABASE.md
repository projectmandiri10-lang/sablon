# Deploy Cloudflare-Only (D1 + R2 + Auth Worker)

Panduan ini menyiapkan project sepenuhnya di ekosistem Cloudflare:

- Frontend di Cloudflare Pages (`sablon-5gx`)
- API di Cloudflare Worker (`sablon`)
- Database di Cloudflare D1 (`sablon-db`, binding `DB`)
- Storage aset di Cloudflare R2 (`sablon-assets`, binding `ASSETS`)
- Auth custom di Worker: password PBKDF2 + JWT + refresh token (D1), Google OAuth via Worker

Supabase sudah tidak dipakai (project lama disuspend permanen). Folder `supabase/` hanya arsip sejarah migration lama dan tidak perlu dijalankan lagi.

## 1. Siapkan D1

```powershell
cd cloudflare-worker
npx wrangler login
npx wrangler d1 create sablon-db
```

Salin `database_id` yang muncul ke `wrangler.toml` pada blok `[[d1_databases]]`, lalu jalankan skema dan seed:

```powershell
npx wrangler d1 execute sablon-db --remote --file d1/0001_schema.sql
npx wrangler d1 execute sablon-db --remote --file d1/0002_seed.sql
```

Skema membentuk 12 tabel (11 tabel domain + `sessions` untuk refresh token). Seed mengisi `pricing_rules` (ready_trace Rp2.000, ai_redraw promo Rp5.000, separation_film gratis), `app_settings` default (termasuk jam tutup QRIS 22:00-05:00 Asia/Jakarta), dan tax rule UMKM 0,5%.

## 2. Siapkan R2

Aktifkan R2 sekali lewat dashboard Cloudflare (menu R2, terima ketentuan free tier), lalu:

```powershell
npx wrangler r2 bucket create sablon-assets
```

Objek disimpan dengan key `example-jobs/<path>` dan disajikan publik lewat route Worker `GET /api/assets/example-jobs/*` (tanpa bucket public access).

## 3. Aktifkan OAuth Google

1. Buka Google Cloud Console, pilih OAuth Client ID tipe web application yang sudah ada.
2. Tambahkan Authorized redirect URI:

```text
https://sablon.jho-j80.workers.dev/api/auth/google/callback
```

3. Simpan client secret untuk di-set sebagai secret Worker `GOOGLE_OAUTH_CLIENT_SECRET`.

Flow: frontend mengarahkan browser ke `GET /api/auth/google` di Worker; Worker membuat state JWT bertanda tangan, redirect ke Google, lalu callback menukar code, upsert profile, dan redirect balik ke Pages dengan hash `#access_token=...&refresh_token=...`.

## 4. Set Secrets Worker

```powershell
cd cloudflare-worker
npx wrangler secret put AUTH_JWT_SECRET
npx wrangler secret put GOOGLE_OAUTH_CLIENT_SECRET
npx wrangler secret put MIDTRANS_SERVER_KEY
npx wrangler secret put SIGNUP_BONUS_HASH_SALT
npx wrangler secret put INTERACTIVE_QRIS_WEBHOOK_SECRET
npx wrangler secret put AIVENE_API_KEY
npx wrangler secret put OPENAI_API_KEY
```

- `AUTH_JWT_SECRET`: generate acak, mis. `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`. Dipakai untuk menandatangani access JWT (15 menit) dan state OAuth.
- `SIGNUP_BONUS_HASH_SALT`: salt hash guard device/IP bonus signup Rp5.000.
- `INTERACTIVE_QRIS_WEBHOOK_SECRET`: harus sama dengan secure variable MacroDroid/NotificationForwarder.
- Secret provider AI dan Midtrans yang sudah ada di dashboard tetap berlaku (tidak berubah oleh migrasi).

Variabel non-secret ada di `wrangler.toml` (`APP_BASE_URL` = domain Pages, `WORKER_BASE_URL` = domain Worker, `GOOGLE_OAUTH_CLIENT_ID`, konfigurasi AI redraw, QRIS, Midtrans client key).

## 5. Deploy Worker

```powershell
npx wrangler deploy
```

Verifikasi cepat:

```text
GET https://sablon.jho-j80.workers.dev/            -> flag d1Configured/r2Configured/authConfigured true
GET https://sablon.jho-j80.workers.dev/api/app-config -> settings publik + fitur QRIS
```

Endpoint auth baru:

```text
POST /api/auth/signup
POST /api/auth/login
POST /api/auth/refresh
POST /api/auth/logout
GET  /api/auth/google
GET  /api/auth/google/callback
GET  /api/assets/example-jobs/*
```

Endpoint lama (jobs, payments, admin, balance) tetap dengan kontrak API yang sama; semua data kini dari D1 dan aset dari R2.

## 6. Deploy Frontend ke Pages

Frontend berada di `frontend/` dan sudah terhubung ke GitHub (auto-deploy saat push ke `main`).

Set di Cloudflare Pages:

- Root directory: `frontend`
- Build command: `npm run build`
- Build output directory: `dist`

Environment variables Pages (cukup satu):

```env
VITE_API_BASE_URL=https://sablon.jho-j80.workers.dev
```

Untuk testing lokal, isi `frontend/.env.local` dengan `VITE_API_BASE_URL=http://127.0.0.1:8787` dan jalankan `npx wrangler dev` di `cloudflare-worker/`.

## 7. Test Setelah Deploy

1. Buka domain Pages, register email baru -> bonus signup Rp5.000 masuk otomatis.
2. Logout, login ulang dengan email/password.
3. Login Google (pastikan redirect URI sudah terdaftar).
4. Checkout QRIS dinamis: nominal unik 2 digit, QR payload dinamis muncul.
5. Kirim webhook settlement (MacroDroid) -> saldo masuk tepat sekali (idempotent).
6. Login sebagai `jho.j80@gmail.com` (superuser di-seed saat signup/login pertama email itu) -> cek admin finance, settings, isi qrPayload QRIS statis, upload gambar QRIS, publish example job.
7. Coba Midtrans sandbox bila diaktifkan.

## 8. Test Lokal

```powershell
cd cloudflare-worker
npm test        # 97 test, D1 asli via node:sqlite (Node >= 22.5)
cd ../frontend
npm test        # 48 test
npm run build
```

Test worker memakai skema SQL asli dari `d1/*.sql` lewat adapter `node:sqlite`, jadi perilaku SQL (unique index, cascade, SUM saldo) teruji nyata, bukan mock.

## Catatan

- Tidak ada verifikasi email / reset password (parity dengan kondisi sebelumnya).
- Akun admin tetap `jho.j80@gmail.com`; password di-set saat signup pertama email itu, atau langsung login Google.
- Artefak job user tetap disimpan di browser (IndexedDB); D1 hanya menyimpan metadata.
- Free tier: D1 5 GB, R2 10 GB, Workers 100k request/hari.