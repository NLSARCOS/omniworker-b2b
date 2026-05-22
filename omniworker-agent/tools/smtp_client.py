"""SMTP/IMAP client toolset for the OmniWorker agent.

Reads credentials from OMNIWORKER_HOME / smtp_settings.json.
Exposes LLM-callable tools:
  smtp_send_email       -- send an email via SMTP
  imap_receive_emails   -- fetch recent emails via IMAP
"""

import json
import logging
import os
import smtplib
import imaplib
import email
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.header import decode_header
from typing import Any, Dict, Optional, List
from pathlib import Path

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Helper to resolve OMNIWORKER_HOME and settings
# ---------------------------------------------------------------------------

def _get_settings_path() -> Path:
    from omniworker_constants import get_omniworker_home
    return get_omniworker_home() / "smtp_settings.json"


def _load_smtp_settings() -> Dict[str, Any]:
    path = _get_settings_path()
    if not path.exists():
        return {}
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        logger.error("Failed to read smtp_settings.json: %s", e)
        return {}


def _check_smtp_available() -> bool:
    settings = _load_smtp_settings()
    # Require at least SMTP or IMAP hosts to be configured
    has_smtp = bool(settings.get("smtp_host") and settings.get("smtp_user"))
    has_imap = bool(settings.get("imap_host") and settings.get("imap_user"))
    return has_smtp or has_imap


def _tool_error(msg: str) -> str:
    from tools.registry import tool_error
    return tool_error(msg)


# ---------------------------------------------------------------------------
# Handlers
# ---------------------------------------------------------------------------

async def _handle_send_email(args: dict, **kw) -> str:
    to_email = args.get("to_email", "").strip()
    subject = args.get("subject", "").strip()
    body = args.get("body", "").strip()
    html_body = args.get("html_body", "").strip()

    if not to_email:
        return _tool_error("to_email is required.")
    if not subject:
        return _tool_error("subject is required.")
    if not body and not html_body:
        return _tool_error("Either body or html_body is required.")

    settings = _load_smtp_settings()
    smtp_host = settings.get("smtp_host", "").strip()
    smtp_port_raw = settings.get("smtp_port")
    smtp_user = settings.get("smtp_user", "").strip()
    smtp_pass = settings.get("smtp_password", "").strip()
    encryption = settings.get("smtp_encryption", "tls").strip().lower()

    if not smtp_host or not smtp_user:
        return _tool_error(
            "SMTP is not configured. Please set up SMTP credentials in the Tools screen."
        )

    try:
        smtp_port = int(smtp_port_raw) if smtp_port_raw else 587
    except ValueError:
        smtp_port = 587

    try:
        # Create message
        if html_body:
            msg = MIMEMultipart("alternative")
            msg.attach(MIMEText(body or "", "plain", "utf-8"))
            msg.attach(MIMEText(html_body, "html", "utf-8"))
        else:
            msg = MIMEText(body, "plain", "utf-8")

        msg["Subject"] = subject
        msg["From"] = smtp_user
        msg["To"] = to_email

        # Connect
        if encryption == "ssl":
            server = smtplib.SMTP_SSL(smtp_host, smtp_port, timeout=15)
        else:
            server = smtplib.SMTP(smtp_host, smtp_port, timeout=15)

        if encryption == "tls":
            server.starttls()

        if smtp_pass:
            server.login(smtp_user, smtp_pass)

        server.sendmail(smtp_user, [to_email], msg.as_string())
        server.quit()

        return json.dumps({
            "success": True,
            "message": f"Email successfully sent to {to_email}"
        }, ensure_ascii=False)

    except Exception as e:
        logger.error("smtp_send_email error: %s", e)
        return _tool_error(f"Failed to send email: {str(e)}")


