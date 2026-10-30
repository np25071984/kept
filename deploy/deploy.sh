#!/usr/bin/env bash
# Deploys the pushed main branch: copies a clean checkout to the server, rebuilds, and checks the site answers.
# The server applies pending migrations as it starts (IMPLEMENTATION.md §6).
# Usage: deploy/deploy.sh [ssh-host]   Defaults: host "kept" (an ~/.ssh/config alias), /opt/kept, https://kept-ledger.com.
set -euo pipefail

host="${1:-kept}"
dir="${KEPT_DIR:-/opt/kept}"
url="${KEPT_URL:-https://kept-ledger.com}"
cd "$(dirname "$0")/.."

# What runs on the server is always a commit on GitHub, never local edits.
[ -z "$(git status --porcelain)" ] || { echo "Uncommitted changes: commit or stash them first." >&2; exit 1; }
[ "$(git branch --show-current)" = main ] || { echo "Deploy from main." >&2; exit 1; }
git fetch -q origin main
[ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ] || { echo "main and origin/main differ: push or pull first." >&2; exit 1; }
rev="$(git rev-parse --short HEAD)"

echo "Deploying $rev to $host:$dir"
rsync -az --delete --exclude node_modules --exclude dist --exclude .env --exclude .git --exclude .claude --exclude deploy/.env ./ "$host:$dir/"

# On the server: record the commit, rebuild, wait until it answers, then show the newest migration and the checks.
ssh "$host" bash -s -- "$dir" "$url" "$rev" <<'REMOTE'
set -euo pipefail
dir="$1"; url="$2"; rev="$3"
echo "$rev" > "$dir/REVISION"
cd "$dir/deploy"
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
