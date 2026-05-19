import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { validateOutputPath, OutputPathError } from '../src/utils/validate-output-path.js';

describe('validateOutputPath', () => {
  const originalEnv = process.env.FORME_MCP_OUTPUT_DIRS;

  beforeEach(() => {
    delete process.env.FORME_MCP_OUTPUT_DIRS;
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.FORME_MCP_OUTPUT_DIRS;
    } else {
      process.env.FORME_MCP_OUTPUT_DIRS = originalEnv;
    }
  });

  describe('default policy: CWD only', () => {
    it('resolves relative paths inside CWD', () => {
      const result = validateOutputPath('./ok.pdf');
      expect(result).toBe(join(process.cwd(), 'ok.pdf'));
    });

    it('allows subdirectory paths inside CWD', () => {
      const result = validateOutputPath('subdir/ok.pdf');
      expect(result).toBe(join(process.cwd(), 'subdir', 'ok.pdf'));
    });

    it('allows CWD itself as the output dir', () => {
      const result = validateOutputPath('output.pdf');
      expect(result).toBe(join(process.cwd(), 'output.pdf'));
    });

    it('rejects absolute paths outside CWD', () => {
      expect(() => validateOutputPath('/tmp/output.pdf')).toThrow(OutputPathError);
      expect(() => validateOutputPath('/tmp/output.pdf')).toThrow(/outside the allowed directories/);
    });

    it('rejects parent-traversal escapes', () => {
      expect(() => validateOutputPath('../escaped.pdf')).toThrow(OutputPathError);
    });

    it('rejects ~/.ssh/authorized_keys style paths', () => {
      // Absolute path that's unlikely to be inside CWD on a CI runner.
      expect(() => validateOutputPath('/etc/passwd')).toThrow(OutputPathError);
    });
  });

  describe('FORME_MCP_OUTPUT_DIRS opt-in', () => {
    it('allows paths inside an opted-in dir', () => {
      process.env.FORME_MCP_OUTPUT_DIRS = '/tmp';
      const result = validateOutputPath('/tmp/output.pdf');
      expect(result).toBe('/tmp/output.pdf');
    });

    it('allows multiple dirs separated by the platform separator', () => {
      const sep = process.platform === 'win32' ? ';' : ':';
      process.env.FORME_MCP_OUTPUT_DIRS = `/tmp${sep}/var/tmp`;
      expect(validateOutputPath('/tmp/a.pdf')).toBe('/tmp/a.pdf');
      expect(validateOutputPath('/var/tmp/b.pdf')).toBe('/var/tmp/b.pdf');
    });

    it('still rejects paths outside both CWD and the opt-in dirs', () => {
      process.env.FORME_MCP_OUTPUT_DIRS = '/tmp';
      expect(() => validateOutputPath('/etc/passwd')).toThrow(OutputPathError);
    });

    it('ignores empty entries in the env var', () => {
      process.env.FORME_MCP_OUTPUT_DIRS = ':/tmp:';
      expect(validateOutputPath('/tmp/output.pdf')).toBe('/tmp/output.pdf');
    });
  });
});
