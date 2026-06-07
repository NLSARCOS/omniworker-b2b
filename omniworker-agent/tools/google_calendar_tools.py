"""Google Calendar tools for the Flux Agent agent.

Uses Google OAuth2 credentials from auth.json (provider: "google").
Exposes LLM-callable tools:
  gcalendar_list_events   -- list upcoming events
  gcalendar_create_event  -- create a new calendar event
  gcalendar_list_calendars -- list available calendars
"""

import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict

logger = logging.getLogger(__name__)

CALENDAR_API_BASE = "https://www.googleapis.com/calendar/v3"


def _get_google_credentials() -> Dict[str, Any]:
    from omniworker_cli.auth import resolve_google_runtime_credentials
    return resolve_google_runtime_credentials()


def _google_headers() -> Dict[str, str]:
    creds = _get_google_credentials()
    return {
        "Authorization": f"Bearer {creds['access_token']}",
        "Content-Type": "application/json",
    }


def _check_gcalendar_available() -> bool:
    try:
        from omniworker_cli.auth import get_google_auth_status
        status = get_google_auth_status()
        return status.get("logged_in", False)
    except Exception:
        return False


def _tool_error(msg: str) -> str:
    from tools.registry import tool_error
    return tool_error(msg)


# ---------------------------------------------------------------------------
# Handlers
# ---------------------------------------------------------------------------

async def _handle_list_events(args: dict, **kw) -> str:
    calendar_id = args.get("calendar_id", "primary").strip()
    days_ahead = min(max(int(args.get("days_ahead", 7)), 1), 90)
    max_results = min(max(int(args.get("max_results", 20)), 1), 100)

    try:
        import httpx
        headers = _google_headers()
        now = datetime.now(timezone.utc)
        time_min = now.isoformat()
        time_max = (now + timedelta(days=days_ahead)).isoformat()

        params = {
            "timeMin": time_min,
            "timeMax": time_max,
            "maxResults": max_results,
            "singleEvents": "true",
            "orderBy": "startTime",
        }

        response = httpx.get(
            f"{CALENDAR_API_BASE}/calendars/{calendar_id}/events",
            headers=headers,
            params=params,
            timeout=15,
        )

        if response.status_code == 401:
            return _tool_error("Google auth expired. Run `omniworker auth google` to re-authenticate.")
        if response.status_code >= 400:
            return _tool_error(f"Calendar API error: {response.status_code} - {response.text[:200]}")

        data = response.json()
        events = []
        for event in data.get("items", []):
            start = event.get("start", {})
            end = event.get("end", {})
            events.append({
                "id": event.get("id"),
                "summary": event.get("summary", "(Sin título)"),
                "description": event.get("description", ""),
                "location": event.get("location", ""),
                "start": start.get("dateTime") or start.get("date", ""),
                "end": end.get("dateTime") or end.get("date", ""),
                "status": event.get("status", ""),
                "attendees": [
                    {"email": a.get("email"), "status": a.get("responseStatus", "")}
                    for a in event.get("attendees", [])
                ],
                "htmlLink": event.get("htmlLink", ""),
            })

        return json.dumps({
            "success": True,
            "events": events,
            "count": len(events),
            "calendar": calendar_id,
            "range": f"Next {days_ahead} days",
        }, ensure_ascii=False)

    except Exception as e:
        logger.error("gcalendar_list_events error: %s", e)
        return _tool_error(f"Calendar list events failed: {e}")


async def _handle_create_event(args: dict, **kw) -> str:
    summary = args.get("summary", "").strip()
    start_time = args.get("start_time", "").strip()
    end_time = args.get("end_time", "").strip()
    description = args.get("description", "").strip()
    location = args.get("location", "").strip()
    attendees = args.get("attendees", [])
    calendar_id = args.get("calendar_id", "primary").strip()
    all_day = bool(args.get("all_day", False))

    if not summary:
        return _tool_error("summary is required for creating an event.")
    if not start_time:
        return _tool_error("start_time is required (ISO 8601 format, e.g. '2024-12-25T10:00:00-05:00').")

    try:
        import httpx
        headers = _google_headers()

        event_body: Dict[str, Any] = {"summary": summary}

        if all_day:
            # All-day events use 'date' format (YYYY-MM-DD)
            event_body["start"] = {"date": start_time[:10]}
            event_body["end"] = {"date": end_time[:10] if end_time else start_time[:10]}
        else:
            event_body["start"] = {"dateTime": start_time}
            if end_time:
                event_body["end"] = {"dateTime": end_time}
            else:
                # Default 1 hour duration
                try:
                    start_dt = datetime.fromisoformat(start_time)
                    end_dt = start_dt + timedelta(hours=1)
                    event_body["end"] = {"dateTime": end_dt.isoformat()}
                except Exception:
                    event_body["end"] = {"dateTime": start_time}

        if description:
            event_body["description"] = description
        if location:
            event_body["location"] = location
        if attendees:
            if isinstance(attendees, str):
                attendees = [a.strip() for a in attendees.split(",") if a.strip()]
            event_body["attendees"] = [{"email": a} for a in attendees]

        response = httpx.post(
            f"{CALENDAR_API_BASE}/calendars/{calendar_id}/events",
            headers=headers,
            json=event_body,
            timeout=15,
        )

        if response.status_code == 401:
            return _tool_error("Google auth expired. Run `omniworker auth google` to re-authenticate.")
        if response.status_code >= 400:
            return _tool_error(f"Calendar create event failed: {response.status_code} - {response.text[:200]}")

        created = response.json()
        return json.dumps({
            "success": True,
            "message": f"Event '{summary}' created successfully.",
            "id": created.get("id"),
            "htmlLink": created.get("htmlLink", ""),
            "start": created.get("start", {}),
            "end": created.get("end", {}),
        }, ensure_ascii=False)

    except Exception as e:
        logger.error("gcalendar_create_event error: %s", e)
        return _tool_error(f"Calendar create event failed: {e}")


