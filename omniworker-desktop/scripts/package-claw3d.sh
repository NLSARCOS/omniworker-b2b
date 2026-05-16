#!/bin/bash
# scripts/package-claw3d.sh — Build Claw3D standalone and package as tarball for CDN upload
# Run this locally to generate claw3d-standalone.tar.gz, then upload to your web server.
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_URL="https://github.com/iamlukethedev/Claw3D"
TMP_DIR="$(mktemp -d -t claw3d-package-XXXXXX)"
OUTPUT_FILE="$SCRIPT_DIR/../claw3d-standalone.tar.gz"

echo "[Claw3D Package] Cloning $REPO_URL..."
git clone --depth 1 "$REPO_URL" "$TMP_DIR/claw3d"

echo "[Claw3D Package] Patching next.config for standalone output..."
sed -i.bak "s/const nextConfig: NextConfig = {/const nextConfig: NextConfig = {\n  output: 'standalone',/" "$TMP_DIR/claw3d/next.config.ts" || \
sed -i "s/const nextConfig: NextConfig = {/const nextConfig: NextConfig = {\n  output: 'standalone',/" "$TMP_DIR/claw3d/next.config.ts"

echo "[Claw3D Package] Installing dependencies..."
cd "$TMP_DIR/claw3d"
npm ci --prefer-offline --no-audit

echo "[Claw3D Package] Building standalone..."
npm run build

echo "[Claw3D Package] Packaging tarball..."
cd "$TMP_DIR/claw3d/.next/standalone"

# Remove unnecessary files to keep tarball small
rm -rf docs tests .github readme-image.png home-screen.png
rm -f CHANGELOG.md CODE_OF_CONDUCT.MD CONTRIBUTING.md TUTORIAL.md VISION.md ROADMAP.md
rm -f SECURITY.md SUPPORT.md PR89.md MULTI_AGENT_BETA.md CREATING_SKILLS.md
rm -f CODE_DOCUMENTATION.md ARCHITECTURE.md AGENTS.md next.config.ts.bak

tar -czf "$OUTPUT_FILE" .

SIZE=$(du -sh "$OUTPUT_FILE" | cut -f1)
echo "[Claw3D Package] Done: $OUTPUT_FILE ($SIZE)"
echo ""
echo "Upload this file to your web server/CDN and set the URL in the desktop app."
echo "Example: https://cdn.yourdomain.com/omniworker/claw3d-standalone.tar.gz"

rm -rf "$TMP_DIR"
