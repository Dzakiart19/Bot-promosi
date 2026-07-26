---
name: Multi-platform bot dashboard architecture
description: Bagaimana dashboard monitor menampilkan beberapa bot platform sekaligus secara konsisten.
---

Setiap bot platform (OpenTalk, Yapping, SillyChat, Chatib, DuckChat, X) berjalan sebagai proses Express terpisah di port sendiri
dengan singleton stats sendiri (lib/core/stats.js) — tidak ada state yang dibagi antar proses secara langsung.

Untuk dashboard yang menampilkan SEMUA platform sekaligus dan konsisten di port mana pun dibuka:
setiap instance server men-fetch stats platform lain via HTTP ke `http://localhost:<port>/api/stats`
(server-to-server dalam container yang sama), digabung lewat endpoint `GET /api/stats/all`.
Daftar platform (nama + port) disimpan di `lib/core/platforms-registry.js` sebagai satu-satunya sumber kebenaran.

**Why:** browser fetch cross-port dari sisi klien akan kena cross-origin issue dan rumit di proxy Replit;
fetch server-side via localhost jauh lebih andal karena semua proses ada di container yang sama.

**How to apply:** menambah platform baru ke dashboard = tambah satu baris di platforms-registry.js.
Jangan hardcode nama/port platform di monitor.html — semua harus datang dari registry + /api/stats/all.
