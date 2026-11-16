-- Seed nilai terbaru dari migration Postgres (fresh start, tanpa data lama).

INSERT INTO pricing_rules (key, amount_idr, active, description, updated_at) VALUES
  ('ready_trace', 2000, 1, 'Vector Siap Proses SVG tanpa AI', '2026-07-19T00:00:00.000Z'),
  ('ai_redraw', 5000, 1, 'Promo perkenalan AI Redraw image-to-image termasuk pecah warna sablon', '2026-07-19T00:00:00.000Z'),
  ('separation_film', 0, 1, 'Download film separasi sablon gratis setelah proses gambar', '2026-07-19T00:00:00.000Z')
ON CONFLICT(key) DO UPDATE SET
  amount_idr = excluded.amount_idr,
  active = excluded.active,
  description = excluded.description,
  updated_at = excluded.updated_at;

INSERT INTO app_settings (key, value, is_public, description, updated_at) VALUES
  ('shopee_payment', '{"url":"https://shopee.co.id/","note":"Checkout nominal credit di Shopee, lalu kirim email akun Design Mudah melalui chat Shopee. Admin top up manual 5-15 menit pada jam kerja.","contact":""}', 1, 'Konfigurasi pembayaran manual Shopee', '2026-07-19T00:00:00.000Z'),
  ('app_status', '{"maintenance":false,"message":""}', 1, 'Status aplikasi publik', '2026-07-19T00:00:00.000Z'),
  ('example_jobs', '{"sticker":null,"sablon":null}', 1, 'Contoh gambar aktif untuk sticker dan sablon', '2026-07-19T00:00:00.000Z'),
  ('ai_redraw_model', '{"mode":"quality","preset":"quality","label":"Kualitas","provider":"aivene_image","primaryProvider":"aivene_image","fallbackProvider":"openai_image","aiveneImageModel":"gpt-image-2","openAiImageModel":"gpt-image-2","promptProfile":"logo_photo_cleanup_short","generationQuality":"medium","imageSize":"1K","inputMaxEdge":1080,"backgroundMode":"transparent","safetyEnabled":true,"aspectPolicy":"match_source","resolutionPolicy":"high","preprocess":"node_heuristic","persistPrompt":true,"retryOnLowConfidence":false,"estimatedUsdPerImage":0.05,"note":"Default AIVene GPT Image 2 dengan input maksimal 1080px, input_fidelity nonaktif, dan OpenAI fallback otomatis; trace berjalan lokal di browser."}', 0, 'AIVene GPT Image 2 + OpenAI fallback; input_fidelity nonaktif; trace dan artefak berjalan lokal di browser', '2026-07-19T00:00:00.000Z'),
  ('interactive_qris_payment', '{"enabled":false,"merchantName":"","qrImageUrl":"","qrPayload":"","instructions":"Scan QRIS merchant lalu bayar sesuai nominal unik yang muncul di billing.","contact":"","closedHours":{"enabled":true,"timezone":"Asia/Jakarta","start":"22:00","end":"05:00","message":"Pembayaran QRIS tutup pukul 22:00 sampai 05:00 WIB. Silakan pilih metode lain atau kembali saat jam operasional."}}', 1, 'Konfigurasi QRIS otomatis dengan nominal unik', '2026-07-19T00:00:00.000Z')
ON CONFLICT(key) DO UPDATE SET
  value = excluded.value,
  is_public = excluded.is_public,
  description = excluded.description,
  updated_at = excluded.updated_at;

INSERT INTO tax_rules (id, tax_code, rate_percent, effective_from, effective_to, note, created_at) VALUES
  ('tax-rule-umkm-default', 'umkm_final_revenue', 0.5, '2018-07-01', NULL, 'Default awal PPh Final UMKM 0,5 persen. Verifikasi berkala dengan konsultan pajak bila aturan berubah.', '2026-07-19T00:00:00.000Z')
ON CONFLICT(id) DO NOTHING;