"""Shopify integration tool for the OmniWorker agent.

Reads credentials from environment variables:
  SHOPIFY_STORE_DOMAIN  (e.g. my-store.myshopify.com)
  SHOPIFY_ACCESS_TOKEN  (Admin API access token)

Exposes LLM-callable tools:
  shopify_list_products   -- list products with optional filters
  shopify_get_product     -- get a single product by ID or handle
  shopify_list_orders     -- list orders with optional status filter
  shopify_get_order       -- get a single order by ID
"""

import json
import logging
import os
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

API_VERSION = "2024-10"

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

def _get_config() -> tuple[str, str]:
    """Return (store_domain, access_token) from env vars."""
    domain = os.getenv("SHOPIFY_STORE_DOMAIN", "").strip()
    token = os.getenv("SHOPIFY_ACCESS_TOKEN", "").strip()
    if domain and not domain.startswith(("http://", "https://")):
        domain = f"https://{domain}"
    return domain.rstrip("/"), token


def _check_shopify_available() -> bool:
    domain, token = _get_config()
    return bool(domain and token)


def _get_headers(token: str) -> Dict[str, str]:
    return {
        "X-Shopify-Access-Token": token,
        "Content-Type": "application/json",
    }


# ---------------------------------------------------------------------------
# Async helpers
# ---------------------------------------------------------------------------

def _tool_error(msg: str) -> str:
    from tools.registry import tool_error
    return tool_error(msg)


