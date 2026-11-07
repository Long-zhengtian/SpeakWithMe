#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root/backend"
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
cd "$root/frontend"
npm install
