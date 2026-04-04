"""Forme API client. Zero dependencies — uses stdlib urllib + json."""

import base64
import json
import urllib.error
import urllib.request
from typing import Any, Dict, List, Optional, Sequence, Union


class FormeError(Exception):
    """Raised on non-2xx responses from the Forme API."""

    def __init__(self, status: int, message: str) -> None:
        self.status = status
        self.message = message
        super().__init__(message)


class Forme:
    """Client for the Forme hosted PDF API.

    Args:
        api_key: API key (e.g. ``"forme_sk_..."``).
        base_url: Base URL of the API. Defaults to ``https://api.formepdf.com``.
    """

    def __init__(
        self,
        api_key: str,
        base_url: str = "https://api.formepdf.com",
    ) -> None:
        self._api_key = api_key
        self._base_url = base_url.rstrip("/")

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def render(
        self,
        slug: str,
        data: Any = None,
        *,
        s3: Optional[Dict[str, Any]] = None,
    ) -> Union[bytes, Dict[str, Any]]:
        """Render a template to PDF (synchronous).

        Returns raw PDF bytes, or a dict with ``{"url": "..."}`` when *s3*
        is provided.
        """
        body: Dict[str, Any] = dict(data) if data is not None else {}
        if s3 is not None:
            body["s3"] = s3

        resp_body, content_type = self._request(
            "POST",
            "/v1/render/{}".format(slug),
            body=body,
        )

        if content_type is not None and "application/json" in content_type:
            return json.loads(resp_body)  # type: ignore[no-any-return]
        return resp_body

    def render_async(
        self,
        slug: str,
        data: Any = None,
        *,
        webhook_url: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Start an asynchronous render job.

        Returns ``{"jobId": "...", "status": "pending"}``.
        """
        body: Dict[str, Any] = dict(data) if data is not None else {}
        if webhook_url is not None:
            body["webhookUrl"] = webhook_url

        resp_body, _ = self._request(
            "POST",
            "/v1/render/{}/async".format(slug),
            body=body,
        )
        return json.loads(resp_body)  # type: ignore[no-any-return]

    def get_job(self, job_id: str) -> Dict[str, Any]:
        """Poll the status of an async render job."""
        resp_body, _ = self._request("GET", "/v1/jobs/{}".format(job_id))
        return json.loads(resp_body)  # type: ignore[no-any-return]

    def certify(
        self,
        pdf: bytes,
        *,
        certificate: Optional[str] = None,
        private_key: Optional[str] = None,
        certificate_pem: Optional[str] = None,
        private_key_pem: Optional[str] = None,
        certificate_id: Optional[str] = None,
        reason: Optional[str] = None,
        location: Optional[str] = None,
        contact: Optional[str] = None,
    ) -> bytes:
        """Certify a PDF with a PKCS#7 digital signature.

        Pass either ``certificate``/``private_key`` PEM strings, or
        ``certificate_id`` for a saved certificate on the hosted API.
        ``certificate_pem``/``private_key_pem`` are accepted as aliases.

        Returns certified PDF bytes.
        """
        body: Dict[str, Any] = {
            "pdf": base64.b64encode(pdf).decode("ascii"),
        }
        cert = certificate or certificate_pem
        key = private_key or private_key_pem
        if cert is not None:
            body["certificate"] = cert
        if key is not None:
            body["privateKey"] = key
        if certificate_id is not None:
            body["certificateId"] = certificate_id
        if reason is not None:
            body["reason"] = reason
        if location is not None:
            body["location"] = location
        if contact is not None:
            body["contact"] = contact

        resp_body, _ = self._request("POST", "/v1/certify", body=body)
        return resp_body

    def redact(
        self,
        pdf: bytes,
        *,
        redactions: Optional[List[Dict[str, Any]]] = None,
        patterns: Optional[List[Dict[str, Any]]] = None,
        presets: Optional[List[str]] = None,
        template: Optional[str] = None,
    ) -> bytes:
        """Redact sensitive content from a PDF.

        Provide at least one of ``redactions`` (coordinate regions),
        ``patterns`` (text search), ``presets`` (built-in patterns like
        ``"ssn"``, ``"email"``), or ``template`` (saved redaction template slug).

        Returns redacted PDF bytes.
        """
        body: Dict[str, Any] = {
            "pdf": base64.b64encode(pdf).decode("ascii"),
        }
        if redactions is not None:
            body["redactions"] = redactions
        if patterns is not None:
            body["patterns"] = patterns
        if presets is not None:
            body["presets"] = presets
        if template is not None:
            body["template"] = template

        resp_body, _ = self._request("POST", "/v1/redact", body=body)
        return resp_body

    def merge(self, pdfs: Sequence[bytes]) -> bytes:
        """Merge multiple PDFs into one.

        Args:
            pdfs: 2-20 PDF byte strings to merge in order.

        Returns merged PDF bytes.
        """
        body: Dict[str, Any] = {
            "pdfs": [base64.b64encode(p).decode("ascii") for p in pdfs],
        }

        resp_body, _ = self._request("POST", "/v1/merge", body=body)
        return resp_body

    def rasterize(
        self,
        pdf: bytes,
        *,
        dpi: Optional[int] = None,
    ) -> List[bytes]:
        """Convert PDF pages to PNG images.

        Args:
            pdf: PDF bytes to rasterize.
            dpi: Resolution (72-300, default 150).

        Returns a list of PNG image bytes, one per page.
        """
        body: Dict[str, Any] = {
            "pdf": base64.b64encode(pdf).decode("ascii"),
        }
        if dpi is not None:
            body["dpi"] = dpi

        resp_body, _ = self._request("POST", "/v1/rasterize", body=body)
        result = json.loads(resp_body)
        return [base64.b64decode(page) for page in result["pages"]]

    def extract(self, pdf_bytes: bytes) -> Any:
        """Extract embedded data from a PDF.

        Returns the embedded data dict, or ``None`` if the PDF has no
        embedded data.
        """
        try:
            resp_body, _ = self._request(
                "POST",
                "/v1/extract",
                body=pdf_bytes,
                content_type="application/pdf",
            )
            result = json.loads(resp_body)
            return result.get("data")
        except FormeError as exc:
            if exc.status == 404 and "no embedded data" in exc.message.lower():
                return None
            raise

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _request(
        self,
        method: str,
        path: str,
        *,
        body: Any = None,
        content_type: str = "application/json",
    ) -> tuple:
        """Send an HTTP request and return ``(response_bytes, content_type)``."""
        url = self._base_url + path

        if isinstance(body, bytes):
            data = body
        elif body is not None:
            data = json.dumps(body).encode("utf-8")
        else:
            data = None

        req = urllib.request.Request(url, data=data, method=method)
        req.add_header("Authorization", "Bearer {}".format(self._api_key))
        if data is not None:
            req.add_header("Content-Type", content_type)

        try:
            resp = urllib.request.urlopen(req)
            resp_content_type = resp.headers.get("Content-Type")
            return resp.read(), resp_content_type
        except urllib.error.HTTPError as exc:
            status = exc.code
            message = "Request failed with status {}".format(status)
            try:
                err_body = json.loads(exc.read())
                if isinstance(err_body, dict):
                    message = err_body.get("error") or err_body.get("message") or message
            except (ValueError, TypeError):
                pass
            raise FormeError(status, message) from None
