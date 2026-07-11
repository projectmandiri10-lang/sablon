# Cloudflare Free Tier Copy

Folder ini adalah salinan siap deploy untuk Cloudflare Pages + Worker + Supabase.

## Isi Folder

- `frontend/` - aplikasi Vite untuk Cloudflare Pages
- `cloudflare-worker/` - API Worker
- `shared/` - konfigurasi bersama antara frontend dan worker
- `supabase/` - migration dan schema Supabase
- `supabase/SUPABASE_BOOTSTRAP.sql` - SQL bootstrap untuk project Supabase baru
- `.env` dan `.env.example` - env versi Cloudflare
- `DEPLOY_CLOUDFLARE_SUPABASE.md` - panduan deploy
- `INTERACTIVE_QRIS_NOTIFICATION_FORWARDER.md` - panduan QRIS gratis via NotificationForwarder

## Yang Berubah

- Jalur deploy dipisah dari backend Node/Express lama.
- `VITE_API_BASE_URL` mengarah ke Worker baru.
- `VITE_GOOGLE_OAUTH_REDIRECT_TO` mengarah ke domain Pages baru.
- AI redraw sekarang berjalan lewat `OpenAI` direct sebagai jalur utama dengan `OpenRouter` sebagai fallback otomatis.
- Default copy ini disetel ke `OpenAI-first` agar local, Worker, dan seed database konsisten.
- Jika secret `OPENAI_API_KEY` dan `OPENROUTER_API_KEY` belum diisi, jalur AI redraw nonaktif tetapi Ready Trace tetap bisa dipakai lewat proses lokal browser.

## Mulai Cepat

1. Baca `DEPLOY_CLOUDFLARE_SUPABASE.md`.
2. Isi `.env` dengan URL dan secret baru.
3. Deploy `cloudflare-worker/` dengan Wrangler.
4. Deploy `frontend/` ke Cloudflare Pages dengan root directory `frontend`.
5. Jalankan migration Supabase dari folder `supabase/`.
6. Jika project Supabase baru masih kosong, jalankan `supabase/SUPABASE_BOOTSTRAP.sql` di SQL Editor dulu.

## Catatan

- Folder `landing/` dan `backend/` sengaja tidak ikut ke copy ini karena bukan target Cloudflare free tier.
- Jalur AI redraw tidak mengirim token provider AI ke browser atau Supabase. Worker menerima upload dari browser, memanggil provider yang aktif, lalu mengembalikan hasil ke flow trace lokal browser yang membuat vector, film sablon, PDF, dan ZIP.
- Untuk pembayaran otomatis biaya rendah tanpa Open API berbayar, gunakan jalur `interactive_qris` yang didokumentasikan di `INTERACTIVE_QRIS_NOTIFICATION_FORWARDER.md`.
