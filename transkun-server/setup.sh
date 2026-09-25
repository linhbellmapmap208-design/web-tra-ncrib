#!/usr/bin/env bash
# Installs Transkun V2 from GitHub into transkun-server/.venv (CPU PyTorch by default).
set -euo pipefail
cd "$(dirname "$0")"

TORCH_INDEX="${TORCH_INDEX:-https://download.pytorch.org/whl/cpu}"

if command -v uv >/dev/null 2>&1; then
  uv venv .venv --python 3.12
  VIRTUAL_ENV="$PWD/.venv" uv pip install --index-url "$TORCH_INDEX" --extra-index-url https://pypi.org/simple -r requirements.txt
else
  python3 -m venv .venv
  .venv/bin/pip install --index-url "$TORCH_INDEX" --extra-index-url https://pypi.org/simple -r requirements.txt
fi

echo "Transkun V2 installed. Start the app with: pnpm dev"
