# Self-Hosted Server — API Parity Checklist

This document tracks parity between the self-hosted Rust server and the hosted TypeScript API for all `/v1/*` endpoints.

## Endpoint Parity

| Endpoint | Self-Hosted | Hosted | Parity |
|----------|------------|--------|--------|
| `POST /v1/render` (inline) | Yes | Yes | Full |
| `POST /v1/render/:slug` (template) | Yes | Yes | Partial (see below) |
| `POST /v1/certify` | Yes | Yes | Full |
| `POST /v1/redact` | Yes | Yes | Full |
| `POST /v1/merge` | Yes | Yes | Full |
| `POST /v1/rasterize` | Yes | Yes | Full |
| `GET /v1/templates` | 501 | Yes | N/A (hosted-only) |
| `GET /v1/documents` | 501 | Yes | N/A (hosted-only) |
| `GET /v1/redaction-templates` | 501 | Yes | N/A (hosted-only) |
| `GET /v1/certificates` | 501 | Yes | N/A (hosted-only) |

## Template Render — Hosted-Only Fields

These request body fields on `POST /v1/render/:slug` are hosted-only and silently ignored by the self-hosted server (they are not part of the template data contract):

| Field | Purpose | Self-Hosted |
|-------|---------|-------------|
| `save` | Auto-save rendered PDF to Documents archive | Ignored |
| `saveName` | Custom name for saved document | Ignored |
| `metadata` | Developer metadata (key-value pairs) | Ignored |
| `s3` | Upload to customer's S3 bucket | Not supported |

## Hosted-Only Endpoints

| Endpoint | Purpose |
|----------|---------|
| `POST /v1/render/:slug/async` | Async render with job polling |
| `GET /v1/jobs/:jobId` | Poll async job status |
| `POST /v1/extract` | Extract embedded data from PDF |
| `GET /v1/templates/:slug` | Get single template |
| `GET /v1/documents/:id` | Get document with download URL |
| `GET /v1/redaction-templates/:slug` | Get single redaction template |

## Certify Field Names

The self-hosted server accepts both naming conventions:

| Hosted API | Self-Hosted (primary) | Self-Hosted (alias) |
|------------|----------------------|---------------------|
| `certificate` | `certificate` | `certificatePem` |
| `privateKey` | `privateKey` | `privateKeyPem` |
| `certificateId` | Rejected (400) | — |

## Not-Supported Response Format

All hosted-only features return a consistent error shape:

```json
{
  "error": "Human-readable message explaining what requires the hosted API",
  "code": "NOT_IMPLEMENTED"
}
```

Status code: `501 Not Implemented`

Examples:
- `certificateId` on `/v1/certify` → 400 (bad request, not 501, because the endpoint itself works)
- `template` slug on `/v1/redact` → 400 (same reason)
- `GET /v1/templates` → 501 (entire endpoint is hosted-only)

## Error Response Shape

All errors use:

```json
{
  "error": "Human-readable message",
  "code": "ERROR_CODE"
}
```

| Code | HTTP Status | When |
|------|-------------|------|
| `BAD_REQUEST` | 400 | Invalid input, missing fields, out-of-range values |
| `UNAUTHORIZED` | 401 | Missing or invalid API key |
| `NOT_FOUND` | 404 | Template not found, directory not configured |
| `RENDER_FAILED` | 400 | WASM rendering error |
| `INTERNAL_ERROR` | 500 | Task failure, IO errors |
| `NOT_IMPLEMENTED` | 501 | Hosted-only endpoint |

## PKCS#1 Key Support

Both hosted and self-hosted accept PKCS#1 (`-----BEGIN RSA PRIVATE KEY-----`) and PKCS#8 (`-----BEGIN PRIVATE KEY-----`) private keys. PKCS#1 keys are automatically converted to PKCS#8 before signing.

## Self-Hosted-Only Features

| Feature | Notes |
|---------|-------|
| Visible signature fields (`visible`, `x`, `y`, `width`, `height`) on `/v1/certify` | Pending verification on hosted API |

## Query Parameters

| Parameter | Endpoints | Description |
|-----------|-----------|-------------|
| `flattenForms=true` | `/v1/render`, `/v1/render/:slug` | Flatten form fields to static content |
