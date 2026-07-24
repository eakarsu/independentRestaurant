#!/usr/bin/env bash
set -euo pipefail

project_dir="${RUNTIME_PROJECT_SOURCE:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)}"
cd "$project_dir"
if [[ -f .env ]]; then
  set -a
  source ./.env
  set +a
fi

api_port="${BACKEND_PORT:-${PORT:-}}"
ui_port="${FRONTEND_PORT:-${CLIENT_PORT:-}}"
[[ "$api_port" =~ ^[0-9]+$ ]] || { echo "BACKEND_PORT or PORT must be set" >&2; exit 2; }
[[ "$ui_port" =~ ^[0-9]+$ ]] || { echo "FRONTEND_PORT or CLIENT_PORT must be set" >&2; exit 2; }
: "${DATABASE_URL:?DATABASE_URL is required}"
: "${NEXTAUTH_SECRET:?NEXTAUTH_SECRET is required}"
if [[ ! -d node_modules ]]; then
  echo "Dependencies are absent. Run npm ci explicitly before startup." >&2
  exit 1
fi
for port in "$api_port" "$ui_port"; do
  if lsof -tiTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "Port $port is already in use; no process was stopped" >&2
    exit 1
  fi
done

npx prisma migrate deploy
ALLOW_USER_PROVISION=1 PROVISION_USER_ROLE=ADMIN npm run create-admin
npm run dev -- --hostname 127.0.0.1 --port "$api_port" &
api_pid=$!
API_PORT="$api_port" UI_PORT="$ui_port" node scripts/runtime-proxy.mjs &
ui_pid=$!
cleanup() {
  kill "$api_pid" "$ui_pid" 2>/dev/null || true
  wait "$api_pid" "$ui_pid" 2>/dev/null || true
}
trap cleanup EXIT INT TERM
echo "Independent Restaurant UI starting at http://127.0.0.1:$ui_port"
wait "$api_pid" "$ui_pid"
