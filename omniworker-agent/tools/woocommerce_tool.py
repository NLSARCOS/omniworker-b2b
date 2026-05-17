"""WooCommerce integration tool for the OmniWorker agent.

Reads credentials from environment variables:
  WOOCOMMERCE_STORE_URL   (e.g. https://my-store.com)
  WOOCOMMERCE_CONSUMER_KEY
  WOOCOMMERCE_CONSUMER_SECRET

Exposes LLM-callable tools:
  woocommerce_list_products  -- list products with filters
  woocommerce_get_product    -- get a single product by ID
  woocommerce_list_orders    -- list orders with filters
  woocommerce_get_order      -- get a single order by ID
"""

import json
import logging
import os
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

def _get_config() -> tuple[str, str, str]:
    """Return (store_url, consumer_key, consumer_secret)."""
    url = os.getenv("WOOCOMMERCE_STORE_URL", "").strip()
    key = os.getenv("WOOCOMMERCE_CONSUMER_KEY", "").strip()
    secret = os.getenv("WOOCOMMERCE_CONSUMER_SECRET", "").strip()
    if url and not url.startswith(("http://", "https://")):
        url = f"https://{url}"
    return url.rstrip("/"), key, secret


def _check_woocommerce_available() -> bool:
    url, key, secret = _get_config()
    return bool(url and key and secret)


# ---------------------------------------------------------------------------
# Async helpers
# ---------------------------------------------------------------------------

def _tool_error(msg: str) -> str:
    from tools.registry import tool_error
    return tool_error(msg)


async def _wc_get(path: str, params: Optional[Dict[str, Any]] = None) -> Any:
    import httpx
    url, key, secret = _get_config()
    if not url or not key or not secret:
        raise RuntimeError("WooCommerce credentials not configured. Set WOOCOMMERCE_STORE_URL, WOOCOMMERCE_CONSUMER_KEY and WOOCOMMERCE_CONSUMER_SECRET.")

    full_url = f"{url}/wp-json/wc/v3/{path.lstrip('/')}"
    query = params or {}
    query["consumer_key"] = key
    query["consumer_secret"] = secret

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(full_url, params=query)
        if resp.status_code == 401:
            raise RuntimeError("WooCommerce authentication failed. Check your consumer key and secret.")
        if resp.status_code == 404:
            raise RuntimeError(f"WooCommerce resource not found: {path}")
        resp.raise_for_status()
        return resp.json()


# ---------------------------------------------------------------------------
# Handlers
# ---------------------------------------------------------------------------

async def _handle_list_products(args: dict, **kw) -> str:
    per_page = min(args.get("limit", 50), 100)
    params: Dict[str, Any] = {"per_page": per_page}
    if args.get("status"):
        params["status"] = args["status"]
    if args.get("search"):
        params["search"] = args["search"]
    if args.get("category"):
        params["category"] = args["category"]

    try:
        products = await _wc_get("products", params)
        simplified = []
        for p in products:
            simplified.append({
                "id": p.get("id"),
                "name": p.get("name"),
                "slug": p.get("slug"),
                "status": p.get("status"),
                "type": p.get("type"),
                "price": p.get("price"),
                "regular_price": p.get("regular_price"),
                "sale_price": p.get("sale_price"),
                "stock_quantity": p.get("stock_quantity"),
                "stock_status": p.get("stock_status"),
                "sku": p.get("sku"),
                "categories": [c.get("name") for c in p.get("categories", [])],
            })
        return json.dumps({
            "products": simplified,
            "count": len(simplified),
        }, ensure_ascii=False)
    except Exception as e:
        logger.error("woocommerce_list_products error: %s", e)
        return _tool_error(str(e))


async def _handle_get_product(args: dict, **kw) -> str:
    product_id = args.get("product_id", "").strip()
    if not product_id:
        return _tool_error("product_id is required.")

    try:
        p = await _wc_get(f"products/{product_id}")
        result = {
            "id": p.get("id"),
            "name": p.get("name"),
            "description": p.get("description", ""),
            "short_description": p.get("short_description", ""),
            "status": p.get("status"),
            "type": p.get("type"),
            "price": p.get("price"),
            "regular_price": p.get("regular_price"),
            "sale_price": p.get("sale_price"),
            "stock_quantity": p.get("stock_quantity"),
            "stock_status": p.get("stock_status"),
            "sku": p.get("sku"),
            "weight": p.get("weight"),
            "categories": [c.get("name") for c in p.get("categories", [])],
            "tags": [t.get("name") for t in p.get("tags", [])],
            "images": [img.get("src") for img in p.get("images", [])],
        }
        return json.dumps(result, ensure_ascii=False)
    except Exception as e:
        logger.error("woocommerce_get_product error: %s", e)
        return _tool_error(str(e))


