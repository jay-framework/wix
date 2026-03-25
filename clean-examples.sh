#!/bin/bash
# Clean build folders and Vite cache for all examples

REPO_ROOT="$(cd "$(dirname "$0")" && pwd)"
EXAMPLES_DIR="$REPO_ROOT/examples"

for dir in "$EXAMPLES_DIR"/*/; do
  name="$(basename "$dir")"
  [ -f "$dir/package.json" ] || continue

  echo "Cleaning $name..."
  rm -rf "$dir/dist" "$dir/build" "$dir/node_modules/.vite"
  # Remove generated .d.ts files from src
  find "$dir/src" -name '*.d.ts' -delete 2>/dev/null
done

echo "Done."
