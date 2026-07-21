#!/usr/bin/env bash
set -euo pipefail

project_dir="${RUNTIME_PROJECT_SOURCE:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)}"
cd "$project_dir"

mode="${1:---dev}"
app_port="${PORT:-3000}"

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required; startup never guesses or creates a database." >&2
  exit 1
fi
if [[ -z "${NEXTAUTH_SECRET:-}" ]]; then
  echo "NEXTAUTH_SECRET is required; startup never supplies a default credential." >&2
  exit 1
fi
if [[ ! -d node_modules ]]; then
  echo "Dependencies are absent. Run npm ci explicitly before startup." >&2
  exit 1
fi

case "${mode}" in
  --migrate)
    npx prisma migrate deploy
    ;;
  --dev)
    exec npm run dev -- --hostname "${HOST:-127.0.0.1}" --port "${app_port}"
    ;;
  --prod)
    if [[ ! -d .next ]]; then
      echo "Production build is absent. Run npm run build before startup." >&2
      exit 1
    fi
    exec npm run start -- --hostname "${HOST:-127.0.0.1}" --port "${app_port}"
    ;;
  *)
    echo "Usage: ./start.sh [--dev|--prod|--migrate]" >&2
    exit 2
    ;;
esac
