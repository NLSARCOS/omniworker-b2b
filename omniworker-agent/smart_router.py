#!/usr/bin/env python3
"""
OmniWorker Smart Router — Routes LLM inference between local SLM and cloud SaaS.

Architecture:
  Desktop App → Agent Gateway → Smart Router (this, port 8341)
                                      │
                                      ├─ Local SLM (port 8080) — simple/fast
                                      └─ Cloud SaaS (worker.thelab.lat) — complex/capable

Classification logic:
  Level 1: Quick message classification (desktop app) — already handled.
  Level 2: Tool-aware routing — if tools are involved, check if local SLM can handle.
  Level 3: Inference complexity — analyze prompt to decide model power needed.

Runs as a transparent HTTP proxy. The agent configures base_url to this router.
"""

import json
import logging
import os
import re
import signal
import sys
import threading
from http.client import HTTPConnection, HTTPSConnection
from http.server import HTTPServer, BaseHTTPRequestHandler
from socket import timeout as SocketTimeout
from urllib.parse import urlparse

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [smart-router] %(levelname)s: %(message)s",
)
logger = logging.getLogger("smart-router")

# ────────────────────────────────────────────────────
# Configuration
# ────────────────────────────────────────────────────

ROUTER_PORT = int(os.environ.get("SMART_ROUTER_PORT", "8341"))
LOCAL_SLM_HOST = "127.0.0.1"
LOCAL_SLM_PORT = int(os.environ.get("LOCAL_SLM_PORT", "8080"))
CLOUD_API_URL = os.environ.get(
    "CLOUD_API_URL", "https://worker.thelab.lat/api"
)
ROUTER_LOG = os.environ.get("SMART_ROUTER_LOG", "").lower() in ("1", "true", "yes")

# ────────────────────────────────────────────────────
# Dynamic Token Retrieval
# ────────────────────────────────────────────────────

ENV_CACHE_LOCK = threading.Lock()
CACHED_API_KEY = None
CACHED_ENV_MTIME = 0.0

# Connection Pool/Cache for Cloud
CLOUD_CONN = None
CLOUD_CONN_LOCK = threading.Lock()

def get_resilient_ssl_context():
    """Load a resilient SSL context, preferring system certs, with certifi fallback and unverified fallback if all else fails."""
    import ssl
    try:
        context = ssl.create_default_context()
        try:
            import certifi
            context.load_verify_locations(certifi.where())
            logger.info("SSL context loaded successfully using certifi bundle.")
        except ImportError:
            pass
        return context
    except Exception as e:
        logger.warning(f"Could not create default SSL context: {e}. Attempting unverified fallback.")
        try:
            return ssl._create_unverified_context()
        except Exception as e2:
            logger.error(f"Failed to create even unverified SSL context: {e2}")
            raise e2

def get_cloud_connection(use_https, host, port):
    """Get or create the cached cloud connection, ensuring thread-safety."""
    global CLOUD_CONN
    if CLOUD_CONN is None:
        if use_https:
            context = get_resilient_ssl_context()
            CLOUD_CONN = HTTPSConnection(
                host,
                port=port,
                timeout=120,
                context=context
            )
        else:
            CLOUD_CONN = HTTPConnection(
                host,
                port=port,
                timeout=120,
            )
    return CLOUD_CONN

def get_latest_api_key() -> str:
    """Read the latest OPENAI_API_KEY / CUSTOM_API_KEY from ~/.omniworker/.env dynamically to avoid stale keys after JWT refresh. Uses mtime to cache and avoid redundant disk I/O."""
    global CACHED_API_KEY, CACHED_ENV_MTIME
    env_path = os.path.expanduser("~/.omniworker/.env")
    if os.path.exists(env_path):
        try:
            mtime = os.path.getmtime(env_path)
            with ENV_CACHE_LOCK:
                if CACHED_API_KEY is not None and mtime == CACHED_ENV_MTIME:
                    return CACHED_API_KEY
            
            # Otherwise read and update cache
            key_val = None
            with open(env_path, "r", encoding="utf-8") as f:
                for line in f:
                    trimmed = line.strip()
                    if trimmed.startswith("#") or "=" not in trimmed:
                        continue
                    key, val = trimmed.split("=", 1)
                    key = key.strip()
                    val = val.strip().strip("'").strip('"')
                    if key in ("OPENAI_API_KEY", "CUSTOM_API_KEY") and val:
                        key_val = val
            if key_val:
                with ENV_CACHE_LOCK:
                    CACHED_API_KEY = key_val
                    CACHED_ENV_MTIME = mtime
                return key_val
        except Exception as e:
            logger.warning(f"Error reading dynamic API key from .env: {e}")
    return os.environ.get("OPENAI_API_KEY", "")

