import { invoiceSchema, invoiceExample } from './invoice.js';
import { receiptSchema, receiptExample } from './receipt.js';
import { reportSchema, reportExample } from './report.js';
import { letterSchema, letterExample } from './letter.js';
import { shippingLabelSchema, shippingLabelExample } from './shipping-label.js';

export { themeSchema, type Theme } from './theme.js';

export {
  invoiceSchema,
  type InvoiceData,
  invoiceDescription,
  invoiceFields,
  invoiceExample,
} from './invoice.js';

export {
  receiptSchema,
  type ReceiptData,
  receiptDescription,
  receiptFields,
  receiptExample,
} from './receipt.js';

export {
  reportSchema,
  type ReportData,
  reportDescription,
  reportFields,
  reportExample,
} from './report.js';

export {
  letterSchema,
  type LetterData,
  letterDescription,
  letterFields,
  letterExample,
} from './letter.js';

export {
  shippingLabelSchema,
  type ShippingLabelData,
  shippingLabelDescription,
  shippingLabelFields,
  shippingLabelExample,
} from './shipping-label.js';

// Validate all example data against schemas at load time to catch drift early
const allSchemas = {
  invoice: { schema: invoiceSchema, example: invoiceExample },
  receipt: { schema: receiptSchema, example: receiptExample },
  report: { schema: reportSchema, example: reportExample },
  letter: { schema: letterSchema, example: letterExample },
  'shipping-label': { schema: shippingLabelSchema, example: shippingLabelExample },
};

for (const [name, { schema, example }] of Object.entries(allSchemas)) {
  try {
    schema.parse(example);
  } catch (err: any) {
    throw new Error(`Template "${name}" example data does not match its schema: ${err.message}`);
  }
}
