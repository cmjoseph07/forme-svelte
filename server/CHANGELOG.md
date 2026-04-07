# Changelog

## [0.9.1] - 2026-04-06

### Changed
- Bump rasterizer base image to 0.9.1

## [0.9.0] - 2026-04-04

### Added
- `flattenForms` query parameter on `/v1/render` and `/v1/render/:slug` endpoints
- `Content-Disposition: attachment` header on `/v1/render/:slug` responses
- `NotImplemented` error variant (HTTP 501, code `NOT_IMPLEMENTED`) for consistent error shapes on resource listing endpoints
- Preset name validation on `/v1/redact` (returns 400 for unknown preset names)
- Max 20 presets limit on `/v1/redact`
- Regex compilation validation on `/v1/redact` (returns 400 for invalid patterns)

### Changed
- Certify request fields renamed: `certificatePem` → `certificate`, `privateKeyPem` → `privateKey` (old names still accepted via `serde(alias)`)
- Error messages on `/v1/merge` aligned with hosted API wording

### Removed
- `/v1/sign` endpoint (use `/v1/certify` instead)
