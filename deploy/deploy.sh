#!/usr/bin/env bash
# Deploys the pushed main branch: the server checks out that commit from GitHub, rebuilds, and checks the site answers.
# The server applies pending migrations as it starts (IMPLEMENTATION.md §6).
# Usage: deploy/deploy.sh [ssh-host]   Defaults: host "kept" (an ~/.ssh/config alias), /opt/kept, https://kept-ledger.com.
# KEPT_REV deploys an earlier commit of main instead, to roll back.
set -euo pipefail

host="${1:-kept}"
dir="${KEPT_DIR:-/opt/kept}"
url="${KEPT_URL:-https://kept-ledger.com}"
repo="${KEPT_REPO:-https://github.com/np25071984/kept.git}"
cd "$(dirname "$0")/.."

# What runs on the server is always a commit on GitHub: the server fetches it, so no local file can reach it.
git fetch -q origin main
rev="$(git rev-parse --short "${KEPT_REV:-origin/main}")"
git merge-base --is-ancestor "$rev" origin/main || { echo "$rev is not on main." >&2; exit 1; }
echo "Deploying $rev: $(git log -1 --format=%s "$rev")"

# On the server: check out the commit, rebuild, wait until it answers, then show the newest migration and the checks.
ssh "$host" bash -s -- "$dir" "$url" "$rev" "$repo" <<'REMOTE'
set -euo pipefail
dir="$1"; url="$2"; rev="$3"; repo="$4"
cd "$dir"
if [ ! -d .git ]; then
  # The first deploy from GitHub turns the folder, once copied over, into a clone of the repository.
  chown -R "$(id -u):$(id -g)" .
  git init -q
  git remote add origin "$repo"
  rm -f REVISION
fi
git fetch -q origin main
git checkout -q --force --detach "$rev"
# Files gone from the repository go from the server too; ignored ones, such as deploy/.env, stay.
git clean -q -fd
cd deploy
docker compose up -d --build 2>&1 | tail -n 2
for _ in $(seq 1 30); do
  [ "$(curl -s -o /dev/null -w '%{http_code}' "$url/health")" = 200 ] && break
  sleep 2
done
echo "Newest migration: $(docker compose exec -T postgres psql -U kept -d kept -Atc 'select name from kysely_migration order by name desc limit 1')"
failed=0
for path in /health / /app/ /app/site.css; do
  code="$(curl -s -o /dev/null -w '%{http_code}' "$url$path")"
  echo "$code $path"
  [ "$code" = 200 ] || failed=1
done
[ "$failed" = 0 ] || { docker compose logs --tail 30 kept; exit 1; }
REMOTE

echo "Deployed $rev"
