# Changelog

## [0.8.0] - 2026-03-29

_Dependency bump only._

## [0.7.12] - 2026-03-24

_Dependency bump only._

## [0.7.11] - 2026-03-23

### Added
- Initial release: shared package for built-in PDF templates and Zod schemas
- Templates: invoice, receipt, report, letter, shipping-label (with theme/logo support)
- `@formepdf/templates/schemas` sub-export for Zod schemas with descriptions, fields, and examples
- Shipping label uses `<QrCode>` for tracking (replaces fake barcode rectangles)
