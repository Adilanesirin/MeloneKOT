import { convertPendingInvoiceToSale, getPendingInvoices, placeOrder, PendingInvoice } from './api';
import { getSalesReport } from './Reportapi';
import {
  getOfflineOrders, isInFlight, markInFlight, OfflineOrder, OfflineOrderMeta,
  removeOfflineOrder, unmarkInFlight, updateOfflineOrder, updateOfflineOrderMeta,
} from './localCache';
import { saveOpenKotForTable } from './storage';
import { printOrderReceipt } from '../utils/printer';
import { KotOrder, KotOrderItem, PlaceOrderResponse } from '../utils/kot';

// A request we aborted can still be finished by a slow server. Never conclude "not sent"
// before this much time has passed since the send started.
const NOT_SENT_GRACE_MS = 90000;
// After this long without any confirmation, the waiter may override manually.
const OVERRIDE_AFTER_MS = 5 * 60 * 1000;

export type VerifyResult = 'sent' | 'not_sent' | 'unknown';

export interface VerifyOutcome {
  orderId: string;
  tableNumber: string;
  orderType: 'kot' | 'sales';
  result: 'sent' | 'not_sent';
  slip?: PlaceOrderResponse;
  printed?: boolean;
  printMessage?: string;
}

export interface ResendResult {
  ok: boolean;
  message?: string;
  unconfirmed?: boolean;
  canOverride?: boolean;
  slip?: PlaceOrderResponse;
  printed?: boolean;
  printMessage?: string;
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
const norm = (v: unknown) => String(v ?? '').trim().toLowerCase();
const num = (v: unknown) => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '0'));
  return Number.isFinite(n) ? n : 0;
};
const todayYmd = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);
}
const invoiceLines = (inv: PendingInvoice) =>
  inv.order_items ?? inv.items ?? inv.order?.order_items ?? inv.order?.items ?? [];

const sameTable = (b: PendingInvoice, tableNumber: string, floor?: string) =>
  norm(b.table_number) === norm(tableNumber) && (!floor || !b.floor || norm(b.floor) === norm(floor));

/** qty per item name on this table's pending KOT. null = server gave no item details (cannot verify). */
function kotQuantities(bills: PendingInvoice[], tableNumber: string, floor?: string): Record<string, number> | null {
  const out: Record<string, number> = {};
  for (const bill of bills) {
    if (!sameTable(bill, tableNumber, floor)) continue;
    const lines = invoiceLines(bill);
    if (!lines.length) return null;
    for (const line of lines) {
      const name = norm(line.name ?? line.item_name ?? line.menu_item_name);
      if (!name) continue;
      out[name] = (out[name] ?? 0) + (num(line.quantity) || 1);
    }
  }
  return out;
}

const graceOver = (order: OfflineOrder) => Date.now() - (order.meta?.attemptAt ?? 0) >= NOT_SENT_GRACE_MS;

// ---------------------------------------------------------------------------
// Snapshot: ONE real server read before sending. It proves the network works
// AND records what the table looks like, so we can check the result later.
// Throws when the server cannot be read, which means NOTHING has been sent.
// ---------------------------------------------------------------------------
export async function takeOrderSnapshot(
  orderType: 'kot' | 'sales',
  tableNumber: string,
  floor?: string,
): Promise<{ baseline: Record<string, number> | null; salesBefore: number }> {
  if (orderType === 'sales') {
    const t = todayYmd();
    const res = await withTimeout(
      getSalesReport({ date_from: t, date_to: t, pos_identifier: 'ALL', table_number: tableNumber }),
      15000,
    );
    return { baseline: null, salesBefore: (res.billwise ?? []).length };
  }
  const bills = await getPendingInvoices();
  return { baseline: kotQuantities(bills, tableNumber, floor), salesBefore: 0 };
}