# ────────────────────────────────────────────────────
# Message Classification
# ────────────────────────────────────────────────────

# Patterns that indicate complex tasks requiring cloud
COMPLEX_PATTERNS = [
    # Code-related (English)
    r"```",
    r"\bfunction\b\s",
    r"\bclass\b\s",
    r"\bimport\b\s",
    r"\bdef\b\s",
    r"\basync\b\s",
    r"\bawait\b\s",
    r"\breturn\b\s",
    # Code-related (Spanish)
    r"\bfuncion\b",
    r"\bfunción\b",
    r"\bclase\b",
    r"\bimportar\b",
    r"\bretornar\b",
    r"\bretorna\b",
    r"\bdevuelve\b",
    # Database
    r"\bSELECT\b\s",
    r"\bCREATE\b\s",
    r"\bINSERT\b\s",
    r"\bALTER\b\s",
    # Dev tools
    r"\bnpm\b",
    r"\bgit\b",
    r"\bpip\b",
    r"\bpython\b",
    r"\bnode\b",
    r"\bdocker\b",
    # Error/debugging
    r"\berror\b",
    r"\btraceback\b",
    r"\bexception\b",
    r"\bdebug\b",
    r"\bfix\b",
    r"\bbug\b",
    r"\bdepura\b",
    r"\bdepurar\b",
    r"\bfallo\b",
    # Complex instructions (English)
    r"\banalyze\b",
    r"\banalyse\b",
    r"\bexplain\b",
    r"\bcompare\b",
    r"\bcreate\b",
    r"\bwrite\b",
    r"\bimplement\b",
    r"\brefactor\b",
    r"\bbuild\b",
    r"\bgenerate\b",
    r"\bdesign\b",
    r"\bdeploy\b",
    r"\bconfigur",
    r"\binstall\b",
    r"\bstep.?by.?step\b",
    r"\bhow\s+to\b",
    # Complex instructions (Spanish)
    r"\banaliza\b",
    r"\banalizar\b",
    r"\bexplica\b",
    r"\bexplicar\b",
    r"\bcompara\b",
    r"\bcomparar\b",
    r"\bcrear\b",
    r"\bcrea\b",
    r"\bescribe\b",
    r"\bescribir\b",
    r"\bimplementa\b",
    r"\bimplementar\b",
    r"\brefactorizar\b",
    r"\brefactoriza\b",
    r"\bconstruir\b",
    r"\bconstruye\b",
    r"\bgenerar\b",
    r"\bgenera\b",
    r"\bdiseñar\b",
    r"\bdiseña\b",
    r"\bdesplegar\b",
    r"\bdespliega\b",
    r"\bconfigurar\b",
    r"\bconfigura\b",
    r"\binstalar\b",
    r"\binstala\b",
    r"\bpaso\s+a\s+paso\b",
    r"\bcómo\s+hacer\b",
    r"\bcomo\s+hacer\b",
    r"\bc[oó]mo\b\s+(hacer|crear|config|instal|usar|puedo)",
    # File operations that need analysis
    r"\barchivo\b.*\barchivo\b",  # mentions files multiple times
]

COMPLEX_RE = re.compile("|".join(COMPLEX_PATTERNS), re.IGNORECASE)

