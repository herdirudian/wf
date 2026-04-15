## Operasional (Cron, Webhook, Backup)

### Environment Variables

- `CRON_TOKEN`
  - Dipakai untuk endpoint cron:
    - `POST /api/cron/payments/cleanup`
    - `POST /api/cron/webhooks/process`
    - `POST /api/cron/xendit/reconcile`
  - Kirim melalui header: `x-cron-token: <CRON_TOKEN>`
  - Alternatif: `Authorization: Bearer <CRON_TOKEN>`
  - Alternatif (darurat / untuk debug forwarding header): query param `?token=<CRON_TOKEN>`

### Cron Scheduler (VPS / Panel)

Jalankan periodic:

1) Auto-cancel booking yang invoice Xendit expired (fallback tanpa webhook)
- `POST /api/cron/payments/cleanup`
- Rekomendasi jadwal: setiap 5–10 menit

2) Proses ulang webhook yang sudah tersimpan tapi gagal diproses
- `POST /api/cron/webhooks/process`
- Rekomendasi jadwal: setiap 5–10 menit

3) Reconcile status invoice langsung dari Xendit (jika ada missing callback)
- `POST /api/cron/xendit/reconcile`
- Rekomendasi jadwal: setiap 10–30 menit

Contoh (Linux cron + curl):

```bash
curl -sS -X POST "https://YOUR_DOMAIN/api/cron/payments/cleanup" -H "x-cron-token: YOUR_CRON_TOKEN"
curl -sS -X POST "https://YOUR_DOMAIN/api/cron/webhooks/process" -H "x-cron-token: YOUR_CRON_TOKEN"
curl -sS -X POST "https://YOUR_DOMAIN/api/cron/xendit/reconcile" -H "x-cron-token: YOUR_CRON_TOKEN"

curl -sS -X POST "https://YOUR_DOMAIN/api/cron/payments/cleanup" -H "Authorization: Bearer YOUR_CRON_TOKEN"
curl -sS -X POST "https://YOUR_DOMAIN/api/cron/payments/cleanup?token=YOUR_CRON_TOKEN"
```

### Webhook Xendit

- Endpoint: `POST /api/webhooks/xendit`
- Jika webhook valid, sistem:
  - Menyimpan payload webhook ke DB (`GatewayWebhookEvent`)
  - Mengembalikan HTTP 200 (cepat)
  - Memproses pembayaran secara asynchronous (dan bisa diproses ulang via cron)

### Reprocess Manual (Admin)

Jika butuh sinkron manual per payment:

- `POST /api/payments/{paymentId}/reconcile`
  - Membaca invoice dari Xendit (by invoice id / `gatewayRef`)
  - Mengupdate status payment/booking berdasarkan status terbaru

### Backup & Recovery (MySQL)

#### Backup (mysqldump)

1) Backup database:

```bash
mysqldump -u root -p woodforest_jayagiri_48 > backup_woodforest_jayagiri_48.sql
```

2) Simpan file `.sql` ke lokasi terpisah (offsite) dan lakukan rotasi (harian/mingguan).

#### Restore

1) Buat database kosong (jika belum ada):

```bash
mysql -u root -p -e "CREATE DATABASE woodforest_jayagiri_48;"
```

2) Restore:

```bash
mysql -u root -p woodforest_jayagiri_48 < backup_woodforest_jayagiri_48.sql
```

#### Catatan

- Setelah restore, jalankan `prisma db push` untuk memastikan schema sesuai aplikasi.
- Pastikan backup mencakup file konfigurasi environment (`.env`) secara aman (jangan disebar publik).
