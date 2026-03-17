"""Forme API client. Zero dependencies — uses stdlib urllib + json."""

import json
import urllib.error
import urllib.request
from typing import Any, Dict, Optional, Union


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
