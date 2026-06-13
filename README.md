# Cloudflare Free Tier Copy

Folder ini adalah salinan siap deploy untuk Cloudflare Pages + Worker + Supabase.

## Isi Folder

- `frontend/` - aplikasi Vite untuk Cloudflare Pages
- `cloudflare-worker/` - API Worker
- `shared/` - konfigurasi bersama antara frontend dan worker
- `supabase/` - migration dan schema Supabase
- `.env` dan `.env.example` - env versi Cloudflare
- `DEPLOY_CLOUDFLARE_SUPABASE.md` - panduan deploy

## Yang Berubah

- Jalur deploy dipisah dari backend Node/Express lama.
- `VITE_API_BASE_URL` mengarah ke Worker baru.
- `VITE_GOOGLE_OAUTH_REDIRECT_TO` mengarah ke domain Pages baru.
- AI redraw tetap opsional. Kalau `PROCESSOR_BASE_URL` dan `PROCESSOR_API_KEY` belum diisi, Worker akan memberi pesan yang jelas dan jalur Ready Trace tetap bisa dipakai.

## Mulai Cepat

1. Baca `DEPLOY_CLOUDFLARE_SUPABASE.md`.
2. Isi `.env` dengan URL dan secret baru.
3. Deploy `cloudflare-worker/` dengan Wrangler.
4. Deploy `frontend/` ke Cloudflare Pages dengan root directory `frontend`.
5. Jalankan migration Supabase dari folder `supabase/`.

## Catatan

- Folder `landing/` dan `backend/` sengaja tidak ikut ke copy ini karena bukan target Cloudflare free tier.
- Jika Anda ingin menyalakan AI redraw eksternal nanti, isi env processor di worker dan backend eksternal itu tetap dijalankan di luar Cloudflare.
