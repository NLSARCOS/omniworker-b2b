# Flux Agent — Code Signing & Notarization Guide

Guía para firmar el app y eliminar el warning "no se puede verificar que no contiene malware" en macOS, Windows y Linux.

---

## Problema que resuelve

- **macOS**: Gatekeeper bloquea el app ("dañino" / "no se puede abrir")
- **Windows**: SmartScreen muestra "Windows protegió tu PC"
- **safeStorage**: sin firma, los tokens encriptados no persisten entre sesiones → el usuario tiene que hacer login cada vez que abre el app

---

## 1. macOS — Apple Developer Certificate

### Requisitos
- Cuenta Apple Developer (USD $99/año): https://developer.apple.com/programs/
- Mac con Xcode instalado

### Paso 1: Obtener certificados

```bash
# Abrir Xcode → Settings → Accounts → agregar Apple ID
# O desde la terminal:
xcrun notarytool store-credentials "AC_PASSWORD"
# Te pide: Apple ID, password (app-specific), Team ID
```

Necesitas 2 certificados desde https://developer.apple.com/account/resources/certificates/list:

1. **Developer ID Application** — para firmar el app
2. **Developer ID Installer** — para firmar el DMG/installer

Crearlos desde Xcode: Accounts → Manage Certificates → + → Developer ID Application

### Paso 2: Verificar certificados instalados

```bash
# Listar certificados en el Keychain
security find-identity -v -p codesigning
# Debe mostrar algo como:
# 1) ABC123... "Developer ID Application: Tu Nombre (TEAM_ID)"
```

### Paso 3: Variables de entorno para el build

Agregar al `~/.zshrc` o `~/.bash_profile`:

```bash
# macOS code signing
export CSC_NAME="Developer ID Application: Tu Nombre (TEAM_ID)"
# Notarización (usando notarytool)
export APPLE_ID="tu@email.com"
export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"  # App-specific password
export APPLE_TEAM_ID="XXXXXXXXXX"
```

Generar app-specific password: https://appleid.apple.com → Sign-In and Security → App-Specific Passwords

### Paso 4: Build firmado

```bash
cd omniworker-desktop
npm run build:mac
```

electron-builder detecta `CSC_NAME` automáticamente y:
1. Firma el .app con el certificado
2. Aplica Hardened Runtime
3. Notariza con Apple (tarda 2-5 min)
4. Staples el ticket al .app

### Paso 5: Verificar

```bash
# Verificar firma
codesign -dv --verbose=4 dist/mac-arm64/Flux\ Agent\ By\ Simplex.app

# Verificar notarización
spctl --assess --type execute dist/mac-arm64/Flux\ Agent\ By\ Simplex.app
```

### Troubleshooting macOS

- **"no identity found"**: el certificado no está en el Keychain → instalar desde Xcode
- **notarization failed**: revisar con `xcrun notarytool log <submission-id>`
- **"app is damaged"**: el usuario debe correr `xattr -cr /Applications/Flux.app`

---

## 2. Windows — Code Signing Certificate

### Requisitos
- Certificado de code signing (EV o Standard):
  - **Standard** (~$200/año): funciona pero SmartScreen puede seguir mostrando warning hasta que el app tenga reputación
  - **EV** (~$400/año): SmartScreen inmediatamente confía, requiere token USB físico

Proveedores recomendados:
- DigiCert: https://www.digicert.com/signing/code-signing-certificates
- Sectigo: https://sectigo.com/ssl-certificates-tls/code-signing

### Paso 1: Instalar certificado

El certificado se instala en el Windows Certificate Store:
- Doble click en el .pfx → Install Certificate → Local Machine → Personal
- O importar desde certmgr.msc

### Paso 2: Variables de entorno

```powershell
# En Windows PowerShell o agregar como Environment Variables del sistema
# Opción A: Usando nombre del certificado
$env:CSC_NAME = "Tu Nombre o Empresa"

# Opción B: Usando thumbprint (más preciso)
$env:CSC_LINK = "https://your-cert-provider.com/token"
$env:CSC_KEY_PASSWORD = "your-password"
```

### Paso 3: Build firmado

```powershell
cd omniworker-desktop
npm run build:win
```

### Alternativa: SignTool manual

Si electron-builder no firma automáticamente:

