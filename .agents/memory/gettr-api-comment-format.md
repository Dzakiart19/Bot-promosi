---
name: GETTR API comment format
description: Format payload yang benar untuk postComment dan createPost di GETTR API; endpoint mana yang benar-benar berfungsi
---

# GETTR API — Format POST ke /api/u/post

## Rule
Gunakan **JSON body** (bukan FormData/multipart) untuk semua POST ke `/api/u/post`.

Field `rich_txt` TIDAK valid untuk komentar — pakai `txt`. Field `_t` wajib ada.

## Comment (reply ke post orang lain) — ENDPOINT YANG BEKERJA
```
POST /api/u/post
```
```json
{
  "content": {
    "txt": "<teks komentar>",
    "pid": "<parent post ID>",
    "uid": "<userId milik akun kita — numeric string>",
    "_t": "cmt"
  }
}
```
Header: `Content-Type: application/json`, `x-app-auth: {"user":"<userId>","token":"<token>"}`

GETTR menyimpan `pid` dengan benar — comment ter-link ke thread parent dan muncul di
comments list. ID yang dihasilkan format `p426...` (bukan `c37p...`), tapi relasi parent tetap benar.

## Endpoint TIDAK BEKERJA — JANGAN PAKAI
```
POST /api/u/post/{postId}/comment
```
Endpoint ini mengembalikan HTTP 400 `parent postId: {id} != null` untuk SEMUA post di trending,
tanpa kecuali, pada akun @celadini. Kemungkinan restriction server-side per akun. Jangan coba lagi.

## Standalone post
```json
{ "content": { "txt": "<teks>", "_t": "post" } }
```

## Auth header
`x-app-auth: {"user":"<userId numeric string>","token":"<token>"}`
`user` di x-app-auth adalah userId (angka), bukan handle/username.

**Why:** Endpoint baru `/u/post/{id}/comment` diblok GETTR server untuk akun ini (400 pada setiap test).
Endpoint lama `/u/post` + `pid` di body terbukti bekerja: comment muncul di thread, `pid` tersimpan benar,
dikonfirmasi via test `GET /u/post/{id}/comments` yang menunjukkan count bertambah.

**How to apply:** Setiap kali ada perubahan ke `postComment` di GETTR client — gunakan `/u/post` + `pid` di
body, BUKAN `/u/post/{id}/comment`. Verifikasi dengan cek comment list dari target post setelah test.