# Simple greeting/thanks patterns — always route to local
SIMPLE_PATTERNS = re.compile(
    r"^(hola|hi|hello|hey|buenos?\\s*d[ií]as|buenas|gracias|thanks|thank you|"
    r"bye|adi[oó]s|ok|s[ií]|no|yes|nope|sure|claro|dale|listo|yo|"
    r"qu[eé]\\s*tal|qu[eé]\\s*haces|c[oó]mo\\s*est[aá]s|how\\s*are\\s*you|"
    r"what'?s\\s*up|sup|good\\s*morning|good\\s*night|buenas\\s*noches|"
    r"bien|perfecto|excelente|genial|cool|nice|great|awesome)"
    r"[\\s!.?¡¿]*$",
    re.IGNORECASE,
)


def classify_request(data: dict) -> str:
    """Classify a chat completion request.

    Returns:
        "local" — route to local SLM (fast, free, limited)
        "cloud" — route to cloud SaaS (capable, costs tokens)

    Classification levels:
        1. Tool presence → always cloud (SLM can't do tool calling)
        2. System prompt complexity → cloud if complex instructions
        3. Multi-turn depth → cloud if conversation is deep
        4. Message content → complex patterns → cloud, simple → local
    """
    messages = data.get("messages", [])
    if not messages:
        return "cloud"

    # ── Level 2: Tool-aware routing ──
    has_tool_calls = False
    has_tool_results = False
    for msg in messages:
        if msg.get("tool_calls"):
            has_tool_calls = True
        if msg.get("role") == "tool":
            has_tool_results = True

    # Tool calling requires a capable model — always cloud
    if has_tool_calls:
        return "cloud"

    # If there are tools defined in the request, the agent expects tool calling
    if data.get("tools"):
        return "cloud"

    # ── Analyze message content ──
    last_user_msg = ""
    total_content_len = 0
    system_complexity = 0

    for msg in messages:
        content = msg.get("content", "") or ""
        total_content_len += len(content)

        if msg.get("role") == "user":
            last_user_msg = content

        if msg.get("role") == "system":
            # Count complexity indicators in system prompt
            system_complexity += len(COMPLEX_RE.findall(content))
            # Long system prompts are complex
            if len(content) > 500:
                system_complexity += 2

    # ── Level 3: Inference complexity routing ──

    # Multi-turn: more than 4 messages (2+ exchanges) → cloud
    if len(messages) > 4:
        return "cloud"

    # Complex system prompt → cloud
    if system_complexity >= 2:
        return "cloud"

    trimmed_last = last_user_msg.strip()

    # Simple greeting/thanks (starts & ends with greeting words) → local
    if SIMPLE_PATTERNS.match(trimmed_last):
        return "local"

    # Any real question (?) that is not a simple greeting -> cloud
    if "?" in trimmed_last or "¿" in trimmed_last:
        return "cloud"

    # Very short last user message (<= 15 chars) + no complex context → local
    if len(trimmed_last) <= 15:
        if COMPLEX_RE.search(trimmed_last):
            return "cloud"
        return "local"

    # Medium messages (15-50 chars) without complex patterns → local
    if len(trimmed_last) <= 50:
        if not COMPLEX_RE.search(trimmed_last):
            return "local"
        else:
            return "cloud"

    # Messages > 50 chars or matching complex patterns → cloud
    return "cloud"


# ────────────────────────────────────────────────────
# TCP health probe
# ────────────────────────────────────────────────────

SLM_ALIVE_STATUS = False
LAST_SLM_CHECK = 0.0
SLM_CACHE_LOCK = threading.Lock()

def is_local_slm_alive() -> bool:
    """Quick TCP probe with a short timeout and 8-second caching to prevent slow connection attempts when offline."""
    global SLM_ALIVE_STATUS, LAST_SLM_CHECK
    import time
    import socket
    
    with SLM_CACHE_LOCK:
        now = time.time()
        if now - LAST_SLM_CHECK < 8.0:
            return SLM_ALIVE_STATUS
        
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            s.settimeout(0.2)  # Reduced to 0.2s for faster response
            s.connect((LOCAL_SLM_HOST, LOCAL_SLM_PORT))
            s.close()
            SLM_ALIVE_STATUS = True
        except (OSError, SocketTimeout):
            SLM_ALIVE_STATUS = False
        
        LAST_SLM_CHECK = now
        return SLM_ALIVE_STATUS


