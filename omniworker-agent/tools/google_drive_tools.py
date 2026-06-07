"""Google Drive tools for the Flux Agent agent.

Uses Google OAuth2 credentials from auth.json (provider: "google").
Exposes LLM-callable tools:
  gdrive_search      -- search files by name, type, or content
  gdrive_read        -- read file content (text files, Google Docs/Sheets)
  gdrive_upload      -- upload a file to Google Drive
  gdrive_list_folder -- list contents of a Drive folder
"""

import json
import logging
import os
from typing import Any, Dict

logger = logging.getLogger(__name__)

DRIVE_API_BASE = "https://www.googleapis.com/drive/v3"
DRIVE_UPLOAD_BASE = "https://www.googleapis.com/upload/drive/v3"


def _get_google_credentials() -> Dict[str, Any]:
    from omniworker_cli.auth import resolve_google_runtime_credentials
    return resolve_google_runtime_credentials()


def _google_headers() -> Dict[str, str]:
    creds = _get_google_credentials()
    return {
        "Authorization": f"Bearer {creds['access_token']}",
        "Content-Type": "application/json",
    }


def _check_gdrive_available() -> bool:
    try:
        from omniworker_cli.auth import get_google_auth_status
        status = get_google_auth_status()
        return status.get("logged_in", False)
    except Exception:
        return False


def _tool_error(msg: str) -> str:
    from tools.registry import tool_error
    return tool_error(msg)


# Google Docs MIME export mapping
_EXPORT_MIME_MAP = {
    "application/vnd.google-apps.document": ("text/plain", ".txt"),
    "application/vnd.google-apps.spreadsheet": ("text/csv", ".csv"),
    "application/vnd.google-apps.presentation": ("text/plain", ".txt"),
}


# ---------------------------------------------------------------------------
# Handlers
# ---------------------------------------------------------------------------

async def _handle_drive_search(args: dict, **kw) -> str:
    query = args.get("query", "").strip()
    max_results = min(max(int(args.get("max_results", 20)), 1), 100)
    file_type = args.get("file_type", "").strip().lower()

    if not query:
        return _tool_error("query is required. Search by filename, e.g. 'invoice 2024' or 'budget.xlsx'.")

    try:
        import httpx
        headers = _google_headers()

        # Build Drive search query
        drive_q = f"name contains '{query}' and trashed = false"
        if file_type:
            mime_map = {
                "doc": "application/vnd.google-apps.document",
                "sheet": "application/vnd.google-apps.spreadsheet",
                "slide": "application/vnd.google-apps.presentation",
                "pdf": "application/pdf",
                "folder": "application/vnd.google-apps.folder",
                "image": "image/",
            }
            mime = mime_map.get(file_type)
            if mime:
                if mime.endswith("/"):
                    drive_q += f" and mimeType contains '{mime}'"
                else:
                    drive_q += f" and mimeType = '{mime}'"

        params = {
            "q": drive_q,
            "pageSize": max_results,
            "fields": "files(id,name,mimeType,size,modifiedTime,owners,webViewLink,parents)",
            "orderBy": "modifiedTime desc",
        }

        response = httpx.get(f"{DRIVE_API_BASE}/files", headers=headers, params=params, timeout=15)

        if response.status_code == 401:
            return _tool_error("Google auth expired. Run `omniworker auth google` to re-authenticate.")
        if response.status_code >= 400:
            return _tool_error(f"Drive API error: {response.status_code} - {response.text[:200]}")

        data = response.json()
        files = []
        for f in data.get("files", []):
            size_bytes = int(f.get("size", 0)) if f.get("size") else None
            files.append({
                "id": f["id"],
                "name": f["name"],
                "mimeType": f.get("mimeType", ""),
                "size": f"{size_bytes:,} bytes" if size_bytes else "N/A",
                "modifiedTime": f.get("modifiedTime", ""),
                "owner": f.get("owners", [{}])[0].get("emailAddress", "") if f.get("owners") else "",
                "webViewLink": f.get("webViewLink", ""),
            })

        return json.dumps({"success": True, "files": files, "count": len(files)}, ensure_ascii=False)

    except Exception as e:
        logger.error("gdrive_search error: %s", e)
        return _tool_error(f"Drive search failed: {e}")


