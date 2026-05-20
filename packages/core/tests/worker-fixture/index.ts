// Minimal worker entry the @cloudflare/vitest-pool-workers harness
// loads. We don't actually export a fetch handler — the vitest tests
// `import` from the package and drive it directly.
export default {};
