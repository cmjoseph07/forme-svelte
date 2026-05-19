import { describe, it, expect, afterEach } from 'vitest';
import { join } from 'node:path';
import { mkdir, unlink } from 'node:fs/promises';
import { renderCustom } from '../src/tools/render-custom.js';
import { checkDenylist, SandboxDenylistError } from '../src/sandbox/denylist.js';
import { sanitizeDocument, SandboxAssetError } from '../src/sandbox/sanitize-doc.js';

const testDir = join(process.cwd(), '.test-output');
await mkdir(testDir, { recursive: true });
const tmpFile = (name: string) => join(testDir, `${Date.now()}-${name}`);

const filesToClean: string[] = [];
afterEach(async () => {
  for (const f of filesToClean.splice(0)) {
    try { await unlink(f); } catch { /* ignore */ }
  }
});

// ─── denylist (host-side, fast-fail before worker starts) ───────────

describe('denylist', () => {
  it('rejects `require(...)` calls', () => {
    expect(() => checkDenylist(`const x = require('fs');`)).toThrow(SandboxDenylistError);
    expect(() => checkDenylist(`require('fs')`)).toThrow(/require/);
  });

  it('rejects single-line imports', () => {
    expect(() => checkDenylist(`import fs from 'fs';`)).toThrow(SandboxDenylistError);
  });

  it('rejects multi-line imports (the regex strip in 0.9.x missed these)', () => {
    const src = `
      import {
        readFile,
        writeFile
      } from 'node:fs/promises';
    `;
    expect(() => checkDenylist(src)).toThrow(SandboxDenylistError);
  });

  it('rejects dynamic imports', () => {
    expect(() => checkDenylist(`import('fs')`)).toThrow(/dynamic import/);
  });

  it('rejects `eval(...)`', () => {
    expect(() => checkDenylist(`eval('1+1')`)).toThrow(/eval/);
  });

  it('rejects `new Function(...)` (dynamic code construction)', () => {
    expect(() => checkDenylist(`new Function('return process')`)).toThrow(/Function/);
  });

  it('rejects bare references to Function/AsyncFunction/GeneratorFunction', () => {
    expect(() => checkDenylist(`const f = Function;`)).toThrow(/Function/);
    expect(() => checkDenylist(`const af = AsyncFunction;`)).toThrow(/AsyncFunction/);
    expect(() => checkDenylist(`const gf = GeneratorFunction;`)).toThrow(/GeneratorFunction/);
  });

  it('rejects `.constructor.constructor` escape (Object prototype chain)', () => {
    expect(() => checkDenylist(`({}).constructor.constructor('return process')()`)).toThrow(/constructor.constructor/);
    expect(() => checkDenylist(`[].constructor.constructor('x')`)).toThrow(/constructor.constructor/);
    expect(() => checkDenylist(`(0).constructor.constructor('x')`)).toThrow(/constructor.constructor/);
  });

  it('rejects bracket-form `["constructor"]["constructor"]` escape', () => {
    expect(() => checkDenylist(`({})['constructor']['constructor']('x')`)).toThrow(/constructor.constructor/);
  });

  it('rejects `export * from` re-exports', () => {
    expect(() => checkDenylist(`export * from 'fs';`)).toThrow(/export-all/);
  });

  it('rejects named `export { foo }` statements', () => {
    expect(() => checkDenylist(`const foo = 1; export { foo };`)).toThrow(/export/);
  });

  it('allows ordinary JSX-transpiled code (createElement calls)', () => {
    const src = `React.createElement(Document, null, React.createElement(Text, null, 'hi'))`;
    expect(() => checkDenylist(src)).not.toThrow();
  });

  it('allows `export default <Doc/>` (translated to __default__ by host)', () => {
    // The host rewrites `export default X` → `const __default__ = X`
    // before the worker runs, but the denylist itself should allow it.
    expect(() => checkDenylist(`export default React.createElement(Document, null);`)).not.toThrow();
  });

  it('lists every violation in one throw (not whack-a-mole)', () => {
    try {
      checkDenylist(`
        require('fs');
        eval('1');
        new Function('x');
      `);
      throw new Error('expected SandboxDenylistError');
    } catch (err) {
      expect(err).toBeInstanceOf(SandboxDenylistError);
      const violations = (err as SandboxDenylistError).violations;
      expect(violations.some(v => v.includes('require'))).toBe(true);
      expect(violations.some(v => v.includes('eval'))).toBe(true);
      expect(violations.some(v => v.includes('Function'))).toBe(true);
    }
  });
});

