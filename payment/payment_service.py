"""Payment mock service.

Run with:
    python payment_service.py
"""

from __future__ import annotations

import json
import math
import os
import random
import uuid
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any


HOST = os.getenv("PAYMENT_HOST", "0.0.0.0")
PORT = int(os.getenv("PAYMENT_PORT", "8082"))
SUCCESS_PROBABILITY = 0.8


def process_payment(amount: float) -> tuple[HTTPStatus, dict[str, Any]]:
    """Return a randomized mock payment result for a valid amount."""
    transaction_id = f"txn_{uuid.uuid4().hex[:12]}"

    if random.random() < SUCCESS_PROBABILITY:
        return HTTPStatus.OK, {
            "status": "success",
            "transaction_id": transaction_id,
            "amount": amount,
        }

    return HTTPStatus.PAYMENT_REQUIRED, {
        "status": "failed",
        "reason": "insufficient_funds",
        "transaction_id": transaction_id,
        "amount": amount,
    }


class PaymentHandler(BaseHTTPRequestHandler):
    """Handle the payment mock HTTP API."""

    def do_POST(self) -> None:  # noqa: N802 - required by BaseHTTPRequestHandler
        if self.path != "/pay":
            self._send_json(HTTPStatus.NOT_FOUND, {"error": "not_found"})
            return

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

        status, response = process_payment(amount)
        self._send_json(status, response)

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