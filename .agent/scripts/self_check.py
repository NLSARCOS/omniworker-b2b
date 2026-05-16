#!/usr/bin/env python3
"""
Self Check - .agent consistency audit
====================================

Validates internal consistency of the local `.agent` system.

Usage:
    python3 .agent/scripts/self_check.py .
    python3 .agent/scripts/self_check.py . --strict
"""

from __future__ import annotations

import argparse
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable


@dataclass
class Finding:
    level: str
    message: str


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Audit .agent consistency")
    parser.add_argument("project", nargs="?", default=".", help="Project root")
    parser.add_argument("--strict", action="store_true", help="Treat warnings as failures")
    return parser.parse_args()


def parse_frontmatter_skills(md_path: Path) -> list[str]:
    text = md_path.read_text(encoding="utf-8")
    if not text.startswith("---\n"):
        return []

    parts = text.split("---", 2)
    if len(parts) < 3:
        return []

    frontmatter = parts[1]
    match = re.search(r"^skills:\s*(.+)$", frontmatter, flags=re.MULTILINE)
    if not match:
        return []

    raw = match.group(1).strip()
    return [item.strip() for item in raw.split(",") if item.strip()]


def find_command_script_refs(text: str) -> Iterable[tuple[str, str]]:
    pattern = re.compile(r"\b(python|python3)\s+(\.agent/[\w./-]+\.py)\b")
    return pattern.findall(text)


def count_skill_dirs(skills_dir: Path) -> int:
    return sum(1 for path in skills_dir.iterdir() if path.is_dir() and (path / "SKILL.md").exists())


def add(level: str, message: str, findings: list[Finding]) -> None:
    findings.append(Finding(level=level, message=message))


def validate_required_structure(agent_dir: Path, findings: list[Finding]) -> None:
    required_dirs = ["agents", "skills", "workflows", "rules", "scripts", "project-skills"]
    required_files = ["ARCHITECTURE.md", "CODEBASE.md", "MEMORY.md", "rules/GEMINI.md"]

    for rel in required_dirs:
        if not (agent_dir / rel).is_dir():
            add("ERROR", f"Missing required directory: .agent/{rel}", findings)

    for rel in required_files:
        if not (agent_dir / rel).is_file():
            add("ERROR", f"Missing required file: .agent/{rel}", findings)


def validate_agent_skill_links(agent_dir: Path, findings: list[Finding]) -> None:
    skills_dir = agent_dir / "skills"
    available_skills = {
        path.name
        for path in skills_dir.iterdir()
        if path.is_dir() and (path / "SKILL.md").exists()
    }

    for agent_file in sorted((agent_dir / "agents").glob("*.md")):
        for skill in parse_frontmatter_skills(agent_file):
            if skill not in available_skills:
                add(
                    "ERROR",
                    f"{agent_file.relative_to(agent_dir.parent)} references missing skill '{skill}'",
                    findings,
                )


def validate_command_refs(agent_dir: Path, findings: list[Finding]) -> None:
    for md_file in sorted(agent_dir.rglob("*.md")):
        text = md_file.read_text(encoding="utf-8")

        for interpreter, rel_script in find_command_script_refs(text):
            script_path = agent_dir.parent / rel_script
            if not script_path.is_file():
                add(
                    "ERROR",
                    f"{md_file.relative_to(agent_dir.parent)} references missing script {rel_script}",
                    findings,
                )
            if interpreter == "python":
                add(
                    "WARN",
                    f"{md_file.relative_to(agent_dir.parent)} uses 'python' for {rel_script}; prefer 'python3'",
                    findings,
                )


