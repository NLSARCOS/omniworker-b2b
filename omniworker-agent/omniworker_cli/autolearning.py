"""Autolearning subcommand for hermes CLI.

Manage detected user behavior patterns: list, approve, reject, scan.
"""

import json
import sys
from pathlib import Path
from typing import Optional

PROJECT_ROOT = Path(__file__).parent.parent.resolve()
sys.path.insert(0, str(PROJECT_ROOT))

from omniworker_cli.colors import Colors, color


def patterns_list(
    user_id: Optional[str] = None,
    platform: Optional[str] = None,
    include_rejected: bool = False,
    limit: int = 50,
):
    """List detected patterns."""
    from agent.pattern_store import PatternStore

    store = PatternStore()
    try:
        rows = store.list_all(
            user_id=user_id,
            platform=platform,
            status=None if include_rejected else "detected",
            limit=limit,
        )
    finally:
        store.close()

    if not rows:
        print(color("No patterns detected yet.", Colors.DIM))
        print(
            color(
                "Patterns are discovered automatically as you use OmniWorker. "
                "Run 'hermes patterns scan' to force a scan.",
                Colors.DIM,
            )
        )
        return

    print()
    print(
        color(
            "┌─────────────────────────────────────────────────────────────────────────┐",
            Colors.CYAN,
        )
    )
    print(
        color(
            "│                     Detected Patterns (Autolearning)                    │",
            Colors.CYAN,
        )
    )
    print(
        color(
            "└─────────────────────────────────────────────────────────────────────────┘",
            Colors.CYAN,
        )
    )
    print()

    for row in rows:
        pat_id = row.get("id", "?")
        prompt = row.get("canonical_prompt", "(empty)")
        pat_type = row.get("pattern_type", "?")
        schedule = row.get("schedule_inferred") or "—"
        conf = row.get("confidence", 0.0)
        count = row.get("occurrence_count", 0)
        status = row.get("status", "detected")
        job_id = row.get("auto_created_job_id")

        if status == "active":
            status_color = Colors.GREEN
        elif status == "rejected":
            status_color = Colors.RED
        else:
            status_color = Colors.YELLOW

        conf_bar = "█" * int(conf * 10) + "░" * (10 - int(conf * 10))

        print(f"  {color(pat_id, Colors.YELLOW)} {color(f'[{status}]', status_color)}")
        print(f"    Prompt:  {prompt[:80]}{'...' if len(prompt) > 80 else ''}")
        print(f"    Type:    {pat_type}")
        print(f"    Schedule: {schedule}")
        print(f"    Confidence: {conf:.0%} {conf_bar}")
        print(f"    Occurrences: {count}")
        if job_id:
            print(f"    Auto-cron: {color(job_id, Colors.GREEN)}")
        print()


def patterns_approve(pattern_id: str, schedule: Optional[str] = None):
    """Approve a pattern and create its cron job."""
    from agent.pattern_store import PatternStore
    from tools.cronjob_tools import cronjob

    store = PatternStore()
    try:
        row = store.get(pattern_id)
        if not row:
            print(color(f"Pattern not found: {pattern_id}", Colors.RED))
            return 1

        if row.get("status") == "active" and row.get("auto_created_job_id"):
            print(
                color(
                    f"Pattern is already active (job {row['auto_created_job_id']}).",
                    Colors.GREEN,
                )
            )
            return 0

        prompt = row["canonical_prompt"]
        inferred = schedule or row.get("schedule_inferred")
        if not inferred:
            print(
                color(
                    "Pattern has no inferred schedule. Provide one with --schedule.",
                    Colors.RED,
                )
            )
            return 1

        name = f"🧠 {prompt[:47]}{'...' if len(prompt) > 47 else ''}"
        deliver = "local"
        if row.get("source_platform") and row.get("source_chat_id"):
            deliver = f"{row['source_platform']}:{row['source_chat_id']}"

        result = json.loads(
            cronjob(
                action="create",
                prompt=prompt,
                schedule=inferred,
                name=name,
                deliver=deliver,
            )
        )
        if result.get("success"):
            job_id = result["job_id"]
            store.mark_auto_created(pattern_id, job_id)
            print(color(f"Approved and created job: {job_id}", Colors.GREEN))
            print(f"  Schedule: {inferred}")
            return 0

        print(color(f"Failed to create job: {result.get('error')}", Colors.RED))
        return 1
    finally:
        store.close()


def patterns_reject(pattern_id: str):
    """Reject a pattern so it is never auto-activated."""
    from agent.pattern_store import PatternStore

    store = PatternStore()
    try:
        row = store.get(pattern_id)
        if not row:
            print(color(f"Pattern not found: {pattern_id}", Colors.RED))
            return 1
        store.update_status(pattern_id, "rejected")
        print(color(f"Pattern {pattern_id} rejected.", Colors.YELLOW))
        return 0
    finally:
        store.close()


def patterns_scan():
    """Force an immediate pattern scan."""
    from agent.pattern_engine import scan_sessions_from_db

    patterns = scan_sessions_from_db()
    if patterns:
        print(color(f"Detected {len(patterns)} pattern(s):", Colors.GREEN))
        for pat in patterns:
            print(
                f"  • {pat.canonical_prompt[:60]}... "
                f"(confidence: {pat.confidence:.0%}, schedule: {pat.schedule_inferred or '—'})"
            )
    else:
        print(color("No patterns detected in recent history.", Colors.DIM))
    return 0


def patterns_command(args):
    """Handle patterns subcommands."""
    subcmd = getattr(args, "patterns_command", None)

    if subcmd is None or subcmd == "list":
        patterns_list(
            user_id=getattr(args, "user_id", None),
            platform=getattr(args, "platform", None),
            include_rejected=getattr(args, "all", False),
            limit=getattr(args, "limit", 50),
        )
        return 0

    if subcmd == "scan":
        return patterns_scan()

    if subcmd in {"approve", "activate"}:
        return patterns_approve(
            getattr(args, "pattern_id", ""),
            schedule=getattr(args, "schedule", None),
        )

    if subcmd in {"reject", "disable"}:
        return patterns_reject(getattr(args, "pattern_id", ""))

    print(f"Unknown patterns command: {subcmd}")
    print("Usage: hermes patterns [list|scan|approve|reject]")
    sys.exit(1)
