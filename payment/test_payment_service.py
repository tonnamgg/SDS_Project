import json
import unittest
from http.client import HTTPConnection
from threading import Thread
from unittest.mock import patch

from payment_service import (
    PaymentHandler,
    ProductCatalogError,
    ThreadingHTTPServer,
    add_balance,
    get_balance,
    process_payment,
)


class PaymentLogicTests(unittest.TestCase):
    def test_successful_payment_when_amount_is_within_balance(self):
        status, response = process_payment(125.50, available_balance=125.50)

        self.assertEqual(status, 200)
        self.assertEqual(response["status"], "success")
        self.assertEqual(response["amount"], 125.50)
        self.assertTrue(response["transaction_id"].startswith("txn_"))

    def test_insufficient_funds_when_amount_exceeds_balance(self):
        status, response = process_payment(125.50, available_balance=125.49)

        self.assertEqual(status, 402)
        self.assertEqual(response["status"], "failed")
        self.assertEqual(response["reason"], "insufficient_funds")
        self.assertTrue(response["transaction_id"].startswith("txn_"))


class PaymentHttpTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), PaymentHandler)
        cls.thread = Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()

    def post(self, payload, path="/api/payment"):
        connection = HTTPConnection("127.0.0.1", self.server.server_port)
        connection.request(
            "POST",
            path,
            body=json.dumps(payload),
            headers={"Content-Type": "application/json"},
        )
        response = connection.getresponse()
        body = json.loads(response.read())
        connection.close()
        return response.status, body

    def get(self, path):
        connection = HTTPConnection("127.0.0.1", self.server.server_port)
        connection.request("GET", path)
        response = connection.getresponse()
        body = json.loads(response.read())
        connection.close()
        return response.status, body

    def test_balance_endpoint_returns_current_balance(self):
        status, body = self.get("/api/payment/balance")

        self.assertEqual(status, 200)
        self.assertEqual(body["balance"], get_balance())

    def test_balance_can_be_added(self):
        starting_balance = get_balance()
        status, body = self.post(
            {"amount": 250.00}, path="/api/payment/balance"
        )

        self.assertEqual(status, 200)
        self.assertEqual(body["added_amount"], 250.00)
        self.assertEqual(body["balance"], round(starting_balance + 250.00, 2))

    def test_invalid_balance_top_up_is_rejected(self):
        status, body = self.post(
            {"amount": 0}, path="/api/payment/balance"
        )

        self.assertEqual(status, 400)
        self.assertEqual(body["error"], "amount must be a positive number")

    def test_invalid_quantity_is_rejected(self):
        status, body = self.post({"sku": "CPU-INT-14900K", "quantity": 0})

        self.assertEqual(status, 400)
        self.assertIn("quantity must be positive", body["error"])

    @patch("payment_service.fetch_product_price", return_value=49.99)
    def test_payment_endpoint_calculates_amount_from_catalog_price(self, _fetch_price):
        starting_balance = get_balance()
        status, body = self.post({"sku": "RAM-32GB", "quantity": 2})

        self.assertEqual(status, 200)
        self.assertEqual(body["status"], "success")
        self.assertEqual(body["sku"], "RAM-32GB")
        self.assertEqual(body["quantity"], 2)
        self.assertEqual(body["unit_price"], 49.99)
        self.assertEqual(body["amount"], 99.98)
        self.assertEqual(body["remaining_balance"], round(starting_balance - 99.98, 2))

    @patch("payment_service.fetch_product_price", side_effect=ProductCatalogError)
    def test_catalog_failure_is_reported(self, _fetch_price):
        status, body = self.post({"sku": "RAM-32GB", "quantity": 2})

        self.assertEqual(status, 502)
        self.assertEqual(body["error"], "product_catalog_unavailable")


if __name__ == "__main__":
    unittest.main()