# ────────────────────────────────────────────────────
# HTTP Proxy Handler
# ────────────────────────────────────────────────────

class SmartRouterHandler(BaseHTTPRequestHandler):
    """Transparent HTTP proxy with smart routing."""

    def do_POST(self):
        # Read request body
        try:
            content_length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(content_length)
            data = json.loads(body)
        except Exception as e:
            self.send_error(400, f"Invalid request: {e}")
            return

        messages = data.get("messages", [])
        stream = data.get("stream", False)

        # Classify the request
        target = classify_request(data)

        last_user = ""
        for msg in reversed(messages):
            if msg.get("role") == "user":
                last_user = (msg.get("content") or "")[:100]
                break

        if ROUTER_LOG:
            logger.info(
                f"→ {target.upper()} | msgs={len(messages)} | "
                f"stream={stream} | user={last_user!r}"
            )

        # Route to target
        if target == "local":
            if is_local_slm_alive():
                success = self._proxy_to_local(body, stream)
                if success:
                    return
                # Local failed — fall back to cloud
                if ROUTER_LOG:
                    logger.info("Local SLM failed, falling back to cloud")
            else:
                if ROUTER_LOG:
                    logger.info("Local SLM not available, routing to cloud")

        self._proxy_to_cloud(body, stream)

    def do_GET(self):
        """Health check endpoint."""
        if self.path == "/health":
            slm_alive = is_local_slm_alive()
            status = {
                "status": "ok",
                "local_slm": "available" if slm_alive else "unavailable",
                "cloud_url": CLOUD_API_URL,
                "router_port": ROUTER_PORT,
            }
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps(status).encode())
            return
        self.send_error(404, "Not found")

    def _proxy_to_local(self, body: bytes, stream: bool) -> bool:
        """Proxy request to local SLM. Returns False on failure (before sending response)."""
        try:
            conn = HTTPConnection(LOCAL_SLM_HOST, LOCAL_SLM_PORT, timeout=30)
            conn.request(
                "POST",
                "/v1/chat/completions",
                body=body,
                headers={"Content-Type": "application/json"},
            )
            resp = conn.getresponse()

            # Check status BEFORE sending anything to client
            if resp.status != 200:
                error_body = resp.read(1024).decode(errors="replace")
                logger.warning(f"Local SLM returned {resp.status}: {error_body[:200]}")
                conn.close()
                return False

            if stream:
                # OK — forward response to client
                self.send_response(200)
                self.send_header("Content-Type", "text/event-stream")
                self.send_header("Cache-Control", "no-cache")
                self.send_header("Connection", "close")
                self.end_headers()

                # Stream chunks line by line to prevent SSE buffering/hangs
                while True:
                    line = resp.readline()
                    if not line:
                        break
                    self.wfile.write(line)
                    self.wfile.flush()
            else:
                resp_body = resp.read()
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(resp_body)))
                self.send_header("Connection", "close")
                self.end_headers()
                self.wfile.write(resp_body)
                self.wfile.flush()

            conn.close()
            return True

        except Exception as e:
            logger.warning(f"Local SLM proxy error: {e}")
            return False

    def _proxy_to_cloud(self, body: bytes, stream: bool):
        """Proxy request to cloud SaaS with connection reuse and error resilience."""
        global CLOUD_CONN
        parsed = urlparse(CLOUD_API_URL)
        use_https = parsed.scheme == "https"
        host = parsed.hostname
        port = parsed.port or (443 if use_https else 80)

        # Build auth headers with modern user agent to prevent Cloudflare blocks
        headers = {
            "Content-Type": "application/json",
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Connection": "keep-alive",
        }

        # Prefer incoming Authorization header unless it is generic/absent
        auth = self.headers.get("Authorization", "")
        if auth and "no-key-required" not in auth and auth.strip() != "Bearer":
            headers["Authorization"] = auth
        else:
            api_key = get_latest_api_key()
            if api_key:
                headers["Authorization"] = f"Bearer {api_key}"

        acquired = CLOUD_CONN_LOCK.acquire(blocking=False)
        conn = None
        try:
            if acquired:
                conn = get_cloud_connection(use_https, host, port)
            else:
                # Create ad-hoc connection for concurrent request
                if use_https:
                    context = get_resilient_ssl_context()
                    conn = HTTPSConnection(host, port=port, timeout=120, context=context)
                else:
                    conn = HTTPConnection(host, port=port, timeout=120)

            path = f"{parsed.path.rstrip('/')}/v1/chat/completions"

            # Execute with a retry if stale
            max_attempts = 2
            for attempt in range(max_attempts):
                try:
                    conn.request("POST", path, body=body, headers=headers)
                    resp = conn.getresponse()
                    break
                except (Exception, OSError) as req_err:
                    if acquired and attempt == 0:
                        logger.info(f"Cached cloud connection failed ({req_err}), resetting and retrying...")
                        try:
                            conn.close()
                        except Exception:
                            pass
                        CLOUD_CONN = None
                        conn = get_cloud_connection(use_https, host, port)
                        continue
                    else:
                        raise req_err

            # Forward response status
            self.send_response(resp.status)

            if stream and resp.status == 200:
                # Forward relevant headers
                for key, val in resp.getheaders():
                    lower = key.lower()
                    if lower in ("transfer-encoding", "connection", "server"):
                        continue
                    self.send_header(key, val)
                self.send_header("Connection", "close")
                self.end_headers()

                # Stream response line by line to prevent SSE buffering/hangs
                while True:
                    line = resp.readline()
                    if not line:
                        break
                    self.wfile.write(line)
                    self.wfile.flush()
            else:
                # Read entire body first so we can determine Content-Length
                resp_body = resp.read()

                # Forward relevant headers
                for key, val in resp.getheaders():
                    lower = key.lower()
                    if lower in ("transfer-encoding", "connection", "server", "content-length"):
                        continue
                    self.send_header(key, val)
                
                # Send explicit Content-Length and close connection
                self.send_header("Content-Length", str(len(resp_body)))
                self.send_header("Connection", "close")
                self.end_headers()

                self.wfile.write(resp_body)
                self.wfile.flush()

        except Exception as e:
            logger.error(f"Cloud proxy error: {e}")
            try:
                self.send_error(502, f"Cloud API error: {e}")
            except Exception:
                pass  # Headers already sent during streaming

        finally:
            if acquired:
                # If exception occurred, connection is bad. Reset it.
                if sys.exc_info()[0] is not None:
                    try:
                        conn.close()
                    except Exception:
                        pass
                    CLOUD_CONN = None
                CLOUD_CONN_LOCK.release()
            else:
                try:
                    conn.close()
                except Exception:
                    pass

    def log_message(self, format, *args):
        # Suppress default access logs unless debug mode
        if ROUTER_LOG:
            logger.info(format % args)


