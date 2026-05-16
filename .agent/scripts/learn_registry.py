#!/usr/bin/env python3
"""
Learn Registry - project-scoped learning state
==============================================

Tracks repeated project-specific conventions and materializes them into
`.agent/project-skills/` once they cross a confidence threshold.

Usage:
    python3 .agent/scripts/learn_registry.py status
    python3 .agent/scripts/learn_registry.py note --topic "button color" --signal "Buttons must stay red"
    python3 .agent/scripts/learn_registry.py materialize --topic "button color"
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
from pathlib import Path
from typing import Any


ROOT = Path(".").resolve()
PROJECT_SKILLS = ROOT / ".agent" / "project-skills"
REGISTRY_PATH = PROJECT_SKILLS / "_registry.json"


DEFAULT_REGISTRY = {
    "settings": {
        "threshold": 3,
        "auto_materialize": True,
    },
    "topics": {},
}


def slugify(text: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return slug or "project-pattern"


def load_registry() -> dict[str, Any]:
    PROJECT_SKILLS.mkdir(parents=True, exist_ok=True)
    if not REGISTRY_PATH.exists():
        return json.loads(json.dumps(DEFAULT_REGISTRY))
    try:
        return json.loads(REGISTRY_PATH.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return json.loads(json.dumps(DEFAULT_REGISTRY))


def save_registry(registry: dict[str, Any]) -> None:
    PROJECT_SKILLS.mkdir(parents=True, exist_ok=True)
    REGISTRY_PATH.write_text(json.dumps(registry, indent=2), encoding="utf-8")


def get_topic(registry: dict[str, Any], topic: str) -> dict[str, Any]:
    topics = registry.setdefault("topics", {})
    return topics.setdefault(
        topic,
        {
            "count": 0,
            "signals": [],
            "skill_slug": f"project-{slugify(topic)}",
            "materialized": False,
            "created_at": int(time.time()),
            "updated_at": int(time.time()),
        },
    )


def create_skill(topic: str, item: dict[str, Any]) -> Path:
    skill_dir = PROJECT_SKILLS / item["skill_slug"]
    skill_dir.mkdir(parents=True, exist_ok=True)
    skill_file = skill_dir / "SKILL.md"

    if skill_file.exists():
        return skill_file

    signal_lines = "\n".join(f"- {entry}" for entry in item["signals"][:5]) or "- Document the confirmed convention here."
    content = f"""---
name: {item["skill_slug"]}
description: Project-specific convention for {topic}
---

# {topic}

## When To Use

Use this skill when working in areas affected by this project-specific convention.

## Confirmed Signals

{signal_lines}

## Rules

- Preserve the established convention for this project.
- Prefer project consistency over generic defaults.
- Add concrete examples from the repo when the convention becomes clearer.

## Anti-Patterns

- Reverting to generic toolkit defaults when this project has a confirmed local rule.
- Applying this convention outside this repository without verification.
"""
    skill_file.write_text(content, encoding="utf-8")
    return skill_file


def cmd_status() -> int:
    registry = load_registry()
    threshold = registry["settings"]["threshold"]
    print("\n=== Learn Registry ===")
    print(f"Threshold: {threshold}")
    print(f"Auto-materialize: {registry['settings']['auto_materialize']}")

    topics = registry.get("topics", {})
    if not topics:
        print("No tracked learning topics yet.")
        return 0

    for topic, item in sorted(topics.items()):
        ready = item["count"] >= threshold
        print(
            f"- {topic}: count={item['count']} | slug={item['skill_slug']} | "
            f"ready={'yes' if ready else 'no'} | materialized={'yes' if item['materialized'] else 'no'}"
        )
    return 0


def cmd_note(topic: str, signal: str) -> int:
    registry = load_registry()
    threshold = registry["settings"]["threshold"]
    item = get_topic(registry, topic)
    item["count"] += 1
    item["updated_at"] = int(time.time())
    if signal and signal not in item["signals"]:
        item["signals"].append(signal)

    message = f"Tracked learning signal for '{topic}' ({item['count']}/{threshold})."

    if registry["settings"].get("auto_materialize") and item["count"] >= threshold and not item["materialized"]:
        skill_file = create_skill(topic, item)
        item["materialized"] = True
        message += f" Materialized project skill at {skill_file.relative_to(ROOT)}."

    save_registry(registry)
    print(message)
    return 0


def cmd_materialize(topic: str) -> int:
    registry = load_registry()
    item = get_topic(registry, topic)
    skill_file = create_skill(topic, item)
    item["materialized"] = True
    item["updated_at"] = int(time.time())
    save_registry(registry)
    print(f"Materialized project skill for '{topic}' at {skill_file.relative_to(ROOT)}")
    return 0


def main() -> None:
    parser = argparse.ArgumentParser(description="Manage project-scoped learning state")
    subparsers = parser.add_subparsers(dest="command", required=True)

    subparsers.add_parser("status")

    note_parser = subparsers.add_parser("note")
    note_parser.add_argument("--topic", required=True)
    note_parser.add_argument("--signal", required=True)

    materialize_parser = subparsers.add_parser("materialize")
    materialize_parser.add_argument("--topic", required=True)

    args = parser.parse_args()

    if args.command == "status":
        sys.exit(cmd_status())
    if args.command == "note":
        sys.exit(cmd_note(args.topic, args.signal))
    if args.command == "materialize":
        sys.exit(cmd_materialize(args.topic))


if __name__ == "__main__":
    main()
