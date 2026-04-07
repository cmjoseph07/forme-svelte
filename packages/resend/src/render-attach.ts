import { renderDocument } from '@formepdf/core';
import { getTemplate } from '@formepdf/templates';
import type { ReactElement } from 'react';
import type { RenderAttachOptions } from './types.js';

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

export async function renderAndAttach(options: RenderAttachOptions) {
  const { template, data, render, filename } = options;

  let element;
  if (render) {
    element = callRenderFn(render, 'renderAndAttach');
  } else if (template) {
    const templateFn = getTemplate(template);
    if (!templateFn) {
      throw new Error(`Unknown template: "${template}".`);
    }
    element = templateFn(data || {});
  } else {
    throw new Error('Either "template" or "render" must be provided.');
  }

  const pdfBytes = await renderDocument(element);

  return {
    filename: filename || `${template || 'document'}.pdf`,
    content: Buffer.from(pdfBytes),
  };
}
