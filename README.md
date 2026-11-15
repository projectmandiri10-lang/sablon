# Cloudflare Free Tier Copy

Folder ini adalah salinan siap deploy untuk Cloudflare Pages + Worker + D1 + R2 (tanpa Supabase).

## Isi Folder

- `frontend/` - aplikasi Vite untuk Cloudflare Pages
- `cloudflare-worker/` - API Worker (auth custom, data D1, storage R2)
- `cloudflare-worker/d1/` - skema + seed D1 (`0001_schema.sql`, `0002_seed.sql`)
- `shared/` - konfigurasi bersama antara frontend dan worker
- `supabase/` - **arsip sejarah** migration Supabase lama (deprecated, tidak dipakai lagi)
- `.env` dan `.env.example` - env versi Cloudflare
- `DEPLOY_CLOUDFLARE_SUPABASE.md` - panduan deploy Cloudflare-only (D1/R2/auth Worker)
- `INTERACTIVE_QRIS_NOTIFICATION_FORWARDER.md` - panduan QRIS gratis via NotificationForwarder
- `MACRODROID_INTERACTIVE_QRIS_IMPORT.md` - panduan import MacroDroid untuk relay QRIS gratis
- `macrodroid/` - file `.macro` siap import untuk MacroDroid

## Yang Berubah

- Backend penuh di Cloudflare: database D1 `sablon-db` (binding `DB`), storage R2 `sablon-assets` (binding `ASSETS`), auth custom di Worker (PBKDF2 + JWT + refresh token, Google OAuth via Worker). Supabase pensiun.
- Jalur deploy dipisah dari backend Node/Express lama.
- `VITE_API_BASE_URL` mengarah ke Worker baru; frontend tidak lagi memakai env Supabase.
- AI redraw sekarang berjalan lewat `AIVene` sebagai jalur utama dengan `OpenAI` sebagai fallback otomatis. Model AIVene default adalah `gpt-image-2`; Admin dapat memilih `gpt-image-1.5` sebagai alternatif tanpa mengubah fallback OpenAI `gpt-image-2`.
- Default copy ini disetel ke preset hemat `standard`: input AI maksimal 1080 px pada sisi terpanjang, `input_fidelity=low`, output `medium` 1K, dan tanpa retry low-confidence.
- Harga promo perkenalan AI redraw adalah Rp5.000 per gambar dan sudah termasuk pecah warna sablon; harga Vector Siap Proses tetap mengikuti pricing rule terpisah.
- Browser mengirim salinan WebP terkompresi untuk foto biasa atau PNG untuk gambar transparan; file upload asli tetap tersedia untuk preview dan proses lokal.
- Jika secret `AIVENE_API_KEY` dan `OPENAI_API_KEY` belum diisi, jalur AI redraw nonaktif tetapi Ready Trace tetap bisa dipakai lewat proses lokal browser.

## Mulai Cepat

1. Baca `DEPLOY_CLOUDFLARE_SUPABASE.md`.
2. Isi `.env` dan secret Worker (`AUTH_JWT_SECRET`, `GOOGLE_OAUTH_CLIENT_SECRET`, dll).
3. Buat D1 `sablon-db` + jalankan `cloudflare-worker/d1/0001_schema.sql` dan `0002_seed.sql`; buat R2 `sablon-assets`.
4. Deploy `cloudflare-worker/` dengan Wrangler.
5. Deploy `frontend/` ke Cloudflare Pages dengan root directory `frontend` (auto-deploy dari GitHub).

## Catatan

- Folder `landing/` dan `backend/` sengaja tidak ikut ke copy ini karena bukan target Cloudflare free tier.
- Folder `supabase/` dibiarkan sebagai arsip sejarah; jangan jalankan migration-nya lagi.
- Jalur AI redraw tidak mengirim token provider AI ke browser. Worker menerima upload dari browser, memanggil model AIVene yang dipilih Admin (`gpt-image-2` secara default atau `gpt-image-1.5`) dengan fidelity low, lalu mengembalikan PNG mentah AI. Jika AIVene gagal sesuai kebijakan fallback, OpenAI tetap memakai `gpt-image-2`. Browser meng-upscale PNG mentah tepat satu tahap dengan Pica pada faktor default 3,15× dan batas aman 4096 px, lalu menjalankan trace lokal untuk menghasilkan PNG, vector, film sablon, PDF, dan ZIP. Ready trace memakai analisis resolusi, ketajaman, dan kepadatan tepi lokal untuk menentukan kebutuhan upscale 3,15×; sumber SVG vector dilewatkan tanpa upscale. Trace ulang selalu dimulai dari sumber mentah dan mengganti seluruh artefak trace lama tanpa memanggil AI lagi.
- Untuk pembayaran otomatis biaya rendah tanpa Open API berbayar, gunakan jalur `interactive_qris` yang didokumentasikan di `INTERACTIVE_QRIS_NOTIFICATION_FORWARDER.md`. Jika Android 16 menolak NotificationForwarder, gunakan paket MacroDroid di `MACRODROID_INTERACTIVE_QRIS_IMPORT.md`.