// ─── post-eval doc sanitizer ────────────────────────────────────────

describe('sanitizeDocument', () => {
  it('rejects font src that is a filesystem path', () => {
    const doc = { fonts: [{ family: 'X', src: '/etc/passwd' }] };
    expect(() => sanitizeDocument(doc)).toThrow(SandboxAssetError);
    expect(() => sanitizeDocument(doc)).toThrow(/data: URIs are allowed/);
  });

  it('rejects font src that is an http URL', () => {
    const doc = { fonts: [{ family: 'X', src: 'http://attacker.com/x.ttf' }] };
    expect(() => sanitizeDocument(doc)).toThrow(SandboxAssetError);
  });

  it('rejects font src that is an https URL', () => {
    const doc = { fonts: [{ family: 'X', src: 'https://cdn.com/x.ttf' }] };
    expect(() => sanitizeDocument(doc)).toThrow(SandboxAssetError);
  });

  it('allows font src that is a data: URI', () => {
    const doc = { fonts: [{ family: 'X', src: 'data:font/ttf;base64,AAAA' }] };
    expect(() => sanitizeDocument(doc)).not.toThrow();
  });

  it('allows font src that is a Uint8Array', () => {
    const doc = { fonts: [{ family: 'X', src: new Uint8Array([1, 2, 3]) }] };
    expect(() => sanitizeDocument(doc)).not.toThrow();
  });

  it('rejects Image kind.src that is a filesystem path', () => {
    const doc = { children: [{ kind: { type: 'Image', src: '/etc/passwd' } }] };
    expect(() => sanitizeDocument(doc)).toThrow(/image src/i);
  });

  it('rejects Image kind.src that is an http URL (SSRF beacon)', () => {
    const doc = { children: [{ kind: { type: 'Image', src: 'http://attacker.com/exfil' } }] };
    expect(() => sanitizeDocument(doc)).toThrow(/image src/i);
  });

  it('allows Image kind.src that is a data: URI', () => {
    const doc = { children: [{ kind: { type: 'Image', src: 'data:image/png;base64,iVBORw0KGgo=' } }] };
    expect(() => sanitizeDocument(doc)).not.toThrow();
  });

  it('catches Image nested several levels deep (View > View > Image)', () => {
    const doc = {
      children: [
        {
          kind: { type: 'View' },
          children: [
            {
              kind: { type: 'View' },
              children: [
                { kind: { type: 'Image', src: '/etc/passwd' } },
              ],
            },
          ],
        },
      ],
    };
    expect(() => sanitizeDocument(doc)).toThrow(/image src/i);
  });

  it('ignores documents with no fonts or children', () => {
    expect(() => sanitizeDocument({})).not.toThrow();
    expect(() => sanitizeDocument({ fonts: [] })).not.toThrow();
    expect(() => sanitizeDocument({ children: [] })).not.toThrow();
  });
});

// ─── end-to-end via renderCustom ────────────────────────────────────

