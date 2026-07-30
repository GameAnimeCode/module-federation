#!/usr/bin/env bash
# Compiles the host and both extensions, then assembles them into the
# backend's wwwroot exactly the way it expects to find them at runtime:
#   wwwroot/                          <- host's dist/*
#   wwwroot/apps/extensions/<name>/   <- each extension's dist/*
#
# After this script runs, `dotnet run` from src/backend serves the whole
# system from a single origin — no separate dev servers, no CORS involved.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOST_DIR="$ROOT_DIR/src/host"
BACKEND_DIR="$ROOT_DIR/src/backend"
EXTENSIONS_SRC_DIR="$ROOT_DIR/src/extensions"
WWWROOT_DIR="$BACKEND_DIR/wwwroot"

build_frontend_project() {
  local project_dir="$1"
  local label="$2"
  echo "==> [$label] npm install"
  npm --prefix "$project_dir" install
  echo "==> [$label] npm run build"
  npm --prefix "$project_dir" run build
}

build_frontend_project "$HOST_DIR" "host"
for ext_dir in "$EXTENSIONS_SRC_DIR"/*/; do
  ext_name="$(basename "$ext_dir")"
  build_frontend_project "$ext_dir" "$ext_name"
done

echo "==> Resetting $WWWROOT_DIR"
rm -rf "$WWWROOT_DIR"
mkdir -p "$WWWROOT_DIR" "$WWWROOT_DIR/apps/extensions"

echo "==> Copying host dist -> wwwroot/"
cp -r "$HOST_DIR/dist/." "$WWWROOT_DIR/"

for ext_dir in "$EXTENSIONS_SRC_DIR"/*/; do
  ext_name="$(basename "$ext_dir")"
  echo "==> Copying $ext_name dist -> wwwroot/apps/extensions/$ext_name/"
  mkdir -p "$WWWROOT_DIR/apps/extensions/$ext_name"
  cp -r "$ext_dir/dist/." "$WWWROOT_DIR/apps/extensions/$ext_name/"
done

echo "==> dotnet build"
dotnet build "$BACKEND_DIR" -c Release

echo
echo "Build complete. Run the server with:"
echo "  dotnet run --project $BACKEND_DIR --urls http://localhost:5080"
