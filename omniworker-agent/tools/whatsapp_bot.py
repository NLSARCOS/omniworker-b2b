"""WhatsApp Bot Builder tool for the OmniWorker agent.

Generates, configures, and manages AI-powered WhatsApp customer service bots.
Based on the whatsapp-agentkit project architecture.

Tools exposed:
  whatsapp_bot_create    -- Generate a new bot project from templates
  whatsapp_bot_configure -- Update bot configuration
  whatsapp_bot_status    -- Check if a bot project exists and its health
  whatsapp_bot_test      -- Send a test message through the bot brain
"""

import json
import logging
import os
import shutil
import subprocess
import sys
from pathlib import Path
from string import Template
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)

BOT_DIR = Path.home() / ".omniworker" / "whatsapp-bot"
SETTINGS_FILE = BOT_DIR / "settings.json"
PID_FILE = Path.home() / ".omniworker" / "whatsapp-bot.pid"
TEMPLATE_DIR = Path(__file__).resolve().parent / "whatsapp_bot_templates"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _tool_error(msg: str) -> str:
    from tools.registry import tool_error
    return tool_error(msg)


def _tool_result(data: Any) -> str:
    from tools.registry import tool_result
    return tool_result(data)


def _check_available() -> bool:
    # WhatsApp tools must be explicitly enabled via WHATSAPP_ENABLED env var
    return os.getenv("WHATSAPP_ENABLED", "").lower() in {"true", "1", "yes"}


def _bot_exists() -> bool:
    if not _check_available():
        return False
    return (BOT_DIR / "agent" / "main.py").exists()


def _bot_running() -> bool:
    if not _check_available():
        return False
    if not PID_FILE.exists():
        return False
    try:
        pid = int(PID_FILE.read_text(encoding="utf-8").strip())
        os.kill(pid, 0)
        return True
    except (ProcessLookupError, ValueError, PermissionError):
        PID_FILE.unlink(missing_ok=True)
        return False


def _get_settings() -> Optional[Dict[str, Any]]:
    if not SETTINGS_FILE.exists():
        return None
    return json.loads(SETTINGS_FILE.read_text(encoding="utf-8"))


def _save_settings(settings: Dict[str, Any]) -> None:
    SETTINGS_FILE.write_text(json.dumps(settings, indent=2, ensure_ascii=False), encoding="utf-8")


def _apply_template(template_path: Path, dest_path: Path, variables: Dict[str, str]) -> None:
    content = template_path.read_text(encoding="utf-8")
    tmpl = Template(content)
    result = tmpl.safe_substitute(variables)
    dest_path.parent.mkdir(parents=True, exist_ok=True)
    dest_path.write_text(result, encoding="utf-8")


# ---------------------------------------------------------------------------
# Handlers
# ---------------------------------------------------------------------------


