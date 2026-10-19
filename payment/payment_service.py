"""Payment mock service.

Run with:
    python payment_service.py
"""

from __future__ import annotations

import json
import math
import os
import uuid
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Lock
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import urlopen


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


def fetch_product_price(sku: str, catalog_url: str | None = None) -> float:
    """Fetch and return the price for a SKU from the Product Catalog."""
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

        price = product.get("price")
        if isinstance(price, bool) or not isinstance(price, (int, float)):
            raise ProductCatalogError
        price = float(price)
        if not math.isfinite(price) or price <= 0:
            raise ProductCatalogError
        return price

    raise ProductNotFoundError


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
            unit_price = fetch_product_price(sku)
        except ProductNotFoundError:
            self._send_json(HTTPStatus.NOT_FOUND, {"error": "product_not_found"})
            return
        except ProductCatalogError:
            self._send_json(
                HTTPStatus.BAD_GATEWAY,
                {"error": "product_catalog_unavailable"},
            )
            return

        amount = unit_price * quantity
        status, response = process_payment(amount)
        response.update({"sku": sku, "quantity": quantity, "unit_price": unit_price})
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