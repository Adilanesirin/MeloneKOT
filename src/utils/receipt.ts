// src/utils/receipt.ts
// Builds plain-text receipts for a thermal printer from the place-order
// response (POST /api/kot/place-order/). No printer library in here, so it is
// safe to change or test on its own.
//
// Only the <C>...</C> (centre) tag is used — it's the tag the printer library
// documents. Amounts use plain numbers (no ₹ sign): most thermal printers
// can't print it and show "?" instead.

import { PlaceOrderResponse } from './kot';

/** Characters per line: 58mm paper = 32, 80mm paper = 48. */
export const PAPER_CHARS = 32;

/** What to print after an order: customer bill, kitchen slip, or both. */
export type PrintMode = 'bill' | 'kot' | 'both';
export const PRINT_MODE: PrintMode = 'bill';

export interface FirmInfo {
  name?: string;
  place?: string;
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
const rule = () => '-'.repeat(PAPER_CHARS);

const money = (n: number | string | undefined | null): string => {
  const v = typeof n === 'number' ? n : parseFloat(n ?? '0');
  return (Number.isFinite(v) ? v : 0).toFixed(2);
};

/** left text + right text on one line, padded to the paper width */
function leftRight(left: string, right: string): string {
  const space = PAPER_CHARS - left.length - right.length;
  if (space >= 1) return left + ' '.repeat(space) + right;
  return left.slice(0, Math.max(0, PAPER_CHARS - right.length - 1)) + ' ' + right;
}

/** break long text into paper-width lines */
function wrap(text: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < text.length; i += PAPER_CHARS) {
    out.push(text.slice(i, i + PAPER_CHARS));
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
export function buildBillText(res: PlaceOrderResponse, firm?: FirmInfo): string {
  const o = res.order;
  if (!o) return '';
  const b = res.billing;
  const out: string[] = [];

  if (firm?.name) out.push(`<C>${firm.name}</C>`);
  if (firm?.place) out.push(`<C>${firm.place}</C>`);
  out.push(rule());
  out.push(leftRight(`Bill: ${b?.bill_number ?? `KOT-${o.id}`}`, formatTime(o.order_time)));
  out.push(`Table: ${o.table_number}${o.floor ? `   Floor: ${o.floor}` : ''}`);
  out.push(`Customer: ${o.customer_name}`);
  out.push(rule());

  o.order_items.forEach((it) => {
    wrap(`${it.name}${portionTag(it.portion)}`).forEach((l) => out.push(l));
    out.push(leftRight(`  ${it.quantity} x ${money(it.price)}`, money(it.item_total)));
  });

  out.push(rule());
  out.push(leftRight('Subtotal', money(o.subtotal)));
  out.push(leftRight('Tax', money(o.tax_amount)));
  out.push(leftRight('TOTAL', money(o.total_amount)));
  out.push(rule());
  out.push('<C>Thank you! Visit again</C>');

  return out.join('\n') + '\n\n\n'; // feed paper so the slip clears the cutter
}

// ---------------------------------------------------------------------------
// Kitchen slip (no prices)
// ---------------------------------------------------------------------------
export function buildKotText(res: PlaceOrderResponse): string {
  const o = res.order;
  if (!o) return '';
  const out: string[] = [];

  out.push('<C>** KITCHEN ORDER **</C>');
  out.push(rule());
  out.push(leftRight(`KOT #${o.id}`, formatTime(o.order_time)));
  out.push(`Table: ${o.table_number}${o.floor ? `   Floor: ${o.floor}` : ''}`);
  out.push(rule());

  o.order_items.forEach((it) => {
    wrap(`${it.quantity} x ${it.name}${portionTag(it.portion)}`).forEach((l) => out.push(l));
  });

  if (o.special_instructions) {
    out.push(rule());
    wrap(`Note: ${o.special_instructions}`).forEach((l) => out.push(l));
  }
  out.push(rule());

  return out.join('\n') + '\n\n\n';
}