# ────────────────────────────────────────────────────
# Server
# ────────────────────────────────────────────────────

class ThreadedHTTPServer(HTTPServer):
    """Handle each request in a separate thread for concurrent streaming."""
    daemon_threads = True

    def process_request(self, request, client_address):
        thread = threading.Thread(
            target=self.process_request_thread,
            args=(request, client_address),
            daemon=True,
        )
        thread.start()

    def process_request_thread(self, request, client_address):
        try:
            self.finish_request(request, client_address)
        except Exception:
            self.handle_error(request, client_address)
        finally:
            self.shutdown_request(request)


def main():
    server = ThreadedHTTPServer(("127.0.0.1", ROUTER_PORT), SmartRouterHandler)

    logger.info(f"🧠 Smart Router started on port {ROUTER_PORT}")
    logger.info(f"   Local SLM: {LOCAL_SLM_HOST}:{LOCAL_SLM_PORT}")
    logger.info(f"   Cloud SaaS: {CLOUD_API_URL}")

    # Graceful shutdown
    def shutdown(sig, frame):
        logger.info("Shutting down...")
        server.shutdown()
        sys.exit(0)

    signal.signal(signal.SIGTERM, shutdown)
    signal.signal(signal.SIGINT, shutdown)

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        shutdown(None, None)


if __name__ == "__main__":
    main()
