#!/usr/bin/env python3
"""
Context Pack - low-token operational snapshot
=============================================

Builds a compact summary of the current repo state so agents can start with a
small context footprint and escalate only when needed.

Usage:
    python3 .agent/scripts/context_pack.py
    python3 .agent/scripts/context_pack.py --json
"""

from __future__ import annotations

import argparse
import json
import subprocess
from pathlib import Path


ROOT = Path(".").resolve()
AGENT_ROOT = ROOT / ".agent"


def read_json(path: Path) -> dict:
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}


def detect_project_scripts() -> list[str]:
    package_json = ROOT / "package.json"
    if not package_json.exists():
        return []
    data = read_json(package_json)
    scripts = data.get("scripts", {})
    return sorted(scripts.keys())


def detect_stack() -> list[str]:
    package_json = ROOT / "package.json"
    if not package_json.exists():
        return []
    data = read_json(package_json)
    deps = {**data.get("dependencies", {}), **data.get("devDependencies", {})}
    stack: list[str] = []
    if "next" in deps:
        stack.append("Next.js")
    elif "react" in deps:
        stack.append("React")
    elif "vue" in deps:
        stack.append("Vue")
    elif "svelte" in deps:
        stack.append("Svelte")
    if "typescript" in deps:
        stack.append("TypeScript")
    if "tailwindcss" in deps:
        stack.append("Tailwind CSS")
    if "prisma" in deps:
        stack.append("Prisma")
    return stack


def detect_changed_files(limit: int = 12) -> list[str]:
    result = subprocess.run(
        ["git", "status", "--short"],
        cwd=ROOT,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        return []
    files = [line[3:].strip() for line in result.stdout.splitlines() if line.strip()]
    return files[:limit]


def detect_project_skills(limit: int = 8) -> list[str]:
    project_skills = AGENT_ROOT / "project-skills"
    if not project_skills.exists():
        return []
    skills = []
    for path in sorted(project_skills.iterdir()):
        if path.is_dir() and (path / "SKILL.md").exists():
            skills.append(path.name)
    return skills[:limit]


def detect_learning_ready(limit: int = 5) -> list[str]:
    registry = read_json(AGENT_ROOT / "project-skills" / "_registry.json")
    settings = registry.get("settings", {})
    threshold = settings.get("threshold", 3)
    topics = registry.get("topics", {})
    ready = [
        topic
        for topic, item in topics.items()
        if item.get("count", 0) >= threshold and not item.get("materialized", False)
    ]
    return ready[:limit]


def infer_agents(changed_files: list[str]) -> list[str]:
    joined = " ".join(changed_files).lower()
    agents: list[str] = []
    if any(key in joined for key in ["component", "page", "layout", "css", "tailwind", ".html", ".tsx", ".jsx"]):
        agents.append("frontend-specialist")
    if any(key in joined for key in ["api", "server", "route", "service", ".py", ".go"]):
        agents.append("backend-specialist")
    if any(key in joined for key in ["schema", "migration", "prisma", "db", "sql"]):
        agents.append("database-architect")
    if any(key in joined for key in ["test", "spec", "__tests__", "playwright", "vitest", "jest"]):
        agents.append("test-engineer")
    if any(key in joined for key in ["auth", "token", "secret", "env", "security"]):
        agents.append("security-auditor")
    if not agents:
        agents.append("orchestrator")
    return agents[:4]


def build_pack() -> dict:
    changed_files = detect_changed_files()
    scripts = detect_project_scripts()
    stack = detect_stack()
    project_skills = detect_project_skills()
    learning_ready = detect_learning_ready()
    suggested_agents = infer_agents(changed_files)

    return {
        "project": ROOT.name,
        "path": str(ROOT),
        "stack": stack,
        "package_scripts": scripts,
        "changed_files": changed_files,
        "project_skills": project_skills,
        "learning_ready": learning_ready,
        "suggested_agents": suggested_agents,
        "recommended_checks": [
            "python3 .agent/scripts/smart_validate.py" if changed_files else "python3 .agent/scripts/doctor.py",
            "python3 .agent/scripts/self_check.py .",
        ],
    }


def render_text(pack: dict) -> None:
    print("=== Context Pack ===")
    print(f"Project: {pack['project']}")
    print(f"Stack: {', '.join(pack['stack']) if pack['stack'] else 'unknown'}")
    print(f"Suggested agents: {', '.join(pack['suggested_agents'])}")
    print(f"Changed files: {len(pack['changed_files'])}")
    if pack["changed_files"]:
        for file in pack["changed_files"]:
            print(f"  - {file}")
    print(f"Project skills: {', '.join(pack['project_skills']) if pack['project_skills'] else 'none'}")
    if pack["learning_ready"]:
        print(f"Learning ready: {', '.join(pack['learning_ready'])}")
    print("Recommended checks:")
    for command in pack["recommended_checks"]:
        print(f"  - {command}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate a compact low-token context snapshot")
    parser.add_argument("--json", action="store_true", help="Emit machine-readable JSON")
    args = parser.parse_args()

    pack = build_pack()
    if args.json:
        print(json.dumps(pack, indent=2))
        return
    render_text(pack)


if __name__ == "__main__":
    main()
