/// Render arbitrary user-supplied JSX to a PDF file.
///
/// Trust model: this tool is hardened for accidental misuse (infinite
/// loops, accidental fs reads, typo'd code). It is NOT a service-grade
/// boundary for arbitrary attacker code — see README.md for the full
/// picture. The sandbox layers:
///
///   1. AST denylist (host) — blocks imports, requires, eval/Function,
///      and constructor-chain escapes before paying worker startup cost.
///   2. Worker isolation — JSX evaluates in a `node:worker_threads`
///      Worker with V8 memory limits. Crash isolation: a bad template
///      cannot crash the MCP server.
///   3. `vm.Context` inside the worker — fresh global with only React +
///      Forme components. No `process`, `Buffer`, `fetch`, `require`.
///   4. `vm.runInContext({ timeout })` — synchronous 5s timeout that
///      actually interrupts `while(true){}`, unlike `new Function`.
///   5. Outer wall-clock timeout (10s) backed by `worker.terminate()`
///      — covers async hangs the inner timeout can't.
///   6. Post-eval document sanitizer — blocks file paths and http(s)
///      URLs in font/image `src` to close the asset-resolution side
///      channel.
///   7. Output path allowlist — writes restricted to CWD by default;
///      opt-in extra dirs via `FORME_MCP_OUTPUT_DIRS`.

import { writeFile } from 'node:fs/promises';
import { transform } from 'esbuild';
import { renderPdf } from '@formepdf/core';
import { validateOutputPath } from '../utils/validate-output-path.js';
import { evaluateInSandbox } from '../sandbox/host.js';
import { sanitizeDocument } from '../sandbox/sanitize-doc.js';
import { resolveBundledAssets } from '../sandbox/resolve-assets.js';

export async function renderCustom(
  jsx: string,
  output?: string,
): Promise<{ path: string; size: number }> {
  // Resolve + validate the output path FIRST so we fail fast if the
  // caller asked to write somewhere disallowed (e.g. /etc/passwd).
  const outputPath = validateOutputPath(output || './custom.pdf');

  // Transpile JSX → JS. Cheap (~ms), happens in the host — the worker
  // doesn't need esbuild and we avoid sending TSX into the sandbox at all.
  let transpiled: string;
  try {
    const result = await transform(jsx, {
      loader: 'tsx',
      jsx: 'transform',
      jsxFactory: 'React.createElement',
      jsxFragment: 'React.Fragment',
    });
    transpiled = result.code;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `JSX transpilation failed: ${msg}\n\nSource:\n${jsx.slice(0, 500)}`,
    );
  }

  // The denylist allows `export default` (so users can write
  // `export default <Doc/>`) but vm.runInContext is script mode and
  // can't execute ES module syntax. Rewrite `export default X` →
  // `const __default__ = X` so the worker's fallback wrapper picks it up.
  const preparedCode = stripExportDefault(transpiled);

  // Evaluate in the worker sandbox. Returns the serialized document tree.
  const rawDoc = await evaluateInSandbox(preparedCode);

  // Post-eval sanitization: block file-path / http URL src on fonts and
  // images before they reach `@formepdf/core`'s asset resolver.
  sanitizeDocument(rawDoc);

  // Bypass renderDocument()'s built-in resolveFonts/resolveImages
  // (filesystem + fetch). The sanitizer guarantees every asset is a
  // data: URI, which the WASM engine reads directly. Render via the
  // pure-JSON entry point.
  const doc = await resolveBundledAssets(rawDoc);
  const pdfBytes = await renderPdf(JSON.stringify(doc));

  await writeFile(outputPath, pdfBytes);

  return { path: outputPath, size: pdfBytes.length };
}

/// Strip leading `export default` from each statement in transpiled code,
/// replacing with a `const __default__ = ` binding so the worker can find
/// it. esbuild always emits `export default` at statement-start (column
/// 0 after any preceding statements), so a line-anchored regex is
/// reliable — and any false positive inside a string literal would have
/// triggered the AST visitor in the denylist, which we already passed.
function stripExportDefault(code: string): string {
  return code.replace(
    /(^|\n)(\s*)export\s+default\s+/g,
    (_match, lead, indent) => `${lead}${indent}const __default__ = `,
  );
}