// ---------------------------------------------------------------------------
// Verification: did the order really reach the server?
// ---------------------------------------------------------------------------
async function verifyKot(order: OfflineOrder): Promise<{ result: VerifyResult; bill?: PendingInvoice }> {
  const meta = order.meta;
  const baseline = meta?.baseline;
  if (!meta || !baseline) return { result: 'unknown' };

  let bills: PendingInvoice[];
  try {
    bills = await getPendingInvoices();
  } catch {
    return { result: 'unknown' };
  }
  const now = kotQuantities(bills, order.tableNumber, order.payload.floor);
  if (!now) return { result: 'unknown' };
  const bill = bills.find((b) => sameTable(b, order.tableNumber, order.payload.floor));

  const added: Record<string, number> = {};
  meta.lines.forEach((l) => {
    const k = norm(l.name);
    added[k] = (added[k] ?? 0) + l.quantity;
  });
  const names = Object.keys(added);

  // every item of this order is now on the table's KOT on top of what was there before
  if (names.every((k) => (now[k] ?? 0) >= (baseline[k] ?? 0) + added[k])) return { result: 'sent', bill };

  // nothing changed AND the table did not shrink (e.g. KOT closed elsewhere) AND the slow server had time to finish
  const shrank = Object.keys(baseline).some((k) => (now[k] ?? 0) < baseline[k]);
  const unchanged = names.every((k) => (now[k] ?? 0) <= (baseline[k] ?? 0));
  if (!shrank && unchanged && graceOver(order)) return { result: 'not_sent' };

  return { result: 'unknown' };
}

async function verifySales(order: OfflineOrder): Promise<{ result: VerifyResult; bill?: PendingInvoice }> {
  const meta = order.meta;
  if (!meta) return { result: 'unknown' };
  try {
    const t = todayYmd();
    const res = await withTimeout(
      getSalesReport({ date_from: t, date_to: t, pos_identifier: 'ALL', table_number: order.tableNumber }),
      15000,
    );
    const count = (res.billwise ?? []).length;
    if (count > meta.salesBefore) return { result: 'sent' };
    if (count === meta.salesBefore && graceOver(order)) return { result: 'not_sent' };
  } catch {
    // offline: stay unconfirmed
  }
  return { result: 'unknown' };
}

// kitchen slip rebuilt from the saved cart lines (only the NEW items)
function buildSlip(order: OfflineOrder, orderId: number): PlaceOrderResponse {
  const now = new Date().toISOString();
  const items: KotOrderItem[] = (order.meta?.lines ?? []).map((c, i) => ({
    id: i + 1,
    menu_item_id: c.menuItemId,
    name: c.name,
    portion: c.hasPortions ? c.portionLabel : 'single',
    quantity: c.quantity,
    price: String(c.unitPrice),
    tax: '0',
    item_total: c.unitPrice * c.quantity,
    tax_amount: 0,
    item_total_with_tax: c.unitPrice * c.quantity,
    kitchen_number: null,
    created_at: now,
  }));
  const subtotal = items.reduce((sum, it) => sum + it.item_total, 0);
  const kot: KotOrder = {
    id: orderId,
    session_id: '', client_id: '', username: '',
    customer_name: order.payload.customer_name,
    customer_phone: order.payload.customer_phone ?? '',
    table_number: order.payload.table_number,
    floor: order.payload.floor ?? '',
    waiter_name: order.payload.waiter_name ?? '', member_count: 0,
    subtotal: String(subtotal), tax_amount: '0', total_amount: String(subtotal),
    status: 'open', order_type: 'kot', order_time: order.createdAt,
    special_instructions: order.payload.special_instructions ?? '',
    order_items: items,
    item_count: items.reduce((sum, it) => sum + it.quantity, 0),
    created_at: order.createdAt, updated_at: order.createdAt,
  };
  return { success: true, order: kot };
}

