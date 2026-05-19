import { parse } from 'acorn';
import { simple as walkSimple } from 'acorn-walk';
import type {
  CallExpression,
  ExportAllDeclaration,
  ExportDefaultDeclaration,
  ExportNamedDeclaration,
  Identifier,
  ImportDeclaration,
  ImportExpression,
  MemberExpression,
  Node,
} from 'estree';

/// Identifier names that, if referenced anywhere in the user's code,
/// indicate an attempt to reach into Node's host environment. `Function`
/// and friends are the canonical sandbox-escape primitives — even though
/// `vm.runInContext` isolates the global Function constructor, blocking
/// statically gives a much clearer error than a confusing runtime failure.
const BLOCKED_IDENTIFIERS = new Set([
  'Function',
  'AsyncFunction',
  'GeneratorFunction',
  'eval',
]);

/// Function call targets that are blocked by name. `require` is also
/// shadowed in the vm context, but we reject statically so users get
/// a clear "blocked: require()" message instead of "require is not a
/// function".
const BLOCKED_CALLEES = new Set(['require', 'eval']);

export class SandboxDenylistError extends Error {
  readonly violations: string[];
  constructor(violations: string[]) {
    super(
      `Code contains operations blocked by the Forme MCP sandbox:\n  - ${violations.join('\n  - ')}\n\nThe sandbox blocks imports, requires, eval, dynamic code construction (Function/eval), and constructor-chain escapes (e.g. \`({}).constructor.constructor\`).`,
    );
    this.name = 'SandboxDenylistError';
    this.violations = violations;
  }
}

/// Walks the transpiled JS AST and rejects code patterns that try to
/// escape the sandbox. Throws `SandboxDenylistError` listing every
/// violation found (so users see the full picture on the first attempt,
/// not whack-a-mole one error at a time).
///
/// This runs in the host before the worker starts — fast-fails on
/// obvious abuse so we don't pay the worker startup cost for code that
/// can't run anyway.
export function checkDenylist(code: string): void {
  let ast: Node;
  try {
    ast = parse(code, {
      ecmaVersion: 2022,
      sourceType: 'module',
      allowReturnOutsideFunction: true,
      allowAwaitOutsideFunction: true,
    }) as unknown as Node;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new SandboxDenylistError([`syntax error during parse: ${msg}`]);
  }

  const violations: string[] = [];

  walkSimple(ast as never, {
    ImportDeclaration(node) {
      const n = node as unknown as ImportDeclaration;
      const src = typeof n.source.value === 'string' ? n.source.value : '<unknown>';
      violations.push(`import statement: \`import ... from '${src}'\``);
    },
    ImportExpression(node) {
      const n = node as unknown as ImportExpression;
      const src =
        n.source.type === 'Literal' && typeof n.source.value === 'string'
          ? n.source.value
          : '<dynamic>';
      violations.push(`dynamic import: \`import('${src}')\``);
    },
    ExportNamedDeclaration() {
      violations.push('export statement');
    },
    ExportDefaultDeclaration() {
      // `export default` is the common "this template is the default export"
      // pattern. Allow it — the worker strips it during code prep. Only
      // re-exports actually leak module state.
      const n = arguments[0] as ExportDefaultDeclaration;
      if (n.declaration.type === 'Identifier' || n.declaration.type === 'Literal') {
        return;
      }
      // Function/expression default exports are fine — they're values, not bindings.
    },
    ExportAllDeclaration(node) {
      const n = node as unknown as ExportAllDeclaration;
      violations.push(`export-all: \`export * from '${n.source.value}'\``);
    },
    CallExpression(node) {
      const n = node as unknown as CallExpression;
      if (n.callee.type === 'Identifier' && BLOCKED_CALLEES.has(n.callee.name)) {
        violations.push(`call to \`${n.callee.name}(...)\``);
      }
    },
    NewExpression(node) {
      const n = node as unknown as { callee: Node };
      if (n.callee.type === 'Identifier') {
        const name = (n.callee as Identifier).name;
        if (BLOCKED_IDENTIFIERS.has(name)) {
          violations.push(`\`new ${name}(...)\` (dynamic code construction)`);
        }
      }
      // `new (foo.constructor.constructor)(...)` is caught by the MemberExpression check.
    },
    Identifier(node) {
      const n = node as unknown as Identifier;
      if (BLOCKED_IDENTIFIERS.has(n.name)) {
        violations.push(`reference to \`${n.name}\` (blocked identifier)`);
      }
    },
    MemberExpression(node) {
      const n = node as unknown as MemberExpression;
      if (isConstructorChainEscape(n)) {
        violations.push(
          '`.constructor.constructor` (escape via Object.prototype.constructor)',
        );
      }
    },
  });

  if (violations.length > 0) {
    // De-duplicate while preserving first-seen order. The walker can
    // visit the same node multiple times (e.g. inside template literals).
    const seen = new Set<string>();
    const unique = violations.filter((v) => {
      if (seen.has(v)) return false;
      seen.add(v);
      return true;
    });
    throw new SandboxDenylistError(unique);
  }
}

/// True for `<anything>.constructor.constructor` — the canonical escape
/// `({}).constructor` is `Object`, `Object.constructor` is `Function`.
/// Catches `({}).constructor.constructor('return process')()` and the
/// many equivalents (`[].constructor.constructor`, `''.constructor.constructor`,
/// `(0).constructor.constructor`, etc.).
function isConstructorChainEscape(node: MemberExpression): boolean {
  if (node.computed) {
    // `foo['constructor']` is the bracket form. Treat literal-keyed bracket
    // access the same as dot access.
    if (
      node.property.type === 'Literal' &&
      node.property.value === 'constructor' &&
      node.object.type === 'MemberExpression'
    ) {
      const inner = node.object;
      const innerIsConstructor =
        (!inner.computed &&
          inner.property.type === 'Identifier' &&
          inner.property.name === 'constructor') ||
        (inner.computed &&
          inner.property.type === 'Literal' &&
          inner.property.value === 'constructor');
      return innerIsConstructor;
    }
    return false;
  }
  if (node.property.type !== 'Identifier' || node.property.name !== 'constructor') {
    return false;
  }
  // Outer is `.constructor` — check inner for another `.constructor`.
  const inner = node.object;
  if (inner.type !== 'MemberExpression') return false;
  if (inner.computed) {
    return (
      inner.property.type === 'Literal' && inner.property.value === 'constructor'
    );
  }
  return inner.property.type === 'Identifier' && inner.property.name === 'constructor';
}
