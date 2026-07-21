#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required" >&2
  exit 1
fi
backup_path="${1:-}"
if [[ -z "${backup_path}" || "${backup_path}" != *.dump ]]; then
  echo "Usage: scripts/backup.sh /explicit/path/restaurant-YYYYMMDD.dump" >&2
  exit 2
fi
pg_dump --format=custom --no-owner --no-acl --file="${backup_path}" "${DATABASE_URL}"
pg_restore --list "${backup_path}" >/dev/null
echo "Verified backup: ${backup_path}"
