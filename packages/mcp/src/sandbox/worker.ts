/// Worker-side JSX evaluator. Runs inside a `node:worker_threads.Worker`
/// spawned by `host.ts`. The worker is short-lived: one evaluation, then
/// the host terminates it.
///
/// Receives transpiled JS via `parentPort.postMessage`. Builds a
/// `vm.Context` populated only with React + Forme components, runs the
/// code with `vm.runInContext(..., { timeout, breakOnSigint })` so
/// synchronous infinite loops abort, calls `serialize(element)` to
/// materialize a plain JSON document, posts the document back to the
/// host. On any error, posts a normalized error envelope.
///
/// Why a `vm.Context` inside an already-isolated worker: defense in
/// depth. The worker gives us OS-level memory/CPU limits and crash
/// isolation; the `vm.Context` gives us interruptible synchronous code
/// execution (something the worker alone can't provide — only
/// `worker.terminate()`, which is async and only works between event
/// loop turns).

import { parentPort } from 'node:worker_threads';
import vm from 'node:vm';
import * as React from 'react';
import * as FormeReact from '@formepdf/react';
import { FORME_COMPONENT_NAMES } from './components.js';

const EVAL_TIMEOUT_MS = 5_000;

interface WorkerInput {
  code: string;
}

type WorkerOutput =
  | { ok: true; doc: unknown }
  | { ok: false; error: { name: string; message: string; stack?: string } };

function asError(err: unknown): { name: string; message: string; stack?: string } {
  if (err instanceof Error) {
    return { name: err.name, message: err.message, stack: err.stack };
  }
  return { name: 'UnknownError', message: String(err) };
}

if (!parentPort) {
  throw new Error('sandbox worker.ts must be loaded as a worker_thread');
}

parentPort.once('message', (input: WorkerInput) => {
  try {
    const doc = evaluate(input.code);
    const out: WorkerOutput = { ok: true, doc };
    parentPort!.postMessage(out);
  } catch (err) {
    const out: WorkerOutput = { ok: false, error: asError(err) };
    parentPort!.postMessage(out);
  }
});

function evaluate(code: string): unknown {
  // Build the vm context. Each named binding goes onto the new global
  // object. We DELIBERATELY do not copy host globals — `vm.createContext`
  // gives a fresh global with only the JS built-ins (Object, Array,
  // Function, etc.). Node-specific globals (process, Buffer, fetch,
  // setTimeout) are absent unless we explicitly add them. We don't.
  const contextObject: Record<string, unknown> = {
    React,
    FormeReact,
    // A stub console keeps `console.log(...)` in user JSX from throwing.
    // We don't forward to the host's stdout — that would pollute the
    // MCP stdio channel.
    console: {
      log: () => {},
      warn: () => {},
      error: () => {},
      info: () => {},
      debug: () => {},
    },
  };
  for (const name of FORME_COMPONENT_NAMES) {
    contextObject[name] = (FormeReact as Record<string, unknown>)[name];
  }
  const ctx = vm.createContext(contextObject, {
    name: 'forme-mcp-sandbox',
    // codeGeneration restrictions: refuse `eval`/`Function` from inside
    // the context. Even though vm contexts already isolate the Function
    // constructor (it builds code that runs in the same context, where
    // process etc. are absent), disabling code generation outright stops
    // hypothetical bugs in eval-target lookups.
    codeGeneration: { strings: false, wasm: false },
  });

  // Strip trailing whitespace, comments, and a single trailing semicolon
  // so the bare-expression attempt parses cleanly.
  const trimmed = code
    .replace(/\/\/[^\n]*$/, '')
    .replace(/;\s*$/, '')
    .trim();

  // Try as a bare JSX expression first (the common case after esbuild
  // transpiles `<Document>...</Document>` → `React.createElement(...)`).
  let element: unknown;
  let bareError: unknown = null;
  try {
    element = vm.runInContext(`(${trimmed})`, ctx, {
      timeout: EVAL_TIMEOUT_MS,
      breakOnSigint: true,
      filename: 'sandbox-input.js',
    });
  } catch (err) {
    bareError = err;
  }

  if (!isReactElement(element)) {
    // Fall back to script form: user defined `Template` or `App`, or used
    // `export default`. esbuild strips JSX into createElement calls but
    // keeps the rest of the script as-is. We've already removed export
    // syntax in the host via the denylist + a small prep pass, so what
    // remains is plain ES.
    const wrapped = `
      (function() {
        ${code}
        if (typeof Template !== 'undefined') {
          return typeof Template === 'function' ? Template({}) : Template;
        }
        if (typeof App !== 'undefined') {
          return typeof App === 'function' ? App({}) : App;
        }
        if (typeof __default__ !== 'undefined') {
          return typeof __default__ === 'function' ? __default__({}) : __default__;
        }
        return null;
      })()
    `;
    try {
      element = vm.runInContext(wrapped, ctx, {
        timeout: EVAL_TIMEOUT_MS,
        breakOnSigint: true,
        filename: 'sandbox-input.js',
      });
    } catch (err) {
      // Prefer the more informative of the two errors. The script-form
      // error is usually more useful (the bare-expression form often
      // fails with "Unexpected token" on multi-statement input).
      throw err instanceof Error ? err : bareError ?? err;
    }
  }

  if (typeof element === 'function') {
    // The user returned a component definition rather than an element.
    // Call it with empty props to materialize.
    element = (element as (p: object) => unknown)({});
  }

  if (!isReactElement(element)) {
    throw new Error(
      'Could not find a React element to render. Your JSX should either:\n' +
        '- Be a single JSX expression (e.g. <Document>...</Document>)\n' +
        '- Define a function called Template or App that returns JSX\n' +
        '- Define a default export',
    );
  }

  // serialize() runs in the worker process (not the vm context) using
  // the worker's React + FormeReact modules. Because the JSX was created
  // with the SAME React module reference we passed into the context, the
  // returned element is a plain object that serialize() can walk.
  const doc = FormeReact.serialize(element as React.ReactElement);
  // structuredClone happens automatically via postMessage; doc must be
  // a transferable shape (plain objects/arrays/primitives, Uint8Array).
  return doc;
}

function isReactElement(value: unknown): boolean {
  return Boolean(value) && React.isValidElement(value as never);
}
