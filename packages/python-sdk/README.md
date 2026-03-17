# forme

Python SDK for the [Forme](https://formepdf.com) hosted PDF API.

## Installation

```bash
pip install forme
```

## Quick Start

```python
from forme import Forme

client = Forme("forme_sk_...")

# Render a template to PDF bytes
pdf = client.render("invoice", {"customer": "Acme", "total": 100})

with open("invoice.pdf", "wb") as f:
    f.write(pdf)
```

## API Reference

### `Forme(api_key, base_url="https://api.formepdf.com")`

Create a client instance.

### `client.render(slug, data=None, *, s3=None)`

Render a template synchronously. Returns `bytes` (PDF), or a `dict` with `{"url": "..."}` when `s3` is provided.

```python
# Direct PDF bytes
pdf = client.render("invoice", {"customer": "Acme"})

# Upload to S3
result = client.render("invoice", {"customer": "Acme"}, s3={
    "bucket": "my-bucket",
    "key": "invoices/001.pdf",
    "accessKeyId": "AK...",
    "secretAccessKey": "SK...",
})
print(result["url"])
```

### `client.render_async(slug, data=None, *, webhook_url=None)`

Start an asynchronous render job. Returns `{"jobId": "...", "status": "pending"}`.

```python
job = client.render_async("report", data, webhook_url="https://example.com/hook")
print(job["jobId"])
```

### `client.get_job(job_id)`

Poll the status of an async job.

```python
result = client.get_job("job-123")
if result["status"] == "complete":
    pdf_b64 = result["pdfBase64"]
```

### `client.extract(pdf_bytes)`

Extract embedded data from a PDF. Returns the data dict, or `None` if none is embedded.

```python
data = client.extract(pdf_bytes)
```

## Error Handling

All methods raise `FormeError` on non-2xx responses:

```python
from forme import Forme, FormeError

try:
    pdf = client.render("invoice", data)
except FormeError as e:
    print(f"Error {e.status}: {e.message}")
```

## Requirements

- Python 3.8+
- No dependencies (stdlib only)