def validate_count_docs(agent_dir: Path, findings: list[Finding]) -> None:
    actual_agents = len(list((agent_dir / "agents").glob("*.md")))
    actual_workflows = len(list((agent_dir / "workflows").glob("*.md")))
    actual_skills = count_skill_dirs(agent_dir / "skills")
    openspec_workflows = len(list((agent_dir / "workflows").glob("opsx-*.md")))
    kit_workflows = actual_workflows - openspec_workflows

    architecture = (agent_dir / "ARCHITECTURE.md").read_text(encoding="utf-8")
    gemini = (agent_dir / "rules" / "GEMINI.md").read_text(encoding="utf-8")

    count_checks = [
        (architecture, r"Total\*\*: (\d+) agents \+ (\d+) skills \+ (\d+) workflows", "ARCHITECTURE totals"),
        (gemini, r"Agents: `.agent/agents/` \((\d+) specialists\)", "GEMINI agent count"),
        (gemini, r"Skills: `.agent/skills/` \((\d+) skills", "GEMINI skill count"),
        (gemini, r"Workflows: `.agent/workflows/` \((\d+) workflows", "GEMINI workflow count"),
    ]

    for text, pattern, label in count_checks:
        match = re.search(pattern, text)
        if not match:
            add("WARN", f"{label} not found or changed format", findings)
            continue

        numbers = [int(value) for value in match.groups()]
        if label == "ARCHITECTURE totals":
            expected = [actual_agents, actual_skills, actual_workflows]
            if numbers != expected:
                add(
                    "ERROR",
                    f"{label} mismatch: documented={numbers}, actual={expected}",
                    findings,
                )
        elif "agent" in label.lower() and numbers[0] != actual_agents:
            add("ERROR", f"{label} mismatch: documented={numbers[0]}, actual={actual_agents}", findings)
        elif "skill" in label.lower() and numbers[0] != actual_skills:
            add("ERROR", f"{label} mismatch: documented={numbers[0]}, actual={actual_skills}", findings)
        elif "workflow" in label.lower() and numbers[0] != actual_workflows:
            add("ERROR", f"{label} mismatch: documented={numbers[0]}, actual={actual_workflows}", findings)

    kit_match = re.search(r"### Kit Workflows \((\d+)\)", architecture)
    open_match = re.search(r"### OpenSpec Workflows \((\d+)\)", architecture)
    if kit_match and int(kit_match.group(1)) != kit_workflows:
        add(
            "ERROR",
            f"ARCHITECTURE kit workflow count mismatch: documented={kit_match.group(1)}, actual={kit_workflows}",
            findings,
        )
    if open_match and int(open_match.group(1)) != openspec_workflows:
        add(
            "ERROR",
            f"ARCHITECTURE OpenSpec workflow count mismatch: documented={open_match.group(1)}, actual={openspec_workflows}",
            findings,
        )


def validate_parallel_skill(agent_dir: Path, findings: list[Finding]) -> None:
    skill_file = agent_dir / "skills" / "parallel-agents" / "SKILL.md"
    if not skill_file.is_file():
        return

    text = skill_file.read_text(encoding="utf-8")
    if "api-designer" in text:
        add("WARN", "parallel-agents skill references non-existent agent 'api-designer'", findings)


def validate_preview_workflow(agent_dir: Path, findings: list[Finding]) -> None:
    workflow = agent_dir / "workflows" / "preview.md"
    script = agent_dir / "scripts" / "auto_preview.py"
    if not workflow.is_file() or not script.is_file():
        return

    workflow_text = workflow.read_text(encoding="utf-8")
    script_text = script.read_text(encoding="utf-8")

    for action in ["start", "stop", "restart", "status", "check"]:
        workflow_mentions = action in workflow_text
        script_mentions = f'"{action}"' in script_text or f"'{action}'" in script_text
        if workflow_mentions and not script_mentions:
            add("ERROR", f"preview workflow mentions '{action}' but auto_preview.py does not support it", findings)


