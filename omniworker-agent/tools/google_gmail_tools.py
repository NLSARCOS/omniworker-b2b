"""Google Gmail tools for the Flux Agent agent.

Uses Google OAuth2 credentials from auth.json (provider: "google").
Exposes LLM-callable tools:
  gmail_search   -- search emails with Gmail query syntax
  gmail_read     -- read full email content by ID
  gmail_send     -- send a new email or reply to an existing thread
  gmail_labels   -- list labels and move emails between labels
"""

import base64
import json
import logging
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Any, Dict

logger = logging.getLogger(__name__)

GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1/users/me"


def _get_google_credentials() -> Dict[str, Any]:
    """Resolve Google OAuth2 credentials with auto-refresh."""
    from omniworker_cli.auth import resolve_google_runtime_credentials
    return resolve_google_runtime_credentials()


def _google_headers() -> Dict[str, str]:
    creds = _get_google_credentials()
    return {
        "Authorization": f"Bearer {creds['access_token']}",
        "Content-Type": "application/json",
    }


def _check_gmail_available() -> bool:
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

async def _handle_gmail_search(args: dict, **kw) -> str:
    query = args.get("query", "").strip()
    max_results = min(max(int(args.get("max_results", 10)), 1), 50)

    if not query:
        return _tool_error("query is required. Use Gmail search syntax (e.g. 'from:user@example.com', 'is:unread', 'subject:hello').")

    try:
        import httpx
        headers = _google_headers()
        params = {"q": query, "maxResults": max_results}
        response = httpx.get(f"{GMAIL_API_BASE}/messages", headers=headers, params=params, timeout=15)

        if response.status_code == 401:
            return _tool_error("Google auth expired. Run `omniworker auth google` to re-authenticate.")
        if response.status_code >= 400:
            return _tool_error(f"Gmail API error: {response.status_code} - {response.text[:200]}")

        data = response.json()
        messages = data.get("messages", [])

        if not messages:
            return json.dumps({"success": True, "emails": [], "count": 0, "message": f"No emails found for query: {query}"}, ensure_ascii=False)

        # Fetch metadata for each message
        emails = []
        for msg_ref in messages[:max_results]:
            msg_resp = httpx.get(
                f"{GMAIL_API_BASE}/messages/{msg_ref['id']}",
                headers=headers,
                params={"format": "metadata", "metadataHeaders": ["From", "To", "Subject", "Date"]},
                timeout=10,
            )
            if msg_resp.status_code != 200:
                continue
            msg_data = msg_resp.json()
            headers_list = msg_data.get("payload", {}).get("headers", [])
            header_map = {h["name"]: h["value"] for h in headers_list}
            emails.append({
                "id": msg_data["id"],
                "threadId": msg_data.get("threadId"),
                "subject": header_map.get("Subject", ""),
                "from": header_map.get("From", ""),
                "to": header_map.get("To", ""),
                "date": header_map.get("Date", ""),
                "snippet": msg_data.get("snippet", ""),
                "labelIds": msg_data.get("labelIds", []),
            })

        return json.dumps({"success": True, "emails": emails, "count": len(emails)}, ensure_ascii=False)

    except Exception as e:
        logger.error("gmail_search error: %s", e)
        return _tool_error(f"Gmail search failed: {e}")


async def _handle_gmail_read(args: dict, **kw) -> str:
    message_id = args.get("message_id", "").strip()
    if not message_id:
        return _tool_error("message_id is required. Use gmail_search to find email IDs first.")

    try:
        import httpx
        headers = _google_headers()
        response = httpx.get(
            f"{GMAIL_API_BASE}/messages/{message_id}",
            headers=headers,
            params={"format": "full"},
            timeout=15,
        )

        if response.status_code == 401:
            return _tool_error("Google auth expired. Run `omniworker auth google` to re-authenticate.")
        if response.status_code == 404:
            return _tool_error(f"Email {message_id} not found.")
        if response.status_code >= 400:
            return _tool_error(f"Gmail API error: {response.status_code}")

        msg_data = response.json()
        headers_list = msg_data.get("payload", {}).get("headers", [])
        header_map = {h["name"]: h["value"] for h in headers_list}

        # Extract body
        body = ""
        payload = msg_data.get("payload", {})

        def _extract_body(part: dict) -> str:
            """Recursively extract text/plain body from message parts."""
            mime = part.get("mimeType", "")
            if mime == "text/plain" and part.get("body", {}).get("data"):
                return base64.urlsafe_b64decode(part["body"]["data"]).decode("utf-8", errors="replace")
            for sub_part in part.get("parts", []):
                text = _extract_body(sub_part)
                if text:
                    return text
            return ""

        body = _extract_body(payload)

        # Fallback to snippet if no plain text body
        if not body:
            body = msg_data.get("snippet", "")

        return json.dumps({
            "success": True,
            "id": msg_data["id"],
            "threadId": msg_data.get("threadId"),
            "subject": header_map.get("Subject", ""),
            "from": header_map.get("From", ""),
            "to": header_map.get("To", ""),
            "cc": header_map.get("Cc", ""),
            "date": header_map.get("Date", ""),
            "body": body.strip(),
            "labelIds": msg_data.get("labelIds", []),
        }, ensure_ascii=False)

    except Exception as e:
        logger.error("gmail_read error: %s", e)
        return _tool_error(f"Gmail read failed: {e}")


