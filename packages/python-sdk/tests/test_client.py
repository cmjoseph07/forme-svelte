"""Tests for the Forme Python SDK client."""

import json
import unittest
import urllib.error
from io import BytesIO
from unittest.mock import MagicMock, patch

from forme import Forme, FormeError


def _mock_response(body, status=200, content_type="application/json"):
    """Create a mock HTTP response."""
    if isinstance(body, str):
        data = body.encode("utf-8")
    elif isinstance(body, dict):
        data = json.dumps(body).encode("utf-8")
    else:
        data = body

    resp = MagicMock()
    resp.read.return_value = data
    resp.status = status
    resp.headers = {"Content-Type": content_type}
    resp.__enter__ = lambda s: s
    resp.__exit__ = MagicMock(return_value=False)
    return resp


def _mock_http_error(status, body):
    """Create a mock urllib HTTPError."""
    if isinstance(body, dict):
        data = json.dumps(body).encode("utf-8")
    else:
        data = body.encode("utf-8") if isinstance(body, str) else body

    err = urllib.error.HTTPError(
        url="https://api.formepdf.com/test",
        code=status,
        msg="Error",
        hdrs=MagicMock(),  # type: ignore[arg-type]
        fp=BytesIO(data),
    )
    return err


class TestRender(unittest.TestCase):
    """Tests for Forme.render()."""

    @patch("forme.client.urllib.request.urlopen")
    def test_render_returns_pdf_bytes(self, mock_urlopen):
        pdf_bytes = b"%PDF-1.7 fake pdf content"
        mock_urlopen.return_value = _mock_response(
            pdf_bytes, content_type="application/pdf"
        )

        client = Forme("forme_sk_test")
        result = client.render("invoice", {"customer": "Acme"})

        self.assertEqual(result, pdf_bytes)

    @patch("forme.client.urllib.request.urlopen")
    def test_render_sends_correct_headers_and_body(self, mock_urlopen):
        mock_urlopen.return_value = _mock_response(
            b"%PDF", content_type="application/pdf"
        )

        client = Forme("forme_sk_test")
        client.render("invoice", {"customer": "Acme"})

        req = mock_urlopen.call_args[0][0]
        self.assertEqual(req.get_method(), "POST")
        self.assertTrue(req.full_url.endswith("/v1/render/invoice"))
        self.assertEqual(req.get_header("Authorization"), "Bearer forme_sk_test")
        self.assertEqual(req.get_header("Content-type"), "application/json")

        body = json.loads(req.data)
        self.assertEqual(body, {"customer": "Acme"})

    @patch("forme.client.urllib.request.urlopen")
    def test_render_with_s3_returns_url(self, mock_urlopen):
        mock_urlopen.return_value = _mock_response(
            {"url": "https://s3.example.com/invoice.pdf"},
            content_type="application/json",
        )

        client = Forme("forme_sk_test")
        s3_opts = {"bucket": "my-bucket", "key": "invoice.pdf",
                    "accessKeyId": "AK", "secretAccessKey": "SK"}
        result = client.render("invoice", {"customer": "Acme"}, s3=s3_opts)

        self.assertEqual(result, {"url": "https://s3.example.com/invoice.pdf"})

        req = mock_urlopen.call_args[0][0]
        body = json.loads(req.data)
        self.assertEqual(body["s3"]["bucket"], "my-bucket")
        self.assertEqual(body["customer"], "Acme")

    @patch("forme.client.urllib.request.urlopen")
    def test_render_raises_on_404(self, mock_urlopen):
        mock_urlopen.side_effect = _mock_http_error(
            404, {"error": "Template not found"}
        )

        client = Forme("forme_sk_test")
        with self.assertRaises(FormeError) as ctx:
            client.render("missing")

        self.assertEqual(ctx.exception.status, 404)
        self.assertEqual(ctx.exception.message, "Template not found")

    @patch("forme.client.urllib.request.urlopen")
    def test_render_raises_on_429(self, mock_urlopen):
        mock_urlopen.side_effect = _mock_http_error(
            429, {"error": "Rate limit exceeded"}
        )

        client = Forme("forme_sk_test")
        with self.assertRaises(FormeError) as ctx:
            client.render("invoice")

        self.assertEqual(ctx.exception.status, 429)

    @patch("forme.client.urllib.request.urlopen")
    def test_render_raises_on_500(self, mock_urlopen):
        mock_urlopen.side_effect = _mock_http_error(
            500, {"message": "Internal server error"}
        )

        client = Forme("forme_sk_test")
        with self.assertRaises(FormeError) as ctx:
            client.render("invoice")

        self.assertEqual(ctx.exception.status, 500)
        self.assertEqual(ctx.exception.message, "Internal server error")


class TestRenderAsync(unittest.TestCase):
    """Tests for Forme.render_async()."""

    @patch("forme.client.urllib.request.urlopen")
    def test_render_async_returns_job(self, mock_urlopen):
        mock_urlopen.return_value = _mock_response(
            {"jobId": "job-123", "status": "pending"}
        )

        client = Forme("forme_sk_test")
        result = client.render_async("invoice", {"customer": "Acme"})

        self.assertEqual(result["jobId"], "job-123")
        self.assertEqual(result["status"], "pending")

    @patch("forme.client.urllib.request.urlopen")
    def test_render_async_sends_webhook_url(self, mock_urlopen):
        mock_urlopen.return_value = _mock_response(
            {"jobId": "job-456", "status": "pending"}
        )

        client = Forme("forme_sk_test")
        client.render_async("invoice", {"x": 1}, webhook_url="https://hook.example.com")

        req = mock_urlopen.call_args[0][0]
        self.assertTrue(req.full_url.endswith("/v1/render/invoice/async"))
        body = json.loads(req.data)
        self.assertEqual(body["webhookUrl"], "https://hook.example.com")
        self.assertEqual(body["x"], 1)

    @patch("forme.client.urllib.request.urlopen")
    def test_render_async_raises_on_error(self, mock_urlopen):
        mock_urlopen.side_effect = _mock_http_error(
            500, {"error": "Render failed"}
        )

        client = Forme("forme_sk_test")
        with self.assertRaises(FormeError) as ctx:
            client.render_async("invoice")

        self.assertEqual(ctx.exception.status, 500)


