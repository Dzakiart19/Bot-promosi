---
name: Ban/rate-limit backoff untuk polling bot
description: Kapan dan bagaimana menambahkan backoff saat platform target mem-ban/rate-limit sesi bot secara berturut-turut
---

Kalau bot dapat respons ban/rate-limit dari platform target (event "userBanned" via socket,
atau error "ban"/"ratelimit" dari HTTP endpoint), JANGAN retry di jeda tetap (misal LOOP_DELAY_MS 1.5s) —
itu cuma memperparah ban dan boros resource. Deteksi kondisi ban di reason/error sesi, hitung
banStreak (reset ke 0 begitu satu sesi sukses normal), lalu tambahkan exponential backoff
di atas LOOP_DELAY_MS.

**Why:** Ban berturut-turut meski identitas guest berbeda tiap kali biasanya indikasi ban di level
IP/fingerprint dari platform, bukan bug di kode bot. Backoff tidak "menghapus" ban itu, tapi
mencegah bot terus menghajar endpoint yang sudah menolak dan mengurangi beban tak berguna.

**How to apply:** Kalau platform baru juga mulai menunjukkan pola ban/rate-limit berturut-turut,
pasang pola yang sama (banStreak counter + banBackoffMs) di main loop bot-nya, bukan menaikkan
LOOP_DELAY_MS statis. Ini bukan solusi permanen untuk ban IP-level — kalau butuh "unban" beneran,
itu di luar cakupan kode (perlu ganti IP/proxy), harus disampaikan jujur ke user.
