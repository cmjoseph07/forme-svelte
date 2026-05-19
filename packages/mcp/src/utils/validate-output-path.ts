import { resolve, relative, sep } from 'node:path';

/// Restricts where `render_custom_pdf` (and other MCP tools) may write
/// PDF output. By default, writes are permitted ONLY under the current
/// working directory. Additional directories can be allowlisted via the
/// `FORME_MCP_OUTPUT_DIRS` environment variable (colon-separated on
/// Unix, semicolon on Windows).
///
/// This is a guardrail against agents requesting writes to surprising
/// locations (e.g. `~/.ssh/authorized_keys`, system config files). It
/// is NOT a sandbox — anything the MCP process can write, the user
/// could write directly. The point is to make accidental misuse loud.

export class OutputPathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OutputPathError';
  }
}

export function validateOutputPath(requestedPath: string): string {
  const resolved = resolve(requestedPath);
  const allowedRoots = getAllowedRoots();

  for (const root of allowedRoots) {
    if (isInside(resolved, root)) {
      return resolved;
    }
  }

  throw new OutputPathError(
    `Output path "${resolved}" is outside the allowed directories. ` +
      `By default writes are restricted to the current working directory ` +
      `(${process.cwd()}). To allow additional directories, set the ` +
      `FORME_MCP_OUTPUT_DIRS environment variable to a list of absolute ` +
      `paths separated by "${pathListSeparator()}".`,
  );
}

function getAllowedRoots(): string[] {
  const roots = [process.cwd()];
  const extra = process.env.FORME_MCP_OUTPUT_DIRS;
  if (extra) {
    for (const dir of extra.split(pathListSeparator())) {
      const trimmed = dir.trim();
      if (trimmed.length > 0) {
        roots.push(resolve(trimmed));
      }
    }
  }
  return roots;
}

function pathListSeparator(): string {
  // On Windows, env-var path lists conventionally use `;` rather than
  // `:` (which conflicts with drive letters like `C:\`).
  return process.platform === 'win32' ? ';' : ':';
}

/// True when `child` is `parent` or any path within `parent`. Uses
/// `path.relative` to handle case-sensitivity and separator quirks per
/// platform; rejects when the relative path starts with `..` (escape).
function isInside(child: string, parent: string): boolean {
  if (child === parent) return true;
  const rel = relative(parent, child);
  if (rel.length === 0) return true;
  if (rel === '..' || rel.startsWith(`..${sep}`)) return false;
  return true;
}
