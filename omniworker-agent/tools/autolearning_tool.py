"""Autolearning tool — let the agent manage detected user patterns.

Provides read/write access to the pattern store so the agent can:
- List detected patterns for the user
- Approve/reject patterns
- Trigger a manual scan
"""

import json
import logging
from typing import Any, Dict, List, Optional

from tools.registry import registry, tool_error

logger = logging.getLogger(__name__)


def autolearning(
    action: str,
    pattern_id: Optional[str] = None,
    schedule: Optional[str] = None,
    limit: int = 20,
    include_rejected: bool = False,
) -> str:
    """Manage detected user behavior patterns."""
    normalized = (action or "").strip().lower()

    try:
        from agent.pattern_store import PatternStore
    except Exception as exc:
        return tool_error(f"Pattern store not available: {exc}", success=False)

    store = PatternStore()
    try:
        if normalized == "list":
            status_filter = None if include_rejected else "detected"
            rows = store.list_all(status=status_filter, limit=limit)
            patterns = []
            for row in rows:
                patterns.append({
                    "id": row["id"],
                    "canonical_prompt": row["canonical_prompt"],
                    "pattern_type": row["pattern_type"],
                    "schedule_inferred": row.get("schedule_inferred"),
                    "confidence": row["confidence"],
                    "occurrence_count": row["occurrence_count"],
                    "status": row["status"],
                    "first_seen_at": row["first_seen_at"],
                    "last_seen_at": row["last_seen_at"],
                })
            return json.dumps(
                {"success": True, "count": len(patterns), "patterns": patterns},
                indent=2,
            )

        if normalized == "get":
            if not pattern_id:
                return tool_error("pattern_id is required for get", success=False)
            row = store.get(pattern_id)
            if not row:
                return tool_error(f"Pattern '{pattern_id}' not found", success=False)
            return json.dumps({"success": True, "pattern": row}, indent=2)

        if normalized in {"approve", "activate"}:
            if not pattern_id:
                return tool_error("pattern_id is required for approve", success=False)
            row = store.get(pattern_id)
            if not row:
                return tool_error(f"Pattern '{pattern_id}' not found", success=False)
            if row.get("status") == "active" and row.get("auto_created_job_id"):
                return json.dumps(
                    {
                        "success": True,
                        "message": "Pattern is already active.",
                        "job_id": row["auto_created_job_id"],
                    },
                    indent=2,
                )

            # Create cron job manually from pattern
            from tools.cronjob_tools import cronjob

            prompt = row["canonical_prompt"]
            inferred = row.get("schedule_inferred") or schedule
            if not inferred:
                return tool_error(
                    "Pattern has no inferred schedule. Provide one with the schedule parameter.",
                    success=False,
                )
            name = f"🧠 {prompt[:47]}{'...' if len(prompt) > 47 else ''}"
            deliver = "local"
            if row.get("source_platform") and row.get("source_chat_id"):
                deliver = f"{row['source_platform']}:{row['source_chat_id']}"

            result = cronjob(
                action="create",
                prompt=prompt,
                schedule=inferred,
                name=name,
                deliver=deliver,
            )
            parsed = json.loads(result)
            if parsed.get("success"):
                job_id = parsed.get("job_id")
                store.mark_auto_created(pattern_id, job_id)
                return json.dumps(
                    {
                        "success": True,
                        "message": f"Pattern approved and cron job '{job_id}' created.",
                        "job_id": job_id,
                    },
                    indent=2,
                )
            return tool_error(
                f"Failed to create cron job: {parsed.get('error')}", success=False
            )

        if normalized in {"reject", "disable"}:
            if not pattern_id:
                return tool_error("pattern_id is required for reject", success=False)
            store.update_status(pattern_id, "rejected")
            return json.dumps(
                {"success": True, "message": f"Pattern '{pattern_id}' rejected."},
                indent=2,
            )

        if normalized == "scan":
            from agent.pattern_engine import scan_sessions_from_db

            patterns = scan_sessions_from_db()
            return json.dumps(
                {
                    "success": True,
                    "message": f"Scan complete. {len(patterns)} patterns detected.",
                    "count": len(patterns),
                },
                indent=2,
            )

        return tool_error(f"Unknown autolearning action '{action}'", success=False)

    except Exception as exc:
        logger.warning("autolearning tool error: %s", exc, exc_info=True)
        return tool_error(str(exc), success=False)
    finally:
        store.close()


AUTOLEARNING_SCHEMA = {
    "name": "autolearning",
    "description": """Manage auto-detected user behavior patterns.

Use action='list' to see patterns the engine has detected.
Use action='get' with pattern_id to inspect a specific pattern.
Use action='approve' to turn a detected pattern into a scheduled cron job.
Use action='reject' to tell the engine to ignore a pattern.
Use action='scan' to force an immediate pattern scan.

When the user says things like 'why did you schedule that?' or
'stop doing this automatically', use reject to disable the pattern.""",
    "parameters": {
        "type": "object",
        "properties": {
            "action": {
                "type": "string",
                "description": "One of: list, get, approve, reject, scan",
            },
            "pattern_id": {
                "type": "string",
                "description": "Required for get/approve/reject",
            },
            "schedule": {
                "type": "string",
                "description": "Optional override schedule when approving (e.g. '0 9 * * *')",
            },
            "limit": {
                "type": "integer",
                "description": "Max patterns to return for list action",
                "default": 20,
            },
            "include_rejected": {
                "type": "boolean",
                "description": "Include rejected patterns in list",
                "default": False,
            },
        },
        "required": ["action"],
    },
}


registry.register(
    name="autolearning",
    toolset="autolearning",
    schema=AUTOLEARNING_SCHEMA,
    handler=lambda args, **kw: autolearning(
        action=args.get("action", ""),
        pattern_id=args.get("pattern_id"),
        schedule=args.get("schedule"),
        limit=args.get("limit", 20),
        include_rejected=args.get("include_rejected", False),
    ),
    check_fn=lambda: True,
    emoji="🧠",
)
