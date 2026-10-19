"""Payment mock service.

Run with:
    python payment_service.py
"""

from __future__ import annotations

import json
import math
import os
import uuid
from dotenv import load_dotenv
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Lock
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

load_dotenv()

HOST = os.getenv("PAYMENT_HOST", "0.0.0.0")
PORT = int(os.getenv("PAYMENT_PORT", "8082"))
AVAILABLE_BALANCE = float(os.getenv("PAYMENT_BALANCE", "100000.00"))
PRODUCT_CATALOG_URL = os.getenv("PRODUCT_CATALOG_URL", "http://localhost:3000")
current_balance = AVAILABLE_BALANCE
balance_lock = Lock()


class ProductCatalogError(Exception):
    """Raised when the product catalog cannot provide product data."""


class ProductNotFoundError(ProductCatalogError):
    """Raised when the requested SKU does not exist in the catalog."""


class ProductStockError(ProductCatalogError):
    """Raised when the requested quantity exceeds the available stock."""


def fetch_product(sku: str, catalog_url: str | None = None) -> dict[str, Any]:
    """Fetch a complete product record for a SKU from the Product Catalog."""
    if catalog_url is None:
        catalog_url = PRODUCT_CATALOG_URL

    products_url = f"{catalog_url.rstrip('/')}/api/products"
    try:
        with urlopen(products_url, timeout=5) as response:
            products = json.load(response)
    except (HTTPError, URLError, TimeoutError, json.JSONDecodeError) as error:
        raise ProductCatalogError from error

    if not isinstance(products, list):
        raise ProductCatalogError

    for product in products:
        if not isinstance(product, dict) or product.get("sku") != sku:
            continue

        return product

    raise ProductNotFoundError


def update_product_stock(
    product: dict[str, Any], quantity: int, catalog_url: str | None = None
) -> int:
    """Subtract quantity from the catalog product and return remaining stock."""
    if catalog_url is None:
        catalog_url = PRODUCT_CATALOG_URL

    stock = product.get("stock")
    if isinstance(stock, bool) or not isinstance(stock, int) or stock < quantity:
        raise ProductStockError

    updated_product = dict(product)
    remaining_stock = stock - quantity
    updated_product["stock"] = remaining_stock
    updated_product["status"] = "Out of Stock" if remaining_stock == 0 else "Active"
    product_url = (
        f"{catalog_url.rstrip('/')}/api/admin/products/"
        f"{quote(str(product['sku']), safe='')}"
    )
    request = Request(
        product_url,
        data=json.dumps(updated_product).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="PUT",
    )

    try:
        with urlopen(request, timeout=5) as response:
            if response.status >= 400:
                raise ProductCatalogError
    except (HTTPError, URLError, TimeoutError) as error:
        raise ProductCatalogError from error

    return remaining_stock


def process_payment(
    amount: float, available_balance: float | None = None
) -> tuple[HTTPStatus, dict[str, Any]]:
    """Process a payment and deduct it from the service balance."""
    global current_balance

    transaction_id = f"txn_{uuid.uuid4().hex[:12]}"

    if available_balance is not None:
        if amount <= available_balance:
            return HTTPStatus.OK, {
                "status": "success",
                "transaction_id": transaction_id,
                "amount": amount,
                "remaining_balance": round(available_balance - amount, 2),
            }
        balance = available_balance
    else:
        with balance_lock:
            if amount <= current_balance:
                current_balance -= amount
                return HTTPStatus.OK, {
                    "status": "success",
                    "transaction_id": transaction_id,
                    "amount": amount,
                    "remaining_balance": round(current_balance, 2),
                }
            balance = current_balance

    return HTTPStatus.PAYMENT_REQUIRED, {
        "status": "failed",
        "reason": "insufficient_funds",
        "transaction_id": transaction_id,
        "amount": amount,
        "remaining_balance": round(balance, 2),
    }


def get_balance() -> float:
    """Return the current available payment balance."""
    with balance_lock:
        return round(current_balance, 2)


def add_balance(amount: float) -> float:
    """Add funds and return the new available payment balance."""
    global current_balance

    with balance_lock:
        current_balance = round(current_balance + amount, 2)
        return current_balance


