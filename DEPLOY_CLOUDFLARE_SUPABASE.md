# Deploy Cloudflare Free Tier

Panduan ini menyiapkan salinan project untuk:

- Frontend di Cloudflare Pages
- API di Cloudflare Worker
- Auth, database, credit, dan setting publik di Supabase

Folder ini sengaja hanya membawa bagian yang aman untuk free tier:

- `frontend/`
- `cloudflare-worker/`
- `shared/`
- `supabase/`

`landing/` dan `backend/` tidak dipakai di salinan ini.

## 1. Siapkan Supabase

1. Buat project baru di Supabase.
2. Ambil `Project URL` dan `publishable key` dari `Project Settings > API`.
3. Jalankan migration dari folder `supabase/migrations/` di project Supabase baru.
4. Pastikan tabel dan policy auth yang dipakai project ini sudah ikut terbentuk.

Gunakan placeholder env berikut:

```env
SUPABASE_PROJECT_REF=YOUR_NEW_PROJECT_REF
SUPABASE_URL=https://YOUR_NEW_PROJECT_REF.supabase.co
VITE_SUPABASE_URL=https://YOUR_NEW_PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=...
```

## 2. Aktifkan OAuth Google

Untuk Google OAuth via Supabase:

1. Buka Google Cloud Console.
2. Buat OAuth Client ID tipe web application.
3. Isi Authorized redirect URI dengan:

```text
https://YOUR_NEW_PROJECT_REF.supabase.co/auth/v1/callback
```

4. Tambahkan domain Pages baru Anda sebagai authorized origin.
5. Isi `GOOGLE_OAUTH_CLIENT_ID` dan `GOOGLE_OAUTH_CLIENT_SECRET` di Supabase Auth provider, bukan di Pages.

Env yang dipakai folder ini:

```env
GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=
GOOGLE_OAUTH_CALLBACK_URL=https://YOUR_NEW_PROJECT_REF.supabase.co/auth/v1/callback
VITE_GOOGLE_OAUTH_REDIRECT_TO=https://YOUR-PAGES-DOMAIN.pages.dev
```

## 3. Deploy Worker

Worker berada di `cloudflare-worker/`.

1. Masuk folder tersebut.
2. Login Wrangler.
3. Set secret Supabase dan optional processor.
4. Deploy ke Cloudflare Workers.

Contoh:

```powershell
cd cloudflare-worker
npm install
npx wrangler login
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler deploy
```

Env Worker yang penting:

```env
SUPABASE_URL=https://YOUR_NEW_PROJECT_REF.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
PROCESSOR_BASE_URL=
PROCESSOR_API_KEY=
```

Kalau `PROCESSOR_BASE_URL` dan `PROCESSOR_API_KEY` kosong, endpoint AI redraw tetap ada tetapi akan memberi pesan bahwa jalur itu belum diaktifkan.

Endpoint penting:

```text
GET  /api/app-config
GET  /api/me/balance
POST /api/jobs/quote
POST /api/jobs/commit
POST /api/image-retouch
POST /api/ai-redraw
```

## 4. Deploy Frontend ke Pages

Frontend berada di `frontend/`.

Set di Cloudflare Pages:

- Root directory: `frontend`
- Build command: `npm run build`
- Build output directory: `dist`

Environment variables Pages:

```env
VITE_SUPABASE_URL=https://YOUR_NEW_PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=...
VITE_API_BASE_URL=https://YOUR-WORKER-URL.workers.dev
VITE_GOOGLE_OAUTH_REDIRECT_TO=https://YOUR-PAGES-DOMAIN.pages.dev
```

Jika Anda masih testing lokal:

```env
VITE_API_BASE_URL=http://127.0.0.1:8787
VITE_GOOGLE_OAUTH_REDIRECT_TO=http://localhost:5173
```

## 5. Test Setelah Deploy

1. Buka domain Pages baru.
2. Coba register dan login Google.
3. Pastikan `GET /api/app-config` terbaca dari Worker.
4. Pastikan credit dan admin data terbaca dari Supabase.
5. Coba mode Ready Trace saat processor belum diisi.
6. Pastikan pesan error AI redraw jelas, bukan error teknis mentah.

## 6. Jika Anda Mau Menyalakan AI Redraw

Isi env ini di Worker atau processor eksternal:

```env
PROCESSOR_BASE_URL=https://your-processor.example.com
PROCESSOR_API_KEY=...
OPENROUTER_API_KEY=...
```

Mode ini tetap opsional dan bukan syarat untuk deploy Cloudflare free tier.
