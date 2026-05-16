---
name: release-management
description: Guidelines and instructions for creating and uploading releases to the omniworker-releases GitHub repository using the GitHub CLI.
---

# Release Management Protocol

This skill provides step-by-step instructions for taking the output of the electron-builder process from `omniworker-desktop` and uploading them as a new GitHub Release in the `Simplex-lat/omniworker-releases` repository.

## Prerequisites

- GitHub CLI (`gh`) must be authenticated with push access to the `Simplex-lat` organization.
- You must have already run the build commands in the `omniworker-desktop` directory:
  - `npm run build:mac`
  - `npm run build:win`
  - `npm run build:linux`

## Upload Procedure

1. **Locate Build Artifacts:**
   The build artifacts will be located in the `omniworker-desktop/dist` folder (or `omniworker-desktop/out/make` depending on your electron-builder config). Ensure that `.dmg`, `.exe` (or `.nsis`), and `.AppImage`/`.deb` files have been successfully generated.

2. **Draft the Release Command:**
   Before uploading, rename the artifacts to use "latest" instead of the version number so the dashboard download links work permanently without updates:
   - `Omniworker-${version}-mac.zip` -> `Omniworker-latest-mac.zip`
   - `Omniworker-Setup-${version}.exe` -> `Omniworker-Setup-latest.exe`
   - `Omniworker-${version}.AppImage` -> `Omniworker-latest.AppImage`

   Use the `gh release create` command to create the release and upload the assets simultaneously. The command takes the format:
   ```bash
   gh release create <tag> <file1> <file2> <file3> -R Simplex-lat/omniworker-releases -t "<Release Title>" -n "<Release Notes>"
   ```

   **Example:**
   ```bash
   cd omniworker-desktop/dist
   gh release create v1.0.0 Omniworker-latest-mac.zip Omniworker-1.0.0.dmg Omniworker-Setup-latest.exe Omniworker-latest.AppImage -R Simplex-lat/omniworker-releases -t "Omniworker v1.0.0" -n "Initial release of Omniworker Desktop"
   ```

3. **Verify Upload:**
   Ensure the release appears at `https://github.com/Simplex-lat/omniworker-releases/releases/latest`. The URLs to the files should follow this format:
   `https://github.com/Simplex-lat/omniworker-releases/releases/latest/download/Omniworker-1.0.0.dmg`

## Usage in the Dashboard (SaaS)

When updating the "Download" buttons on the `omniworker-saas` website, use the direct download URLs format to bypass the GitHub release UI:
- **macOS:** `https://github.com/Simplex-lat/omniworker-releases/releases/latest/download/Omniworker-latest-mac.zip` (adjust file name based on your naming convention, GitHub supports "latest" to automatically resolve the newest tag).
- **Windows:** `https://github.com/Simplex-lat/omniworker-releases/releases/latest/download/Omniworker-Setup-latest.exe`
- **Linux:** `https://github.com/Simplex-lat/omniworker-releases/releases/latest/download/Omniworker-latest.AppImage`