def refund_balance(amount: float) -> float:
    """Return funds to the balance when a payment cannot be completed."""
    return add_balance(amount)


class PaymentHandler(BaseHTTPRequestHandler):
    """Handle the payment mock HTTP API."""

    def do_GET(self) -> None:  # noqa: N802 - required by BaseHTTPRequestHandler
        if self.path == "/api/payment/balance":
            self._send_json(HTTPStatus.OK, {"balance": get_balance()})
            return

        self._send_json(HTTPStatus.NOT_FOUND, {"error": "not_found"})

    def do_POST(self) -> None:  # noqa: N802 - required by BaseHTTPRequestHandler
        if self.path == "/api/payment/balance":
            self._handle_balance_top_up()
            return

        if self.path != "/api/payment":
            self._send_json(HTTPStatus.NOT_FOUND, {"error": "not_found"})
            return

        try:
            content_length = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(content_length))
            sku = payload["sku"]
            quantity = payload["quantity"]
            if not isinstance(sku, str) or not sku.strip():
                raise ValueError
            if isinstance(quantity, bool) or not isinstance(quantity, int):
                raise ValueError
            if quantity <= 0:
                raise ValueError
        except (TypeError, ValueError, KeyError, json.JSONDecodeError):
            self._send_json(
                HTTPStatus.BAD_REQUEST,
                {"error": "sku and quantity must be provided; quantity must be positive"},
            )
            return

        try:
            product = fetch_product(sku)
        except ProductNotFoundError:
            self._send_json(HTTPStatus.NOT_FOUND, {"error": "product_not_found"})
            return
        except ProductCatalogError:
            self._send_json(
                HTTPStatus.BAD_GATEWAY,
                {"error": "product_catalog_unavailable"},
            )
            return

        price = product.get("price")
        if isinstance(price, bool) or not isinstance(price, (int, float)):
            self._send_json(HTTPStatus.BAD_GATEWAY, {"error": "invalid_product_data"})
            return
        unit_price = float(price)
        if not math.isfinite(unit_price) or unit_price <= 0:
            self._send_json(HTTPStatus.BAD_GATEWAY, {"error": "invalid_product_data"})
            return

        stock = product.get("stock")
        if isinstance(stock, bool) or not isinstance(stock, int):
            self._send_json(HTTPStatus.BAD_GATEWAY, {"error": "invalid_product_data"})
            return
        if quantity > stock:
            self._send_json(HTTPStatus.CONFLICT, {"error": "insufficient_stock"})
            return

        amount = unit_price * quantity
        status, response = process_payment(amount)
        if status != HTTPStatus.OK:
            response.update({"sku": sku, "quantity": quantity, "unit_price": unit_price})
            self._send_json(status, response)
            return

        try:
            remaining_stock = update_product_stock(product, quantity)
        except ProductCatalogError:
            refund_balance(amount)
            self._send_json(
                HTTPStatus.BAD_GATEWAY,
                {"error": "product_catalog_update_failed"},
            )
            return

        response.update(
            {
                "sku": sku,
                "quantity": quantity,
                "unit_price": unit_price,
                "remaining_stock": remaining_stock,
            }
        )
        self._send_json(status, response)

    def _handle_balance_top_up(self) -> None:
        try:
            content_length = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(content_length))
            amount = payload["amount"]
            if isinstance(amount, bool) or not isinstance(amount, (int, float)):
                raise ValueError
            amount = float(amount)
            if not math.isfinite(amount) or amount <= 0:
                raise ValueError
        except (TypeError, ValueError, KeyError, json.JSONDecodeError):
            self._send_json(
                HTTPStatus.BAD_REQUEST,
                {"error": "amount must be a positive number"},
            )
            return

        self._send_json(
            HTTPStatus.OK,
            {"added_amount": amount, "balance": add_balance(amount)},
        )

    def _send_json(self, status: HTTPStatus, payload: dict[str, Any]) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format: str, *args: Any) -> None:
        """Keep request logs concise and compatible with the default server logs."""
        super().log_message(format, *args)


def main() -> None:
    server = ThreadingHTTPServer((HOST, PORT), PaymentHandler)
    print(f"Payment mock listening on http://{HOST}:{PORT}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()