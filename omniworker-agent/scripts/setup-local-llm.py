#!/usr/bin/env python3
"""Setup local LLM server for OmniWorker.

Downloads a pre-compiled llama.cpp server binary and a small GGUF model
to ~/.omniworker/local-llm/. The server runs on localhost:11435 and serves
both chat completions and embeddings.

Usage:
    python setup-local-llm.py [--model MODEL_URL] [--force]
"""

import argparse
import os
import platform
import shutil
import subprocess
import sys
import urllib.request
import zipfile
from pathlib import Path

LLAMA_RELEASE_TAG = "b4518"
# Qwen2.5-1.5B es suficiente para tareas simples (traducción, búsqueda, resumen)
# Pesa ~1GB y corre bien en computadoras viejas de oficina con 2-4GB de RAM libre
MODEL_DEFAULT_URL = "https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf"
MODEL_NAME = "qwen2.5-1.5b-instruct-q4_k_m.gguf"
LOCAL_LLM_DIR = Path.home() / ".omniworker" / "local-llm"


def get_llama_binary_url() -> str:
    system = platform.system()
    machine = platform.machine()

    base = f"https://github.com/ggerganov/llama.cpp/releases/download/{LLAMA_RELEASE_TAG}"

    if system == "Darwin":
        if machine == "arm64":
            return f"{base}/llama-{LLAMA_RELEASE_TAG}-bin-macos-arm64.zip"
        else:
            return f"{base}/llama-{LLAMA_RELEASE_TAG}-bin-macos-x64.zip"
    elif system == "Linux":
        return f"{base}/llama-{LLAMA_RELEASE_TAG}-bin-ubuntu-x64.zip"
    elif system == "Windows":
        return f"{base}/llama-{LLAMA_RELEASE_TAG}-bin-win-cuda-cu12.4-x64.zip"
    else:
        raise RuntimeError(f"Unsupported platform: {system} {machine}")


def download(url: str, dest: Path, desc: str) -> None:
    if dest.exists():
        print(f"[local-llm] {desc} already exists: {dest}")
        return

    print(f"[local-llm] Downloading {desc}...")
    print(f"[local-llm] URL: {url}")
    dest.parent.mkdir(parents=True, exist_ok=True)

    def report(block_num, block_size, total_size):
        downloaded = block_num * block_size
        pct = downloaded * 100 // total_size if total_size > 0 else 0
        sys.stdout.write(f"\r[local-llm] {pct}% ({downloaded // 1024 // 1024}MB / {total_size // 1024 // 1024}MB)")
        sys.stdout.flush()

    urllib.request.urlretrieve(url, dest, reporthook=report)
    print()  # newline after progress


def setup_llama_binary(force: bool = False) -> Path:
    binary_dir = LOCAL_LLM_DIR / "bin"
    binary_name = "llama-server.exe" if platform.system() == "Windows" else "llama-server"
    binary_path = binary_dir / binary_name

    if binary_path.exists() and not force:
        print(f"[local-llm] llama-server already installed: {binary_path}")
        return binary_path

    url = get_llama_binary_url()
    zip_path = LOCAL_LLM_DIR / "llama-server.zip"
    download(url, zip_path, "llama.cpp server binary")

    print(f"[local-llm] Extracting {zip_path}...")
    with zipfile.ZipFile(zip_path, "r") as z:
        z.extractall(binary_dir)

    zip_path.unlink()

    # On Unix, make binary executable
    if platform.system() != "Windows":
        binary_path.chmod(0o755)

    print(f"[local-llm] llama-server installed: {binary_path}")
    return binary_path


def setup_model(model_url: str, force: bool = False) -> Path:
    model_path = LOCAL_LLM_DIR / "models" / MODEL_NAME

    if model_path.exists() and not force:
        print(f"[local-llm] Model already downloaded: {model_path}")
        return model_path

    download(model_url, model_path, f"model ({MODEL_NAME})")
    print(f"[local-llm] Model saved: {model_path}")
    return model_path


