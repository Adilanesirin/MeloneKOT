// src/utils/reportExport.ts
import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as XLSX from 'xlsx';
import { fmtDate, fmtTime } from '../components/Reportparts';

export type ExportType = 'excel' | 'pdf';

type Cell = string | number;

interface ExportTable {
  title: string;
  headers: string[];
  body: Cell[][];
  /** column indexes that are amounts (shown with 2 decimals, right aligned) */
  amountCols: number[];
}

interface ExportArgs {
  type: ExportType;
  view: string;
  rows: any[];
  from: string;
  to: string;
  summary?: { total_bills?: number; total_revenue?: number | string } | null;
}

const num = (v: unknown): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

const when = (iso?: string): string => {
  if (!iso) return '';
  const d = fmtDate(iso);
  return d === '—' ? String(iso) : `${d} ${fmtTime(iso)}`.trim();
};

const text = (v: unknown): string => (v === undefined || v === null ? '' : String(v));

function buildTable(view: string, rows: any[]): ExportTable {
  if (view === 'bill') {
    return {
      title: 'Sales Report - Bill Wise',
      headers: ['#', 'Date & Time', 'Type', 'KOT Number', 'Invoice No.', 'POS', 'Customer', 'Table', 'Floor', 'Waiter', 'Payment', 'Taxable', 'Tax', 'Total'],
      body: rows.map((r, i) => [
        i + 1,
        when(r._time),
        text(r._type),
        text(r._kot),
        text(r._invoice),
        text(r._pos),
        text(r._customer),
        text(r._table),
        text(r._floor),
        text(r._waiter),
        text(r._payment),
        num(r._taxable),
        num(r._tax),
        num(r._total),
      ]),
      amountCols: [11, 12, 13],
    };
  }
  if (view === 'item') {
    return {
      title: 'Sales Report - Item Wise',
      headers: ['#', 'Date & Time', 'Invoice', 'Item', 'Qty', 'Rate', 'Total'],
      body: rows.map((r, i) => [
        i + 1,
        when(r._time ?? r.time ?? r.created_at),
        text(r.bill_number),
        text(r.name),
        num(r.quantity),
        num(r.rate),
        num(r.total),
      ]),
      amountCols: [5, 6],
    };
  }
  if (view === 'summary') {
    return {
      title: 'Sales Report - Item Summary',
      headers: ['#', 'Item', 'Qty', 'Rate', 'Total'],
      body: rows.map((r, i) => [i + 1, text(r.name), num(r.quantity), num(r.rate), num(r.total)]),
      amountCols: [3, 4],
    };
  }
  return {
    title: 'Sales Report - Category Wise',
    headers: ['#', 'Category', 'Menu Items', 'Total Sales'],
    body: rows.map((r, i) => [i + 1, text(r.category_name), r.items?.length ?? 0, num(r.total_sales)]),
    amountCols: [3],
  };
}

const esc = (v: unknown): string =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

function buildHtml(t: ExportTable, period: string, summaryLine: string): string {
  const head = t.headers.map((h) => `<th>${esc(h)}</th>`).join('');
  const rowsHtml = t.body
    .map((row) => {
      const tds = row
        .map((c, i) => {
          const isAmt = t.amountCols.includes(i);
          return `<td class="${isAmt ? 'r' : ''}">${isAmt ? num(c).toFixed(2) : esc(c)}</td>`;
        })
        .join('');
      return `<tr>${tds}</tr>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<style>
  @page { size: A4 landscape; margin: 12mm; }
  body { font-family: Helvetica, Arial, sans-serif; color: #111; font-size: 10px; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  .meta { color: #555; margin-bottom: 10px; font-size: 11px; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #111; color: #fff; text-align: left; padding: 6px; font-size: 9px; text-transform: uppercase; }
  td { padding: 5px 6px; border-bottom: 1px solid #ddd; }
  tr:nth-child(even) td { background: #f6f6f6; }
  .r { text-align: right; }
</style>
</head>
<body>
  <h1>${esc(t.title)}</h1>
  <div class="meta">${esc(period)}${summaryLine ? ` &nbsp;|&nbsp; ${esc(summaryLine)}` : ''}</div>
  <table>
    <thead><tr>${head}</tr></thead>
    <tbody>${rowsHtml}</tbody>
  </table>
</body>
</html>`;
}

async function shareFile(uri: string, mimeType: string, uti: string) {
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Sharing is not available on this device.');
  }
  // give the UI time to settle so the share sheet is not dropped
  await new Promise((resolve) => setTimeout(resolve, 400));
  await Sharing.shareAsync(uri, { mimeType, UTI: uti, dialogTitle: 'Save or share report' });
}

export async function exportSalesReport({ type, view, rows, from, to, summary }: ExportArgs): Promise<void> {
  const table = buildTable(view, rows);
  const period = from === to ? `Date: ${from}` : `Period: ${from} to ${to}`;
  const summaryLine =
    summary && (summary.total_bills !== undefined || summary.total_revenue !== undefined)
      ? `Bills: ${summary.total_bills ?? 0}  |  Revenue: ${num(summary.total_revenue).toFixed(2)}`
      : '';
  const baseName = `Sales_Report_${view}_${from}_to_${to}`;
  const dir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory ?? '';

  if (type === 'excel') {
    const aoa: Cell[][] = [[table.title], [period], summaryLine ? [summaryLine] : [], [], table.headers, ...table.body];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = table.headers.map((h, i) => ({
      wch: Math.min(
        32,
        Math.max(h.length, ...table.body.map((r) => String(r[i] ?? '').length)) + 2
      ),
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sales Report');
    const base64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
    const uri = `${dir}${baseName}.xlsx`;
    await FileSystem.writeAsStringAsync(uri, base64, { encoding: 'base64' });
    await shareFile(uri, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'org.openxmlformats.spreadsheetml.sheet');
    return;
  }

  const html = buildHtml(table, period, summaryLine);
  const { uri: tmp } = await Print.printToFileAsync({ html, width: 842, height: 595 });
  const uri = `${dir}${baseName}.pdf`;
  await FileSystem.deleteAsync(uri, { idempotent: true });
  await FileSystem.moveAsync({ from: tmp, to: uri });
  await shareFile(uri, 'application/pdf', 'com.adobe.pdf');
}