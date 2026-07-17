#!/bin/bash
set -e

# ── Validasi token ──────────────────────────────────────────────
TOKEN=$(node -e "process.stdout.write(process.env.GITHUB_TOKEN || '')" 2>/dev/null)
if [ -z "$TOKEN" ]; then
  echo "❌ GITHUB_TOKEN tidak ditemukan. Set dulu di Replit Secrets (ikon 🔒)."
  exit 1
fi

# ── Konfigurasi ─────────────────────────────────────────────────
REPO="https://github.com/Dzakiart19/Bot-promosi.git"
BRANCH="main"
COMMIT_MSG="${1:-"chore: update $(date +'%Y-%m-%d %H:%M:%S')"}"

# ── Git user (Replit kadang kosong) ─────────────────────────────
git config user.email "bot@replit.dev" 2>/dev/null || true
git config user.name  "Replit Agent"  2>/dev/null || true

# ── Stage semua perubahan ────────────────────────────────────────
git add -A

# ── Commit kalau ada yang berubah ───────────────────────────────
if git diff --cached --quiet; then
  echo "✅ Tidak ada perubahan baru — skip commit."
else
  git commit -m "$COMMIT_MSG"
  echo "📝 Commit: $COMMIT_MSG"
fi

# ── Push — bypass replit-git-askpass dengan GIT_ASKPASS=echo ────
PUSH_URL="https://${TOKEN}@github.com/Dzakiart19/Bot-promosi.git"
GIT_ASKPASS=echo GIT_TERMINAL_PROMPT=0 git push "$PUSH_URL" "$BRANCH"
echo "🚀 Berhasil push ke github.com/Dzakiart19/Bot-promosi (branch: $BRANCH)"
