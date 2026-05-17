"""PrestaShop integration tool for the OmniWorker agent.

Reads credentials from environment variables:
  PRESTASHOP_STORE_URL  (e.g. https://my-store.com)
  PRESTASHOP_API_KEY    (WebService API key)

Exposes LLM-callable tools:
  prestashop_list_products  -- list products
  prestashop_get_product    -- get a single product by ID
  prestashop_list_orders    -- list orders
  prestashop_get_order      -- get a single order by ID
"""

import json
import logging
import os
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

def _get_config() -> tuple[str, str]:
    """Return (store_url, api_key)."""
    url = os.getenv("PRESTASHOP_STORE_URL", "").strip()
    key = os.getenv("PRESTASHOP_API_KEY", "").strip()
    if url and not url.startswith(("http://", "https://")):
        url = f"https://{url}"
    return url.rstrip("/"), key


def _check_prestashop_available() -> bool:
    url, key = _get_config()
    return bool(url and key)


# ---------------------------------------------------------------------------
# Async helpers
# ---------------------------------------------------------------------------

def _tool_error(msg: str) -> str:
    from tools.registry import tool_error
    return tool_error(msg)


async def _ps_get(resource: str, params: Optional[Dict[str, Any]] = None) -> Any:
    import httpx
    url, key = _get_config()
    if not url or not key:
        raise RuntimeError("PrestaShop credentials not configured. Set PRESTASHOP_STORE_URL and PRESTASHOP_API_KEY.")

    full_url = f"{url}/api/{resource}"
    query = params or {}
    query["output_format"] = "JSON"
    query["display"] = "full"

    # PrestaShop WebService uses Basic Auth with API key as username and no password
    auth = httpx.BasicAuth(username=key, password="")

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(full_url, params=query, auth=auth)
        if resp.status_code == 401:
            raise RuntimeError("PrestaShop authentication failed. Check your API key.")
        if resp.status_code == 404:
            raise RuntimeError(f"PrestaShop resource not found: {resource}")
        resp.raise_for_status()
        return resp.json()


def _extract_ps_list(data: dict, key: str) -> list:
    """PrestaShop wraps lists in {key: [{...}, ...]} format."""
    if not isinstance(data, dict):
        return []
    root = data.get(key, data)
    if isinstance(root, list):
        return root
    if isinstance(root, dict):
        # Sometimes it returns a single object as dict instead of list
        return [root]
    return []


# ---------------------------------------------------------------------------
# Handlers
# ---------------------------------------------------------------------------

async def _handle_list_products(args: dict, **kw) -> str:
    limit = min(args.get("limit", 50), 100)
    params: Dict[str, Any] = {"limit": limit}
    if args.get("active") is not None:
        params["filter[active]"] = "1" if args["active"] else "0"

    try:
        data = await _ps_get("products", params)
        products = _extract_ps_list(data, "products")
        simplified = []
        for p in products:
            simplified.append({
                "id": p.get("id"),
                "name": p.get("name", [{}])[0].get("value") if isinstance(p.get("name"), list) else p.get("name"),
                "reference": p.get("reference"),
                "price": p.get("price"),
                "wholesale_price": p.get("wholesale_price"),
                "quantity": p.get("quantity"),
                "active": p.get("active"),
                "date_add": p.get("date_add"),
                "date_upd": p.get("date_upd"),
            })
        return json.dumps({
            "products": simplified,
            "count": len(simplified),
        }, ensure_ascii=False)
    except Exception as e:
        logger.error("prestashop_list_products error: %s", e)
        return _tool_error(str(e))


async def _handle_get_product(args: dict, **kw) -> str:
    product_id = args.get("product_id", "").strip()
    if not product_id:
        return _tool_error("product_id is required.")

    try:
        data = await _ps_get(f"products/{product_id}")
        products = _extract_ps_list(data, "products")
        if not products:
            return _tool_error(f"Product {product_id} not found.")
        p = products[0]

        def _localized(val):
            if isinstance(val, list) and val:
                return val[0].get("value", "")
            return val or ""

        result = {
            "id": p.get("id"),
            "name": _localized(p.get("name")),
            "description": _localized(p.get("description")),
            "description_short": _localized(p.get("description_short")),
            "reference": p.get("reference"),
            "price": p.get("price"),
            "wholesale_price": p.get("wholesale_price"),
            "quantity": p.get("quantity"),
            "minimal_quantity": p.get("minimal_quantity"),
            "active": p.get("active"),
            "available_for_order": p.get("available_for_order"),
            "show_price": p.get("show_price"),
            "weight": p.get("weight"),
            "date_add": p.get("date_add"),
            "date_upd": p.get("date_upd"),
            "associations": p.get("associations", {}),
        }
        return json.dumps(result, ensure_ascii=False)
    except Exception as e:
        logger.error("prestashop_get_product error: %s", e)
        return _tool_error(str(e))


