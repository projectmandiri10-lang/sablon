# InterActive QRIS Gratis via NotificationForwarder

Panduan ini menjelaskan jalur **gratis** untuk top up QRIS otomatis di repo `cloudflare-free-tier` tanpa membeli `Open API` resmi InterActive QRIS.

Flow ini memakai:

- QRIS merchant statis InterActive
- `interactive_qris` payment flow yang sudah ada di Worker + frontend
- aplikasi Android **ItsAzni NotificationForwarder**
- satu HP Android yang menerima notifikasi sukses bayar dari aplikasi InterActive QRIS

## Ringkasan Arsitektur

1. User membuat instruksi pembayaran dari halaman Billing.
2. Worker membuat row `payment_transactions` dengan:
   - `provider='interactive_qris'`
   - `payment_type='qris_static_unique'`
   - `amount_idr` exact unique payable
   - `base_amount_idr` nominal dasar top up
   - `unique_code` 2 digit
   - `expired_at` 30 menit
3. User membayar ke QRIS merchant statis sesuai nominal unik.
4. Aplikasi InterActive QRIS di Android memunculkan notifikasi sukses bayar.
5. NotificationForwarder meneruskan notifikasi itu ke Worker webhook.
6. Worker memvalidasi secret, package name, lalu mencocokkan nominal notifikasi ke pending payment yang aktif.
7. Jika cocok, Worker menandai transaksi settled dan menambahkan saldo user melalui `credit_ledger`.

## 1. Env Worker

Isi env ini di runtime Worker:

```env
INTERACTIVE_QRIS_WEBHOOK_SECRET=isi-dengan-secret-panjang-random
INTERACTIVE_QRIS_SOURCE_PACKAGE=com.interactive.qrisid
INTERACTIVE_QRIS_MIN_AMOUNT_IDR=2000
INTERACTIVE_QRIS_UNIQUE_DIGITS=2
```

Catatan:

- `INTERACTIVE_QRIS_WEBHOOK_SECRET` harus sama persis dengan header yang dikirim NotificationForwarder.
- Jika package aplikasi InterActive QRIS di HP ternyata berbeda, gunakan package yang benar dari device tersebut.

## 2. App Setting yang Harus Diisi

Masuk ke tab `Setting aplikasi` di halaman superadmin, lalu isi `QRIS otomatis`:

- `Aktifkan QRIS otomatis`: centang
- `Nama merchant`: nama toko/merchant yang muncul di billing
- `URL gambar QR`: URL publik gambar QRIS statis
- `Instruksi billing`: instruksi singkat untuk user
- `Kontak admin`: nomor WhatsApp atau kontak bantuan

Field ini disimpan sebagai app setting publik `interactive_qris_payment`.

## 3. Setup NotificationForwarder

Standar aplikasi yang dipakai:

- GitHub: `https://github.com/ItsAzni/NotificationForwarder`

### Langkah Android

1. Install aplikasi NotificationForwarder.
2. Aktifkan `Notification Access`.
3. Set `Battery` ke `Unrestricted`.
4. Aktifkan `Auto Start` / `Background Run` jika ROM Android memerlukan.
5. Jika tersedia, kunci app di recent apps agar tidak dibersihkan otomatis.

### Filter aplikasi

Pilih hanya aplikasi **InterActive QRIS** sebagai sumber notifikasi.

### Endpoint webhook

```text
https://YOUR-WORKER.workers.dev/api/payments/interactive-qris/webhook
```

### HTTP method

```text
POST
```

### Header wajib

```text
x-interactive-qris-secret: YOUR_LONG_RANDOM_SECRET
```

### Payload JSON yang distandarkan

Payload minimum yang harus dikirim:

```json
{
  "packageName": "com.interactive.qrisid",
  "title": "InterActive QRIS",
  "text": "Pembayaran QRIS sukses sebesar Rp 10.237",
  "postedAt": "2026-07-11T10:00:00.000Z",
  "raw": {}
}
```

Minimal `packageName` dan `text` harus ada. `text` harus berisi nominal sukses bayar yang bisa diparsing Worker.

## 4. Hardening Operasional

- Gunakan **1 HP merchant khusus** jika memungkinkan.
- Pastikan HP selalu:
  - online
  - terhubung charger saat jam operasional
  - tidak menyembunyikan isi notifikasi di lock screen
- Hindari dua HP membaca merchant QRIS yang sama untuk mencegah notifikasi ganda atau inkonsisten.
- Setelah reboot, kirim notifikasi test untuk memastikan forwarder aktif kembali.

## 5. Checklist Verifikasi

### Verifikasi konfigurasi

- `GET /health` menampilkan `interactiveQrisConfigured: true`
- `GET /api/app-config` menampilkan:
  - `interactive_qris_payment.enabled: true`
  - `interactiveQrisAvailable: true`

### Verifikasi happy path

1. Buat instruksi QRIS dari halaman Billing.
2. Pastikan user melihat:
   - QR image
   - exact payable amount
   - base amount
   - unique code
   - expiry
   - contact
3. Bayar sesuai nominal unik.
4. Pastikan NotificationForwarder mengirim webhook ke Worker.
5. Cek hasil:
   - `payment_transactions.status` menjadi settled
   - `credited_ledger_id` terisi
   - saldo user bertambah sesuai nominal exact payment

### Verifikasi safety

- Secret salah harus `401`
- Package name salah harus di-ignore
- Notifikasi tanpa nominal harus di-ignore
- Nominal expired / tidak ada pending match harus di-ignore
- Webhook valid yang dikirim ulang tidak boleh double credit

## 6. Posisi Midtrans vs QRIS Gratis

- `Midtrans` tetap bisa dipakai sebagai jalur redirect otomatis terpisah.
- `Shopee` tetap bisa dipakai sebagai jalur manual.
- `InterActive QRIS + NotificationForwarder` adalah jalur **gratis** untuk notifikasi otomatis berbasis Android, tanpa membeli Open API resmi.