class TestGetJob(unittest.TestCase):
    """Tests for Forme.get_job()."""

    @patch("forme.client.urllib.request.urlopen")
    def test_get_job_returns_result(self, mock_urlopen):
        mock_urlopen.return_value = _mock_response({
            "id": "job-123",
            "status": "complete",
            "pdfBase64": "JVBER...",
        })

        client = Forme("forme_sk_test")
        result = client.get_job("job-123")

        self.assertEqual(result["id"], "job-123")
        self.assertEqual(result["status"], "complete")
        self.assertIn("pdfBase64", result)

    @patch("forme.client.urllib.request.urlopen")
    def test_get_job_sends_auth_header(self, mock_urlopen):
        mock_urlopen.return_value = _mock_response({"id": "job-1", "status": "pending"})

        client = Forme("forme_sk_secret")
        client.get_job("job-1")

        req = mock_urlopen.call_args[0][0]
        self.assertEqual(req.get_header("Authorization"), "Bearer forme_sk_secret")
        self.assertEqual(req.get_method(), "GET")
        self.assertTrue(req.full_url.endswith("/v1/jobs/job-1"))

    @patch("forme.client.urllib.request.urlopen")
    def test_get_job_raises_on_404(self, mock_urlopen):
        mock_urlopen.side_effect = _mock_http_error(
            404, {"error": "Job not found"}
        )

        client = Forme("forme_sk_test")
        with self.assertRaises(FormeError) as ctx:
            client.get_job("nonexistent")

        self.assertEqual(ctx.exception.status, 404)


class TestExtract(unittest.TestCase):
    """Tests for Forme.extract()."""

    @patch("forme.client.urllib.request.urlopen")
    def test_extract_returns_data(self, mock_urlopen):
        mock_urlopen.return_value = _mock_response(
            {"data": {"customer": "Acme", "total": 100}}
        )

        client = Forme("forme_sk_test")
        result = client.extract(b"%PDF-fake")

        self.assertEqual(result, {"customer": "Acme", "total": 100})

    @patch("forme.client.urllib.request.urlopen")
    def test_extract_returns_none_on_no_embedded_data(self, mock_urlopen):
        mock_urlopen.side_effect = _mock_http_error(
            404, {"error": "No embedded data found"}
        )

        client = Forme("forme_sk_test")
        result = client.extract(b"%PDF-fake")

        self.assertIsNone(result)

    @patch("forme.client.urllib.request.urlopen")
    def test_extract_raises_on_other_errors(self, mock_urlopen):
        mock_urlopen.side_effect = _mock_http_error(
            500, {"error": "Server error"}
        )

        client = Forme("forme_sk_test")
        with self.assertRaises(FormeError) as ctx:
            client.extract(b"%PDF-fake")

        self.assertEqual(ctx.exception.status, 500)

    @patch("forme.client.urllib.request.urlopen")
    def test_extract_sends_pdf_content_type(self, mock_urlopen):
        mock_urlopen.return_value = _mock_response({"data": {}})

        client = Forme("forme_sk_test")
        client.extract(b"%PDF-fake")

        req = mock_urlopen.call_args[0][0]
        self.assertEqual(req.get_header("Content-type"), "application/pdf")
        self.assertEqual(req.data, b"%PDF-fake")


class TestBaseUrl(unittest.TestCase):
    """Tests for base_url handling."""

    @patch("forme.client.urllib.request.urlopen")
    def test_custom_base_url(self, mock_urlopen):
        mock_urlopen.return_value = _mock_response(
            b"%PDF", content_type="application/pdf"
        )

        client = Forme("sk", base_url="https://custom.example.com")
        client.render("tpl")

        req = mock_urlopen.call_args[0][0]
        self.assertTrue(req.full_url.startswith("https://custom.example.com/"))

    @patch("forme.client.urllib.request.urlopen")
    def test_trailing_slash_stripped(self, mock_urlopen):
        mock_urlopen.return_value = _mock_response(
            b"%PDF", content_type="application/pdf"
        )

        client = Forme("sk", base_url="https://api.formepdf.com/")
        client.render("tpl")

        req = mock_urlopen.call_args[0][0]
        self.assertIn("/v1/render/tpl", req.full_url)
        self.assertNotIn("//v1", req.full_url)


class TestErrorFallback(unittest.TestCase):
    """Test error message fallback when JSON parsing fails."""

    @patch("forme.client.urllib.request.urlopen")
    def test_non_json_error_body(self, mock_urlopen):
        mock_urlopen.side_effect = _mock_http_error(502, "Bad Gateway")

        client = Forme("forme_sk_test")
        with self.assertRaises(FormeError) as ctx:
            client.render("invoice")

        self.assertEqual(ctx.exception.status, 502)
        self.assertEqual(ctx.exception.message, "Request failed with status 502")


if __name__ == "__main__":
    unittest.main()
