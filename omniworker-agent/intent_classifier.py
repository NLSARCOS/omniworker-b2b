import os
import re
import logging
import urllib.request
import urllib.error

logger = logging.getLogger(__name__)

# ── Endpoints ────────────────────────────────────────────────────────────────
# Local SLM: llama-server spawned by the desktop at startup
_LOCAL_SLM_BASE_URL = os.getenv("OMNIWORKER_LOCAL_SLM_URL", "http://127.0.0.1:8080/v1")
_LOCAL_SLM_MODEL    = os.getenv("OMNIWORKER_LOCAL_SLM_MODEL", "slm")   # matches llama-server --alias

# SaaS cloud gateway (injected by the desktop via ~/.omniworker/.env)
_CLOUD_API_URL = os.getenv("CLOUD_API_URL")
if _CLOUD_API_URL:
    if _CLOUD_API_URL.endswith("/api"):
        _SAAS_BASE_URL = f"{_CLOUD_API_URL}/v1"
    elif _CLOUD_API_URL.endswith("/api/"):
        _SAAS_BASE_URL = f"{_CLOUD_API_URL}v1"
    else:
        _SAAS_BASE_URL = _CLOUD_API_URL
else:
    _SAAS_BASE_URL = os.getenv("OMNIWORKER_SAAS_BASE_URL", "http://localhost:3000/api/v1")

_SAAS_API_KEY  = (
    os.getenv("OMNIWORKER_SAAS_API_KEY")
    or os.getenv("OPENAI_API_KEY")
    or os.getenv("CUSTOM_API_KEY")
    or ""
)
_SAAS_MODEL    = os.getenv("OMNIWORKER_SAAS_MODEL", "omniworker-b2b")


def _is_slm_alive() -> bool:
    """
    Quick TCP-level check to see if llama-server is listening.
    Returns False on any error (not installed, still booting, etc.).
    Times out in 300ms so it never blocks a turn.
    """
    try:
        req = urllib.request.Request(
            f"{_LOCAL_SLM_BASE_URL}/models",
            headers={"Authorization": "Bearer no-key-required"},
        )
        with urllib.request.urlopen(req, timeout=0.3):
            return True
    except Exception:
        return False


# ── Intent classification ─────────────────────────────────────────────────────

# Tasks cheap enough to run locally (file ops, translate, summarise short text…)
_LOCAL_KEYWORDS = [
    # File system
    "buscar archivo", "busca el archivo", "encuentra el archivo",
    "listar archivos", "lista archivos", "carpeta", "directorio",
    # Translation
    "traduce", "traducir", "translate", "translation",
    # Simple summarise / short Q&A
    "resume esto", "resumen", "summarize", "summary",
    # Calendar / OS tasks
    "calendario", "evento", "recordatorio", "reminder",
    "abre la app", "abre el archivo", "abre el programa",
    "ejecuta", "corre el script", "terminal", "comando",
    # Misc cheap
    "mi pc", "mi computadora", "mi mac", "local",
    "convierte este texto", "convierte el formato",
    "extrae el texto", "copiar texto",
]

# Tasks that need reasoning / long context → always go to cloud
_CLOUD_KEYWORDS = [
    "diseña", "arquitectura", "escribe el código", "implementa",
    "crea una app", "crea una aplicación", "build", "refactor",
    "analiza el código", "code review", "debug", "depura",
    "react", "nextjs", "typescript", "python", "fastapi",
    "aws", "docker", "kubernetes", "deploy",
    "plan de", "estrategia", "roadmap", "propuesta",
    "ensayo", "artículo largo", "escribe un libro",
    "modelo matemático", "algoritmo complejo",
    "generate", "genera código", "genera la función",
]


def is_local_intent(user_message: str) -> bool:
    """
    Heuristic classifier: True  → route to local SLM (save tokens)
                          False → route to cloud SaaS gateway
    """
    msg = user_message.lower().strip()

    # 1. Explicit cloud keywords take priority
    for kw in _CLOUD_KEYWORDS:
        if kw in msg:
            return False

    # 2. Long prompts almost always need cloud reasoning
    if len(user_message) > 400:
        return False

    # 3. Local keywords → candidate for SLM
    for kw in _LOCAL_KEYWORDS:
        if kw in msg:
            return True

    # 4. Default: short+simple → local if SLM is up, cloud otherwise
    return True


def get_routing_config(
    user_message: str,
    current_base_url: str,
    current_model: str,
    current_key: str,
) -> tuple:
    """
    Returns (base_url, model, api_key) for this turn.

    Routing logic:
      • complex / long prompt  → SaaS cloud gateway
      • simple / local task    → llama-server (local SLM)
          - but only if the SLM is actually running
          - falls back to SaaS if SLM is offline
    """
    if is_local_intent(user_message):
        if _is_slm_alive():
            logger.info("[Intent Classifier] → LOCAL SLM (%s)", _LOCAL_SLM_BASE_URL)
            return _LOCAL_SLM_BASE_URL, _LOCAL_SLM_MODEL, "no-key-required"
        else:
            logger.info(
                "[Intent Classifier] LOCAL intent but SLM offline — falling back to CLOUD"
            )

    # Cloud path
    # Read keys dynamically to ensure we get the refreshed values
    saas_key = (
        os.getenv("OMNIWORKER_SAAS_API_KEY")
        or os.getenv("OPENAI_API_KEY")
        or os.getenv("CUSTOM_API_KEY")
        or current_key
    )
    logger.info("[Intent Classifier] → CLOUD SaaS (%s)", _SAAS_BASE_URL)
    return _SAAS_BASE_URL, _SAAS_MODEL, saas_key