async def _handle_gmail_send(args: dict, **kw) -> str:
    to_email = args.get("to_email", "").strip()
    subject = args.get("subject", "").strip()
    body = args.get("body", "").strip()
    reply_to_id = args.get("reply_to_id", "").strip()
    cc = args.get("cc", "").strip()

    if not to_email:
        return _tool_error("to_email is required.")
    if not subject and not reply_to_id:
        return _tool_error("subject is required for new emails.")
    if not body:
        return _tool_error("body is required.")

    try:
        import httpx
        headers = _google_headers()
        thread_id = None

        # If replying, fetch original message for headers
        if reply_to_id:
            orig_resp = httpx.get(
                f"{GMAIL_API_BASE}/messages/{reply_to_id}",
                headers=headers,
                params={"format": "metadata", "metadataHeaders": ["Subject", "Message-ID", "From"]},
                timeout=10,
            )
            if orig_resp.status_code == 200:
                orig_data = orig_resp.json()
                thread_id = orig_data.get("threadId")
                orig_headers = {h["name"]: h["value"] for h in orig_data.get("payload", {}).get("headers", [])}
                if not subject:
                    subject = f"Re: {orig_headers.get('Subject', '')}"

        # Build email
        msg = MIMEText(body, "plain", "utf-8")
        msg["To"] = to_email
        msg["Subject"] = subject
        if cc:
            msg["Cc"] = cc
        if reply_to_id:
            msg["In-Reply-To"] = reply_to_id
            msg["References"] = reply_to_id

        # Encode
        raw = base64.urlsafe_b64encode(msg.as_bytes()).decode("ascii")
        send_body: Dict[str, Any] = {"raw": raw}
        if thread_id:
            send_body["threadId"] = thread_id

        response = httpx.post(
            f"{GMAIL_API_BASE}/messages/send",
            headers=headers,
            json=send_body,
            timeout=15,
        )

        if response.status_code == 401:
            return _tool_error("Google auth expired. Run `omniworker auth google` to re-authenticate.")
        if response.status_code >= 400:
            return _tool_error(f"Gmail send failed: {response.status_code} - {response.text[:200]}")

        sent_data = response.json()
        return json.dumps({
            "success": True,
            "message": f"Email sent to {to_email}",
            "id": sent_data.get("id"),
            "threadId": sent_data.get("threadId"),
        }, ensure_ascii=False)

    except Exception as e:
        logger.error("gmail_send error: %s", e)
        return _tool_error(f"Gmail send failed: {e}")


