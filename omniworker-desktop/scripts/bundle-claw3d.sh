#!/bin/bash
# scripts/bundle-claw3d.sh — Bundle Claw3D as a standalone Next.js app
# Run this during build so users don't need to clone/download anything.
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DESKTOP_DIR="$(dirname "$SCRIPT_DIR")"
RESOURCES_DIR="$DESKTOP_DIR/resources"
OUTPUT_DIR="$RESOURCES_DIR/omniworker-office"
REPO_URL="https://github.com/iamlukethedev/Claw3D"
TMP_DIR="$(mktemp -d -t claw3d-build-XXXXXX)"

echo "[Claw3D Bundle] Cloning $REPO_URL..."
git clone --depth 1 "$REPO_URL" "$TMP_DIR/claw3d"

echo "[Claw3D Bundle] Patching next.config for standalone output..."
# Add output: 'standalone' to next.config.ts
awk '
/const nextConfig: NextConfig = \{/ {
  print
  print "  output: '\''standalone'\'',"
  next
}
{print}
' "$TMP_DIR/claw3d/next.config.ts" > "$TMP_DIR/claw3d/next.config.ts.patched"
mv "$TMP_DIR/claw3d/next.config.ts.patched" "$TMP_DIR/claw3d/next.config.ts"
if ! grep -q "output: 'standalone'" "$TMP_DIR/claw3d/next.config.ts"; then
  echo "[Claw3D Bundle] ERROR: Failed to patch next.config.ts"
  exit 1
fi

echo "[Claw3D Bundle] Installing dependencies..."
cd "$TMP_DIR/claw3d"
npm ci --prefer-offline --no-audit

echo "[Claw3D Bundle] Building standalone..."
npm run build

echo "[Claw3D Bundle] Copying to resources..."
rm -rf "$OUTPUT_DIR"
mkdir -p "$OUTPUT_DIR"
cp -R "$TMP_DIR/claw3d/.next/standalone/." "$OUTPUT_DIR/"

# Copy static files required by the client (Next.js standalone doesn't include them)
if [ -d "$TMP_DIR/claw3d/.next/static" ]; then
  mkdir -p "$OUTPUT_DIR/.next/static"
  cp -R "$TMP_DIR/claw3d/.next/static/." "$OUTPUT_DIR/.next/static/"
  echo "[Claw3D Bundle] Copied static assets"
fi

# Copy public folder if it exists (favicon, images, etc.)
if [ -d "$TMP_DIR/claw3d/public" ]; then
  cp -R "$TMP_DIR/claw3d/public/." "$OUTPUT_DIR/"
  echo "[Claw3D Bundle] Copied public assets"
fi

# Clean up unnecessary files to reduce installer size
rm -rf "$OUTPUT_DIR/docs"
rm -rf "$OUTPUT_DIR/tests"
rm -rf "$OUTPUT_DIR/.github"
rm -f "$OUTPUT_DIR/readme-image.png"
rm -f "$OUTPUT_DIR/home-screen.png"
rm -f "$OUTPUT_DIR/CHANGELOG.md"
rm -f "$OUTPUT_DIR/CODE_OF_CONDUCT.MD"
rm -f "$OUTPUT_DIR/CONTRIBUTING.md"
rm -f "$OUTPUT_DIR/TUTORIAL.md"
rm -f "$OUTPUT_DIR/VISION.md"
rm -f "$OUTPUT_DIR/ROADMAP.md"
rm -f "$OUTPUT_DIR/SECURITY.md"
rm -f "$OUTPUT_DIR/SUPPORT.md"
rm -f "$OUTPUT_DIR/PR89.md"
rm -f "$OUTPUT_DIR/MULTI_AGENT_BETA.md"
rm -f "$OUTPUT_DIR/CREATING_SKILLS.md"
rm -f "$OUTPUT_DIR/CODE_DOCUMENTATION.md"
rm -f "$OUTPUT_DIR/ARCHITECTURE.md"
rm -f "$OUTPUT_DIR/AGENTS.md"

# Remove .git if present
rm -rf "$OUTPUT_DIR/.git"

echo "[Claw3D Bundle] Cleaning up temp files..."
rm -rf "$TMP_DIR"

BUNDLE_SIZE=$(du -sh "$OUTPUT_DIR" | cut -f1)
echo "[Claw3D Bundle] Done. Size: $BUNDLE_SIZE -> $OUTPUT_DIR"
