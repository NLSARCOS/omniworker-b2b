#!/usr/bin/env python3
"""
Doctor - daily operational health check for `.agent`
====================================================

Usage:
    python3 .agent/scripts/doctor.py
    python3 .agent/scripts/doctor.py --json
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

from context_pack import build_pack


ROOT = Path(".").resolve()
AGENT_SCRIPTS = ROOT / ".agent" / "scripts"


def run_command(command: list[str]) -> dict[str, object]:
    result = subprocess.run(command, capture_output=True, text=True)
    return {
        "command": command,
        "returncode": result.returncode,
        "stdout": result.stdout.strip(),
        "stderr": result.stderr.strip(),
        "ok": result.returncode == 0,
    }


def detect_project_scripts() -> dict[str, bool]:
    package_json = ROOT / "package.json"
    if not package_json.exists():
        return {}

    data = json.loads(package_json.read_text(encoding="utf-8"))
    scripts = data.get("scripts", {})
    return {
        "dev": "dev" in scripts,
        "build": "build" in scripts,
        "test": "test" in scripts,
        "lint": "lint" in scripts,
    }


def detect_git_state() -> dict[str, object]:
    result = subprocess.run(
        ["git", "status", "--short"],
        capture_output=True,
        text=True,
        cwd=ROOT,
    )
    if result.returncode != 0:
        return {"available": False, "dirty": False, "changed_files": []}

    changed = [line[3:].strip() for line in result.stdout.splitlines() if line.strip()]
    return {
        "available": True,
        "dirty": bool(changed),
        "changed_files": changed,
    }


def detect_learning_state() -> dict[str, object]:
    registry_path = ROOT / ".agent" / "project-skills" / "_registry.json"
    if not registry_path.exists():
        return {"available": False, "ready_topics": [], "tracked_topics": 0}

    data = json.loads(registry_path.read_text(encoding="utf-8"))
    threshold = data.get("settings", {}).get("threshold", 3)
    topics = data.get("topics", {})
    ready = [
        topic
        for topic, item in topics.items()
        if item.get("count", 0) >= threshold and not item.get("materialized", False)
    ]
    return {
        "available": True,
        "threshold": threshold,
        "tracked_topics": len(topics),
        "ready_topics": ready,
    }


def recommend_actions(
    script_flags: dict[str, bool],
    git_state: dict[str, object],
    learning_state: dict[str, object],
    self_check_ok: bool,
    preview_ok: bool,
) -> list[str]:
    actions: list[str] = []

    if not self_check_ok:
        actions.append("Run `.agent` maintenance before coding: `python3 .agent/scripts/self_check.py .`")
    else:
        actions.append("Start with a compact snapshot: `python3 .agent/scripts/context_pack.py`")

    if script_flags.get("dev") and not preview_ok:
        actions.append("Start local preview: `python3 .agent/scripts/auto_preview.py start`")

    if script_flags.get("lint"):
        actions.append("Use `python3 .agent/scripts/checklist.py .` before handing off meaningful changes")

    if script_flags.get("build"):
        actions.append("Run a build check before release to catch integration issues early")

    if script_flags.get("test"):
        actions.append("Keep the test suite green as part of the default implementation loop")

    if git_state.get("dirty"):
        actions.append("Use change-aware checks: `python3 .agent/scripts/smart_validate.py`")
    elif git_state.get("available"):
        actions.append("Working tree is clean; use `smart_validate.py` after your next set of edits")

    if learning_state.get("ready_topics"):
        actions.append("Project patterns are ready to persist; review `python3 .agent/scripts/learn_registry.py status`")

    if not actions:
        actions.append("Project has no detected package scripts; rely on `.agent` audits and manual run commands")

    return actions


def render_human(results: dict[str, object]) -> int:
    self_check = results["self_check"]
    preview = results["preview"]
    context_pack = results["context_pack"]
    scripts = results["project_scripts"]
    git_state = results["git_state"]
    learning_state = results["learning_state"]
    recommendations = results["recommendations"]

    print("\n=== .agent Doctor ===")
    print(f"Project: {ROOT}")
    print(f"Self Check: {'OK' if self_check['ok'] else 'FAIL'}")
    print(f"Preview: {'Running/Healthy' if preview['ok'] else 'Stopped or unhealthy'}")
    if git_state["available"]:
        print(f"Git Working Tree: {'dirty' if git_state['dirty'] else 'clean'}")
    if learning_state["available"]:
        print(f"Learning Topics: {learning_state['tracked_topics']} tracked")

    print("\nFast Context:")
    print(f"  - Stack: {', '.join(context_pack['stack']) if context_pack['stack'] else 'unknown'}")
    print(f"  - Suggested agents: {', '.join(context_pack['suggested_agents'])}")
    print(f"  - Project skills: {', '.join(context_pack['project_skills']) if context_pack['project_skills'] else 'none'}")

    if scripts:
        print("\nDetected package scripts:")
        for name, exists in scripts.items():
            print(f"  - {name}: {'yes' if exists else 'no'}")

    if git_state["available"] and git_state["changed_files"]:
        print("\nChanged files:")
        for file in git_state["changed_files"][:10]:
            print(f"  - {file}")
        if len(git_state["changed_files"]) > 10:
            print(f"  - ... and {len(git_state['changed_files']) - 10} more")

    if self_check["stdout"]:
        print("\nSelf Check Summary:")
        print(self_check["stdout"])

    if preview["stdout"]:
        print("\nPreview Summary:")
        print(preview["stdout"])

    if learning_state["available"] and learning_state["ready_topics"]:
        print("\nLearning Ready:")
        for topic in learning_state["ready_topics"]:
            print(f"  - {topic}")

    print("\nRecommended Next Actions:")
    for action in recommendations:
        print(f"  - {action}")

    print()
    return 0 if self_check["ok"] else 1


def main() -> None:
    parser = argparse.ArgumentParser(description="Daily .agent operational doctor")
    parser.add_argument("--json", action="store_true", help="Emit machine-readable JSON")
    args = parser.parse_args()

    self_check = run_command([sys.executable, str(AGENT_SCRIPTS / "self_check.py"), str(ROOT)])
    preview = run_command([sys.executable, str(AGENT_SCRIPTS / "auto_preview.py"), "check"])
    context_pack = build_pack()
    scripts = detect_project_scripts()
    git_state = detect_git_state()
    learning_state = detect_learning_state()
    recommendations = recommend_actions(
        scripts,
        git_state,
        learning_state,
        bool(self_check["ok"]),
        bool(preview["ok"]),
    )

    results = {
        "project": str(ROOT),
        "self_check": self_check,
        "preview": preview,
        "context_pack": context_pack,
        "project_scripts": scripts,
        "git_state": git_state,
        "learning_state": learning_state,
        "recommendations": recommendations,
    }

    if args.json:
        print(json.dumps(results, indent=2))
        sys.exit(0 if self_check["ok"] else 1)

    sys.exit(render_human(results))


if __name__ == "__main__":
    main()
