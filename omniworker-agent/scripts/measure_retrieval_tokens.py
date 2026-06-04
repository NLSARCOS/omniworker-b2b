#!/usr/bin/env python3
"""Measure token savings from query-relevant skills/context retrieval.

Usage:
    cd flux-agent-agent
    python3 scripts/measure_retrieval_tokens.py
"""

import sys
import os

# Ensure agent/ is importable
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from agent.prompt_builder import (
    build_skills_system_prompt,
    build_context_files_prompt,
    build_relevant_skills_prompt,
    build_relevant_context_prompt,
)
from agent.model_metadata import estimate_tokens_rough


QUERIES = [
    "How do I deploy a Docker container to AWS?",
    "Write a Python script to fetch stock prices",
    "Set up a CI/CD pipeline with GitHub Actions",
    "How do I configure Flux Agent to use Claude?",
    "Create a React component with Tailwind CSS",
    "Analyze this CSV file and plot the results",
    "Debug why my PostgreSQL connection is failing",
    "Just saying hello, how are you?",
]


def measure():
    print("=" * 70)
    print("Token Measurement: Full vs. Query-Relevant System Prompt")
    print("=" * 70)

    # --- Skills ---
    print("\n--- SKILLS PROMPT ---\n")
    full_skills = build_skills_system_prompt()
    full_skills_tokens = estimate_tokens_rough(full_skills)
    print(f"Full skills prompt: {full_skills_tokens:,} tokens ({len(full_skills):,} chars)")

    if not full_skills:
        print("WARNING: No skills found — skipping skills measurement.")
    else:
        print(f"{'Query':<55} {'Tokens':>8} {'Savings':>8}")
        print("-" * 75)
        for q in QUERIES:
            relevant = build_relevant_skills_prompt(q)
            tok = estimate_tokens_rough(relevant)
            saving = full_skills_tokens - tok
            pct = (saving / full_skills_tokens * 100) if full_skills_tokens else 0
            print(f"{q[:55]:<55} {tok:>8,} {pct:>7.1f}%")

    # --- Context files ---
    print("\n--- CONTEXT FILES PROMPT ---\n")
    # script is in flux-agent-agent/scripts/ → go up two levels for monorepo root
    project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    full_context = build_context_files_prompt(cwd=project_root)
    full_ctx_tokens = estimate_tokens_rough(full_context)
    print(f"Full context prompt: {full_ctx_tokens:,} tokens ({len(full_context):,} chars)")

    if not full_context:
        print("WARNING: No context files found — skipping context measurement.")
    else:
        print(f"{'Query':<55} {'Tokens':>8} {'Savings':>8}")
        print("-" * 75)
        for q in QUERIES:
            relevant = build_relevant_context_prompt(q, cwd=project_root)
            tok = estimate_tokens_rough(relevant)
            saving = full_ctx_tokens - tok
            pct = (saving / full_ctx_tokens * 100) if full_ctx_tokens else 0
            print(f"{q[:55]:<55} {tok:>8,} {pct:>7.1f}%")

    # --- Combined ---
    print("\n--- COMBINED (Skills + Context) ---\n")
    full_total = full_skills_tokens + full_ctx_tokens
    print(f"Full combined:  {full_total:,} tokens")
    print(f"{'Query':<55} {'Tokens':>8} {'Savings':>8}")
    print("-" * 75)
    for q in QUERIES:
        rel_skills = build_relevant_skills_prompt(q)
        rel_ctx = build_relevant_context_prompt(q, cwd=project_root)
        rel_total = estimate_tokens_rough(rel_skills) + estimate_tokens_rough(rel_ctx)
        saving = full_total - rel_total
        pct = (saving / full_total * 100) if full_total else 0
        print(f"{q[:55]:<55} {rel_total:>8,} {pct:>7.1f}%")

    # --- Detailed sample ---
    print("\n--- DETAILED SAMPLE: skills selected for 'deploy docker to aws' ---\n")
    sample = build_relevant_skills_prompt("How do I deploy a Docker container to AWS?")
    # Show first 20 lines
    for i, line in enumerate(sample.splitlines()[:20]):
        print(line)
    if len(sample.splitlines()) > 20:
        print(f"... ({len(sample.splitlines()) - 20} more lines)")

    print("\n" + "=" * 70)


if __name__ == "__main__":
    measure()
