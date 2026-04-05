const DEFAULT_BASE_URL = 'https://api.formepdf.com';

export interface FormeOptions {
  baseUrl?: string;
}

export interface S3Options {
  bucket: string;
  key: string;
  accessKeyId: string;
  secretAccessKey: string;
  region?: string;
  endpoint?: string;
}

export interface RenderOptions {
  s3?: S3Options;
}

export interface AsyncRenderOptions {
  webhookUrl?: string;
}

export interface CertifyOptions {
  certificate?: string;
  privateKey?: string;
  certificateId?: string;
  reason?: string;
  location?: string;
  contact?: string;
}

export interface RedactionPattern {
  pattern: string;
  pattern_type: 'Literal' | 'Regex';
}

export interface RedactionRegion {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RedactOptions {
  redactions?: RedactionRegion[];
  patterns?: RedactionPattern[];
  presets?: string[];
  template?: string;
}

export interface JobResult {
  id: string;
  status: string;
  pdfBase64?: string;
  error?: string;
  completedAt?: string;
}

export class FormeError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'FormeError';
    this.status = status;
  }
}

export class Forme {
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey: string, options?: FormeOptions) {
    this.apiKey = apiKey;
    this.baseUrl = (options?.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
  }

  async render(slug: string, data?: unknown, options?: RenderOptions): Promise<Uint8Array | { url: string }> {
    const body = options?.s3
      ? { ...((data as Record<string, unknown>) ?? {}), s3: options.s3 }
      : (data ?? {});

    const res = await fetch(`${this.baseUrl}/v1/render/${slug}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const message = await parseErrorMessage(res);
      throw new FormeError(res.status, message);
    }

    if (options?.s3) {
      const json = await res.json();
      return { url: json.url };
    }

    return new Uint8Array(await res.arrayBuffer());
  }

  async renderAsync(slug: string, data?: unknown, options?: AsyncRenderOptions): Promise<{ jobId: string; status: string }> {
    const body = options?.webhookUrl
      ? { ...((data as Record<string, unknown>) ?? {}), webhookUrl: options.webhookUrl }
      : (data ?? {});

    const res = await fetch(`${this.baseUrl}/v1/render/${slug}/async`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const message = await parseErrorMessage(res);
      throw new FormeError(res.status, message);
    }

    return res.json();
  }

  async getJob(jobId: string): Promise<JobResult> {
    const res = await fetch(`${this.baseUrl}/v1/jobs/${jobId}`, {
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
      },
    });

    if (!res.ok) {
      const message = await parseErrorMessage(res);
      throw new FormeError(res.status, message);
    }

    return res.json();
  }

  async merge(pdfs: Uint8Array[]): Promise<Uint8Array> {
    const res = await fetch(`${this.baseUrl}/v1/merge`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        pdfs: pdfs.map((p) => uint8ArrayToBase64(p)),
      }),
    });

    if (!res.ok) {
      const message = await parseErrorMessage(res);
      throw new FormeError(res.status, message);
    }

    return new Uint8Array(await res.arrayBuffer());
  }

  async certify(pdf: Uint8Array, options: CertifyOptions): Promise<Uint8Array> {
    const body: Record<string, unknown> = {
      pdf: uint8ArrayToBase64(pdf),
    };

    if (options.certificateId) {
      body.certificateId = options.certificateId;
    } else {
      body.certificate = options.certificate;
      body.privateKey = options.privateKey;
    }
    if (options.reason) body.reason = options.reason;
    if (options.location) body.location = options.location;
    if (options.contact) body.contact = options.contact;

    const res = await fetch(`${this.baseUrl}/v1/certify`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const message = await parseErrorMessage(res);
      throw new FormeError(res.status, message);
    }

    return new Uint8Array(await res.arrayBuffer());
  }

  async redact(pdf: Uint8Array, options: RedactOptions): Promise<Uint8Array> {
    const res = await fetch(`${this.baseUrl}/v1/redact`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        pdf: uint8ArrayToBase64(pdf),
        ...options,
      }),
    });

    if (!res.ok) {
      const message = await parseErrorMessage(res);
      throw new FormeError(res.status, message);
    }

    return new Uint8Array(await res.arrayBuffer());
  }

  async extract(pdf: Uint8Array): Promise<unknown | null> {
    const res = await fetch(`${this.baseUrl}/v1/extract`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/pdf',
      },
      body: pdf as unknown as BodyInit,
    });

    if (res.status === 404) {
      const body = await res.json().catch(() => null);
      if (body?.error?.toLowerCase().includes('no embedded data')) {
        return null;
      }
      throw new FormeError(404, body?.error ?? 'Not found');
    }

    if (!res.ok) {
      const message = await parseErrorMessage(res);
      throw new FormeError(res.status, message);
    }

    const body = await res.json();
    return body.data;
  }
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

async function parseErrorMessage(res: Response): Promise<string> {
  try {
    const body = await res.json();
    return body.error ?? body.message ?? `Request failed with status ${res.status}`;
  } catch {
    return `Request failed with status ${res.status}`;
  }
}
