#!/bin/bash
set -e

# ── Validasi token ──────────────────────────────────────────────
if [ -z "$GITHUB_TOKEN" ]; then
  echo "❌ GITHUB_TOKEN tidak ditemukan di environment variable."
  exit 1
fi

# ── Konfigurasi ─────────────────────────────────────────────────
REPO_URL="https://${GITHUB_TOKEN}@github.com/Dzakiart19/Bot-promosi.git"
BRANCH="main"
COMMIT_MSG="${1:-"chore: update $(date +'%Y-%m-%d %H:%M:%S')"}"

# ── Pastikan git user tersedia (Replit kadang kosong) ────────────
git config user.email "bot@replit.dev" 2>/dev/null || true
git config user.name  "Replit Agent"  2>/dev/null || true

# ── Set remote pakai token (tanpa menyimpan ke .git/config) ─────
git remote set-url origin "$REPO_URL"

# ── Stage semua perubahan ────────────────────────────────────────
git add -A

# ── Commit (lewati kalau tidak ada yang berubah) ─────────────────
if git diff --cached --quiet; then
  echo "✅ Tidak ada perubahan baru — tidak ada yang di-commit."
else
  git commit -m "$COMMIT_MSG"
  echo "📝 Commit: $COMMIT_MSG"
fi

# ── Push ─────────────────────────────────────────────────────────
git push origin "$BRANCH"
echo "🚀 Berhasil push ke github.com/Dzakiart19/Bot-promosi (branch: $BRANCH)"

# ── Kembalikan URL tanpa token (keamanan) ────────────────────────
git remote set-url origin "https://github.com/Dzakiart19/Bot-promosi.git"
