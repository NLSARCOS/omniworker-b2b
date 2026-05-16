#!/usr/bin/env python3
"""
Smart Validate - change-aware validation runner
===============================================

Runs only the validations most relevant to the current changed files.

Usage:
    python3 .agent/scripts/smart_validate.py
    python3 .agent/scripts/smart_validate.py --base origin/main
    python3 .agent/scripts/smart_validate.py --all
"""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path


ROOT = Path(".").resolve()


VALIDATIONS = [
    {
        "name": "Agent Self Check",
        "script": ".agent/scripts/self_check.py",
        "always": True,
    },
    {
        "name": "Lint Check",
        "script": ".agent/skills/lint-and-validate/scripts/lint_runner.py",
        "patterns": [".js", ".jsx", ".ts", ".tsx", ".py", ".rs", ".go", ".css", ".scss"],
    },
    {
        "name": "Test Runner",
        "script": ".agent/skills/testing-patterns/scripts/test_runner.py",
        "keywords": ["/test", "/tests", "spec", "__tests__", "service", "api", "server"],
    },
    {
        "name": "Schema Validation",
        "script": ".agent/skills/database-design/scripts/schema_validator.py",
        "keywords": ["prisma", "schema", "migration", "db", "database", "sql"],
    },
    {
        "name": "UX Audit",
        "script": ".agent/skills/frontend-design/scripts/ux_audit.py",
        "keywords": ["component", "page", "layout", "ui", "styles", "tailwind", "css", "app/"],
    },
    {
        "name": "SEO Check",
        "script": ".agent/skills/seo-fundamentals/scripts/seo_checker.py",
        "keywords": ["meta", "sitemap", "robots", "seo", "head", "page"],
    },
    {
        "name": "Security Scan",
        "script": ".agent/skills/vulnerability-scanner/scripts/security_scan.py",
        "keywords": ["auth", "login", "password", "token", "secret", "env", "middleware", "api"],
    },
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run relevant validations for changed files")
    parser.add_argument("--base", help="Compare against a git base ref, e.g. origin/main")
    parser.add_argument("--all", action="store_true", help="Run all mapped validations")
    return parser.parse_args()


def get_changed_files(base: str | None) -> list[str]:
    if base:
        cmd = ["git", "diff", "--name-only", f"{base}...HEAD"]
    else:
        cmd = ["git", "status", "--short"]

    result = subprocess.run(cmd, capture_output=True, text=True, cwd=ROOT)
    if result.returncode != 0:
        return []

    if base:
        return [line.strip() for line in result.stdout.splitlines() if line.strip()]

    files = []
    for line in result.stdout.splitlines():
        if not line.strip():
            continue
        files.append(line[3:].strip())
    return files


def should_run(validation: dict[str, object], files: list[str], run_all: bool) -> bool:
    if validation.get("always"):
        return True

    if run_all:
        return True

    if not files:
        return False

    patterns = validation.get("patterns", [])
    keywords = validation.get("keywords", [])

    for file_path in files:
        lower = file_path.lower()
        if any(lower.endswith(pattern) for pattern in patterns):
            return True
        if any(keyword in lower for keyword in keywords):
            return True

    return False


def run_script(name: str, script: str) -> tuple[bool, str]:
    cmd = [sys.executable, str(ROOT / script), str(ROOT)]
    result = subprocess.run(cmd, capture_output=True, text=True, cwd=ROOT)
    output = result.stdout.strip() or result.stderr.strip()
    return result.returncode == 0, output


def main() -> None:
    args = parse_args()
    changed_files = get_changed_files(args.base)

    print("=== Smart Validate ===")
    if changed_files:
        print("Changed files:")
        for file in changed_files[:20]:
            print(f"  - {file}")
        if len(changed_files) > 20:
            print(f"  - ... and {len(changed_files) - 20} more")
    else:
        print("No changed files detected from git. Running only always-on checks.")

    selected = [item for item in VALIDATIONS if should_run(item, changed_files, args.all)]
    if not selected:
        print("No validations selected.")
        sys.exit(0)

    failures = 0
    for item in selected:
        print(f"\n🔄 {item['name']}")
        ok, output = run_script(item["name"], item["script"])
        if ok:
            print("✅ PASSED")
        else:
            print("❌ FAILED")
            failures += 1
        if output:
            preview = "\n".join(output.splitlines()[:12])
            print(preview)

    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    main()
