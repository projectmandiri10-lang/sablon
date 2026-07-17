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
- `MACRODROID_INTERACTIVE_QRIS_IMPORT.md` - panduan import MacroDroid untuk relay QRIS gratis
- `macrodroid/` - file `.macro` siap import untuk MacroDroid

## Yang Berubah

- Jalur deploy dipisah dari backend Node/Express lama.
- `VITE_API_BASE_URL` mengarah ke Worker baru.
- `VITE_GOOGLE_OAUTH_REDIRECT_TO` mengarah ke domain Pages baru.
- AI redraw sekarang berjalan lewat `AIVene` sebagai jalur utama dengan `OpenAI` sebagai fallback otomatis.
- Default copy ini disetel ke preset hemat `standard`: input AI maksimal 1080 px pada sisi terpanjang, `input_fidelity=low`, output `medium` 1K, dan tanpa retry low-confidence.
- Browser mengirim salinan WebP terkompresi untuk foto biasa atau PNG untuk gambar transparan; file upload asli tetap tersedia untuk preview dan proses lokal.
- Jika secret `AIVENE_API_KEY` dan `OPENAI_API_KEY` belum diisi, jalur AI redraw nonaktif tetapi Ready Trace tetap bisa dipakai lewat proses lokal browser.

## Mulai Cepat

1. Baca `DEPLOY_CLOUDFLARE_SUPABASE.md`.
2. Isi `.env` dengan URL dan secret baru.
3. Deploy `cloudflare-worker/` dengan Wrangler.
4. Deploy `frontend/` ke Cloudflare Pages dengan root directory `frontend`.
5. Jalankan migration Supabase dari folder `supabase/`.
6. Jika project Supabase baru masih kosong, jalankan `supabase/SUPABASE_BOOTSTRAP.sql` di SQL Editor dulu.

## Helper Supabase CLI

- Gunakan `.\supabase\scripts\supabase-cli.ps1` agar CLI lokal otomatis memakai `SUPABASE_ACCESS_TOKEN` dan `SUPABASE_PROJECT_REF` dari `.env` repo ini.
- Contoh cek project: `.\supabase\scripts\supabase-cli.ps1 projects list`
- Contoh link ke project repo: `.\supabase\scripts\supabase-cli.ps1 link`

## Catatan

- Folder `landing/` dan `backend/` sengaja tidak ikut ke copy ini karena bukan target Cloudflare free tier.
- Jalur AI redraw tidak mengirim token provider AI ke browser atau Supabase. Worker menerima upload dari browser, memanggil AIVene GPT Image 2 dengan fidelity low, lalu mengembalikan PNG mentah AI. Browser meng-upscale PNG mentah tepat satu tahap dengan Pica pada faktor default 3,15× dan batas aman 4096 px, lalu menjalankan trace lokal untuk menghasilkan PNG, vector, film sablon, PDF, dan ZIP. Ready trace memakai analisis resolusi, ketajaman, dan kepadatan tepi lokal untuk menentukan kebutuhan upscale 3,15×; sumber SVG vector dilewatkan tanpa upscale. Trace ulang selalu dimulai dari sumber mentah dan mengganti seluruh artefak trace lama tanpa memanggil AI lagi.
- Untuk pembayaran otomatis biaya rendah tanpa Open API berbayar, gunakan jalur `interactive_qris` yang didokumentasikan di `INTERACTIVE_QRIS_NOTIFICATION_FORWARDER.md`. Jika Android 16 menolak NotificationForwarder, gunakan paket MacroDroid di `MACRODROID_INTERACTIVE_QRIS_IMPORT.md`.