```powershell
signtool sign /tr http://timestamp.digicert.com /td sha256 /fd sha256 /a "dist\Flux Agent By Simplex Setup.exe"
```

---

## 3. Linux — AppImage Signing

Linux no requiere firma obligatoria, pero se puede firmar:

### AppImage
```bash
# Descargar go-appimage sign tool
wget https://github.com/probonopd/go-appimage/releases/download/continuous/appimagetool-x86_64.AppImage

# Firmar
./appimagetool-x86_64.AppImage sign dist/omniworker-desktop-0.4.3.AppImage
```

### Debian package
```bash
# Crear GPG key (si no tienes)
gpg --full-generate-key

# Firmar el .deb
dpkg-sig -k YOUR_KEY_ID -s builder dist/omniworker-desktop-0.4.3.deb
```

---

## 4. CI/CD — GitHub Actions (Automatizado)

La forma más segura: firmar en CI/CD para que los certificados no estén en tu Mac local.

### Secrets necesarios en GitHub

```
# macOS
APPLE_ID
APPLE_APP_SPECIFIC_PASSWORD
APPLE_TEAM_ID
CSC_NAME (o CSC_LINK + CSC_KEY_PASSWORD para base64 cert)

# Windows
WIN_CSC_LINK (url al .pfx)
WIN_CSC_KEY_PASSWORD
```

### Workflow ejemplo (.github/workflows/build.yml)

```yaml
name: Build & Sign

on:
  push:
    tags: ['v*']

jobs:
  mac:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Install deps
        run: npm ci
        working-directory: omniworker-desktop

      - name: Build & Sign macOS
        env:
          CSC_LINK: ${{ secrets.MAC_CERT_BASE64 }}
          CSC_KEY_PASSWORD: ${{ secrets.MAC_CERT_PASSWORD }}
          APPLE_ID: ${{ secrets.APPLE_ID }}
          APPLE_APP_SPECIFIC_PASSWORD: ${{ secrets.APPLE_APP_SPECIFIC_PASSWORD }}
          APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
        run: npm run build:mac
        working-directory: omniworker-desktop

      - name: Upload artifacts
        uses: actions/upload-artifact@v4
        with:
          name: mac-builds
          path: omniworker-desktop/dist/*.dmg

  windows:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Install deps
        run: npm ci
        working-directory: omniworker-desktop

      - name: Build & Sign Windows
        env:
          CSC_LINK: ${{ secrets.WIN_CERT_BASE64 }}
          CSC_KEY_PASSWORD: ${{ secrets.WIN_CERT_PASSWORD }}
        run: npm run build:win
        working-directory: omniworker-desktop

      - name: Upload artifacts
        uses: actions/upload-artifact@v4
        with:
          name: win-builds
          path: omniworker-desktop/dist/*.exe
```

### Exportar certificado macOS para CI

```bash
# Crear .p12 del certificado
security find-identity -v -p codesigning
# Usa el hash que aparece
security export -t identities -f pkcs12 -o certificate.p12 -k ~/Library/Keychains/login.keychain-db

# Convertir a base64
base64 -i certificate.p12 | pbcopy
# Pegar como secret MAC_CERT_BASE64 en GitHub
```

---

## 5. Resumen rápido — Qué comprar

| Plataforma | Certificado | Costo aprox | Dónde |
|---|---|---|---|
| macOS | Apple Developer Program | $99/año | developer.apple.com |
| Windows | Code Signing (Standard o EV) | $200-400/año | digicert.com / sectigo.com |
| Linux | GPG key (gratis) | Gratis | Local |

**Prioridad**: macOS primero (resuelve el problema de safeStorage + Gatekeeper), luego Windows.

---

## 6. Verificar que safeStorage funciona después de firmar

Después de instalar el app firmado:

```bash
# 1. Abrir el app, hacer login
# 2. Cerrar completamente
# 3. Verificar que los tokens persistieron
cat ~/.omniworker/desktop.json | grep -c secureAccess
# Debe mostrar: 2

# 4. Reabrir el app — NO debe pedir login
```

Si sigue pidiendo login, revisar logs:
```bash
# Desde el directorio del app
log show --predicate 'process == "Flux Agent By Simplex"' --last 5m | grep -i "safeStorage\|decrypt\|token"
```
