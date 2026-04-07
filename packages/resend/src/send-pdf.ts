import { Resend } from 'resend';
import { renderDocument } from '@formepdf/core';
import { getTemplate } from '@formepdf/templates';
import type { ReactElement } from 'react';
import { buildDefaultEmail } from './default-email.js';
import type { SendPdfOptions } from './types.js';

// User-supplied render callbacks are called outside React's render cycle.
// If the callback was compiled by React Compiler, it will inject useMemoCache
// and throw a cryptic "Invalid hook call" error. Catch and rethrow with guidance.
function callRenderFn(fn: () => ReactElement, entryPoint: string): ReactElement {
  try {
    return fn();
  } catch (err) {
    if (err instanceof Error && /hook|useMemoCache|Invalid hook call/i.test(err.message)) {
      const name = (fn as any).displayName || fn.name || 'render callback';
      throw new Error(
        `The function passed to ${entryPoint}() ("${name}") appears to be compiled by ` +
        `React Compiler, which injects hooks that cannot run outside of React's render cycle.\n\n` +
        `Fix: Add 'use no memo' at the top of the function to opt it out:\n\n` +
        `  function ${name}() {\n` +
        `    'use no memo';\n` +
        `    return <Document>...</Document>;\n` +
        `  }\n\n` +
        `Alternatively, wrap it in an inline arrow:\n\n` +
        `  ${entryPoint}({ render: () => <${name} /> })`
      );
    }
    throw err;
  }
}

export async function sendPdf(options: SendPdfOptions) {
  const {
    resendApiKey, from, to, subject,
    filename, html, text, react,
    cc, bcc, replyTo, tags, headers,
  } = options;

  let pdfBytes: Uint8Array;
  if ('pdf' in options && options.pdf) {
    pdfBytes = options.pdf;
  } else if ('render' in options && options.render) {
    pdfBytes = await renderDocument(callRenderFn(options.render, 'sendPdf'));
  } else if ('template' in options && options.template) {
    const templateFn = getTemplate(options.template);
    if (!templateFn) {
      throw new Error(`Unknown template: "${options.template}". Use listTemplates() to see available templates.`);
    }
    pdfBytes = await renderDocument(templateFn(options.data || {}));
  } else {
    throw new Error('One of "pdf", "render", or "template" must be provided.');
  }
  const template = 'template' in options ? options.template : undefined;
  const pdfFilename = filename || `${template || 'document'}.pdf`;
  const attachment = {
    filename: pdfFilename,
    content: Buffer.from(pdfBytes),
  };

  let emailHtml = html;
  let emailText = text;
  if (!html && !text && !react) {
    const data = 'data' in options ? options.data : undefined;
    const defaultEmail = buildDefaultEmail(template, data);
    emailHtml = defaultEmail.html;
    emailText = defaultEmail.text;
  }

  const resend = new Resend(resendApiKey);

  const emailPayload: Record<string, unknown> = {
    from,
    to: Array.isArray(to) ? to : [to],
    subject,
    attachments: [attachment],
  };
  if (react) emailPayload.react = react;
  if (emailHtml) emailPayload.html = emailHtml;
  if (emailText) emailPayload.text = emailText;
  if (cc) emailPayload.cc = Array.isArray(cc) ? cc : [cc];
  if (bcc) emailPayload.bcc = Array.isArray(bcc) ? bcc : [bcc];
  if (replyTo) emailPayload.replyTo = replyTo;
  if (tags) emailPayload.tags = tags;
  if (headers) emailPayload.headers = headers;

  return resend.emails.send(emailPayload as any);
}
