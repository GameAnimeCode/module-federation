#!/usr/bin/env bash
# Branch hmr/latest-vite-federation dev setup: the backend, the host's own
# Vite dev server, and both extensions each on their own `vite dev` server.
# Each extension self-registers its dev URL with the backend on startup (see
# each extension's devServerRegistrationPlugin in vite.config.js and the
# backend's DevServerRegistry) — genuine, un-hardcoded discovery of a
# *running dev server*, not a guessed port. Unlike hmr/dev-federation, the
# host here actually LOADS from a detected dev server (see
# host/src/extensions/loadExtensions.js) instead of only displaying that one
# is running.
#
# What that gets you: edit an extension's source, refresh the host tab (or
# navigate to it fresh) — no build step at all, the change is there
# immediately, since the host is always fetching straight from the dev
# server's live module graph. What it does NOT get you: the page updating
# itself without a refresh while you're looking at it. See README.md's HMR
# section for exactly why (@module-federation/vite's automatic remoteHmr
# patching requires statically-declared remotes, which conflicts with this
# project's fully-dynamic host) and what was actually verified.
#
# Ctrl+C stops every process this script started.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOST_DIR="$ROOT_DIR/src/host"
BACKEND_DIR="$ROOT_DIR/src/backend"
EXTENSIONS_SRC_DIR="$ROOT_DIR/src/extensions"

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
for ext_dir in "$EXTENSIONS_SRC_DIR"/*/; do
  ensure_installed "$ext_dir"
done

echo "==> backend (Development, http://localhost:5080)"
dotnet build "$BACKEND_DIR" -c Debug
(cd "$BACKEND_DIR" && ASPNETCORE_ENVIRONMENT=Development dotnet exec bin/Debug/net10.0/Backend.dll --urls http://localhost:5080) &
pids+=("$!")
sleep 2 # let it bind before extensions try to self-register against it

for ext_dir in "$EXTENSIONS_SRC_DIR"/*/; do
  ext_name="$(basename "$ext_dir")"
  echo "==> $ext_name (vite dev, self-registers with the backend on startup)"
  (cd "$ext_dir" && npm run dev) &
  pids+=("$!")
done

sleep 1

echo "==> host (Vite dev server, http://localhost:5173)"
(cd "$HOST_DIR" && npm run dev) &
pids+=("$!")

wait