async def _shopify_get(path: str, params: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    import httpx
    domain, token = _get_config()
    if not domain or not token:
        raise RuntimeError("Shopify credentials not configured. Set SHOPIFY_STORE_DOMAIN and SHOPIFY_ACCESS_TOKEN.")

    url = f"{domain}/admin/api/{API_VERSION}/{path.lstrip('/')}"
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(url, headers=_get_headers(token), params=params or {})
        if resp.status_code == 401:
            raise RuntimeError("Shopify authentication failed. Check your access token.")
        if resp.status_code == 404:
            raise RuntimeError(f"Shopify resource not found: {path}")
        resp.raise_for_status()
        return resp.json()


# ---------------------------------------------------------------------------
# Handlers
# ---------------------------------------------------------------------------

async def _handle_list_products(args: dict, **kw) -> str:
    limit = min(args.get("limit", 50), 250)
    params: Dict[str, Any] = {"limit": limit}
    if args.get("status"):
        params["status"] = args["status"]
    if args.get("collection_id"):
        params["collection_id"] = args["collection_id"]
    if args.get("title"):
        params["title"] = args["title"]

    try:
        data = await _shopify_get("products.json", params)
        products = data.get("products", [])
        simplified = []
        for p in products:
            simplified.append({
                "id": p.get("id"),
                "title": p.get("title"),
                "handle": p.get("handle"),
                "status": p.get("status"),
                "variants_count": len(p.get("variants", [])),
                "inventory_quantity": sum(v.get("inventory_quantity", 0) for v in p.get("variants", [])),
                "price": p.get("variants", [{}])[0].get("price") if p.get("variants") else None,
                "updated_at": p.get("updated_at"),
            })
        return json.dumps({
            "products": simplified,
            "count": len(simplified),
        }, ensure_ascii=False)
    except Exception as e:
        logger.error("shopify_list_products error: %s", e)
        return _tool_error(str(e))


async def _handle_get_product(args: dict, **kw) -> str:
    product_id = args.get("product_id", "").strip()
    if not product_id:
        return _tool_error("product_id is required.")

    try:
        data = await _shopify_get(f"products/{product_id}.json")
        p = data.get("product", {})
        result = {
            "id": p.get("id"),
            "title": p.get("title"),
            "description": p.get("body_html", ""),
            "vendor": p.get("vendor"),
            "product_type": p.get("product_type"),
            "status": p.get("status"),
            "tags": p.get("tags", "").split(", ") if p.get("tags") else [],
            "variants": [
                {
                    "id": v.get("id"),
                    "title": v.get("title"),
                    "sku": v.get("sku"),
                    "price": v.get("price"),
                    "inventory_quantity": v.get("inventory_quantity"),
                    "option1": v.get("option1"),
                }
                for v in p.get("variants", [])
            ],
            "images": [img.get("src") for img in p.get("images", [])],
            "updated_at": p.get("updated_at"),
        }
        return json.dumps(result, ensure_ascii=False)
    except Exception as e:
        logger.error("shopify_get_product error: %s", e)
        return _tool_error(str(e))


async def _handle_list_orders(args: dict, **kw) -> str:
    limit = min(args.get("limit", 50), 250)
    params: Dict[str, Any] = {"limit": limit}
    if args.get("status"):
        params["status"] = args["status"]
    if args.get("financial_status"):
        params["financial_status"] = args["financial_status"]
    if args.get("created_at_min"):
        params["created_at_min"] = args["created_at_min"]
    if args.get("created_at_max"):
        params["created_at_max"] = args["created_at_max"]

    try:
        data = await _shopify_get("orders.json", params)
        orders = data.get("orders", [])
        simplified = []
        for o in orders:
            simplified.append({
                "id": o.get("id"),
                "name": o.get("name"),
                "email": o.get("email"),
                "status": o.get("financial_status"),
                "fulfillment_status": o.get("fulfillment_status"),
                "total_price": o.get("total_price"),
                "currency": o.get("currency"),
                "created_at": o.get("created_at"),
                "line_items_count": len(o.get("line_items", [])),
                "customer": {
                    "id": o.get("customer", {}).get("id"),
                    "first_name": o.get("customer", {}).get("first_name"),
                    "last_name": o.get("customer", {}).get("last_name"),
                } if o.get("customer") else None,
            })
        return json.dumps({
            "orders": simplified,
            "count": len(simplified),
        }, ensure_ascii=False)
    except Exception as e:
        logger.error("shopify_list_orders error: %s", e)
        return _tool_error(str(e))


async def _handle_get_order(args: dict, **kw) -> str:
    order_id = args.get("order_id", "").strip()
    if not order_id:
        return _tool_error("order_id is required.")

    try:
        data = await _shopify_get(f"orders/{order_id}.json")
        o = data.get("order", {})
        result = {
            "id": o.get("id"),
            "name": o.get("name"),
            "email": o.get("email"),
            "financial_status": o.get("financial_status"),
            "fulfillment_status": o.get("fulfillment_status"),
            "total_price": o.get("total_price"),
            "subtotal_price": o.get("subtotal_price"),
            "total_tax": o.get("total_tax"),
            "currency": o.get("currency"),
            "created_at": o.get("created_at"),
            "shipping_address": o.get("shipping_address"),
            "line_items": [
                {
                    "id": li.get("id"),
                    "title": li.get("title"),
                    "quantity": li.get("quantity"),
                    "price": li.get("price"),
                    "sku": li.get("sku"),
                }
                for li in o.get("line_items", [])
            ],
            "customer": {
                "id": o.get("customer", {}).get("id"),
                "first_name": o.get("customer", {}).get("first_name"),
                "last_name": o.get("customer", {}).get("last_name"),
                "email": o.get("customer", {}).get("email"),
            } if o.get("customer") else None,
        }
        return json.dumps(result, ensure_ascii=False)
    except Exception as e:
        logger.error("shopify_get_order error: %s", e)
        return _tool_error(str(e))


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

SHOPIFY_LIST_PRODUCTS_SCHEMA = {
    "name": "shopify_list_products",
    "description": "List Shopify products. Optionally filter by status (active, draft, archived), collection_id, or title search.",
    "parameters": {
        "type": "object",
        "properties": {
            "limit": {"type": "integer", "description": "Max products to return (1-250).", "default": 50},
            "status": {"type": "string", "description": "Filter by status: active, draft, or archived.", "enum": ["active", "draft", "archived"]},
            "collection_id": {"type": "string", "description": "Filter by collection ID."},
            "title": {"type": "string", "description": "Partial title search."},
        },
    },
}

SHOPIFY_GET_PRODUCT_SCHEMA = {
    "name": "shopify_get_product",
    "description": "Get detailed information about a single Shopify product by its numeric ID.",
    "parameters": {
        "type": "object",
        "properties": {
            "product_id": {"type": "string", "description": "The numeric product ID."},
        },
        "required": ["product_id"],
    },
}

SHOPIFY_LIST_ORDERS_SCHEMA = {
    "name": "shopify_list_orders",
    "description": "List Shopify orders. Optionally filter by status, financial_status, or date range.",
    "parameters": {
        "type": "object",
        "properties": {
            "limit": {"type": "integer", "description": "Max orders to return (1-250).", "default": 50},
            "status": {"type": "string", "description": "Filter by order status: open, closed, cancelled, any."},
            "financial_status": {"type": "string", "description": "Filter by financial status: authorized, pending, partially_paid, paid, partially_refunded, refunded, voided, any."},
            "created_at_min": {"type": "string", "description": "Min creation date (ISO 8601)."},
            "created_at_max": {"type": "string", "description": "Max creation date (ISO 8601)."},
        },
    },
}

SHOPIFY_GET_ORDER_SCHEMA = {
    "name": "shopify_get_order",
    "description": "Get detailed information about a single Shopify order by its numeric ID.",
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
    name="shopify_list_products",
    toolset="ecommerce",
    schema=SHOPIFY_LIST_PRODUCTS_SCHEMA,
    handler=_handle_list_products,
    check_fn=_check_shopify_available,
    is_async=True,
    emoji="🛍️",
)

registry.register(
    name="shopify_get_product",
    toolset="ecommerce",
    schema=SHOPIFY_GET_PRODUCT_SCHEMA,
    handler=_handle_get_product,
    check_fn=_check_shopify_available,
    is_async=True,
    emoji="🛍️",
)

registry.register(
    name="shopify_list_orders",
    toolset="ecommerce",
    schema=SHOPIFY_LIST_ORDERS_SCHEMA,
    handler=_handle_list_orders,
    check_fn=_check_shopify_available,
    is_async=True,
    emoji="🛍️",
)

registry.register(
    name="shopify_get_order",
    toolset="ecommerce",
    schema=SHOPIFY_GET_ORDER_SCHEMA,
    handler=_handle_get_order,
    check_fn=_check_shopify_available,
    is_async=True,
    emoji="🛍️",
)
