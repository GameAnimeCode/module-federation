#!/usr/bin/env bash
# Starts the backend, host, and both extensions for local development.
# See /README.md for how each extension's dev HMR works.
# Ctrl+C stops every process this script started.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOST_DIR="$ROOT_DIR/src/host"
BACKEND_DIR="$ROOT_DIR/src/backend"
EXTENSION_A_DIR="$ROOT_DIR/src/extensions/extension-a"
EXTENSION_B_DIR="$ROOT_DIR/src/extensions/extension-b"

pids=()
cleanup() {
  echo
  echo "==> Stopping dev processes..."
  for pid in "${pids[@]}"; do
    kill "$pid" 2>/dev/null || true
  done
}
trap cleanup EXIT INT TERM

ensure_installed() {
  local project_dir="$1"
  [ -d "$project_dir/node_modules" ] || npm --prefix "$project_dir" install
}

ensure_installed "$HOST_DIR"
ensure_installed "$EXTENSION_A_DIR"
ensure_installed "$EXTENSION_B_DIR"

echo "==> backend (Development, http://localhost:5080)"
dotnet build "$BACKEND_DIR" -c Debug
(cd "$BACKEND_DIR" && ASPNETCORE_ENVIRONMENT=Development dotnet exec bin/Debug/net10.0/Backend.dll --urls http://localhost:5080) &
pids+=("$!")
sleep 2 # let it bind before extension-b's watch build starts touching wwwroot

echo "==> extension-a (vite dev, declarative; the host connects to it directly)"
(cd "$EXTENSION_A_DIR" && npm run dev) &
pids+=("$!")

echo "==> extension-b (watch build -> wwwroot/apps/extensions/extension-b, dynamic; swapped in on change)"
(cd "$EXTENSION_B_DIR" && npm run dev:watch) &
pids+=("$!")

sleep 1 # let extension-b's first watch build land before the host's first manifest fetch

echo "==> host (Vite dev server, http://localhost:5173)"
(cd "$HOST_DIR" && npm run dev) &
pids+=("$!")

wait
