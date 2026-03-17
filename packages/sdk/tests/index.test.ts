import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Forme, FormeError } from '../src/index.js';

function mockFetch(response: {
  ok?: boolean;
  status?: number;
  json?: () => Promise<unknown>;
  arrayBuffer?: () => Promise<ArrayBuffer>;
}) {
  const fn = vi.fn().mockResolvedValue({
    ok: response.ok ?? true,
    status: response.status ?? 200,
    json: response.json ?? (() => Promise.resolve({})),
    arrayBuffer: response.arrayBuffer ?? (() => Promise.resolve(new ArrayBuffer(0))),
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('Forme.render', () => {
  it('returns Uint8Array on success', async () => {
    const pdfBytes = new Uint8Array([37, 80, 68, 70]); // %PDF
    mockFetch({
      arrayBuffer: () => Promise.resolve(pdfBytes.buffer),
    });

    const forme = new Forme('test-key');
    const result = await forme.render('invoice', { amount: 100 });

    expect(result).toBeInstanceOf(Uint8Array);
    expect(Array.from(result)).toEqual([37, 80, 68, 70]);
  });

  it('sends correct headers and body', async () => {
    const fn = mockFetch({
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    });

    const forme = new Forme('my-api-key');
    await forme.render('receipt', { id: 42 });

    expect(fn).toHaveBeenCalledWith('https://api.formepdf.com/v1/render/receipt', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer my-api-key',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ id: 42 }),
    });
  });

  it('sends empty object when data is omitted', async () => {
    const fn = mockFetch({
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    });

    const forme = new Forme('key');
    await forme.render('slug');

    expect(fn).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ body: '{}' }),
    );
  });

  it('throws FormeError on 404', async () => {
    mockFetch({
      ok: false,
      status: 404,
      json: () => Promise.resolve({ error: 'Template not found' }),
    });

    const forme = new Forme('key');
    await expect(forme.render('missing')).rejects.toThrow(FormeError);
    await expect(forme.render('missing')).rejects.toMatchObject({
      status: 404,
      message: 'Template not found',
    });
  });

  it('throws FormeError on 429', async () => {
    mockFetch({
      ok: false,
      status: 429,
      json: () => Promise.resolve({ error: 'Rate limited' }),
    });

    const forme = new Forme('key');
    await expect(forme.render('slug')).rejects.toThrow(FormeError);
    await expect(forme.render('slug')).rejects.toMatchObject({ status: 429 });
  });

  it('throws FormeError on 500 with fallback message', async () => {
    mockFetch({
      ok: false,
      status: 500,
      json: () => Promise.reject(new Error('not json')),
    });

    const forme = new Forme('key');
    await expect(forme.render('slug')).rejects.toMatchObject({
      status: 500,
      message: 'Request failed with status 500',
    });
  });
});

describe('Forme.extract', () => {
  it('returns data on success', async () => {
    mockFetch({
      json: () => Promise.resolve({ data: { invoice: 123 } }),
    });

    const forme = new Forme('key');
    const result = await forme.extract(new Uint8Array([1, 2, 3]));

    expect(result).toEqual({ invoice: 123 });
  });

  it('sends correct headers', async () => {
    const fn = mockFetch({
      json: () => Promise.resolve({ data: null }),
    });

    const forme = new Forme('key');
    await forme.extract(new Uint8Array([1]));

    expect(fn).toHaveBeenCalledWith('https://api.formepdf.com/v1/extract', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer key',
        'Content-Type': 'application/pdf',
      },
      body: expect.any(Uint8Array),
    });
  });

  it('returns null on 404 with "no embedded data"', async () => {
    mockFetch({
      ok: false,
      status: 404,
      json: () => Promise.resolve({ error: 'No embedded data found' }),
    });

    const forme = new Forme('key');
    const result = await forme.extract(new Uint8Array([1]));

    expect(result).toBeNull();
  });

  it('throws FormeError on 404 without "no embedded data"', async () => {
    mockFetch({
      ok: false,
      status: 404,
      json: () => Promise.resolve({ error: 'Not found' }),
    });

    const forme = new Forme('key');
    await expect(forme.extract(new Uint8Array([1]))).rejects.toThrow(FormeError);
    await expect(forme.extract(new Uint8Array([1]))).rejects.toMatchObject({
      status: 404,
      message: 'Not found',
    });
  });

  it('throws FormeError on 500', async () => {
    mockFetch({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: 'Internal error' }),
    });

    const forme = new Forme('key');
    await expect(forme.extract(new Uint8Array([1]))).rejects.toMatchObject({
      status: 500,
      message: 'Internal error',
    });
  });
});