async def _handle_list_orders(args: dict, **kw) -> str:
    limit = min(args.get("limit", 50), 100)
    params: Dict[str, Any] = {"limit": limit}
    if args.get("status"):
        params["filter[current_state]"] = args["status"]

    try:
        data = await _ps_get("orders", params)
        orders = _extract_ps_list(data, "orders")
        simplified = []
        for o in orders:
            simplified.append({
                "id": o.get("id"),
                "reference": o.get("reference"),
                "current_state": o.get("current_state"),
                "total_paid": o.get("total_paid"),
                "total_products": o.get("total_products"),
                "total_shipping": o.get("total_shipping"),
                "date_add": o.get("date_add"),
                "date_upd": o.get("date_upd"),
                "id_customer": o.get("id_customer"),
                "id_cart": o.get("id_cart"),
                "id_currency": o.get("id_currency"),
            })
        return json.dumps({
            "orders": simplified,
            "count": len(simplified),
        }, ensure_ascii=False)
    except Exception as e:
        logger.error("prestashop_list_orders error: %s", e)
        return _tool_error(str(e))


async def _handle_get_order(args: dict, **kw) -> str:
    order_id = args.get("order_id", "").strip()
    if not order_id:
        return _tool_error("order_id is required.")

    try:
        data = await _ps_get(f"orders/{order_id}")
        orders = _extract_ps_list(data, "orders")
        if not orders:
            return _tool_error(f"Order {order_id} not found.")
        o = orders[0]

        result = {
            "id": o.get("id"),
            "reference": o.get("reference"),
            "current_state": o.get("current_state"),
            "total_paid": o.get("total_paid"),
            "total_paid_real": o.get("total_paid_real"),
            "total_products": o.get("total_products"),
            "total_products_wt": o.get("total_products_wt"),
            "total_shipping": o.get("total_shipping"),
            "total_discounts": o.get("total_discounts"),
            "date_add": o.get("date_add"),
            "date_upd": o.get("date_upd"),
            "id_customer": o.get("id_customer"),
            "id_cart": o.get("id_cart"),
            "id_currency": o.get("id_currency"),
            "id_address_delivery": o.get("id_address_delivery"),
            "id_address_invoice": o.get("id_address_invoice"),
            "associations": o.get("associations", {}),
        }
        return json.dumps(result, ensure_ascii=False)
    except Exception as e:
        logger.error("prestashop_get_order error: %s", e)
        return _tool_error(str(e))


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

PRESTASHOP_LIST_PRODUCTS_SCHEMA = {
    "name": "prestashop_list_products",
    "description": "List PrestaShop products. Optionally filter by active status.",
    "parameters": {
        "type": "object",
        "properties": {
            "limit": {"type": "integer", "description": "Max products to return (1-100).", "default": 50},
            "active": {"type": "boolean", "description": "Filter by active status."},
        },
    },
}

PRESTASHOP_GET_PRODUCT_SCHEMA = {
    "name": "prestashop_get_product",
    "description": "Get detailed information about a single PrestaShop product by its numeric ID.",
    "parameters": {
        "type": "object",
        "properties": {
            "product_id": {"type": "string", "description": "The numeric product ID."},
        },
        "required": ["product_id"],
    },
}

PRESTASHOP_LIST_ORDERS_SCHEMA = {
    "name": "prestashop_list_orders",
    "description": "List PrestaShop orders. Optionally filter by status ID.",
    "parameters": {
        "type": "object",
        "properties": {
            "limit": {"type": "integer", "description": "Max orders to return (1-100).", "default": 50},
            "status": {"type": "string", "description": "Filter by order state ID."},
        },
    },
}

PRESTASHOP_GET_ORDER_SCHEMA = {
    "name": "prestashop_get_order",
    "description": "Get detailed information about a single PrestaShop order by its numeric ID.",
    "parameters": {
        "type": "object",
        "properties": {
            "order_id": {"type": "string", "description": "The numeric order ID."},
        },
        "required": ["order_id"],
    },
}


# ---------------------------------------------------------------------------
# Registration
# ---------------------------------------------------------------------------

from tools.registry import registry, tool_error

registry.register(
    name="prestashop_list_products",
    toolset="ecommerce",
    schema=PRESTASHOP_LIST_PRODUCTS_SCHEMA,
    handler=_handle_list_products,
    check_fn=_check_prestashop_available,
    is_async=True,
    emoji="🏪",
)

registry.register(
    name="prestashop_get_product",
    toolset="ecommerce",
    schema=PRESTASHOP_GET_PRODUCT_SCHEMA,
    handler=_handle_get_product,
    check_fn=_check_prestashop_available,
    is_async=True,
    emoji="🏪",
)

registry.register(
    name="prestashop_list_orders",
    toolset="ecommerce",
    schema=PRESTASHOP_LIST_ORDERS_SCHEMA,
    handler=_handle_list_orders,
    check_fn=_check_prestashop_available,
    is_async=True,
    emoji="🏪",
)

registry.register(
    name="prestashop_get_order",
    toolset="ecommerce",
    schema=PRESTASHOP_GET_ORDER_SCHEMA,
    handler=_handle_get_order,
    check_fn=_check_prestashop_available,
    is_async=True,
    emoji="🏪",
)