async def _handle_drive_read(args: dict, **kw) -> str:
    file_id = args.get("file_id", "").strip()
    if not file_id:
        return _tool_error("file_id is required. Use gdrive_search to find file IDs first.")

    try:
        import httpx
        headers = _google_headers()

        # First get file metadata to determine type
        meta_resp = httpx.get(
            f"{DRIVE_API_BASE}/files/{file_id}",
            headers=headers,
            params={"fields": "id,name,mimeType,size"},
            timeout=10,
        )

        if meta_resp.status_code == 401:
            return _tool_error("Google auth expired. Run `omniworker auth google` to re-authenticate.")
        if meta_resp.status_code == 404:
            return _tool_error(f"File {file_id} not found.")
        if meta_resp.status_code >= 400:
            return _tool_error(f"Drive API error: {meta_resp.status_code}")

        meta = meta_resp.json()
        mime_type = meta.get("mimeType", "")
        file_name = meta.get("name", "")

        # Google native formats need export
        if mime_type in _EXPORT_MIME_MAP:
            export_mime, ext = _EXPORT_MIME_MAP[mime_type]
            content_resp = httpx.get(
                f"{DRIVE_API_BASE}/files/{file_id}/export",
                headers={"Authorization": headers["Authorization"]},
                params={"mimeType": export_mime},
                timeout=30,
            )
        else:
            # Regular files: download content
            file_size = int(meta.get("size", 0)) if meta.get("size") else 0
            if file_size > 5_000_000:  # 5MB limit for text reading
                return json.dumps({
                    "success": True,
                    "id": file_id,
                    "name": file_name,
                    "mimeType": mime_type,
                    "size": f"{file_size:,} bytes",
                    "message": "File too large to read inline. Download it instead.",
                }, ensure_ascii=False)

            content_resp = httpx.get(
                f"{DRIVE_API_BASE}/files/{file_id}",
                headers={"Authorization": headers["Authorization"]},
                params={"alt": "media"},
                timeout=30,
            )

        if content_resp.status_code >= 400:
            return _tool_error(f"Failed to read file content: {content_resp.status_code}")

        # Try to decode as text
        try:
            content = content_resp.text
            # Truncate very long content
            if len(content) > 50_000:
                content = content[:50_000] + "\n\n[... truncated, file is very large ...]"
        except Exception:
            content = "(Binary file — cannot display as text)"

        return json.dumps({
            "success": True,
            "id": file_id,
            "name": file_name,
            "mimeType": mime_type,
            "content": content,
        }, ensure_ascii=False)

    except Exception as e:
        logger.error("gdrive_read error: %s", e)
        return _tool_error(f"Drive read failed: {e}")


async def _handle_drive_upload(args: dict, **kw) -> str:
    file_path = args.get("file_path", "").strip()
    file_name = args.get("file_name", "").strip()
    folder_id = args.get("folder_id", "").strip()
    content_text = args.get("content", "").strip()

    if not file_path and not content_text:
        return _tool_error("Either file_path (local file) or content (text content) is required.")

    try:
        import httpx

        creds = _get_google_credentials()
        auth_header = {"Authorization": f"Bearer {creds['access_token']}"}

        # Determine file name and content
        if file_path:
            if not os.path.exists(file_path):
                return _tool_error(f"File not found: {file_path}")
            if not file_name:
                file_name = os.path.basename(file_path)
            with open(file_path, "rb") as f:
                file_content = f.read()
            content_type = "application/octet-stream"
        else:
            if not file_name:
                file_name = "untitled.txt"
            file_content = content_text.encode("utf-8")
            content_type = "text/plain"

        # File metadata
        metadata: Dict[str, Any] = {"name": file_name}
        if folder_id:
            metadata["parents"] = [folder_id]

        # Multipart upload
        import io
        boundary = "flux_agent_boundary"
        body = io.BytesIO()

        # Metadata part
        body.write(f"--{boundary}\r\n".encode())
        body.write(b"Content-Type: application/json; charset=UTF-8\r\n\r\n")
        body.write(json.dumps(metadata).encode("utf-8"))
        body.write(b"\r\n")

        # File content part
        body.write(f"--{boundary}\r\n".encode())
        body.write(f"Content-Type: {content_type}\r\n\r\n".encode())
        body.write(file_content)
        body.write(b"\r\n")
        body.write(f"--{boundary}--\r\n".encode())

        upload_headers = {
            **auth_header,
            "Content-Type": f"multipart/related; boundary={boundary}",
        }

        response = httpx.post(
            f"{DRIVE_UPLOAD_BASE}/files?uploadType=multipart&fields=id,name,webViewLink,size",
            headers=upload_headers,
            content=body.getvalue(),
            timeout=60,
        )

        if response.status_code == 401:
            return _tool_error("Google auth expired. Run `omniworker auth google` to re-authenticate.")
        if response.status_code >= 400:
            return _tool_error(f"Drive upload failed: {response.status_code} - {response.text[:200]}")

        uploaded = response.json()
        return json.dumps({
            "success": True,
            "message": f"File '{file_name}' uploaded successfully.",
            "id": uploaded.get("id"),
            "name": uploaded.get("name"),
            "webViewLink": uploaded.get("webViewLink", ""),
            "size": uploaded.get("size", ""),
        }, ensure_ascii=False)

    except Exception as e:
        logger.error("gdrive_upload error: %s", e)
        return _tool_error(f"Drive upload failed: {e}")


