// src/utils/receipt.ts
// Builds plain-text receipts for a thermal printer from the place-order
// response (POST /api/kot/place-order/). No printer library in here, so it is
// safe to change or test on its own.
//
// Only the <C>...</C> (centre) tag is used — it's the tag the printer library
// documents. Amounts use plain numbers (no ₹ sign): most thermal printers
// can't print it and show "?" instead.

import { PlaceOrderResponse } from './kot';

/** Approximate ESC/POS columns for common thermal roll widths. */
export type PaperWidth = 2 | 3 | 4 | 5;
export const PAPER_COLUMNS: Record<PaperWidth, number> = { 2: 32, 3: 48, 4: 64, 5: 80 };
const DEFAULT_PAPER_WIDTH: PaperWidth = 2;
const TOTAL_TAG = 'M';
const TOTAL_SCALE = 1;

/** What to print after an order: customer bill, kitchen slip, or both. */
export type PrintMode = 'bill' | 'kot' | 'both';
export const PRINT_MODE: PrintMode = 'bill';
export type GstDisplayMode = 'single' | 'split';

export interface FirmInfo {
  name?: string;
  place?: string;
  gstNumber?: string;
  phone?: string;
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
const rule = (width: PaperWidth) => '-'.repeat(PAPER_COLUMNS[width]);

const money = (n: number | string | undefined | null): string => {
  const v = typeof n === 'number' ? n : parseFloat(n ?? '0');
  return (Number.isFinite(v) ? v : 0).toFixed(2);
};

/** left text + right text on one line, padded to the paper width */
function leftRight(left: string, right: string, width: PaperWidth, scale = 1): string {
  const columns = Math.floor(PAPER_COLUMNS[width] / scale);
  const space = columns - left.length - right.length;
  if (space >= 1) return left + ' '.repeat(space) + right;
  return left.slice(0, Math.max(0, columns - right.length - 1)) + ' ' + right;
}

/** break long text into paper-width lines */
function wrap(text: string, width: PaperWidth): string[] {
  const columns = PAPER_COLUMNS[width];
  const out: string[] = [];
  for (let i = 0; i < text.length; i += columns) {
    out.push(text.slice(i, i + columns));
  }
  return out.length ? out : [''];
}

function formatTime(iso?: string): string {
  const d = iso ? new Date(iso) : new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// the server currently returns "single" for every item, so only show real sizes
const portionTag = (portion?: string): string =>
  portion && !['single', 'full'].includes(portion.toLowerCase()) ? ` (${portion})` : '';

// ---------------------------------------------------------------------------
// Customer bill
// ---------------------------------------------------------------------------
export function buildBillText(res: PlaceOrderResponse, _firm?: FirmInfo, width: PaperWidth = DEFAULT_PAPER_WIDTH): string {
  const o = res.order;
  if (!o) return '';
  const out: string[] = [];

  out.push(`Bill no: ${res.billing?.bill_number ?? `SALE-${o.id}`}`);
  out.push(rule(width));
  o.order_items.forEach((it) => {
    wrap(`${it.quantity} x ${it.name}${portionTag(it.portion)}`, width).forEach((line) => out.push(line));
  });

  return out.join('\n') + '\n\n\n'; // feed paper so the slip clears the cutter
}

/** Sales retain the detailed customer bill layout, separate from the current KOT slip. */
export function buildSalesBillText(res: PlaceOrderResponse, firm?: FirmInfo, width: PaperWidth = DEFAULT_PAPER_WIDTH, paymentMethod: string = 'CASH', gstMode: GstDisplayMode = 'single'): string {
  const o = res.order;
  if (!o) return '';
  const b = res.billing;
  const out: string[] = [];

  if (firm?.name) out.push(`<C>${firm.name}</C>`);
  if (firm?.place) out.push(`<C>${firm.place}</C>`);
  if (firm?.gstNumber?.trim()) out.push(`<C>GSTIN: ${firm.gstNumber.trim()}</C>`);
  if (firm?.phone?.trim()) out.push(`<C>Contact: ${firm.phone.trim()}</C>`);
  out.push(rule(width));
    out.push(leftRight(`Bill: ${b?.bill_number ?? `SALE-${o.id}`}`, formatTime(o.order_time), width));
  out.push(`KOT: ${o.kot_number ?? b?.kot_number ?? b?.billing_id ?? o.billing_id ?? o.id}`);
  out.push(leftRight(`Table: ${o.table_number}${o.floor ? `   Floor: ${o.floor}` : ''}`, paymentMethod, width));
  out.push(`Customer: ${o.customer_name}`);
  out.push(`Customer Mobile: ${o.customer_phone?.trim() || b?.customer_phone?.trim() || 'Not provided'}`);
  out.push(rule(width));

  o.order_items.forEach((it) => {
    out.push(...wrap(`${it.name}${portionTag(it.portion)}`, width));
    out.push(leftRight(`  ${it.quantity} x ${money(it.price)}`, money(it.item_total), width));
  });

   out.push(rule(width));
  out.push(leftRight('Subtotal', money(o.subtotal), width));
  if (gstMode === 'split') {
    const tax = Number(o.tax_amount) || 0;
    const subtotal = Number(o.subtotal) || 0;
    const halfRate = subtotal > 0 ? (tax / subtotal * 100) / 2 : 0;
    const rate = Number.isInteger(halfRate) ? String(halfRate) : halfRate.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
    out.push(leftRight(`SGST ${rate}%`, money(tax / 2), width));
    out.push(leftRight(`CGST ${rate}%`, money(tax - tax / 2), width));
  } else {
    out.push(leftRight('GST', money(o.tax_amount), width));
  }
    // TOTAL row: one size step smaller than before, padded for its real character width
  out.push(`<${TOTAL_TAG}>${leftRight('TOTAL', money(o.total_amount), width, TOTAL_SCALE)}</${TOTAL_TAG}>`);
  out.push(rule(width));
  out.push('<C>Thank you! Visit again</C>');

  return out.join('\n') + '\n\n\n';
}

// ---------------------------------------------------------------------------
// Kitchen slip (no prices)
// ---------------------------------------------------------------------------
export function buildKotText(res: PlaceOrderResponse, width: PaperWidth = DEFAULT_PAPER_WIDTH, firm?: FirmInfo): string {
  const o = res.order;
  if (!o) return '';
  const out: string[] = [];

  out.push('<C>** KITCHEN ORDER **</C>');
  if (firm?.gstNumber?.trim()) out.push(`<C>GSTIN: ${firm.gstNumber.trim()}</C>`);
  if (firm?.phone?.trim()) out.push(`<C>Contact: ${firm.phone.trim()}</C>`);
  out.push(rule(width));
  out.push(leftRight(`KOT #${o.kot_number ?? res.billing?.kot_number ?? res.billing?.billing_id ?? o.billing_id ?? o.id}`, formatTime(o.order_time), width));
  out.push(`Table: ${o.table_number}${o.floor ? `   Floor: ${o.floor}` : ''}`);
  out.push(`Customer: ${o.customer_name}`);
  out.push(`Customer Mobile: ${o.customer_phone?.trim() || 'Not provided'}`);
  out.push(rule(width));

  o.order_items.forEach((it) => {
    wrap(`${it.quantity} x ${it.name}${portionTag(it.portion)}`, width).forEach((l) => out.push(l));
  });

  if (o.special_instructions) {
    out.push(rule(width));
    wrap(`Note: ${o.special_instructions}`, width).forEach((l) => out.push(l));
  }
  out.push(rule(width));

  return out.join('\n') + '\n\n\n';
}