async def _handle_create_bot(args: dict, **kw) -> str:
    """Generate a new WhatsApp bot project from templates."""
    if _bot_exists():
        return _tool_error(
            "WhatsApp bot already exists at ~/.omniworker/whatsapp-bot/. "
            "Use whatsapp_bot_configure to update it, or delete the directory first."
        )

    business_name = args.get("business_name", "My Business")
    business_description = args.get("business_description", "A business")
    agent_purpose = args.get("agent_purpose", "Answer customer questions")
    agent_name = args.get("agent_name", "Assistant")
    tone = args.get("tone", "professional")
    hours = args.get("hours", "Monday to Friday 9am to 6pm")
    provider = args.get("provider", "whapi")
    port = str(args.get("port", 8000))

    variables = {
        "business_name": business_name,
        "business_description": business_description,
        "agent_purpose": agent_purpose,
        "agent_name": agent_name,
        "tone": tone,
        "hours": hours,
        "provider": provider,
        "port": port,
        # Provider-specific placeholders (user should set via .env)
        "whapi_token": "",
        "meta_access_token": "",
        "meta_phone_number_id": "",
        "meta_verify_token": "agentkit-verify",
        "twilio_account_sid": "",
        "twilio_auth_token": "",
        "twilio_phone_number": "",
        "openwa_server_url": "http://localhost:2785",
        "openwa_api_key": "",
        "anthropic_api_key": "",
    }

    # Merge credentials from args
    credentials = args.get("credentials", {})
    for key in [
        "whapi_token", "meta_access_token", "meta_phone_number_id",
        "meta_verify_token", "twilio_account_sid", "twilio_auth_token",
        "twilio_phone_number", "openwa_server_url", "openwa_api_key",
        "anthropic_api_key",
    ]:
        if key in credentials:
            variables[key] = credentials[key]

    if "anthropic_api_key" in args:
        variables["anthropic_api_key"] = args["anthropic_api_key"]

    # Create bot directory structure
    agent_dir = BOT_DIR / "agent"
    providers_dir = agent_dir / "providers"
    config_dir = BOT_DIR / "config"
    knowledge_dir = BOT_DIR / "knowledge"

    for d in [agent_dir, providers_dir, config_dir, knowledge_dir]:
        d.mkdir(parents=True, exist_ok=True)

    # Template file mappings
    template_files = [
        ("main.py.template", agent_dir / "main.py"),
        ("brain.py.template", agent_dir / "brain.py"),
        ("memory.py.template", agent_dir / "memory.py"),
        ("providers/__init__.py.template", providers_dir / "__init__.py"),
        ("providers/base.py.template", providers_dir / "base.py"),
        ("providers/whapi.py.template", providers_dir / "whapi.py"),
        ("providers/meta.py.template", providers_dir / "meta.py"),
        ("providers/twilio.py.template", providers_dir / "twilio.py"),
        ("providers/openwa.py.template", providers_dir / "openwa.py"),
        ("config/business.yaml.template", config_dir / "business.yaml"),
        ("config/prompts.yaml.template", config_dir / "prompts.yaml"),
        ("requirements.txt.template", BOT_DIR / "requirements.txt"),
        ("Dockerfile.template", BOT_DIR / "Dockerfile"),
        ("docker-compose.yml.template", BOT_DIR / "docker-compose.yml"),
    ]

    for tmpl_name, dest_path in template_files:
        tmpl_path = TEMPLATE_DIR / tmpl_name
        if tmpl_path.exists():
            _apply_template(tmpl_path, dest_path, variables)

    # Create __init__.py for agent package
    (agent_dir / "__init__.py").write_text("", encoding="utf-8")

    # Create .env file
    env_lines = [
        f"ANTHROPIC_API_KEY={variables['anthropic_api_key']}",
        f"WHATSAPP_PROVIDER={provider}",
        f"PORT={port}",
        "ENVIRONMENT=development",
    ]
    if provider == "whapi":
        env_lines.append(f"WHAPI_TOKEN={variables['whapi_token']}")
    elif provider == "meta":
        env_lines.extend([
            f"META_ACCESS_TOKEN={variables['meta_access_token']}",
            f"META_PHONE_NUMBER_ID={variables['meta_phone_number_id']}",
            f"META_VERIFY_TOKEN={variables['meta_verify_token']}",
        ])
    elif provider == "twilio":
        env_lines.extend([
            f"TWILIO_ACCOUNT_SID={variables['twilio_account_sid']}",
            f"TWILIO_AUTH_TOKEN={variables['twilio_auth_token']}",
            f"TWILIO_PHONE_NUMBER={variables['twilio_phone_number']}",
        ])
    elif provider == "openwa":
        env_lines.extend([
            f"OPENWA_SERVER_URL={variables['openwa_server_url']}",
            f"OPENWA_API_KEY={variables['openwa_api_key']}",
        ])
    (BOT_DIR / ".env").write_text("\n".join(env_lines) + "\n", encoding="utf-8")

    # Save settings
    settings = {
        "businessName": business_name,
        "businessDescription": business_description,
        "agentPurpose": agent_purpose,
        "agentName": agent_name,
        "tone": tone,
        "hours": hours,
        "provider": provider,
        "port": int(port),
        "credentials": credentials,
    }
    _save_settings(settings)

    return _tool_result({
        "success": True,
        "path": str(BOT_DIR),
        "message": f"WhatsApp bot '{agent_name}' for '{business_name}' created successfully.",
    })


