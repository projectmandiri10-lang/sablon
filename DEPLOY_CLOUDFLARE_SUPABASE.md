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
5. Jika project baru masih kosong atau muncul error `public.profiles`, jalankan `supabase/SUPABASE_BOOTSTRAP.sql` di SQL Editor Supabase.
6. Di `Authentication > Providers > Email`, aktifkan leaked password protection agar warning security dasar Supabase ikut berkurang.

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
3. Set secret Supabase, LiteLLM, dan OpenRouter.
4. Deploy ke Cloudflare Workers.

Contoh:

```powershell
cd cloudflare-worker
npm install
npx wrangler login
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler secret put LITELLM_SECRET_KEY
npx wrangler secret put OPENROUTER_API_KEY
npx wrangler deploy
```

Env Worker yang penting:

```env
SUPABASE_URL=https://YOUR_NEW_PROJECT_REF.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
LITELLM_SECRET_KEY=...
LITELLM_BASE_URL=https://litellm.example.com/v1
LITELLM_IMAGE_MODEL=openai/gpt-image-1.5
LITELLM_APP_NAME=EasyRedesign Pro
LITELLM_MAX_IMAGE_INPUT_BYTES=3200000
OPENROUTER_API_KEY=...
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
OPENROUTER_IMAGE_MODEL=black-forest-labs/flux.2-klein-4b
OPENROUTER_IMAGE_MODEL_FALLBACK=sourceful/riverflow-v2-fast
OPENROUTER_SAFETY_MODEL=nvidia/nemotron-3.5-content-safety:free
OPENROUTER_PROMPT_PROFILE=generic_trace_clone
OPENROUTER_IMAGE_QUALITY=high
OPENROUTER_IMAGE_SIZE=1K
OPENROUTER_MAX_IMAGE_INPUT_BYTES=3200000
AI_REDRAW_PRIMARY_PROVIDER=litellm_image
AI_REDRAW_FALLBACK_PROVIDER=openrouter_image
```

`SUPABASE_ACCESS_TOKEN` tidak dibutuhkan oleh runtime Worker di Cloudflare. Token itu hanya berguna untuk tooling lokal seperti MCP atau Supabase CLI.

Kalau secret LiteLLM dan OpenRouter sama-sama kosong, endpoint AI redraw tetap ada tetapi akan memberi pesan bahwa jalur itu belum diaktifkan.

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
5. Coba mode Ready Trace saat secret LiteLLM dan OpenRouter belum diisi; mode ini diproses lokal di browser dan hanya memakai Worker untuk quote/commit credit.
6. Pastikan pesan error AI redraw jelas, bukan error teknis mentah.

## 6. Jika Anda Mau Menyalakan AI Redraw

Isi env ini di Worker:

```env
LITELLM_SECRET_KEY=...
OPENROUTER_API_KEY=...
```

Mode ini tetap opsional dan bukan syarat untuk deploy Cloudflare free tier, tetapi tanpa secret LiteLLM dan tanpa fallback OpenRouter, jalur AI redraw tidak aktif.
