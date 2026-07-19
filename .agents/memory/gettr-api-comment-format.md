---
name: GETTR API comment format
description: Format payload yang benar untuk postComment dan createPost di GETTR API
---

# GETTR API — Format POST ke /api/u/post

## Rule
Gunakan **JSON body** (bukan FormData/multipart) untuk semua POST ke `/api/u/post`.

Field `rich_txt` TIDAK valid untuk komentar — pakai `txt`. Field `_t` wajib ada.

## Comment (reply ke post orang lain)
```json
{
  "content": {
    "txt": "<teks komentar>",
    "pid": "<parent post ID>",
    "uid": "<userId milik akun kita — bukan username/handle>",
    "_t": "cmt"
  }
}
```
Header: `Content-Type: application/json`

## Standalone post
```json
{ "content": { "txt": "<teks>", "_t": "post" } }
```

## Auth header
`x-app-auth: {"user":"<userId numeric string>","token":"<token>"}`
`user` di x-app-auth adalah userId (angka), bukan handle/username.

**Why:** Test langsung ke API — FormData dapat `E_BAD_DATA: Empty post data`,
rich_txt dapat `E_POST_OWNER_NO_MATCH`, hanya JSON+txt+_t:cmt yang dapat 200 OK.

**How to apply:** Setiap kali ada endpoint POST /api/u/post di GETTR client — pastikan
pakai JSON body, bukan FormData. Cek session.userId (bukan session.username/handle) untuk field uid.
