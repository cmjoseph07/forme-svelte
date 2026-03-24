import type { ReactElement } from 'react';
import type { z } from 'zod';

import { Invoice, Receipt, Report, ShippingLabel, Letter } from '@formepdf/templates';
import {
  invoiceSchema, invoiceDescription, invoiceFields, invoiceExample,
  receiptSchema, receiptDescription, receiptFields, receiptExample,
  reportSchema, reportDescription, reportFields, reportExample,
  shippingLabelSchema, shippingLabelDescription, shippingLabelFields, shippingLabelExample,
  letterSchema, letterDescription, letterFields, letterExample,
} from '@formepdf/templates/schemas';

export interface TemplateEntry {
  fn: (data: any) => ReactElement;
  description: string;
  fields: Record<string, string>;
  schema: z.ZodType;
  example: Record<string, unknown>;
}

export const templates: Record<string, TemplateEntry> = {
  invoice: {
    fn: Invoice,
    description: invoiceDescription,
    fields: invoiceFields,
    schema: invoiceSchema,
    example: invoiceExample as unknown as Record<string, unknown>,
  },
  receipt: {
    fn: Receipt,
    description: receiptDescription,
    fields: receiptFields,
    schema: receiptSchema,
    example: receiptExample as unknown as Record<string, unknown>,
  },
  report: {
    fn: Report,
    description: reportDescription,
    fields: reportFields,
    schema: reportSchema,
    example: reportExample as unknown as Record<string, unknown>,
  },
  'shipping-label': {
    fn: ShippingLabel,
    description: shippingLabelDescription,
    fields: shippingLabelFields,
    schema: shippingLabelSchema,
    example: shippingLabelExample as unknown as Record<string, unknown>,
  },
  letter: {
    fn: Letter,
    description: letterDescription,
    fields: letterFields,
    schema: letterSchema,
    example: letterExample as unknown as Record<string, unknown>,
  },
};