async function finishSent(order: OfflineOrder, bill?: PendingInvoice): Promise<VerifyOutcome> {
  const base = { orderId: order.id, tableNumber: order.tableNumber, orderType: order.orderType, result: 'sent' as const };

  if (order.orderType === 'sales') {
    if (order.closeBillNumber) await updateOfflineOrder(order.id, 'sale_close_pending');
    else await removeOfflineOrder(order.id);
    return base;
  }

  const slip = buildSlip(order, Number(bill?.order_id) || 0);
  if (slip.order) {
    await saveOpenKotForTable(
      order.tableId,
      { ...slip.order, billing_id: bill?.billing_id ?? '', bill_number: bill?.bill_number ?? undefined },
      false,
    );
  }
  // print BEFORE removing the saved order: a crash here prints twice at worst, never loses the slip
  const printed = await printOrderReceipt(slip);
  await removeOfflineOrder(order.id);
  return { ...base, slip, printed: printed.ok, printMessage: printed.ok ? undefined : printed.message };
}

async function resolveOrder(order: OfflineOrder): Promise<{ result: VerifyResult; outcome?: VerifyOutcome }> {
  const check = order.orderType === 'sales' ? await verifySales(order) : await verifyKot(order);
  if (check.result === 'sent') return { result: 'sent', outcome: await finishSent(order, check.bill) };
  if (check.result === 'not_sent') {
    await updateOfflineOrder(order.id, 'pending', 'Confirmed with the server: this order was not received.');
    return {
      result: 'not_sent',
      outcome: { orderId: order.id, tableNumber: order.tableNumber, orderType: order.orderType, result: 'not_sent' },
    };
  }
  return { result: 'unknown' };
}

let activeVerify: Promise<VerifyOutcome[]> | null = null;

/** Checks every unconfirmed order against the server. Returns only the ones that got a final answer. */
export function verifyUnconfirmedOrders(): Promise<VerifyOutcome[]> {
  if (activeVerify) return activeVerify;
  activeVerify = (async () => {
    const outcomes: VerifyOutcome[] = [];
    for (const order of await getOfflineOrders()) {
      if (order.status !== 'needs_review' || isInFlight(order.id)) continue;
      const { outcome } = await resolveOrder(order);
      if (outcome) outcomes.push(outcome);
    }
    return outcomes;
  })().finally(() => { activeVerify = null; });
  return activeVerify;
}

/** Plain-language text for the waiter. Every message says exactly what happened. */
export function describeOutcome(o: VerifyOutcome): { title: string; message: string } {
  const where = `Table ${o.tableNumber}`;
  if (o.result === 'sent') {
    const print = o.orderType === 'sales'
      ? ''
      : o.printed
        ? ' The kitchen slip has been printed.'
        : ` The kitchen slip could NOT be printed (${o.printMessage ?? 'printer error'}). Please tell the kitchen or print again.`;
    return { title: 'Order confirmed', message: `${where}: the server DID receive this order. It was not sent twice.${print}` };
  }
  return { title: 'Order was NOT sent', message: `${where}: the server confirmed it never received this order. Tap Send again to place it.` };
}

// ---------------------------------------------------------------------------
// Housekeeping (runs on Tables screen focus + every 15s)
// ---------------------------------------------------------------------------
let activeSync: Promise<VerifyOutcome[]> | null = null;

export function syncOfflineOrders(): Promise<VerifyOutcome[]> {
  if (activeSync) return activeSync;
  activeSync = (async () => {
    const orders = await getOfflineOrders();
    for (const order of orders) {
      if (isInFlight(order.id)) continue;

      if (order.status === 'sending') {
        // app was killed or the connection dropped mid-send: outcome unknown, verify it
        await updateOfflineOrder(order.id, 'needs_review', 'App closed or connection lost while sending. Checking with the server.');
        continue;
      }
      if (order.status === 'sale_close_pending') {
        if (!order.closeBillNumber) {
          await updateOfflineOrder(order.id, 'needs_review', 'The previous KOT could not be identified for closing.');
          continue;
        }
        try {
          await convertPendingInvoiceToSale(order.closeBillNumber, order.payload.payment_method);
          await removeOfflineOrder(order.id);
        } catch (error) {
          await updateOfflineOrder(order.id, 'sale_close_pending', error instanceof Error ? error.message : 'Could not close the previous KOT.');
        }
      }
    }
    return verifyUnconfirmedOrders();
  })().finally(() => { activeSync = null; });
  return activeSync;
}