async def _handle_configure_bot(args: dict, **kw) -> str:
    """Update WhatsApp bot configuration."""
    if not _bot_exists():
        return _tool_error("WhatsApp bot not found. Use whatsapp_bot_create first.")

    settings = _get_settings() or {}

    updatable_fields = [
        "business_name", "business_description", "agent_purpose",
        "agent_name", "tone", "hours", "provider",
    ]
    for field in updatable_fields:
        if field in args:
            # Map snake_case to camelCase for settings
            settings_key = field
            settings[settings_key] = args[field]

    if "port" in args:
        settings["port"] = args["port"]

    if "credentials" in args:
        settings["credentials"] = args["credentials"]

    _save_settings(settings)

    # Regenerate config files from templates
    variables = {
        "business_name": settings.get("business_name", settings.get("businessName", "")),
        "business_description": settings.get("business_description", settings.get("businessDescription", "")),
        "agent_purpose": settings.get("agent_purpose", settings.get("agentPurpose", "")),
        "agent_name": settings.get("agent_name", settings.get("agentName", "")),
        "tone": settings.get("tone", "professional"),
        "hours": settings.get("hours", ""),
        "provider": settings.get("provider", "whapi"),
        "port": str(settings.get("port", 8000)),
        "whapi_token": settings.get("credentials", {}).get("whapi_token", ""),
        "meta_access_token": settings.get("credentials", {}).get("meta_access_token", ""),
        "meta_phone_number_id": settings.get("credentials", {}).get("meta_phone_number_id", ""),
        "meta_verify_token": settings.get("credentials", {}).get("meta_verify_token", "agentkit-verify"),
        "twilio_account_sid": settings.get("credentials", {}).get("twilio_account_sid", ""),
        "twilio_auth_token": settings.get("credentials", {}).get("twilio_auth_token", ""),
        "twilio_phone_number": settings.get("credentials", {}).get("twilio_phone_number", ""),
        "openwa_server_url": settings.get("credentials", {}).get("openwa_server_url", "http://localhost:2785"),
        "openwa_api_key": settings.get("credentials", {}).get("openwa_api_key", ""),
        "anthropic_api_key": settings.get("credentials", {}).get("anthropic_api_key", ""),
    }

    config_dir = BOT_DIR / "config"
    for tmpl_name, dest_name in [
        ("config/business.yaml.template", "business.yaml"),
        ("config/prompts.yaml.template", "prompts.yaml"),
    ]:
        tmpl_path = TEMPLATE_DIR / tmpl_name
        if tmpl_path.exists():
            _apply_template(tmpl_path, config_dir / dest_name, variables)

    # Update .env
    env_path = BOT_DIR / ".env"
    if env_path.exists():
        provider = settings.get("provider", "whapi")
        env_lines = [
            f"ANTHROPIC_API_KEY={variables['anthropic_api_key']}",
            f"WHATSAPP_PROVIDER={provider}",
            f"PORT={variables['port']}",
            "ENVIRONMENT=development",
        ]
        if provider == "whapi":
            env_lines.append(f"WHAPI_TOKEN={variables['whapi_token']}")
        elif provider == "meta":
            env_lines.extend([
                f"META_ACCESS_TOKEN={variables['meta_access_token']}",
                f"META_PHONE_NUMBER_ID={variables['meta_phone_number_id']}",
                f"META_VERIFY_TOKEN={variables['meta_verify_token']}",
            ])
        elif provider == "twilio":
            env_lines.extend([
                f"TWILIO_ACCOUNT_SID={variables['twilio_account_sid']}",
                f"TWILIO_AUTH_TOKEN={variables['twilio_auth_token']}",
                f"TWILIO_PHONE_NUMBER={variables['twilio_phone_number']}",
            ])
        elif provider == "openwa":
            env_lines.extend([
                f"OPENWA_SERVER_URL={variables['openwa_server_url']}",
                f"OPENWA_API_KEY={variables['openwa_api_key']}",
            ])
        env_path.write_text("\n".join(env_lines) + "\n", encoding="utf-8")

    return _tool_result({
        "success": True,
        "message": "WhatsApp bot configuration updated.",
        "settings": settings,
    })


async def _handle_bot_status(args: dict, **kw) -> str:
    """Check WhatsApp bot status."""
    exists = _bot_exists()
    running = _bot_running()
    settings = _get_settings()

    result = {
        "exists": exists,
        "running": running,
        "path": str(BOT_DIR) if exists else None,
    }

    if settings:
        result["businessName"] = settings.get("businessName", settings.get("business_name", ""))
        result["agentName"] = settings.get("agentName", settings.get("agent_name", ""))
        result["provider"] = settings.get("provider", "")
        result["port"] = settings.get("port", 8000)

    return _tool_result(result)


async def _handle_test_bot(args: dict, **kw) -> str:
    """Send a test message to the running bot."""
    message = args.get("message", "Hola")
    port = args.get("port", 8000)

    if not _bot_running():
        return _tool_error("WhatsApp bot is not running. Start it first.")

    try:
        import urllib.request
        url = f"http://127.0.0.1:{port}/test"
        data = json.dumps({"message": message, "sender": "test_user"}).encode("utf-8")
        req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=30) as resp:
            result = json.loads(resp.read().decode("utf-8"))
        return _tool_result({
            "response": result.get("response", ""),
            "message": "Test message sent successfully.",
        })
    except Exception as e:
        return _tool_error(f"Failed to send test message: {e}")


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

