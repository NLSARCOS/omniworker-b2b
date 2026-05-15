import os
import re
import logging

logger = logging.getLogger(__name__)

def is_local_intent(user_message: str) -> bool:
    """
    Heurística rápida para clasificador de intenciones.
    Decide si la petición debe resolverse en LOCAL (SLM) o en CLOUD (SaaS).
    """
    message_lower = user_message.lower()
    
    local_keywords = [
        "buscar", "archivo", "sistema", "rag", "documento", "carpeta", 
        "calendario", "evento", "abre", "ejecuta", "terminal", "script",
        "mi computadora", "mi pc", "local"
    ]
    
    complex_keywords = [
        "diseña", "arquitectura", "compilador", "explícame la teoría", 
        "ensayo", "analiza este código complejo", "escribe un libro",
        "crea una aplicación web completa", "react", "nextjs", "aws",
        "plan de marketing", "modelo matemático"
    ]
    
    # 1. Regla: Tareas que interactúan explícitamente con el SO son locales.
    for kw in local_keywords:
        if kw in message_lower:
            return True
            
    # 2. Regla: Tareas abstractas y complejas van a la nube.
    for kw in complex_keywords:
        if kw in message_lower:
            return False
            
    # 3. Longitud: Prompts muy largos suelen requerir razonamiento complejo (Cloud)
    if len(user_message) > 500:
        return False
        
    # Por defecto, resolvemos localmente para ahorrar tokens (AaaS value prop)
    return True

def get_routing_config(user_message: str, current_base_url: str, current_model: str, current_key: str):
    """
    Retorna (base_url, model, api_key) dependiendo de la ruta elegida.
    """
    if is_local_intent(user_message):
        logger.info("[Intent Classifier] Ruta elegida: LOCAL (SLM)")
        # Devolver la configuración local original (Ej. LMStudio / Ollama)
        return current_base_url, current_model, current_key
    else:
        logger.info("[Intent Classifier] Ruta elegida: CLOUD (SaaS Gateway)")
        # Forzar el enrutamiento al backend SaaS
        saas_url = os.getenv("OMNIWORKER_SAAS_URL", "http://localhost:3000/api/v1/chat/completions")
        saas_key = os.getenv("OMNIWORKER_API_KEY", "dummy-local-token")
        saas_model = "omniworker-cloud-reasoner"
        return saas_url, saas_model, saas_key