// ---------------------------------------------------------------------------
// "Send again": an unconfirmed order is VERIFIED first and only re-posted
// when the server proves it never received it.
// ---------------------------------------------------------------------------
export async function resendOfflineOrder(id: string, manualOverride = false): Promise<ResendResult> {
  const order: OfflineOrder | undefined = (await getOfflineOrders()).find((o) => o.id === id);
  if (!order) return { ok: true, message: 'This order is no longer waiting.' };
  if (isInFlight(id)) return { ok: false, message: 'This order is still being sent. Please wait.' };

  if (order.status === 'needs_review' && !manualOverride) {
    const { result, outcome } = await resolveOrder(order);
    if (result === 'sent') {
      return {
        ok: true,
        message: 'The server had already received this order, so nothing was sent again.',
        slip: outcome?.slip, printed: outcome?.printed, printMessage: outcome?.printMessage,
      };
    }
    if (result === 'unknown') {
      const waited = Date.now() - (order.meta?.attemptAt ?? 0);
      return {
        ok: false,
        unconfirmed: true,
        canOverride: waited >= OVERRIDE_AFTER_MS,
        message: 'We still cannot confirm whether this order reached the server. It was NOT sent again, to avoid a duplicate. We keep checking automatically.',
      };
    }
    // result === 'not_sent': proven missing, safe to send
  }

  let snapshot: Awaited<ReturnType<typeof takeOrderSnapshot>>;
  try {
    snapshot = await takeOrderSnapshot(order.orderType, order.tableNumber, order.payload.floor);
  } catch {
    return { ok: false, message: 'Not sent. The network is too weak to start. Nothing reached the server. Try again when the connection is better.' };
  }
  const meta: OfflineOrderMeta = {
    kind: order.orderType,
    lines: order.meta?.lines ?? [],
    baseline: snapshot.baseline,
    salesBefore: snapshot.salesBefore,
    attemptAt: Date.now(),
  };
  await updateOfflineOrderMeta(id, meta);
  const current: OfflineOrder = { ...order, meta };

  markInFlight(id);
  try {
    await updateOfflineOrder(id, 'sending');
    const res = await placeOrder(order.payload, order.orderType, order.id, false);

    if (order.orderType === 'sales') {
      if (order.closeBillNumber) {
        await updateOfflineOrder(id, 'sale_close_pending');
        try {
          await convertPendingInvoiceToSale(order.closeBillNumber, order.payload.payment_method);
          await removeOfflineOrder(id);
        } catch (error) {
          await updateOfflineOrder(id, 'sale_close_pending', error instanceof Error ? error.message : 'Could not close the previous KOT.');
        }
      } else {
        await removeOfflineOrder(id);
      }
      return { ok: true, message: 'The sale was sent to the server.' };
    }

    const slip = buildSlip(current, res.order?.id ?? 0);
    const saved: KotOrder | undefined = res.merged && res.order ? res.order : slip.order;
    if (saved) {
      await saveOpenKotForTable(
        order.tableId,
        { ...saved, billing_id: res.billing?.billing_id ?? '', bill_number: res.billing?.bill_number },
        !!res.merged,
      );
    }
    const printed = await printOrderReceipt(slip);
    await removeOfflineOrder(id);
    return {
      ok: true,
      message: printed.ok
        ? 'Order sent and the kitchen slip was printed.'
        : `Order sent, but the kitchen slip could NOT be printed: ${printed.message}`,
      slip,
      printed: printed.ok,
      printMessage: printed.ok ? undefined : printed.message,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not send the order.';
    if ((error as { notSent?: boolean })?.notSent) {
      await updateOfflineOrder(id, 'pending', message);
      return { ok: false, message: `Not sent: ${message} Nothing reached the server. You can send it again.` };
    }
    await updateOfflineOrder(id, 'needs_review', message);
    return {
      ok: false,
      unconfirmed: true,
      message: 'No reply from the server. We do not know whether it arrived. It was NOT sent again. Checking automatically.',
    };
  } finally {
    unmarkInFlight(id);
  }
}
