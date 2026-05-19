#!/bin/bash
# download_slm.sh — Prepares the local SLM engine before Electron packaging.
# Run automatically via `prebuild` in package.json.
#
# Downloads:
#   1. llama-server binary  (platform-specific)
#   2. A small GGUF model   (Qwen2.5-0.5B-Instruct, ~397 MB)
#
# Skip any step by setting the env vars:
#   SKIP_LLAMA_DOWNLOAD=1  → skip llama-server download
#   SKIP_MODEL_DOWNLOAD=1  → skip GGUF model download
#
# The local-llm directory structure produced:
#   resources/engine/
#     llama-server          (or llama-server.exe on Windows)
#     slm.gguf              (GGUF model, loaded by llama-server)
#   ~/.omniworker/local-llm/scripts/
#     start-local-llm.sh    (startup script read by omniworker.ts)
#     start-local-llm.bat   (Windows variant)

set -euo pipefail

echo "[OmniWorker B2B] Preparing Local SLM engine..."

RESOURCES_DIR="resources/engine"
mkdir -p "$RESOURCES_DIR"

# ── 1. llama-server binary ─────────────────────────────────────────────────
if [ "${SKIP_LLAMA_DOWNLOAD:-0}" = "1" ]; then
  echo "[skip] llama-server download skipped (SKIP_LLAMA_DOWNLOAD=1)"
elif [ -f "$RESOURCES_DIR/llama-server" ] && [ -s "$RESOURCES_DIR/llama-server" ]; then
  echo "[ok]   llama-server already present, skipping download."
else
  echo "[dl]   Downloading llama-server..."

  LLAMA_VERSION="b9190"  # pin a tested release; bump manually after QA
  BASE="https://github.com/ggerganov/llama.cpp/releases/download/${LLAMA_VERSION}"

  case "$(uname -s)-$(uname -m)" in
    Darwin-arm64)   ASSET="llama-${LLAMA_VERSION}-bin-macos-arm64.tar.gz" ;;
    Darwin-x86_64)  ASSET="llama-${LLAMA_VERSION}-bin-macos-x64.tar.gz"   ;;
    Linux-x86_64)   ASSET="llama-${LLAMA_VERSION}-bin-ubuntu-x64.tar.gz"  ;;
    Linux-aarch64)  ASSET="llama-${LLAMA_VERSION}-bin-ubuntu-arm64.tar.gz";;
    MINGW*|MSYS*|CYGWIN*) ASSET="llama-${LLAMA_VERSION}-bin-win-vulkan-x64.zip" ;;
    *)
      echo "[warn] Unknown platform $(uname -s)-$(uname -m) — skipping llama-server download."
      touch "$RESOURCES_DIR/llama-server"
      ASSET=""
      ;;
  esac

  if [ -n "${ASSET:-}" ]; then
    TMP_ARCHIVE="$RESOURCES_DIR/_llama_tmp"
    curl -fL --retry 3 --retry-delay 2 "$BASE/$ASSET" -o "$TMP_ARCHIVE"

    case "$ASSET" in
      *.tar.gz)
        # Mac / Linux — .tar.gz bundles
        tar -xzf "$TMP_ARCHIVE" -C "$RESOURCES_DIR"
        # Move nested binary to top level if needed
        find "$RESOURCES_DIR" -mindepth 2 -name 'llama-server*' -exec mv {} "$RESOURCES_DIR/" \; 2>/dev/null || true
        # Clean up extracted directories
        find "$RESOURCES_DIR" -mindepth 1 -maxdepth 1 -type d -exec rm -rf {} + 2>/dev/null || true
        ;;
      *.zip)
        # Windows — .zip bundles
        unzip -jo "$TMP_ARCHIVE" "*/llama-server*" -d "$RESOURCES_DIR"
        ;;
      *)
        echo "[warn] Unknown archive format: $ASSET"
        ;;
    esac

    rm -f "$TMP_ARCHIVE"
    chmod +x "$RESOURCES_DIR/llama-server" 2>/dev/null || true
    chmod +x "$RESOURCES_DIR/llama-server.exe" 2>/dev/null || true
    echo "[ok]   llama-server downloaded."
  fi
