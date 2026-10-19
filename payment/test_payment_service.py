import json
import unittest
from http.client import HTTPConnection
from threading import Thread
from unittest.mock import patch

from payment_service import PaymentHandler, ThreadingHTTPServer, process_payment


class PaymentLogicTests(unittest.TestCase):
    @patch("payment_service.random.random", return_value=0.1)
    def test_successful_payment(self, _random):
        status, response = process_payment(125.50)

        self.assertEqual(status, 200)
        self.assertEqual(response["status"], "success")
        self.assertEqual(response["amount"], 125.50)
        self.assertTrue(response["transaction_id"].startswith("txn_"))

    @patch("payment_service.random.random", return_value=0.9)
    def test_insufficient_funds_payment(self, _random):
        status, response = process_payment(125.50)

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

    def post(self, payload):
        connection = HTTPConnection("127.0.0.1", self.server.server_port)
        connection.request(
            "POST",
            "/pay",
            body=json.dumps(payload),
            headers={"Content-Type": "application/json"},
        )
        response = connection.getresponse()
        body = json.loads(response.read())
        connection.close()
        return response.status, body

    def test_invalid_amount_is_rejected(self):
        status, body = self.post({"amount": 0})

        self.assertEqual(status, 400)
        self.assertEqual(body["error"], "amount must be a positive number")

    @patch("payment_service.random.random", return_value=0.1)
    def test_pay_endpoint_returns_json(self, _random):
        status, body = self.post({"amount": 99.99})

        self.assertEqual(status, 200)
        self.assertEqual(body["status"], "success")
        self.assertEqual(body["amount"], 99.99)


if __name__ == "__main__":
    unittest.main()