async def _handle_gmail_labels(args: dict, **kw) -> str:
    action = args.get("action", "list").strip().lower()
    message_id = args.get("message_id", "").strip()

    try:
        import httpx
        headers = _google_headers()

        if action == "list":
            response = httpx.get(f"{GMAIL_API_BASE}/labels", headers=headers, timeout=10)
            if response.status_code >= 400:
                return _tool_error(f"Failed to list labels: {response.status_code}")
            labels = response.json().get("labels", [])
            return json.dumps({
                "success": True,
                "labels": [{"id": l["id"], "name": l["name"], "type": l.get("type", "")} for l in labels],
                "count": len(labels),
            }, ensure_ascii=False)

        elif action in ("add", "remove"):
            if not message_id:
                return _tool_error("message_id is required for add/remove label actions.")
            label_ids = args.get("label_ids", [])
            if isinstance(label_ids, str):
                label_ids = [l.strip() for l in label_ids.split(",") if l.strip()]
            if not label_ids:
                return _tool_error("label_ids is required.")

            modify_body: Dict[str, Any] = {}
            if action == "add":
                modify_body["addLabelIds"] = label_ids
            else:
                modify_body["removeLabelIds"] = label_ids

            response = httpx.post(
                f"{GMAIL_API_BASE}/messages/{message_id}/modify",
                headers=headers,
                json=modify_body,
                timeout=10,
            )
            if response.status_code >= 400:
                return _tool_error(f"Failed to modify labels: {response.status_code}")

            return json.dumps({"success": True, "message": f"Labels {action}ed on message {message_id}"}, ensure_ascii=False)

        else:
            return _tool_error(f"Unknown action '{action}'. Use 'list', 'add', or 'remove'.")

    except Exception as e:
        logger.error("gmail_labels error: %s", e)
        return _tool_error(f"Gmail labels failed: {e}")


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

GMAIL_SEARCH_SCHEMA = {
    "name": "gmail_search",
    "description": "Search emails using Gmail query syntax. Examples: 'from:user@example.com', 'is:unread', 'subject:invoice after:2024/01/01'. Returns email metadata (id, subject, from, date, snippet).",
    "parameters": {
        "type": "object",
        "properties": {
            "query": {"type": "string", "description": "Gmail search query (same syntax as Gmail search bar)."},
            "max_results": {"type": "integer", "description": "Max emails to return (1-50). Default 10.", "default": 10},
        },
        "required": ["query"],
    },
}

GMAIL_READ_SCHEMA = {
    "name": "gmail_read",
    "description": "Read the full content of an email by its message ID. Use gmail_search first to find IDs.",
    "parameters": {
        "type": "object",
        "properties": {
            "message_id": {"type": "string", "description": "The Gmail message ID to read."},
        },
        "required": ["message_id"],
    },
}

GMAIL_SEND_SCHEMA = {
    "name": "gmail_send",
    "description": "Send a new email or reply to an existing email thread.",
    "parameters": {
        "type": "object",
        "properties": {
            "to_email": {"type": "string", "description": "Recipient email address."},
            "subject": {"type": "string", "description": "Email subject line. Optional when replying (auto-prefixes 'Re:')."},
            "body": {"type": "string", "description": "Plain text body of the email."},
            "cc": {"type": "string", "description": "Optional CC recipients (comma-separated)."},
            "reply_to_id": {"type": "string", "description": "Optional message ID to reply to (creates reply in the same thread)."},
        },
        "required": ["to_email", "body"],
    },
}

GMAIL_LABELS_SCHEMA = {
    "name": "gmail_labels",
    "description": "List Gmail labels or add/remove labels from a message. Actions: 'list' (show all labels), 'add' (add label to message), 'remove' (remove label from message).",
    "parameters": {
        "type": "object",
        "properties": {
            "action": {"type": "string", "enum": ["list", "add", "remove"], "description": "Action: list, add, or remove.", "default": "list"},
            "message_id": {"type": "string", "description": "Message ID (required for add/remove)."},
            "label_ids": {"type": "array", "items": {"type": "string"}, "description": "Label IDs to add/remove."},
        },
    },
}


# ---------------------------------------------------------------------------
# Registration
# ---------------------------------------------------------------------------

from tools.registry import registry

registry.register(
    name="gmail_search",
    toolset="gmail",
    schema=GMAIL_SEARCH_SCHEMA,
    handler=_handle_gmail_search,
    check_fn=_check_gmail_available,
    is_async=True,
    emoji="📧",
)

registry.register(
    name="gmail_read",
    toolset="gmail",
    schema=GMAIL_READ_SCHEMA,
    handler=_handle_gmail_read,
    check_fn=_check_gmail_available,
    is_async=True,
    emoji="📧",
)

registry.register(
    name="gmail_send",
    toolset="gmail",
    schema=GMAIL_SEND_SCHEMA,
    handler=_handle_gmail_send,
    check_fn=_check_gmail_available,
    is_async=True,
    emoji="📧",
)

registry.register(
    name="gmail_labels",
    toolset="gmail",
    schema=GMAIL_LABELS_SCHEMA,
    handler=_handle_gmail_labels,
    check_fn=_check_gmail_available,
    is_async=True,
    emoji="📧",
)
