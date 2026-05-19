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
