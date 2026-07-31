#!/usr/bin/env bash
# Starts everything needed to develop against both of this project's demo
# extensions at once:
#   - the backend in Development mode (:5080) — discovery API, SSE watcher,
#     CORS for the host's dev server
#   - the host's own Vite dev server (:5173)
#   - extension-a (:5174) on its OWN `vite dev` server — the *declarative*
#     extension. The host's vite.config.js statically points at this exact
#     port, and @module-federation/vite's dev.remoteHmr live-patches its
#     mounted component in the host on every save — no refresh needed.
#   - extension-b in `vite build --watch` mode, writing straight into
#     src/backend/wwwroot/apps/extensions/extension-b/ — the *dynamic*
#     extension. The backend's existing FileSystemWatcher + SSE tells the
#     host to re-fetch the manifest; useExtensionRegistry.js notices the
#     changed lastModifiedUnixMs and hot-*swaps* the mounted component
#     (full remount, not a patch — invisible in practice since its state
#     lives in Pinia, not the component).
#
# See /README.md for the full comparison of the two approaches and why each
# extension demos a different one.
#
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

echo "==> extension-a (vite dev, declarative — the host connects to it directly)"
(cd "$EXTENSION_A_DIR" && npm run dev) &
pids+=("$!")

echo "==> extension-b (watch build -> wwwroot/apps/extensions/extension-b, dynamic — swapped in on change)"
(cd "$EXTENSION_B_DIR" && npm run dev:watch) &
pids+=("$!")

sleep 1 # let extension-b's first watch build land before the host's first manifest fetch

echo "==> host (Vite dev server, http://localhost:5173)"
(cd "$HOST_DIR" && npm run dev) &
pids+=("$!")

wait
