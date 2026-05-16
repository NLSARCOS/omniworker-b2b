#!/usr/bin/env python3
"""
Bundle Analyzer - Blackbox Agents
==================================

Analyzes JavaScript bundle size and composition for optimization opportunities.

Usage:
    python3 scripts/bundle_analyzer.py /path/to/project
"""

import sys
import json
import os
from pathlib import Path

class Colors:
    GREEN = '\033[92m'
    YELLOW = '\033[93m'
    RED = '\033[91m'
    CYAN = '\033[96m'
    BOLD = '\033[1m'
    ENDC = '\033[0m'

# Size thresholds (bytes)
WARN_BUNDLE_SIZE = 250 * 1024    # 250KB
CRITICAL_BUNDLE_SIZE = 500 * 1024  # 500KB
WARN_PACKAGE_SIZE = 100 * 1024    # 100KB single dep

def find_build_output(project_path: Path) -> list:
    """Find built JS files"""
    candidates = [
        project_path / ".next" / "static",
        project_path / "dist",
        project_path / "build" / "static",
        project_path / "out",
        project_path / ".output",
    ]

    js_files = []
    for candidate in candidates:
        if candidate.exists():
            js_files.extend(candidate.rglob("*.js"))

    return js_files

def analyze_package_sizes(project_path: Path) -> list:
    """Check large dependencies in node_modules"""
    node_modules = project_path / "node_modules"
    if not node_modules.exists():
        return []

    large_deps = []
    for pkg_dir in node_modules.iterdir():
        if pkg_dir.is_dir() and not pkg_dir.name.startswith('.'):
            total_size = sum(
                f.stat().st_size for f in pkg_dir.rglob("*") if f.is_file()
            )
            if total_size > WARN_PACKAGE_SIZE:
                large_deps.append((pkg_dir.name, total_size))

    return sorted(large_deps, key=lambda x: x[1], reverse=True)[:10]

def format_size(size_bytes: int) -> str:
    """Format bytes to human-readable"""
    if size_bytes < 1024:
        return f"{size_bytes}B"
    elif size_bytes < 1024 * 1024:
        return f"{size_bytes / 1024:.1f}KB"
    else:
        return f"{size_bytes / (1024 * 1024):.1f}MB"

def main():
    if len(sys.argv) < 2:
        print("Usage: python3 bundle_analyzer.py /path/to/project")
        sys.exit(1)

    project_path = Path(sys.argv[1]).resolve()
    if not project_path.exists():
        print(f"❌ Path not found: {project_path}")
        sys.exit(1)

    print(f"{Colors.BOLD}{Colors.CYAN}📊 Bundle Analysis{Colors.ENDC}")
    print(f"Project: {project_path}\n")

    issues = []
    warnings = []

    # Check built bundles
    js_files = find_build_output(project_path)
    if js_files:
        print(f"{Colors.BOLD}Built JS Files:{Colors.ENDC}")
        total_size = 0
        for f in sorted(js_files, key=lambda x: x.stat().st_size, reverse=True)[:15]:
            size = f.stat().st_size
            total_size += size
            rel_path = f.relative_to(project_path)

            if size > CRITICAL_BUNDLE_SIZE:
                print(f"  {Colors.RED}❌ {rel_path}: {format_size(size)}{Colors.ENDC}")
                issues.append(f"Large bundle: {rel_path} ({format_size(size)})")
            elif size > WARN_BUNDLE_SIZE:
                print(f"  {Colors.YELLOW}⚠️  {rel_path}: {format_size(size)}{Colors.ENDC}")
                warnings.append(f"Bundle approaching limit: {rel_path} ({format_size(size)})")
            else:
                print(f"  {Colors.GREEN}✅ {rel_path}: {format_size(size)}{Colors.ENDC}")

        print(f"\n  Total JS: {format_size(total_size)}")
    else:
        print("  No build output found. Run your build first.")
        print("  Checked: .next/static, dist/, build/static, out/")

    # Check large deps
    large_deps = analyze_package_sizes(project_path)
    if large_deps:
        print(f"\n{Colors.BOLD}Largest Dependencies:{Colors.ENDC}")
        for name, size in large_deps:
            color = Colors.RED if size > CRITICAL_BUNDLE_SIZE else Colors.YELLOW
            print(f"  {color}📦 {name}: {format_size(size)}{Colors.ENDC}")

    # Check for common heavy packages in package.json
    pkg_file = project_path / "package.json"
    if pkg_file.exists():
        with open(pkg_file) as f:
            pkg = json.load(f)
        deps = list(pkg.get("dependencies", {}).keys())
        heavy = [d for d in deps if d in ("moment", "lodash", "jquery", "bootstrap")]
        if heavy:
            for h in heavy:
                warnings.append(f"Heavy dependency: {h} — consider lighter alternative")
                print(f"\n  {Colors.YELLOW}⚠️  {h} — consider lighter alternative{Colors.ENDC}")

    # Summary
    print(f"\n{Colors.BOLD}Summary:{Colors.ENDC}")
    if issues:
        for i in issues:
            print(f"  {Colors.RED}❌ {i}{Colors.ENDC}")
    if warnings:
        for w in warnings:
            print(f"  {Colors.YELLOW}⚠️  {w}{Colors.ENDC}")
    if not issues and not warnings:
        print(f"  {Colors.GREEN}✅ Bundle sizes look good{Colors.ENDC}")

    sys.exit(1 if issues else 0)

if __name__ == "__main__":
    main()