def validate_learn_workflow(agent_dir: Path, findings: list[Finding]) -> None:
    workflow = agent_dir / "workflows" / "learn.md"
    gemini = agent_dir / "rules" / "GEMINI.md"
    architecture = agent_dir / "ARCHITECTURE.md"
    readme = agent_dir.parent / "README.md"

    if not workflow.is_file():
        return

    workflow_text = workflow.read_text(encoding="utf-8")
    gemini_text = gemini.read_text(encoding="utf-8") if gemini.is_file() else ""
    architecture_text = architecture.read_text(encoding="utf-8") if architecture.is_file() else ""
    readme_text = readme.read_text(encoding="utf-8") if readme.is_file() else ""

    if re.search(r"Create a new directory at `\.agent/skills/", workflow_text) or "permanent `.agent/skills/`" in gemini_text:
        add("ERROR", "learn workflow still points project learning at shared `.agent/skills/`", findings)

    if ".agent/project-skills/" not in workflow_text:
        add("ERROR", "learn workflow does not reference `.agent/project-skills/`", findings)

    for label, text in [
        ("GEMINI", gemini_text),
        ("ARCHITECTURE", architecture_text),
        ("README", readme_text),
    ]:
        if "/learn" not in text:
            add("WARN", f"{label} does not mention `/learn` even though learn workflow exists", findings)


def validate_learning_registry(agent_dir: Path, findings: list[Finding]) -> None:
    registry_path = agent_dir / "project-skills" / "_registry.json"
    if not registry_path.is_file():
        add("ERROR", "missing `.agent/project-skills/_registry.json`", findings)
        return

    try:
        import json

        data = json.loads(registry_path.read_text(encoding="utf-8"))
    except Exception as exc:
        add("ERROR", f"invalid learning registry JSON: {exc}", findings)
        return

    settings = data.get("settings", {})
    threshold = settings.get("threshold")
    if not isinstance(threshold, int) or threshold < 1:
        add("ERROR", "learning registry threshold must be a positive integer", findings)

    auto_materialize = settings.get("auto_materialize")
    if not isinstance(auto_materialize, bool):
        add("ERROR", "learning registry auto_materialize must be boolean", findings)


def validate_context_pack(agent_dir: Path, findings: list[Finding]) -> None:
    script = agent_dir / "scripts" / "context_pack.py"
    if not script.is_file():
        add("ERROR", "missing `.agent/scripts/context_pack.py`", findings)
        return

    readme = (agent_dir.parent / "README.md").read_text(encoding="utf-8")
    architecture = (agent_dir / "ARCHITECTURE.md").read_text(encoding="utf-8")
    gemini = (agent_dir / "rules" / "GEMINI.md").read_text(encoding="utf-8")

    for label, text in [
        ("README", readme),
        ("ARCHITECTURE", architecture),
        ("GEMINI", gemini),
    ]:
        if "context_pack.py" not in text:
            add("WARN", f"{label} does not mention `context_pack.py`", findings)


def print_report(findings: list[Finding], strict: bool) -> int:
    errors = [item for item in findings if item.level == "ERROR"]
    warnings = [item for item in findings if item.level == "WARN"]

    print("\n=== .agent Self Check ===")
    print(f"Errors: {len(errors)}")
    print(f"Warnings: {len(warnings)}")

    for item in findings:
        prefix = "❌" if item.level == "ERROR" else "⚠️ "
        print(f"{prefix} {item.message}")

    if not findings:
        print("✅ No consistency issues found.")

    if errors or (strict and warnings):
        return 1
    return 0


def main() -> None:
    args = parse_args()
    root = Path(args.project).resolve()
    agent_dir = root / ".agent"

    findings: list[Finding] = []

    if not agent_dir.is_dir():
        print("❌ .agent directory not found")
        sys.exit(1)

    validate_required_structure(agent_dir, findings)
    validate_agent_skill_links(agent_dir, findings)
    validate_command_refs(agent_dir, findings)
    validate_count_docs(agent_dir, findings)
    validate_parallel_skill(agent_dir, findings)
    validate_preview_workflow(agent_dir, findings)
    validate_learn_workflow(agent_dir, findings)
    validate_learning_registry(agent_dir, findings)
    validate_context_pack(agent_dir, findings)

    sys.exit(print_report(findings, args.strict))


if __name__ == "__main__":
    main()
