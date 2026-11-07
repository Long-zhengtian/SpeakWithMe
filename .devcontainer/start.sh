#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
if [ ! -x "$root/backend/.venv/bin/uvicorn" ] || [ ! -d "$root/frontend/node_modules" ]; then
  bash "$root/.devcontainer/setup.sh"
fi
mkdir -p "$root/backend/data"
if [ -f /tmp/speaking-api.pid ]; then
  kill "$(cat /tmp/speaking-api.pid)" 2>/dev/null || true
fi
if [ -f /tmp/speaking-web.pid ]; then
  kill "$(cat /tmp/speaking-web.pid)" 2>/dev/null || true
fi
cd "$root/backend"
nohup .venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000 > /tmp/speaking-api.log 2>&1 &
echo $! > /tmp/speaking-api.pid
cd "$root/frontend"
nohup npm run dev -- --host 0.0.0.0 --port 5173 > /tmp/speaking-web.log 2>&1 &
echo $! > /tmp/speaking-web.pid
for _ in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30; do
  if curl -sf http://127.0.0.1:8000/api/v1/health >/dev/null && curl -sf http://127.0.0.1:5173/ >/dev/null; then
    exit 0
  fi
  sleep 1
done
exit 0