async def _handle_list_orders(args: dict, **kw) -> str:
    per_page = min(args.get("limit", 50), 100)
    params: Dict[str, Any] = {"per_page": per_page}
    if args.get("status"):
        params["status"] = args["status"]
    if args.get("customer"):
        params["customer"] = args["customer"]
    if args.get("after"):
        params["after"] = args["after"]
    if args.get("before"):
        params["before"] = args["before"]

    try:
        orders = await _wc_get("orders", params)
        simplified = []
        for o in orders:
            simplified.append({
                "id": o.get("id"),
                "status": o.get("status"),
                "total": o.get("total"),
                "currency": o.get("currency"),
                "date_created": o.get("date_created"),
                "customer_id": o.get("customer_id"),
                "billing": {
                    "first_name": o.get("billing", {}).get("first_name"),
                    "last_name": o.get("billing", {}).get("last_name"),
                    "email": o.get("billing", {}).get("email"),
                    "phone": o.get("billing", {}).get("phone"),
                },
                "line_items_count": len(o.get("line_items", [])),
            })
        return json.dumps({
            "orders": simplified,
            "count": len(simplified),
        }, ensure_ascii=False)
    except Exception as e:
        logger.error("woocommerce_list_orders error: %s", e)
        return _tool_error(str(e))


async def _handle_get_order(args: dict, **kw) -> str:
    order_id = args.get("order_id", "").strip()
    if not order_id:
        return _tool_error("order_id is required.")

    try:
        o = await _wc_get(f"orders/{order_id}")
        result = {
            "id": o.get("id"),
            "status": o.get("status"),
            "total": o.get("total"),
            "subtotal": o.get("subtotal"),
            "discount_total": o.get("discount_total"),
            "shipping_total": o.get("shipping_total"),
            "total_tax": o.get("total_tax"),
            "currency": o.get("currency"),
            "date_created": o.get("date_created"),
            "customer_id": o.get("customer_id"),
            "billing": o.get("billing"),
            "shipping": o.get("shipping"),
            "line_items": [
                {
                    "id": li.get("id"),
                    "name": li.get("name"),
                    "quantity": li.get("quantity"),
                    "price": li.get("price"),
                    "sku": li.get("sku"),
                }
                for li in o.get("line_items", [])
            ],
            "payment_method_title": o.get("payment_method_title"),
        }
        return json.dumps(result, ensure_ascii=False)
    except Exception as e:
        logger.error("woocommerce_get_order error: %s", e)
        return _tool_error(str(e))


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

WOOCOMMERCE_LIST_PRODUCTS_SCHEMA = {
    "name": "woocommerce_list_products",
    "description": "List WooCommerce products. Optionally filter by status, search term, or category.",
    "parameters": {
        "type": "object",
        "properties": {
            "limit": {"type": "integer", "description": "Max products to return (1-100).", "default": 50},
            "status": {"type": "string", "description": "Filter by status: publish, draft, pending, private.", "enum": ["publish", "draft", "pending", "private"]},
            "search": {"type": "string", "description": "Search term."},
            "category": {"type": "string", "description": "Category slug or ID."},
        },
    },
}

WOOCOMMERCE_GET_PRODUCT_SCHEMA = {
    "name": "woocommerce_get_product",
    "description": "Get detailed information about a single WooCommerce product by its numeric ID.",
    "parameters": {
        "type": "object",
        "properties": {
            "product_id": {"type": "string", "description": "The numeric product ID."},
        },
        "required": ["product_id"],
    },
}

WOOCOMMERCE_LIST_ORDERS_SCHEMA = {
    "name": "woocommerce_list_orders",
    "description": "List WooCommerce orders. Optionally filter by status, customer ID, or date range.",
    "parameters": {
        "type": "object",
        "properties": {
            "limit": {"type": "integer", "description": "Max orders to return (1-100).", "default": 50},
            "status": {"type": "string", "description": "Filter by status: pending, processing, on-hold, completed, cancelled, refunded, failed, checkout-draft."},
            "customer": {"type": "string", "description": "Filter by customer ID."},
            "after": {"type": "string", "description": "Filter orders created after this ISO 8601 date."},
            "before": {"type": "string", "description": "Filter orders created before this ISO 8601 date."},
        },
    },
}

WOOCOMMERCE_GET_ORDER_SCHEMA = {
    "name": "woocommerce_get_order",
    "description": "Get detailed information about a single WooCommerce order by its numeric ID.",
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
    name="woocommerce_list_products",
    toolset="ecommerce",
    schema=WOOCOMMERCE_LIST_PRODUCTS_SCHEMA,
    handler=_handle_list_products,
    check_fn=_check_woocommerce_available,
    is_async=True,
    emoji="🛒",
)

registry.register(
    name="woocommerce_get_product",
    toolset="ecommerce",
    schema=WOOCOMMERCE_GET_PRODUCT_SCHEMA,
    handler=_handle_get_product,
    check_fn=_check_woocommerce_available,
    is_async=True,
    emoji="🛒",
)

registry.register(
    name="woocommerce_list_orders",
    toolset="ecommerce",
    schema=WOOCOMMERCE_LIST_ORDERS_SCHEMA,
    handler=_handle_list_orders,
    check_fn=_check_woocommerce_available,
    is_async=True,
    emoji="🛒",
)

registry.register(
    name="woocommerce_get_order",
    toolset="ecommerce",
    schema=WOOCOMMERCE_GET_ORDER_SCHEMA,
    handler=_handle_get_order,
    check_fn=_check_woocommerce_available,
    is_async=True,
    emoji="🛒",
)