def create_start_script(binary_path: Path, model_path: Path) -> Path:
    script_dir = LOCAL_LLM_DIR / "scripts"
    script_dir.mkdir(parents=True, exist_ok=True)

    if platform.system() == "Windows":
        script_path = script_dir / "start-local-llm.bat"
        content = f'''@echo off
setlocal
set LLAMA_MODEL={model_path}
set LLAMA_SERVER={binary_path}
set LLAMA_PORT=11435

echo [local-llm] Starting local LLM server on port %LLAMA_PORT%...
"%LLAMA_SERVER%" --model "%LLAMA_MODEL%" --port %LLAMA_PORT% --ctx-size 8192 --embedding --n-gpu-layers 999 --verbose 0
'''
    else:
        script_path = script_dir / "start-local-llm.sh"
        content = f'''#!/bin/bash
set -e
export LLAMA_MODEL="{model_path}"
export LLAMA_SERVER="{binary_path}"
export LLAMA_PORT=11435

echo "[local-llm] Starting local LLM server on port $LLAMA_PORT..."
"$LLAMA_SERVER" --model "$LLAMA_MODEL" --port "$LLAMA_PORT" --ctx-size 8192 --embedding --n-gpu-layers 999 --verbose 0
'''

    script_path.write_text(content)
    if platform.system() != "Windows":
        script_path.chmod(0o755)

    print(f"[local-llm] Start script created: {script_path}")
    return script_path


def patch_config_yaml(omniworker_home: str) -> None:
    """Merge local-llm settings into the active config.yaml."""
    import ruamel.yaml

    config_path = Path(omniworker_home) / "config.yaml"
    if not config_path.exists():
        print(f"[local-llm] config.yaml not found at {config_path}, skipping config patch")
        return

    yaml = ruamel.yaml.YAML()
    yaml.preserve_quotes = True
    yaml.default_flow_style = False

    try:
        with open(config_path, "r") as f:
            config = yaml.load(f)
    except Exception as e:
        print(f"[local-llm] Failed to read config.yaml: {e}")
        return

    if config is None:
        config = {}

    # Ensure auxiliary section exists
    if "auxiliary" not in config:
        config["auxiliary"] = {}
    if config["auxiliary"] is None:
        config["auxiliary"] = {}

    # Set basic_tasks to point to local server
    config["auxiliary"]["basic_tasks"] = {
        "provider": "custom",
        "model": "local-llm",
        "base_url": "http://127.0.0.1:11435/v1",
        "api_key": "dummy",
        "timeout": 60,
        "extra_body": {},
    }

    # Set memory provider to local_embed
    if "memory" not in config:
        config["memory"] = {}
    if config["memory"] is None:
        config["memory"] = {}
    config["memory"]["provider"] = "local_embed"

    try:
        with open(config_path, "w") as f:
            yaml.dump(config, f)
        print(f"[local-llm] Patched {config_path}")
    except Exception as e:
        print(f"[local-llm] Failed to write config.yaml: {e}")


def create_config_snippet() -> None:
    """Write a config snippet that the desktop/agent can merge into config.yaml."""
    snippet_path = LOCAL_LLM_DIR / "config-snippet.yaml"
    snippet = '''# Local LLM configuration — auto-generated by setup-local-llm.py
# This model runs on localhost:11435 and handles basic tasks + embeddings
auxiliary:
  basic_tasks:
    provider: custom
    model: local-llm
    base_url: http://127.0.0.1:11435/v1
    api_key: dummy
    timeout: 60
    extra_body: {}

memory:
  provider: local_embed
'''
    snippet_path.write_text(snippet)
    print(f"[local-llm] Config snippet created: {snippet_path}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Setup local LLM for OmniWorker")
    parser.add_argument("--model", default=MODEL_DEFAULT_URL, help="GGUF model URL")
    parser.add_argument("--force", action="store_true", help="Re-download even if exists")
    args = parser.parse_args()

    print("=" * 60)
    print("OmniWorker Local LLM Setup")
    print("=" * 60)

    binary_path = setup_llama_binary(force=args.force)
    model_path = setup_model(args.model, force=args.force)
    create_start_script(binary_path, model_path)
    create_config_snippet()

    # Patch active config.yaml
    omniworker_home = os.getenv("OMNIWORKER_HOME", str(Path.home() / ".omniworker"))
    patch_config_yaml(omniworker_home)

    print()
    print("[local-llm] Setup complete!")
    print(f"[local-llm] Binary: {binary_path}")
    print(f"[local-llm] Model:  {model_path}")
    print(f"[local-llm] Start:  {LOCAL_LLM_DIR / 'scripts' / 'start-local-llm.sh'}")
    print(f"[local-llm] Config: {LOCAL_LLM_DIR / 'config-snippet.yaml'}")
    print()
    print("[local-llm] To start the server manually, run the start script above.")
    print("[local-llm) The desktop will auto-start it on launch.")


if __name__ == "__main__":
    main()
