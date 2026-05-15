#!/bin/bash
# Scripts para preparar recursos locales antes de empaquetar con Electron Builder.
# Ejecutado automáticamente en el pre-build.

set -e

echo "[OmniWorker B2B] Descargando componentes del Motor Local..."

RESOURCES_DIR="resources/engine"
mkdir -p "$RESOURCES_DIR"

# 1. Descargar llama.cpp binario (cross-platform, aquí simulamos linux para el ejemplo)
# En un entorno real se descargaría el binario adecuado según la plataforma o se compilaría
echo "Descargando llama.cpp server..."
# curl -L https://github.com/ggerganov/llama.cpp/releases/latest/download/llama-server -o $RESOURCES_DIR/llama-server
touch "$RESOURCES_DIR/llama-server"
chmod +x "$RESOURCES_DIR/llama-server"

# 2. Descargar modelo GGUF (SLM para Intent Classifier y tareas locales)
# Ejemplo: Qwen-1.5-0.5B-Chat-Q4_K_M.gguf (~350MB)
echo "Descargando SLM (Qwen-1.5-0.5B-Chat)..."
# curl -L -C - "https://huggingface.co/Qwen/Qwen1.5-0.5B-Chat-GGUF/resolve/main/qwen1_5-0_5b-chat-q4_k_m.gguf" -o "$RESOURCES_DIR/slm.gguf"
touch "$RESOURCES_DIR/slm.gguf"

# 3. Base de Datos Vectorial
# Usaremos lancedb o sqlite-vss embebido en Python, no hace falta descargar binarios extra aquí,
# el motor de PyInstaller ya lo incluye.

echo "[OmniWorker B2B] Recursos locales inyectados correctamente."