async def _handle_list_calendars(args: dict, **kw) -> str:
    try:
        import httpx
        headers = _google_headers()

        response = httpx.get(
            f"{CALENDAR_API_BASE}/users/me/calendarList",
            headers=headers,
            timeout=10,
        )

        if response.status_code == 401:
            return _tool_error("Google auth expired. Run `omniworker auth google` to re-authenticate.")
        if response.status_code >= 400:
            return _tool_error(f"Calendar API error: {response.status_code}")

        data = response.json()
        calendars = [
            {
                "id": cal.get("id"),
                "summary": cal.get("summary", ""),
                "description": cal.get("description", ""),
                "primary": cal.get("primary", False),
                "accessRole": cal.get("accessRole", ""),
            }
            for cal in data.get("items", [])
        ]

        return json.dumps({"success": True, "calendars": calendars, "count": len(calendars)}, ensure_ascii=False)

    except Exception as e:
        logger.error("gcalendar_list_calendars error: %s", e)
        return _tool_error(f"Calendar list failed: {e}")


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

GCALENDAR_LIST_EVENTS_SCHEMA = {
    "name": "gcalendar_list_events",
    "description": "List upcoming calendar events. Shows title, time, location, and attendees for the next N days.",
    "parameters": {
        "type": "object",
        "properties": {
            "days_ahead": {"type": "integer", "description": "How many days ahead to look (1-90). Default 7.", "default": 7},
            "max_results": {"type": "integer", "description": "Max events to return (1-100). Default 20.", "default": 20},
            "calendar_id": {"type": "string", "description": "Calendar ID. Default 'primary'.", "default": "primary"},
        },
    },
}

GCALENDAR_CREATE_EVENT_SCHEMA = {
    "name": "gcalendar_create_event",
    "description": "Create a new calendar event with title, time, description, location, and attendees.",
    "parameters": {
        "type": "object",
        "properties": {
            "summary": {"type": "string", "description": "Event title."},
            "start_time": {"type": "string", "description": "Start time in ISO 8601 format (e.g. '2024-12-25T10:00:00-05:00'). For all-day events use 'YYYY-MM-DD'."},
            "end_time": {"type": "string", "description": "End time in ISO 8601. Defaults to 1 hour after start."},
            "description": {"type": "string", "description": "Optional event description."},
            "location": {"type": "string", "description": "Optional event location."},
            "attendees": {"type": "array", "items": {"type": "string"}, "description": "Optional list of attendee email addresses."},
            "all_day": {"type": "boolean", "description": "If true, creates an all-day event.", "default": False},
            "calendar_id": {"type": "string", "description": "Calendar ID. Default 'primary'.", "default": "primary"},
        },
        "required": ["summary", "start_time"],
    },
}

GCALENDAR_LIST_CALENDARS_SCHEMA = {
    "name": "gcalendar_list_calendars",
    "description": "List all available Google Calendars with their IDs, names, and access roles.",
    "parameters": {
        "type": "object",
        "properties": {},
    },
}


# ---------------------------------------------------------------------------
# Registration
# ---------------------------------------------------------------------------

from tools.registry import registry

registry.register(
    name="gcalendar_list_events",
    toolset="gcalendar",
    schema=GCALENDAR_LIST_EVENTS_SCHEMA,
    handler=_handle_list_events,
    check_fn=_check_gcalendar_available,
    is_async=True,
    emoji="📅",
)

registry.register(
    name="gcalendar_create_event",
    toolset="gcalendar",
    schema=GCALENDAR_CREATE_EVENT_SCHEMA,
    handler=_handle_create_event,
    check_fn=_check_gcalendar_available,
    is_async=True,
    emoji="📅",
)

registry.register(
    name="gcalendar_list_calendars",
    toolset="gcalendar",
    schema=GCALENDAR_LIST_CALENDARS_SCHEMA,
    handler=_handle_list_calendars,
    check_fn=_check_gcalendar_available,
    is_async=True,
    emoji="📅",
)
