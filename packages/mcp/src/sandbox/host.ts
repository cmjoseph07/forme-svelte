/// Host-side entry point for sandboxed JSX evaluation. Spawns a short-
/// lived worker_thread per evaluation, transpiles the JSX in the host
/// (cheap, ~ms), posts the transpiled code into the worker, races the
/// worker's response against an outer wall-clock timeout, and ALWAYS
/// terminates the worker before returning.

import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { checkDenylist, SandboxDenylistError } from './denylist.js';

/// Outer wall-clock timeout. The inner `vm.runInContext` has a 5s
/// timeout for synchronous code; this outer cap exists for the
/// asynchronous overhead (worker startup, message round-trip,
/// post-eval serialization). If anything keeps the worker alive past
/// this we terminate it.
const HOST_WALL_CLOCK_MS = 10_000;

/// Memory limits for the worker. 128MB old-generation is generous for
/// document rendering — even multi-page templates with embedded fonts
/// rarely exceed 32MB. Hitting this triggers worker exit with code 134
/// (OOM), which we surface as a user-facing error.
const WORKER_RESOURCE_LIMITS = {
  maxOldGenerationSizeMb: 128,
  maxYoungGenerationSizeMb: 16,
  codeRangeSizeMb: 64,
};

export class SandboxTimeoutError extends Error {
  constructor() {
    super(
      `JSX evaluation exceeded ${HOST_WALL_CLOCK_MS / 1000}s wall-clock timeout. Likely causes: infinite loop, blocking I/O, or extremely large input.`,
    );
    this.name = 'SandboxTimeoutError';
  }
}

export class SandboxWorkerError extends Error {
  constructor(message: string, public readonly underlying?: { name: string; message: string; stack?: string }) {
    super(message);
    this.name = 'SandboxWorkerError';
  }
}

/// Evaluate transpiled JSX → JS in an isolated worker. Returns the
/// serialized document JSON (a plain JS object ready to JSON.stringify
/// for the WASM renderer).
///
/// `transpiledCode` should be the output of `esbuild.transform()` on the
/// user-supplied JSX — JSX already lowered to `React.createElement`
/// calls, but otherwise structurally identical.
export async function evaluateInSandbox(transpiledCode: string): Promise<unknown> {
  // Fast-fail AST check before paying worker startup cost. Catches the
  // obvious escape attempts so the user sees a clear error instead of
  // a "function timed out" or "is not a function".
  checkDenylist(transpiledCode);

  // Worker file resolution: in production this module is `dist/sandbox/
  // host.js`, the worker sits next to it as `dist/sandbox/worker.js`,
  // and `./worker.js` resolves correctly. Under vitest we run from
  // `src/sandbox/host.ts` (no `worker.js` next to us), so cross to
  // `../../dist/sandbox/worker.js` — which `pretest` ensures exists.
  const workerUrl = import.meta.url.endsWith('host.ts')
    ? new URL('../../dist/sandbox/worker.js', import.meta.url)
    : new URL('./worker.js', import.meta.url);
  return await runInWorker(workerUrl, transpiledCode);
}

async function runInWorker(workerUrl: URL, code: string): Promise<unknown> {
  const worker = new Worker(fileURLToPath(workerUrl), {
    resourceLimits: WORKER_RESOURCE_LIMITS,
    // Workers inherit env by default; we explicitly pass a minimal env
    // to reduce surface area. Anything not here is `undefined` in the
    // worker — including any custom env vars the host process has set.
    env: {
      NODE_ENV: process.env.NODE_ENV ?? 'production',
    },
    // Inherit stderr/stdout (errors during worker startup show up here)
    // but explicitly do not give the worker any IPC channel beyond
    // parentPort.
    stderr: false,
    stdout: false,
  });

  let resolved = false;
  let timeoutHandle: NodeJS.Timeout | null = null;

  try {
    return await new Promise<unknown>((resolve, reject) => {
      const finish = (cb: () => void) => {
        if (resolved) return;
        resolved = true;
        if (timeoutHandle) clearTimeout(timeoutHandle);
        cb();
      };

      timeoutHandle = setTimeout(() => {
        finish(() => reject(new SandboxTimeoutError()));
      }, HOST_WALL_CLOCK_MS);

      worker.once('message', (msg: WorkerMessage) => {
        if (msg.ok === true) {
          finish(() => resolve(msg.doc));
        } else {
          // The worker formatted the error envelope. Carry name/message
          // through so the test layer can match on specific failure
          // kinds (e.g. timeout vs syntax vs reference error).
          const err = msg.error ?? { name: 'WorkerError', message: 'unknown worker error' };
          finish(() => reject(new SandboxWorkerError(err.message, err)));
        }
      });

      worker.once('error', (err) => {
        finish(() =>
          reject(
            new SandboxWorkerError(`Worker error: ${err.message}`, {
              name: err.name,
              message: err.message,
              stack: err.stack,
            }),
          ),
        );
      });

      worker.once('exit', (code) => {
        if (code !== 0) {
          // Common case: code 134 = SIGABRT from V8 OOM. Code 1 = unhandled
          // throw. We surface both as a worker error so the MCP user sees
          // a real message instead of silence.
          finish(() =>
            reject(
              new SandboxWorkerError(
                code === 134
                  ? 'Worker exceeded memory limit (V8 OOM). Likely cause: allocating a very large array/buffer in the template.'
                  : `Worker exited with code ${code} before producing a result.`,
              ),
            ),
          );
        }
      });

      worker.postMessage({ code });
    });
  } finally {
    // ALWAYS terminate. If we resolved cleanly the worker would exit
    // anyway, but terminate() is idempotent and ensures no straggler.
    await worker.terminate().catch(() => {});
  }
}

interface WorkerMessage {
  ok: boolean;
  doc?: unknown;
  error?: { name: string; message: string; stack?: string };
}

// Re-export the denylist error so callers can switch on it.
export { SandboxDenylistError };