describe('renderCustom sandbox integration', () => {
  it('blocks the new Function escape with a clear error', async () => {
    const out = tmpFile('escape-fn.pdf');
    const jsx = `
      const proc = new Function('return process')();
      <Document>
        <Page size="Letter" margin={48}><Text>{proc ? 'pwn' : 'ok'}</Text></Page>
      </Document>
    `;
    await expect(renderCustom(jsx, out)).rejects.toThrow(/blocked|sandbox|Function/i);
  });

  it('blocks the .constructor.constructor escape', async () => {
    const out = tmpFile('escape-ctor.pdf');
    const jsx = `
      const proc = ({}).constructor.constructor('return process')();
      <Document>
        <Page size="Letter" margin={48}><Text>x</Text></Page>
      </Document>
    `;
    await expect(renderCustom(jsx, out)).rejects.toThrow(/constructor|sandbox|blocked/i);
  });

  it('blocks eval', async () => {
    const out = tmpFile('escape-eval.pdf');
    const jsx = `
      eval('1+1');
      <Document><Page><Text>x</Text></Page></Document>
    `;
    await expect(renderCustom(jsx, out)).rejects.toThrow(/eval/);
  });

  it('blocks multi-line imports (caught by AST denylist, not regex)', async () => {
    const out = tmpFile('escape-import.pdf');
    // Side-effect import so esbuild doesn't tree-shake it before the
    // denylist sees it. The whole point of this test is that the AST
    // walker catches imports across newlines — the regex strip in
    // 0.9.x missed multi-line forms.
    const jsx = `
      import
        'node:fs/promises'
      ;
      <Document><Page><Text>x</Text></Page></Document>
    `;
    await expect(renderCustom(jsx, out)).rejects.toThrow(/import/);
  });

  it('terminates infinite synchronous loops via vm.runInContext timeout', async () => {
    const out = tmpFile('infinite-loop.pdf');
    const jsx = `
      while (true) {}
      <Document><Page><Text>x</Text></Page></Document>
    `;
    // Inner vm timeout is 5s; outer worker wall-clock is 10s. Either
    // surfaces as an error (not a hang). Allow up to 12s for the test
    // runner to actually surface the error.
    await expect(renderCustom(jsx, out)).rejects.toThrow();
  }, 15_000);

  it('blocks attempts to bake a file path into a font src', async () => {
    const out = tmpFile('font-path.pdf');
    // Wrap in a Template fn so the multi-statement code can call
    // Font.register and then return JSX. The sanitizer should still
    // reject the file-path src on the doc that comes back from the
    // worker.
    const jsx = `
      function Template() {
        Font.register({ family: 'X', src: '/etc/passwd' });
        return (
          <Document>
            <Page size="Letter" margin={48} style={{ fontFamily: 'X' }}>
              <Text>test</Text>
            </Page>
          </Document>
        );
      }
    `;
    await expect(renderCustom(jsx, out)).rejects.toThrow(/font|sandbox|data: URI/i);
  });

  it('blocks attempts to embed an http image src', async () => {
    const out = tmpFile('image-url.pdf');
    const jsx = `
      <Document>
        <Page size="Letter" margin={48}>
          <Image src="https://attacker.com/exfil.png" />
        </Page>
      </Document>
    `;
    await expect(renderCustom(jsx, out)).rejects.toThrow(/Image src|data: URI/i);
  });

  it('rejects output paths outside CWD', async () => {
    const jsx = `<Document><Page><Text>x</Text></Page></Document>`;
    await expect(renderCustom(jsx, '/etc/forme-test-blocked.pdf')).rejects.toThrow(/outside the allowed directories/);
  });

  it('still renders normal JSX cleanly (regression check)', async () => {
    const out = tmpFile('happy.pdf');
    filesToClean.push(out);
    const jsx = `
      <Document>
        <Page size="Letter" margin={48}>
          <Text>Happy path</Text>
        </Page>
      </Document>
    `;
    const result = await renderCustom(jsx, out);
    expect(result.size).toBeGreaterThan(0);
  });

  it('renders an `export default <Doc/>` style template', async () => {
    const out = tmpFile('export-default.pdf');
    filesToClean.push(out);
    const jsx = `
      export default (
        <Document>
          <Page size="Letter" margin={48}>
            <Text>From export default</Text>
          </Page>
        </Document>
      );
    `;
    const result = await renderCustom(jsx, out);
    expect(result.size).toBeGreaterThan(0);
  });
});
