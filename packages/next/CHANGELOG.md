# Changelog

## [0.7.11] - 2026-03-23

### Fixed
- Edge runtime crash: detection now uses `import.meta.url` instead of `process.versions.node`, fixing environments where `nodejs_compat` polyfills process globals ([#1](https://github.com/danmolitor/forme/issues/1))

### Changed
- Templates imported from shared `@formepdf/templates` package

## [0.7.10] - 2026-03-18

_Dependency bump only._

## [0.7.9] - 2026-03-17

_Dependency bump only._

## [0.7.8] - 2026-03-17

_Dependency bump only._

## [0.7.3] - 2026-03-07

_No changes._

## [0.7.2] - 2026-03-07

_No changes._

## [0.7.1] - 2026-03-07

_No changes._

## [0.7.0] - 2026-03-06

_No changes._

## [0.6.2] - 2026-02-21

_No changes._

## [0.6.1] - 2026-02-14

_No changes._

## [0.6.0] - 2026-02-07

### Added
- Initial release: PDF route handlers for Next.js App Router
