#!/bin/bash
# Clean build folders and Vite cache for all examples

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

for dir in "$SCRIPT_DIR"/*/; do
  name="$(basename "$dir")"
  [ -f "$dir/package.json" ] || continue

  echo "Cleaning $name..."
  rm -rf "$dir/dist" "$dir/build" "$dir/node_modules/.vite"
  # Remove generated .d.ts files from src
  find "$dir/src" -name '*.d.ts' -delete 2>/dev/null
done

echo "Done."
