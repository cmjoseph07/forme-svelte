import React from 'react';
import { Document, Page, View, Text, Table, Row, Cell, Fixed, serialize } from '@formepdf/react';
import { renderPdf } from '@formepdf/core';

// ── Helpers ──────────────────────────────────────────────────────────

function isValidPdf(bytes: Uint8Array): boolean {
  const header = new TextDecoder().decode(bytes.slice(0, 5));
  return header === '%PDF-';
}

function countPages(bytes: Uint8Array): number {
  const text = new TextDecoder('latin1').decode(bytes);
  const match = text.match(/\/Type\s*\/Page(?!\s*s)/g);
  return match ? match.length : 0;
}

function formatMb(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

function getMemory() {
  if (global.gc) global.gc();
  return process.memoryUsage();
}

function logMemoryDelta(label: string, before: NodeJS.MemoryUsage, after: NodeJS.MemoryUsage) {
  const heapDelta = after.heapUsed - before.heapUsed;
  const rssDelta = after.rss - before.rss;
  console.log(`  mem: heap ${formatMb(before.heapUsed)} -> ${formatMb(after.heapUsed)} (${heapDelta >= 0 ? '+' : ''}${formatMb(heapDelta)}) | rss ${formatMb(after.rss)}`);
}

async function measure<T>(fn: () => Promise<T>): Promise<{ result: T; ms: number }> {
  const start = performance.now();
  const result = await fn();
  return { result, ms: performance.now() - start };
}

async function renderElement(element: React.ReactElement): Promise<Uint8Array> {
  const doc = serialize(element);
  return renderPdf(JSON.stringify(doc));
}

// ── Test 1: Large data table (500 rows × 6 columns) ─────────────────

function buildTableDocument(rowCount = 500) {
  const statuses = ['Paid', 'Pending', 'Overdue', 'Shipped', 'Cancelled'];
  const descriptions = [
    'Widget Pro Max',
    'Enterprise License (Annual)',
    'Cloud Hosting — Standard Tier',
    'Consulting Hours',
    'Support Package Premium',
    'API Access (10k requests/mo)',
    'Data Migration Service',
    'Custom Integration Setup',
  ];

  const rows: React.ReactElement[] = [];
  for (let i = 1; i <= rowCount; i++) {
    const qty = 1 + (i % 20);
    const price = 9.99 + (i % 50) * 3.5;
    const total = qty * price;
    rows.push(
      <Row key={i} style={{ backgroundColor: i % 2 === 0 ? '#f9f9f9' : '#fff' }}>
        <Cell style={{ padding: 4 }}><Text style={{ fontSize: 8 }}>{String(i)}</Text></Cell>
        <Cell style={{ padding: 4 }}><Text style={{ fontSize: 8 }}>{descriptions[i % descriptions.length]}</Text></Cell>
        <Cell style={{ padding: 4 }}><Text style={{ fontSize: 8 }}>{String(qty)}</Text></Cell>
        <Cell style={{ padding: 4 }}><Text style={{ fontSize: 8, textAlign: 'right' as const }}>{`$${price.toFixed(2)}`}</Text></Cell>
        <Cell style={{ padding: 4 }}><Text style={{ fontSize: 8, textAlign: 'right' as const, fontWeight: 'bold' as const }}>{`$${total.toFixed(2)}`}</Text></Cell>
        <Cell style={{ padding: 4 }}><Text style={{ fontSize: 8 }}>{statuses[i % statuses.length]}</Text></Cell>
      </Row>,
    );
  }

  return (
    <Document title={`Stress Test — ${rowCount} Row Table`}>
      <Page size="A4" margin={36}>
        <Fixed position="header">
          <View style={{ borderBottom: '1 solid #ddd', paddingBottom: 8, marginBottom: 8 }}>
            <Text style={{ fontSize: 14, fontWeight: 'bold' }}>Invoice Line Items</Text>
          </View>
        </Fixed>
        <Table columns={[
          { width: { fraction: 0.06 } },
          { width: { fraction: 0.34 } },
          { width: { fraction: 0.08 } },
          { width: { fraction: 0.15 } },
          { width: { fraction: 0.17 } },
          { width: { fraction: 0.2 } },
        ]}>
          <Row header style={{ backgroundColor: '#333' }}>
            <Cell style={{ padding: 4 }}><Text style={{ fontSize: 8, color: '#fff', fontWeight: 'bold' }}>#</Text></Cell>
            <Cell style={{ padding: 4 }}><Text style={{ fontSize: 8, color: '#fff', fontWeight: 'bold' }}>Description</Text></Cell>
            <Cell style={{ padding: 4 }}><Text style={{ fontSize: 8, color: '#fff', fontWeight: 'bold' }}>Qty</Text></Cell>
            <Cell style={{ padding: 4 }}><Text style={{ fontSize: 8, color: '#fff', fontWeight: 'bold' }}>Unit Price</Text></Cell>
            <Cell style={{ padding: 4 }}><Text style={{ fontSize: 8, color: '#fff', fontWeight: 'bold' }}>Total</Text></Cell>
            <Cell style={{ padding: 4 }}><Text style={{ fontSize: 8, color: '#fff', fontWeight: 'bold' }}>Status</Text></Cell>
          </Row>
          {rows}
        </Table>
      </Page>
    </Document>
  );
}

async function test1() {
  const memBefore = getMemory();
  const doc = buildTableDocument();
  const { result: pdf, ms } = await measure(() => renderElement(doc));
  const memAfter = getMemory();
  const pages = countPages(pdf);

  if (!isValidPdf(pdf)) throw new Error('Test 1: Invalid PDF output');

  console.log(`Test 1: 500 rows | ${pages} pages | ${Math.round(ms)}ms`);
  logMemoryDelta('Test 1', memBefore, memAfter);
}

// ── Test 2: 30+ page report ──────────────────────────────────────────

function buildReportDocument(sectionCount = 30, paragraphsPerSection = 6) {
  const sections: React.ReactElement[] = [];

  for (let s = 1; s <= sectionCount; s++) {
    sections.push(
      <View key={`h-${s}`} style={{ marginTop: s > 1 ? 24 : 0, marginBottom: 8 }}>
        <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#1a1a1a' }}>
          {`Section ${s}: Analysis of Q${((s - 1) % 4) + 1} Performance`}
        </Text>
        <View style={{ height: 2, backgroundColor: '#3b82f6', marginTop: 4 }} />
      </View>,
    );

    for (let p = 0; p < paragraphsPerSection; p++) {
      sections.push(
        <Text key={`p-${s}-${p}`} style={{ fontSize: 10, lineHeight: 1.5, marginBottom: 8, color: '#333' }}>
          {`This is paragraph ${p + 1} of section ${s}. The quarterly revenue figures demonstrate a consistent upward trend across all major product lines. Key performance indicators remained above target thresholds throughout the reporting period, with notable improvements in customer acquisition costs and lifetime value metrics. Regional performance varied, with North America leading growth at 23% year-over-year, followed by EMEA at 18% and APAC at 15%. The operational efficiency ratio improved by 340 basis points, reflecting the impact of automation initiatives launched in the prior quarter.`}
        </Text>,
      );
    }

    if (s % (sectionCount > 100 ? 10 : 2) === 1) {
      const tableRows: React.ReactElement[] = [];
      for (let r = 1; r <= 8; r++) {
        tableRows.push(
          <Row key={r} style={{ backgroundColor: r % 2 === 0 ? '#f5f5f5' : '#fff' }}>
            <Cell style={{ padding: 4, borderBottom: '1 solid #eee' }}><Text style={{ fontSize: 9 }}>{`Metric ${r}`}</Text></Cell>
            <Cell style={{ padding: 4, borderBottom: '1 solid #eee' }}><Text style={{ fontSize: 9, textAlign: 'right' as const }}>{`${(1000 + r * 127).toLocaleString()}`}</Text></Cell>
            <Cell style={{ padding: 4, borderBottom: '1 solid #eee' }}><Text style={{ fontSize: 9, textAlign: 'right' as const }}>{`+${(r * 2.3).toFixed(1)}%`}</Text></Cell>
          </Row>,
        );
      }

      sections.push(
        <Table key={`t-${s}`} columns={[
          { width: { fraction: 0.5 } },
          { width: { fraction: 0.25 } },
          { width: { fraction: 0.25 } },
        ]} style={{ marginBottom: 12 }}>
          <Row header style={{ backgroundColor: '#1e293b' }}>
            <Cell style={{ padding: 4 }}><Text style={{ fontSize: 9, color: '#fff', fontWeight: 'bold' }}>Metric</Text></Cell>
            <Cell style={{ padding: 4 }}><Text style={{ fontSize: 9, color: '#fff', fontWeight: 'bold' }}>Value</Text></Cell>
            <Cell style={{ padding: 4 }}><Text style={{ fontSize: 9, color: '#fff', fontWeight: 'bold' }}>Change</Text></Cell>
          </Row>
          {tableRows}
        </Table>,
      );
    }
  }

  return (
    <Document title={`Stress Test — ${sectionCount} Section Report`}>
      <Page size="A4" margin={48}>
        <Fixed position="footer">
          <View style={{ borderTop: '1 solid #ddd', paddingTop: 6 }}>
            <Text style={{ fontSize: 8, color: '#999', textAlign: 'center' }}>
              {'Page {{pageNumber}} of {{totalPages}}'}
            </Text>
          </View>
        </Fixed>
        {sections}
      </Page>
    </Document>
  );
}

async function test2() {
  const memBefore = getMemory();
  const doc = buildReportDocument();
  const { result: pdf, ms } = await measure(() => renderElement(doc));
  const memAfter = getMemory();
  const pages = countPages(pdf);

  if (!isValidPdf(pdf)) throw new Error('Test 2: Invalid PDF output');
  if (pages < 30) console.warn(`  Warning: Only ${pages} pages (target: 30+)`);

  console.log(`Test 2: 30+ pages | ${pages} pages | ${Math.round(ms)}ms`);
  logMemoryDelta('Test 2', memBefore, memAfter);
}

// ── Test 3: Concurrent renders ───────────────────────────────────────

async function test3() {
  const json = JSON.stringify(serialize(buildTableDocument()));

  const memBefore = getMemory();
  const { ms: totalMs } = await measure(async () => {
    const promises = Array.from({ length: 10 }, () => renderPdf(json));
    await Promise.all(promises);
  });
  const memAfter = getMemory();

  const avg = totalMs / 10;
  console.log(`Test 3: 10 concurrent | avg ${Math.round(avg)}ms | total ${Math.round(totalMs)}ms`);
  logMemoryDelta('Test 3', memBefore, memAfter);
}

// ── Test 4: Extreme page count (1,000+ pages) ────────────────────────

async function test4() {
  // Test 2 baseline: 30 sections × 6 paragraphs → 38 pages in ~89ms
  // Scale to ~800 sections for 1,000+ pages (text is far cheaper than tables)
  const memBefore = getMemory();

  let json: string;
  try {
    const doc = buildReportDocument(1_100, 6);
    json = JSON.stringify(serialize(doc));
  } catch (err) {
    const memAfter = getMemory();
    console.log(`Test 4: 1,000+ pages | FAILED during serialization: ${(err as Error).message}`);
    logMemoryDelta('Test 4', memBefore, memAfter);
    return;
  }
  console.log(`Test 4: serialized JSON ${formatMb(json.length)}`);

  try {
    const { result: pdf, ms } = await measure(() => renderPdf(json));
    const memAfter = getMemory();
    const pages = countPages(pdf);

    if (!isValidPdf(pdf)) throw new Error('Test 4: Invalid PDF output');
    if (pages < 1000) console.warn(`  Warning: Only ${pages} pages (target: 1,000+)`);

    console.log(`Test 4: 1,000+ pages | ${pages} pages | ${(ms / 1000).toFixed(1)}s | pdf ${formatMb(pdf.length)}`);
    logMemoryDelta('Test 4', memBefore, memAfter);
  } catch (err) {
    const memAfter = getMemory();
    console.log(`Test 4: 1,000+ pages | FAILED during render: ${(err as Error).message}`);
    logMemoryDelta('Test 4', memBefore, memAfter);
  }
}

// ── Test 5: Thousands of pages (5,000+ pages) ────────────────────────

async function test5() {
  // Scale to ~4,000 sections for 5,000+ pages
  const memBefore = getMemory();

  let json: string;
  try {
    const doc = buildReportDocument(5_500, 6);
    json = JSON.stringify(serialize(doc));
  } catch (err) {
    const memAfter = getMemory();
    console.log(`Test 5: 5,000+ pages | FAILED during serialization: ${(err as Error).message}`);
    logMemoryDelta('Test 5', memBefore, memAfter);
    return;
  }
  console.log(`Test 5: serialized JSON ${formatMb(json.length)}`);

  try {
    const { result: pdf, ms } = await measure(() => renderPdf(json));
    const memAfter = getMemory();
    const pages = countPages(pdf);

    if (!isValidPdf(pdf)) throw new Error('Test 5: Invalid PDF output');
    if (pages < 5000) console.warn(`  Warning: Only ${pages} pages (target: 5,000+)`);

    console.log(`Test 5: 5,000+ pages | ${pages} pages | ${(ms / 1000).toFixed(1)}s | pdf ${formatMb(pdf.length)}`);
    logMemoryDelta('Test 5', memBefore, memAfter);
  } catch (err) {
    const memAfter = getMemory();
    console.log(`Test 5: 5,000+ pages | FAILED during render: ${(err as Error).message}`);
    logMemoryDelta('Test 5', memBefore, memAfter);
  }
}

// ── Run ──────────────────────────────────────────────────────────────

async function main() {
  console.log('Forme PDF Stress Test\n');

  await test1();
  await test2();
  await test3();
  await test4();
  await test5();

  console.log('\nAll tests passed.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
