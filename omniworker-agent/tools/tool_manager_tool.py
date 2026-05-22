"""Tool manager tool — let the agent dynamically inspect and manage its toolsets in a session.

Provides actions to:
- List active/inactive toolsets and their availability (list_status)
- Toggle a toolset's active status (toggle_toolset)
- Inspect environment requirements for toolsets (check_requirements)
"""

import json
import logging
import os
from typing import Any, Dict, List, Optional

from tools.registry import registry, tool_error

logger = logging.getLogger(__name__)


def manage_tools(
    action: str,
    toolset: Optional[str] = None,
    enable: Optional[bool] = None,
    **kwargs: Any,
) -> str:
    """Manage dynamic toolset activation, deactivation, and verification."""
    normalized = (action or "").strip().lower()
    session_id = kwargs.get("session_id", "default_session")

    try:
        from model_tools import get_session_toolset_status, toggle_session_toolset

        if normalized == "list_status":
            status = get_session_toolset_status(session_id)
            
            lines = [
                "### Estado de los Toolsets en la Sesión Actual",
                "",
                "| Toolset | Estado | Disponible | Herramientas | Descripción |",
                "| :--- | :--- | :--- | :--- | :--- |"
            ]
            for ts, info in sorted(status.items()):
                estado = "🟢 **Activo**" if info["active"] else "🔴 *Inactivo*"
                disponible = "✅ Sí" if info["available"] else "❌ No (Faltan dependencias)"
                
                # Truncate tools string if too long to save prompt tokens
                tools_list = info["tools"]
                tools_str = ", ".join(tools_list[:5])
                if len(tools_list) > 5:
                    tools_str += f" (+{len(tools_list) - 5})"
                    
                desc = info["description"] or ""
                lines.append(f"| `{ts}` | {estado} | {disponible} | `{tools_str}` | {desc} |")
                
            return "\n".join(lines)

        elif normalized == "toggle_toolset":
            if not toolset:
                return tool_error("El argumento 'toolset' es requerido para la acción 'toggle_toolset'.", success=False)
            if enable is None:
                return tool_error("El argumento 'enable' (booleano) es requerido para la acción 'toggle_toolset'.", success=False)

            status = get_session_toolset_status(session_id)
            if toolset not in status:
                return tool_error(f"El toolset '{toolset}' no está registrado o no existe.", success=False)

            changed = toggle_session_toolset(session_id, toolset, enable)
            estado_str = "activado" if enable else "desactivado"

            if changed:
                return json.dumps({
                    "success": True,
                    "message": f"El toolset '{toolset}' ha sido {estado_str} exitosamente para esta sesión."
                }, ensure_ascii=False, indent=2)
            else:
                return json.dumps({
                    "success": True,
                    "message": f"El toolset '{toolset}' ya se encontraba {estado_str} en esta sesión."
                }, ensure_ascii=False, indent=2)

        elif normalized == "check_requirements":
            status = get_session_toolset_status(session_id)
            
            if toolset:
                if toolset not in status:
                    return tool_error(f"El toolset '{toolset}' no está registrado o no existe.", success=False)
                
                info = status[toolset]
                available = info["available"]
                reqs = info["requirements"]
                
                lines = [
                    f"### Requisitos del Toolset `{toolset}`",
                    f"- **Disponible:** {'✅ Sí' if available else '❌ No'}",
                    f"- **Herramientas:** `{', '.join(info['tools'])}`",
                    f"- **Descripción:** {info['description']}",
                    "",
                    "**Variables de entorno / requisitos necesarios:**"
                ]
                if reqs:
                    for req in reqs:
                        has_req = req in os.environ
                        lines.append(f"  - `{req}`: {'✅ Configurada' if has_req else '❌ Faltante (Define esta variable de entorno)'}")
                else:
                    lines.append("  - Sin variables de entorno requeridas por herramientas individuales.")
                    
                return "\n".join(lines)
            else:
                # Check all unavailable toolsets
                lines = [
                    "### Diagnóstico de Requisitos de Toolsets",
                    "A continuación se detallan los requisitos de los toolsets que no están disponibles actualmente por dependencias faltantes:",
                    ""
                ]
                has_unavailable = False
                for ts, info in sorted(status.items()):
                    if not info["available"]:
                        has_unavailable = True
                        lines.append(f"#### Toolset: `{ts}` (Descripción: {info['description']})")
                        lines.append(f"- **Herramientas:** `{', '.join(info['tools'])}`")
                        lines.append("- **Variables de entorno requeridas:**")
                        for req in info["requirements"]:
                            has_req = req in os.environ
                            lines.append(f"  - `{req}`: {'✅ Configurada' if has_req else '❌ Faltante (Define esta variable de entorno)'}")
                        if not info["requirements"]:
                            lines.append("  - El check_fn personalizado del toolset retornó False (depende de un servicio externo, binario local o entorno).")
                        lines.append("")
                        
                if not has_unavailable:
                    return "Todos los toolsets están totalmente disponibles y con sus requisitos cumplidos. ¡Listo para funcionar!"
                    
                return "\n".join(lines)

        return tool_error(f"Acción '{action}' desconocida para manage_tools", success=False)

    except Exception as exc:
        logger.exception("manage_tools tool error: %s", exc)
        return tool_error(str(exc), success=False)


MANAGE_TOOLS_SCHEMA = {
    "name": "manage_tools",
    "description": (
        "Permite listar, activar, desactivar y verificar requisitos de los diferentes toolsets "
        "(grupos de herramientas) en la sesión actual. Esto ayuda a evitar errores por dependencias "
        "faltantes y a optimizar el consumo de tokens desactivando herramientas innecesarias."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "action": {
                "type": "string",
                "description": (
                    "Acción a realizar. Valores permitidos: "
                    "'list_status' (listar toolsets y su estado actual), "
                    "'toggle_toolset' (activar/desactivar un toolset específico), "
                    "'check_requirements' (verificar requisitos y dependencias)."
                ),
                "enum": ["list_status", "toggle_toolset", "check_requirements"],
            },
            "toolset": {
                "type": "string",
                "description": "Nombre del toolset para las acciones 'toggle_toolset' o 'check_requirements'.",
            },
            "enable": {
                "type": "boolean",
                "description": "Indica si se debe activar (true) o desactivar (false) el toolset. Requerido para 'toggle_toolset'.",
            },
        },
        "required": ["action"],
    },
}


registry.register(
    name="manage_tools",
    toolset="skills",  # Registered under 'skills' so it's always enabled by default
    schema=MANAGE_TOOLS_SCHEMA,
    handler=lambda args, **kw: manage_tools(
        action=args.get("action", ""),
        toolset=args.get("toolset"),
        enable=args.get("enable"),
        **kw,
    ),
    check_fn=lambda: True,
    emoji="⚙️",
)