WHATSAPP_BOT_CREATE_SCHEMA = {
    "name": "whatsapp_bot_create",
    "description": (
        "Create a new WhatsApp AI bot for customer service. "
        "Generates a complete FastAPI project with AI brain, memory, "
        "and WhatsApp provider integration. "
        "Supports Whapi.cloud, Meta Cloud API, and Twilio providers."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "business_name": {
                "type": "string",
                "description": "Name of the business (e.g. 'Cafe El Buen Sabor')",
            },
            "business_description": {
                "type": "string",
                "description": "What the business does",
            },
            "agent_purpose": {
                "type": "string",
                "description": "What the agent should do (answer questions, take orders, etc.)",
            },
            "agent_name": {
                "type": "string",
                "description": "Name of the AI agent that customers will see (e.g. 'Sofia')",
            },
            "tone": {
                "type": "string",
                "description": "Communication tone",
                "enum": ["professional", "friendly", "sales", "empathetic"],
                "default": "professional",
            },
            "hours": {
                "type": "string",
                "description": "Business hours (e.g. 'Monday to Friday 9am to 6pm')",
            },
            "provider": {
                "type": "string",
                "description": "WhatsApp provider to use",
                "enum": ["whapi", "meta", "twilio", "openwa"],
                "default": "whapi",
            },
            "port": {
                "type": "integer",
                "description": "Port for the bot server",
                "default": 8000,
            },
            "anthropic_api_key": {
                "type": "string",
                "description": "Anthropic API key for the bot's AI brain",
            },
            "credentials": {
                "type": "object",
                "description": "Provider-specific credentials (whapi_token, meta_access_token, etc.)",
                "properties": {
                    "whapi_token": {"type": "string"},
                    "meta_access_token": {"type": "string"},
                    "meta_phone_number_id": {"type": "string"},
                    "meta_verify_token": {"type": "string"},
                    "twilio_account_sid": {"type": "string"},
                    "twilio_auth_token": {"type": "string"},
                    "twilio_phone_number": {"type": "string"},
                    "openwa_server_url": {"type": "string"},
                    "openwa_api_key": {"type": "string"},
                },
            },
        },
        "required": ["business_name"],
    },
}

WHATSAPP_BOT_CONFIGURE_SCHEMA = {
    "name": "whatsapp_bot_configure",
    "description": "Update the configuration of an existing WhatsApp bot.",
    "parameters": {
        "type": "object",
        "properties": {
            "business_name": {"type": "string", "description": "Updated business name"},
            "business_description": {"type": "string", "description": "Updated business description"},
            "agent_purpose": {"type": "string", "description": "Updated agent purpose"},
            "agent_name": {"type": "string", "description": "Updated agent name"},
            "tone": {
                "type": "string",
                "enum": ["professional", "friendly", "sales", "empathetic"],
                "description": "Updated communication tone",
            },
            "hours": {"type": "string", "description": "Updated business hours"},
            "provider": {
                "type": "string",
                "enum": ["whapi", "meta", "twilio", "openwa"],
                "description": "Switch WhatsApp provider",
            },
            "port": {"type": "integer", "description": "Updated server port"},
            "credentials": {
                "type": "object",
                "description": "Updated provider credentials",
            },
        },
    },
}

WHATSAPP_BOT_STATUS_SCHEMA = {
    "name": "whatsapp_bot_status",
    "description": "Check the status of the WhatsApp bot (exists, running, configuration).",
    "parameters": {
        "type": "object",
        "properties": {},
    },
}

WHATSAPP_BOT_TEST_SCHEMA = {
    "name": "whatsapp_bot_test",
    "description": "Send a test message to the running WhatsApp bot to verify it responds correctly.",
    "parameters": {
        "type": "object",
        "properties": {
            "message": {
                "type": "string",
                "description": "Test message to send (e.g. 'Hola, que horarios tienen?')",
            },
            "port": {
                "type": "integer",
                "description": "Bot server port (default: from settings)",
            },
        },
        "required": ["message"],
    },
}


# ---------------------------------------------------------------------------
# Registration
# ---------------------------------------------------------------------------

from tools.registry import registry  # noqa: E402

registry.register(
    name="whatsapp_bot_create",
    toolset="whatsapp_bot",
    schema=WHATSAPP_BOT_CREATE_SCHEMA,
    handler=_handle_create_bot,
    check_fn=_check_available,
    is_async=True,
    description="Create a new WhatsApp AI bot for customer service",
    emoji="🤖",
)

registry.register(
    name="whatsapp_bot_configure",
    toolset="whatsapp_bot",
    schema=WHATSAPP_BOT_CONFIGURE_SCHEMA,
    handler=_handle_configure_bot,
    check_fn=_bot_exists,
    is_async=True,
    description="Update WhatsApp bot configuration",
    emoji="🤖",
)

registry.register(
    name="whatsapp_bot_status",
    toolset="whatsapp_bot",
    schema=WHATSAPP_BOT_STATUS_SCHEMA,
    handler=_handle_bot_status,
    check_fn=_check_available,
    is_async=True,
    description="Check WhatsApp bot status",
    emoji="🤖",
)

registry.register(
    name="whatsapp_bot_test",
    toolset="whatsapp_bot",
    schema=WHATSAPP_BOT_TEST_SCHEMA,
    handler=_handle_test_bot,
    check_fn=_bot_running,
    is_async=True,
    description="Send a test message to the WhatsApp bot",
    emoji="🤖",
)