fi

# ── 2. GGUF model ─────────────────────────────────────────────────────────
# Qwen2.5-0.5B-Instruct-Q4_K_M — ~397 MB, fast on CPU, good for simple tasks.
MODEL_URL="https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf"
MODEL_PATH="$RESOURCES_DIR/slm.gguf"

if [ "${SKIP_MODEL_DOWNLOAD:-0}" = "1" ]; then
  echo "[skip] GGUF model download skipped (SKIP_MODEL_DOWNLOAD=1)"
elif [ -f "$MODEL_PATH" ] && [ -s "$MODEL_PATH" ]; then
  echo "[ok]   slm.gguf already present, skipping download."
else
  echo "[dl]   Downloading Qwen2.5-0.5B-Instruct GGUF (~397 MB)..."
  # -C - = resume partial download if interrupted
  curl -fL -C - --retry 3 --retry-delay 5 "$MODEL_URL" -o "$MODEL_PATH"
  echo "[ok]   slm.gguf downloaded."
fi

# ── 3. Startup scripts (written to resources/ for the app to copy at first run)
SCRIPTS_DIR="resources/local-llm-scripts"
mkdir -p "$SCRIPTS_DIR"

cat > "$SCRIPTS_DIR/start-local-llm.sh" << 'STARTSCRIPT'
#!/bin/bash
# Auto-generated startup script for the OmniWorker local SLM engine.
# Placed in ~/.omniworker/local-llm/scripts/ by the desktop app on first run.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENGINE_DIR="$(cd "$SCRIPT_DIR/../engine" && pwd)"

LLAMA_BIN="$ENGINE_DIR/llama-server"
MODEL="$ENGINE_DIR/slm.gguf"
PORT="${OMNIWORKER_LOCAL_SLM_PORT:-8080}"
CTX="${OMNIWORKER_LOCAL_SLM_CTX:-2048}"    # optimized for fast, short interactions
THREADS="${OMNIWORKER_LOCAL_SLM_THREADS:-4}"

if [ ! -f "$LLAMA_BIN" ] || [ ! -s "$LLAMA_BIN" ]; then
  echo "[local-llm] llama-server not found, exiting." >&2
  exit 1
fi

if [ ! -f "$MODEL" ] || [ ! -s "$MODEL" ]; then
  echo "[local-llm] slm.gguf not found, exiting." >&2
  exit 1
fi

echo "[local-llm] Starting llama-server on port $PORT..."
exec "$LLAMA_BIN" \
  --model "$MODEL" \
  --alias slm \
  --port "$PORT" \
  --ctx-size "$CTX" \
  --threads "$THREADS" \
  --no-mmap \
  --log-disable
STARTSCRIPT

chmod +x "$SCRIPTS_DIR/start-local-llm.sh"

# Windows .bat variant
cat > "$SCRIPTS_DIR/start-local-llm.bat" << 'WINSTARTSCRIPT'
@echo off
setlocal
set SCRIPT_DIR=%~dp0
set ENGINE_DIR=%SCRIPT_DIR%..\engine

set LLAMA_BIN=%ENGINE_DIR%\llama-server.exe
set MODEL=%ENGINE_DIR%\slm.gguf
if not defined OMNIWORKER_LOCAL_SLM_PORT set OMNIWORKER_LOCAL_SLM_PORT=8080

if not exist "%LLAMA_BIN%" ( echo [local-llm] llama-server.exe not found. & exit /b 1 )
if not exist "%MODEL%"      ( echo [local-llm] slm.gguf not found.        & exit /b 1 )

echo [local-llm] Starting llama-server on port %OMNIWORKER_LOCAL_SLM_PORT%...
"%LLAMA_BIN%" --model "%MODEL%" --alias slm --port %OMNIWORKER_LOCAL_SLM_PORT% --ctx-size 2048 --threads 4 --no-mmap --log-disable
WINSTARTSCRIPT

echo "[OmniWorker B2B] Local SLM engine ready."
echo "  Binary : $RESOURCES_DIR/llama-server"
echo "  Model  : $RESOURCES_DIR/slm.gguf"
echo "  Scripts: $SCRIPTS_DIR/"
