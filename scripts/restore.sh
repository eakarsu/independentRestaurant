#!/usr/bin/env bash
set -euo pipefail

if [[ "${ALLOW_DATABASE_RESTORE:-}" != "I_UNDERSTAND_THIS_REPLACES_DATA" ]]; then
  echo "Set ALLOW_DATABASE_RESTORE=I_UNDERSTAND_THIS_REPLACES_DATA after verifying the target." >&2
  exit 1
fi
if [[ -z "${DATABASE_URL:-}" || -z "${1:-}" || ! -f "${1}" ]]; then
  echo "Usage: DATABASE_URL=... ALLOW_DATABASE_RESTORE=I_UNDERSTAND_THIS_REPLACES_DATA scripts/restore.sh backup.dump" >&2
  exit 2
fi
echo "Target identity: $(psql "${DATABASE_URL}" -Atc 'select current_database() || chr(64) || inet_server_addr() || chr(58) || inet_server_port()')"
pg_restore --clean --if-exists --no-owner --no-acl --exit-on-error --dbname="${DATABASE_URL}" "${1}"
npx prisma migrate deploy
