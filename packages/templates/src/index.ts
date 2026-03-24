import type { ReactElement } from 'react';
import Invoice from './templates/invoice.js';
import Receipt from './templates/receipt.js';
import Report from './templates/report.js';
import ShippingLabel from './templates/shipping-label.js';
import Letter from './templates/letter.js';

const templates: Record<string, (data: any) => ReactElement> = {
  invoice: Invoice,
  receipt: Receipt,
  report: Report,
  'shipping-label': ShippingLabel,
  letter: Letter,
};

export function getTemplate(name: string): ((data: any) => ReactElement) | null {
  return templates[name] || null;
}

export function listTemplates(): { name: string }[] {
  return Object.keys(templates).map(name => ({ name }));
}

export { default as Invoice } from './templates/invoice.js';
export { default as Receipt } from './templates/receipt.js';
export { default as Report } from './templates/report.js';
export { default as ShippingLabel } from './templates/shipping-label.js';
export { default as Letter } from './templates/letter.js';

export type {
  Theme,
  InvoiceData,
  ReceiptData,
  ReportData,
  ShippingLabelData,
  LetterData,
} from './types.js';