describe('Forme.render with S3', () => {
  it('returns { url } when s3 option is provided', async () => {
    const fn = mockFetch({
      json: () => Promise.resolve({ url: 'https://my-bucket.s3.amazonaws.com/invoice.pdf' }),
    });

    const forme = new Forme('key');
    const result = await forme.render('invoice', { amount: 100 }, {
      s3: {
        bucket: 'my-bucket',
        key: 'invoice.pdf',
        accessKeyId: 'AKIA...',
        secretAccessKey: 'secret',
        region: 'us-east-1',
      },
    });

    expect(result).toEqual({ url: 'https://my-bucket.s3.amazonaws.com/invoice.pdf' });
    expect(fn).toHaveBeenCalledWith(
      'https://api.formepdf.com/v1/render/invoice',
      expect.objectContaining({
        body: JSON.stringify({
          amount: 100,
          s3: {
            bucket: 'my-bucket',
            key: 'invoice.pdf',
            accessKeyId: 'AKIA...',
            secretAccessKey: 'secret',
            region: 'us-east-1',
          },
        }),
      }),
    );
  });
});

describe('Forme.renderAsync', () => {
  it('returns { jobId, status } on success', async () => {
    mockFetch({
      status: 202,
      json: () => Promise.resolve({ jobId: 'job-123', status: 'pending' }),
    });

    const forme = new Forme('key');
    const result = await forme.renderAsync('invoice', { amount: 100 });

    expect(result).toEqual({ jobId: 'job-123', status: 'pending' });
  });

  it('sends webhookUrl when provided', async () => {
    const fn = mockFetch({
      status: 202,
      json: () => Promise.resolve({ jobId: 'job-456', status: 'pending' }),
    });

    const forme = new Forme('key');
    await forme.renderAsync('invoice', { amount: 100 }, { webhookUrl: 'https://example.com/hook' });

    expect(fn).toHaveBeenCalledWith(
      'https://api.formepdf.com/v1/render/invoice/async',
      expect.objectContaining({
        body: JSON.stringify({ amount: 100, webhookUrl: 'https://example.com/hook' }),
      }),
    );
  });

  it('throws FormeError on non-2xx', async () => {
    mockFetch({
      ok: false,
      status: 429,
      json: () => Promise.resolve({ error: 'Rate limited' }),
    });

    const forme = new Forme('key');
    await expect(forme.renderAsync('invoice')).rejects.toThrow(FormeError);
    await expect(forme.renderAsync('invoice')).rejects.toMatchObject({ status: 429 });
  });
});

describe('Forme.getJob', () => {
  it('returns job with pdfBase64 when complete', async () => {
    mockFetch({
      json: () => Promise.resolve({
        id: 'job-123',
        status: 'complete',
        pdfBase64: 'JVBERi0=',
        completedAt: '2024-01-15T12:00:00Z',
      }),
    });

    const forme = new Forme('key');
    const result = await forme.getJob('job-123');

    expect(result).toEqual({
      id: 'job-123',
      status: 'complete',
      pdfBase64: 'JVBERi0=',
      completedAt: '2024-01-15T12:00:00Z',
    });
  });

  it('sends correct auth header', async () => {
    const fn = mockFetch({
      json: () => Promise.resolve({ id: 'job-123', status: 'pending' }),
    });

    const forme = new Forme('my-key');
    await forme.getJob('job-123');

    expect(fn).toHaveBeenCalledWith(
      'https://api.formepdf.com/v1/jobs/job-123',
      { headers: { 'Authorization': 'Bearer my-key' } },
    );
  });

  it('throws FormeError on 404', async () => {
    mockFetch({
      ok: false,
      status: 404,
      json: () => Promise.resolve({ error: 'Job not found' }),
    });

    const forme = new Forme('key');
    await expect(forme.getJob('missing')).rejects.toThrow(FormeError);
    await expect(forme.getJob('missing')).rejects.toMatchObject({
      status: 404,
      message: 'Job not found',
    });
  });
});

describe('custom baseUrl', () => {
  it('uses custom baseUrl for render', async () => {
    const fn = mockFetch({
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    });

    const forme = new Forme('key', { baseUrl: 'https://custom.example.com' });
    await forme.render('test');

    expect(fn).toHaveBeenCalledWith(
      'https://custom.example.com/v1/render/test',
      expect.any(Object),
    );
  });

  it('strips trailing slashes from baseUrl', async () => {
    const fn = mockFetch({
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    });

    const forme = new Forme('key', { baseUrl: 'https://custom.example.com/' });
    await forme.render('test');

    expect(fn).toHaveBeenCalledWith(
      'https://custom.example.com/v1/render/test',
      expect.any(Object),
    );
  });
});