async def _handle_drive_list_folder(args: dict, **kw) -> str:
    folder_id = args.get("folder_id", "root").strip()
    max_results = min(max(int(args.get("max_results", 30)), 1), 100)

    try:
        import httpx
        headers = _google_headers()

        params = {
            "q": f"'{folder_id}' in parents and trashed = false",
            "pageSize": max_results,
            "fields": "files(id,name,mimeType,size,modifiedTime,webViewLink)",
            "orderBy": "folder,name",
        }

        response = httpx.get(f"{DRIVE_API_BASE}/files", headers=headers, params=params, timeout=15)

        if response.status_code == 401:
            return _tool_error("Google auth expired. Run `omniworker auth google` to re-authenticate.")
        if response.status_code >= 400:
            return _tool_error(f"Drive API error: {response.status_code}")

        data = response.json()
        items = []
        for f in data.get("files", []):
            is_folder = f.get("mimeType") == "application/vnd.google-apps.folder"
            items.append({
                "id": f["id"],
                "name": f["name"],
                "type": "folder" if is_folder else "file",
                "mimeType": f.get("mimeType", ""),
                "size": f.get("size", "N/A"),
                "modifiedTime": f.get("modifiedTime", ""),
                "webViewLink": f.get("webViewLink", ""),
            })

        return json.dumps({
            "success": True,
            "items": items,
            "count": len(items),
            "folder_id": folder_id,
        }, ensure_ascii=False)

    except Exception as e:
        logger.error("gdrive_list_folder error: %s", e)
        return _tool_error(f"Drive list folder failed: {e}")


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

GDRIVE_SEARCH_SCHEMA = {
    "name": "gdrive_search",
    "description": "Search for files in Google Drive by name. Optionally filter by type (doc, sheet, slide, pdf, folder, image).",
    "parameters": {
        "type": "object",
        "properties": {
            "query": {"type": "string", "description": "Search query (file name or keywords)."},
            "file_type": {"type": "string", "description": "Optional type filter: doc, sheet, slide, pdf, folder, image.", "enum": ["doc", "sheet", "slide", "pdf", "folder", "image"]},
            "max_results": {"type": "integer", "description": "Max files to return (1-100). Default 20.", "default": 20},
        },
        "required": ["query"],
    },
}

GDRIVE_READ_SCHEMA = {
    "name": "gdrive_read",
    "description": "Read the text content of a Google Drive file. Supports text files, Google Docs, and Google Sheets (exported as CSV). Use gdrive_search to find file IDs.",
    "parameters": {
        "type": "object",
        "properties": {
            "file_id": {"type": "string", "description": "The Drive file ID to read."},
        },
        "required": ["file_id"],
    },
}

GDRIVE_UPLOAD_SCHEMA = {
    "name": "gdrive_upload",
    "description": "Upload a file to Google Drive. Either provide a local file_path or text content to create a new file.",
    "parameters": {
        "type": "object",
        "properties": {
            "file_path": {"type": "string", "description": "Local file path to upload."},
            "file_name": {"type": "string", "description": "Name for the file in Drive. Defaults to the local filename."},
            "content": {"type": "string", "description": "Text content to create as a new file (alternative to file_path)."},
            "folder_id": {"type": "string", "description": "Optional Drive folder ID to upload into."},
        },
    },
}

GDRIVE_LIST_FOLDER_SCHEMA = {
    "name": "gdrive_list_folder",
    "description": "List files and subfolders in a Google Drive folder. Use 'root' for the top-level My Drive.",
    "parameters": {
        "type": "object",
        "properties": {
            "folder_id": {"type": "string", "description": "Drive folder ID. Default 'root' (My Drive).", "default": "root"},
            "max_results": {"type": "integer", "description": "Max items to return (1-100). Default 30.", "default": 30},
        },
    },
}


# ---------------------------------------------------------------------------
# Registration
# ---------------------------------------------------------------------------

from tools.registry import registry

registry.register(
    name="gdrive_search",
    toolset="gdrive",
    schema=GDRIVE_SEARCH_SCHEMA,
    handler=_handle_drive_search,
    check_fn=_check_gdrive_available,
    is_async=True,
    emoji="📁",
)

registry.register(
    name="gdrive_read",
    toolset="gdrive",
    schema=GDRIVE_READ_SCHEMA,
    handler=_handle_drive_read,
    check_fn=_check_gdrive_available,
    is_async=True,
    emoji="📁",
)

registry.register(
    name="gdrive_upload",
    toolset="gdrive",
    schema=GDRIVE_UPLOAD_SCHEMA,
    handler=_handle_drive_upload,
    check_fn=_check_gdrive_available,
    is_async=True,
    emoji="📁",
)

registry.register(
    name="gdrive_list_folder",
    toolset="gdrive",
    schema=GDRIVE_LIST_FOLDER_SCHEMA,
    handler=_handle_drive_list_folder,
    check_fn=_check_gdrive_available,
    is_async=True,
    emoji="📁",
)