async def _handle_receive_emails(args: dict, **kw) -> str:
    limit = min(max(int(args.get("limit", 10)), 1), 50)
    folder = args.get("folder", "INBOX").strip()
    unread_only = bool(args.get("unread_only", False))

    settings = _load_smtp_settings()
    imap_host = settings.get("imap_host", "").strip()
    imap_port_raw = settings.get("imap_port")
    imap_user = settings.get("imap_user", "").strip()
    imap_pass = settings.get("imap_password", "").strip()
    encryption = settings.get("imap_encryption", "ssl").strip().lower()

    if not imap_host or not imap_user:
        return _tool_error(
            "IMAP is not configured. Please set up IMAP credentials in the Tools screen."
        )

    try:
        imap_port = int(imap_port_raw) if imap_port_raw else 993
    except ValueError:
        imap_port = 993

    try:
        # Connect
        if encryption == "ssl":
            mail = imaplib.IMAP4_SSL(imap_host, imap_port, timeout=15)
        else:
            mail = imaplib.IMAP4(imap_host, imap_port, timeout=15)

        mail.login(imap_user, imap_pass)
        mail.select(folder)

        # Search query
        search_crit = "UNSEEN" if unread_only else "ALL"
        status, data = mail.search(None, search_crit)
        if status != "OK":
            return _tool_error(f"Failed to search mail: {status}")

        mail_ids = data[0].split()
        # Fetch the most recent ones first
        mail_ids = mail_ids[::-1][:limit]

        emails_fetched = []
        for m_id in mail_ids:
            status, msg_data = mail.fetch(m_id, "(RFC822)")
            if status != "OK":
                continue

            for response_part in msg_data:
                if isinstance(response_part, tuple):
                    msg = email.message_from_bytes(response_part[1])
                    
                    # Decode headers safely
                    def decode_mime_header(header_value: Optional[str]) -> str:
                        if not header_value:
                            return ""
                        decoded_parts = decode_header(header_value)
                        header_str = ""
                        for part, encoding in decoded_parts:
                            if isinstance(part, bytes):
                                try:
                                    header_str += part.decode(encoding or "utf-8", errors="replace")
                                except Exception:
                                    header_str += part.decode("utf-8", errors="replace")
                            else:
                                header_str += str(part)
                        return header_str

                    subject = decode_mime_header(msg.get("Subject"))
                    from_ = decode_mime_header(msg.get("From"))
                    to_ = decode_mime_header(msg.get("To"))
                    date_ = decode_mime_header(msg.get("Date"))

                    # Retrieve body
                    body = ""
                    html_body = ""
                    if msg.is_multipart():
                        for part in msg.walk():
                            content_type = part.get_content_type()
                            content_disp = str(part.get("Content-Disposition"))
                            
                            if "attachment" in content_disp:
                                continue

                            if content_type == "text/plain":
                                try:
                                    body = part.get_payload(decode=True).decode(part.get_content_charset() or "utf-8", errors="replace")
                                except Exception:
                                    body = part.get_payload(decode=True).decode("utf-8", errors="replace")
                            elif content_type == "text/html":
                                try:
                                    html_body = part.get_payload(decode=True).decode(part.get_content_charset() or "utf-8", errors="replace")
                                except Exception:
                                    html_body = part.get_payload(decode=True).decode("utf-8", errors="replace")
                    else:
                        content_type = msg.get_content_type()
                        if content_type == "text/plain":
                            try:
                                body = msg.get_payload(decode=True).decode(msg.get_content_charset() or "utf-8", errors="replace")
                            except Exception:
                                body = msg.get_payload(decode=True).decode("utf-8", errors="replace")
                        elif content_type == "text/html":
                            try:
                                html_body = msg.get_payload(decode=True).decode(msg.get_content_charset() or "utf-8", errors="replace")
                            except Exception:
                                html_body = msg.get_payload(decode=True).decode("utf-8", errors="replace")

                    emails_fetched.append({
                        "uid": m_id.decode("utf-8"),
                        "subject": subject,
                        "from": from_,
                        "to": to_,
                        "date": date_,
                        "body": body.strip(),
                        "html_body": html_body.strip()
                    })

        mail.close()
        mail.logout()

        return json.dumps({
            "emails": emails_fetched,
            "count": len(emails_fetched)
        }, ensure_ascii=False)

    except Exception as e:
        logger.error("imap_receive_emails error: %s", e)
        return _tool_error(f"Failed to receive emails: {str(e)}")


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

SMTP_SEND_EMAIL_SCHEMA = {
    "name": "smtp_send_email",
    "description": "Send an email to a recipient via the configured SMTP server.",
    "parameters": {
        "type": "object",
        "properties": {
            "to_email": {"type": "string", "description": "The recipient's email address."},
            "subject": {"type": "string", "description": "The subject of the email."},
            "body": {"type": "string", "description": "Plain text body content of the email."},
            "html_body": {"type": "string", "description": "Optional HTML formatted body content."}
        },
        "required": ["to_email", "subject"]
    }
}

IMAP_RECEIVE_EMAILS_SCHEMA = {
    "name": "imap_receive_emails",
    "description": "Fetch recent emails from the configured IMAP mailbox.",
    "parameters": {
        "type": "object",
        "properties": {
            "limit": {"type": "integer", "description": "Maximum number of recent emails to fetch (1-50). Default is 10.", "default": 10},
            "folder": {"type": "string", "description": "Mailbox folder to fetch from. Default is 'INBOX'.", "default": "INBOX"},
            "unread_only": {"type": "boolean", "description": "Only retrieve unread emails. Default is false.", "default": False}
        }
    }
}


# ---------------------------------------------------------------------------
# Registration
# ---------------------------------------------------------------------------

from tools.registry import registry

registry.register(
    name="smtp_send_email",
    toolset="smtp_client",
    schema=SMTP_SEND_EMAIL_SCHEMA,
    handler=_handle_send_email,
    check_fn=_check_smtp_available,
    is_async=True,
    emoji="📧",
)

registry.register(
    name="imap_receive_emails",
    toolset="smtp_client",
    schema=IMAP_RECEIVE_EMAILS_SCHEMA,
    handler=_handle_receive_emails,
    check_fn=_check_smtp_available,
    is_async=True,
    emoji="📧",
)
