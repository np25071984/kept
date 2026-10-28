#!/bin/sh
# Runs once, when the data directory is created. The server connects as kept_app, which has no BYPASSRLS.
set -e
psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v pw="$KEPT_APP_PASSWORD" <<'SQL'
CREATE ROLE kept_app LOGIN PASSWORD :'pw';
SQL
