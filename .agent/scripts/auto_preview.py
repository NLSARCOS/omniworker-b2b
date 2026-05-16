#!/usr/bin/env python3
"""
Auto Preview - Antigravity Kit
==============================
Manages the local development server for previewing the application.

Usage:
    python3 .agent/scripts/auto_preview.py start [port]
    python3 .agent/scripts/auto_preview.py stop
    python3 .agent/scripts/auto_preview.py restart [port]
    python3 .agent/scripts/auto_preview.py status
    python3 .agent/scripts/auto_preview.py check
"""

import argparse
import json
import os
import signal
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

AGENT_DIR = Path(".agent")
PID_FILE = AGENT_DIR / "preview.pid"
LOG_FILE = AGENT_DIR / "preview.log"
STATE_FILE = AGENT_DIR / "preview.json"


def get_project_root() -> Path:
    return Path(".").resolve()


def is_running(pid: int) -> bool:
    try:
        os.kill(pid, 0)
        return True
    except OSError:
        return False


def load_state() -> dict[str, Any]:
    if not STATE_FILE.exists():
        return {}
    try:
        return json.loads(STATE_FILE.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {}


def save_state(state: dict[str, Any]) -> None:
    AGENT_DIR.mkdir(parents=True, exist_ok=True)
    STATE_FILE.write_text(json.dumps(state, indent=2), encoding="utf-8")


def clear_state() -> None:
    for file_path in [PID_FILE, STATE_FILE]:
        if file_path.exists():
            file_path.unlink()


def port_is_open(port: int, host: str = "127.0.0.1") -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(0.5)
        return sock.connect_ex((host, port)) == 0


def find_available_port(start_port: int, attempts: int = 10) -> int:
    for port in range(start_port, start_port + attempts):
        if not port_is_open(port):
            return port
    raise RuntimeError(f"No available port found between {start_port} and {start_port + attempts - 1}")


def get_start_command(root: Path) -> list[str] | None:
    pkg_file = root / "package.json"
    if not pkg_file.exists():
        return None

    with open(pkg_file, "r", encoding="utf-8") as file:
        data = json.load(file)

    scripts = data.get("scripts", {})
    if "dev" in scripts:
        return ["npm", "run", "dev"]
    if "start" in scripts:
        return ["npm", "start"]
    return None


def build_url(port: int) -> str:
    return f"http://localhost:{port}"


def check_server(url: str, timeout: float = 2.0) -> tuple[bool, str]:
    try:
        with urllib.request.urlopen(url, timeout=timeout) as response:
            return True, f"HTTP {response.status}"
    except urllib.error.HTTPError as exc:
        return True, f"HTTP {exc.code}"
    except Exception as exc:
        return False, str(exc)


def start_server(port: int = 3000) -> int:
    existing = load_state()
    existing_pid = existing.get("pid")
    if isinstance(existing_pid, int) and is_running(existing_pid):
        print(f"⚠️  Preview already running (PID: {existing_pid})")
        print(f"   URL: {existing.get('url', build_url(existing.get('port', port)))}")
        return 0

    root = get_project_root()
    cmd = get_start_command(root)
    if not cmd:
        print("❌ No 'dev' or 'start' script found in package.json")
        return 1

    AGENT_DIR.mkdir(parents=True, exist_ok=True)
    safe_port = find_available_port(port)
    env = os.environ.copy()
    env["PORT"] = str(safe_port)

    print(f"🚀 Starting preview on port {safe_port}...")
    with open(LOG_FILE, "w", encoding="utf-8") as log:
        process = subprocess.Popen(
            cmd,
            cwd=str(root),
            stdout=log,
            stderr=log,
            env=env,
            shell=False,
        )

    PID_FILE.write_text(str(process.pid), encoding="utf-8")
    state = {
        "pid": process.pid,
        "port": safe_port,
        "url": build_url(safe_port),
        "command": cmd,
        "started_at": int(time.time()),
    }
    save_state(state)

    print(f"✅ Preview started! (PID: {process.pid})")
    print(f"   Logs: {LOG_FILE}")
    print(f"   URL: {state['url']}")
    return 0


def stop_server() -> int:
    state = load_state()
    pid = state.get("pid")
    if not isinstance(pid, int):
        print("ℹ️  No preview server found.")
        clear_state()
        return 0

    try:
        if is_running(pid):
            if sys.platform == "win32":
                subprocess.call(["taskkill", "/F", "/T", "/PID", str(pid)])
            else:
                os.kill(pid, signal.SIGTERM)
            print(f"🛑 Preview stopped (PID: {pid})")
        else:
            print("ℹ️  Process was not running.")
    except Exception as exc:
        print(f"❌ Error stopping server: {exc}")
        return 1
    finally:
        clear_state()

    return 0


def status_server() -> int:
    state = load_state()
    pid = state.get("pid")
    port = state.get("port", 3000)
    url = state.get("url", build_url(port))
    running = isinstance(pid, int) and is_running(pid)
    healthy = False
    detail = "Not checked"

    if running:
        healthy, detail = check_server(url)

    print("\n=== Preview Status ===")
    if running:
        print("✅ Status: Running")
        print(f"🔢 PID: {pid}")
        print(f"🌐 URL: {url}")
        print(f"💚 Health: {'OK' if healthy else 'Unreachable'} ({detail})")
        print(f"📝 Logs: {LOG_FILE}")
    else:
        print("⚪ Status: Stopped")
    print("===================\n")
    return 0 if running else 1


def restart_server(port: int | None = None) -> int:
    state = load_state()
    current_port = state.get("port", 3000)
    stop_server()
    return start_server(port if port is not None else current_port)


def health_check() -> int:
    state = load_state()
    url = state.get("url")
    if not url:
        print("❌ No preview metadata found. Start the preview first.")
        return 1

    healthy, detail = check_server(url)
    if healthy:
        print(f"✅ Preview health check passed: {url} ({detail})")
        return 0

    print(f"❌ Preview health check failed: {url} ({detail})")
    return 1


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("action", choices=["start", "stop", "restart", "status", "check"])
    parser.add_argument("port", nargs="?", type=int)

    args = parser.parse_args()

    if args.action == "start":
        sys.exit(start_server(args.port or 3000))
    if args.action == "stop":
        sys.exit(stop_server())
    if args.action == "restart":
        sys.exit(restart_server(args.port))
    if args.action == "status":
        sys.exit(status_server())
    if args.action == "check":
        sys.exit(health_check())

if __name__ == "__main__":
    main()
