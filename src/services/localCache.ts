import * as SQLite from 'expo-sqlite';
import { getSession } from './storage';

type CacheCollection = 'menu_items' | 'tables' | 'pending_kots' | 'table_master';
type CacheRecord = { id: number | string; position: number; payload: string };

export type OfflineOrderStatus = 'pending' | 'sending' | 'needs_review' | 'sale_close_pending';

/** What the table looked like BEFORE we sent. Used to prove later whether the order arrived. */
export interface OfflineOrderMeta {
  kind: 'kot' | 'sales';
  baseline: Record<string, number> | null; // KOT: qty per item name already on the table's KOT
  salesBefore: number;                     // Sales: how many bills this table had today
  lines: import('../utils/kot').CartLine[]; // exactly what this order adds
  attemptAt: number;                       // when the last send started (ms)
}

export interface OfflineOrder {
  id: string;
  tableId: number;
  tableNumber: string;
  orderType: 'kot' | 'sales';
  payload: import('../utils/kot').PlaceOrderPayload;
  closeBillNumber?: string;
  status: OfflineOrderStatus;
  error?: string;
  createdAt: string;
  meta?: OfflineOrderMeta;
}

let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function database(): Promise<SQLite.SQLiteDatabase> {
  if (!databasePromise) {
    databasePromise = (async () => {
      const db = await SQLite.openDatabaseAsync('melone-local-cache.db');
      await db.execAsync(`
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS cached_records (
          account_scope TEXT NOT NULL,
          collection TEXT NOT NULL,
          record_id TEXT NOT NULL,
          position INTEGER NOT NULL,
          payload TEXT NOT NULL,
          PRIMARY KEY (account_scope, collection, record_id)
        );
        CREATE INDEX IF NOT EXISTS cached_records_lookup
          ON cached_records (account_scope, collection, position);
        CREATE TABLE IF NOT EXISTS order_outbox (
          account_scope TEXT NOT NULL,
          order_id TEXT NOT NULL,
          table_id INTEGER NOT NULL,
          table_number TEXT NOT NULL,
          order_type TEXT NOT NULL,
          payload TEXT NOT NULL,
          close_bill_number TEXT,
          status TEXT NOT NULL,
          error TEXT,
          created_at TEXT NOT NULL,
          PRIMARY KEY (account_scope, order_id)
        );
      `);
      try {
        await db.execAsync('ALTER TABLE order_outbox ADD COLUMN meta TEXT');
      } catch {
        // column already exists on this device
      }
      return db;
    })().catch((error) => {
      databasePromise = null;
      throw error;
    });
  }
  return databasePromise;
}

async function accountScope(): Promise<string | null> {
  const session = await getSession() as { client_id?: string; clientId?: string; username?: string } | null;
  const clientId = session?.client_id || session?.clientId;
  const username = session?.username;
  return clientId && username ? `${clientId.trim().toLowerCase()}:${username.trim().toLowerCase()}` : null;
}

/** Read one account's cached collection. Cache failures never block API use. */
export async function readLocalCollection<T>(collection: CacheCollection): Promise<T[] | null> {
  try {
    const scope = await accountScope();
    if (!scope) return null;
    const db = await database();
    const rows = await db.getAllAsync<CacheRecord>(
      'SELECT record_id AS id, position, payload FROM cached_records WHERE account_scope = ? AND collection = ? ORDER BY position ASC',
      scope,
      collection,
    );
    if (!rows.length) return null;
    return rows.map((row) => JSON.parse(row.payload) as T);
  } catch (error) {
    console.warn('[LocalCache] Read failed', collection, error);
    return null;
  }
}

/** Replace a collection with multi-row inserts inside one SQLite transaction. */
export async function writeLocalCollection<T>(
  collection: CacheCollection,
  rows: T[],
  getId: (row: T, index: number) => string | number,
): Promise<void> {
  try {
    const scope = await accountScope();
    if (!scope) return;
    const db = await database();
    await db.withExclusiveTransactionAsync(async (txn) => {
      await txn.runAsync('DELETE FROM cached_records WHERE account_scope = ? AND collection = ?', scope, collection);
      for (let start = 0; start < rows.length; start += 100) {
        const batch = rows.slice(start, start + 100);
        const values: (string | number)[] = [];
        const placeholders = batch.map((row, offset) => {
          const index = start + offset;
          values.push(scope, collection, String(getId(row, index)), index, JSON.stringify(row));
          return '(?, ?, ?, ?, ?)';
        });
        await txn.runAsync(
          `INSERT OR REPLACE INTO cached_records (account_scope, collection, record_id, position, payload) VALUES ${placeholders.join(',')}`,
          values,
        );
      }
    });
  } catch (error) {
    console.warn('[LocalCache] Write failed', collection, error);
  }
}

export async function clearLocalCache(): Promise<void> {
  try {
    const scope = await accountScope();
    if (!scope) return;
    const db = await database();
    await db.runAsync('DELETE FROM cached_records WHERE account_scope = ?', scope);
  } catch (error) {
    console.warn('[LocalCache] Clear failed', error);
  }
}

export async function enqueueOfflineOrder(
  input: Omit<OfflineOrder, 'id' | 'status' | 'createdAt'>,
  status: OfflineOrderStatus,
): Promise<OfflineOrder> {
  const scope = await accountScope();
  if (!scope) throw new Error('Could not identify the logged-in account. The cart is still saved on this device.');
  const db = await database();
  const order: OfflineOrder = {
    ...input,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    status,
    createdAt: new Date().toISOString(),
  };
   await db.runAsync(
    'INSERT INTO order_outbox (account_scope, order_id, table_id, table_number, order_type, payload, close_bill_number, status, error, created_at, meta) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)',
    scope, order.id, order.tableId, order.tableNumber, order.orderType, JSON.stringify(order.payload),
    order.closeBillNumber ?? null, order.status, order.createdAt,
    order.meta ? JSON.stringify(order.meta) : null,
  );
  return order;
}

export async function getOfflineOrders(): Promise<OfflineOrder[]> {
  try {
    const scope = await accountScope();
    if (!scope) return [];
    const db = await database();
    const rows = await db.getAllAsync<{
      order_id: string; table_id: number; table_number: string; order_type: 'kot' | 'sales';
      payload: string; close_bill_number: string | null; status: OfflineOrderStatus; error: string | null; created_at: string;
      meta: string | null;
    }>('SELECT * FROM order_outbox WHERE account_scope = ? ORDER BY created_at ASC', scope);
    return rows.map((row) => ({
      id: row.order_id, tableId: row.table_id, tableNumber: row.table_number, orderType: row.order_type,
      payload: JSON.parse(row.payload), closeBillNumber: row.close_bill_number ?? undefined,
      status: row.status, error: row.error ?? undefined, createdAt: row.created_at,
      meta: row.meta ? (JSON.parse(row.meta) as OfflineOrderMeta) : undefined,
    }));
  } catch (error) {
    console.warn('[OrderOutbox] Read failed', error);
    return [];
  }
}

export async function updateOfflineOrder(id: string, status: OfflineOrderStatus, error?: string): Promise<void> {
  const scope = await accountScope();
  if (!scope) return;
  const db = await database();
  await db.runAsync('UPDATE order_outbox SET status = ?, error = ? WHERE account_scope = ? AND order_id = ?', status, error ?? null, scope, id);
}

export async function removeOfflineOrder(id: string): Promise<void> {
  const scope = await accountScope();
  if (!scope) return;
  const db = await database();
  await db.runAsync('DELETE FROM order_outbox WHERE account_scope = ? AND order_id = ?', scope, id);
}

export async function updateOfflineOrderMeta(id: string, meta: OfflineOrderMeta): Promise<void> {
  const scope = await accountScope();
  if (!scope) return;
  const db = await database();
  await db.runAsync('UPDATE order_outbox SET meta = ? WHERE account_scope = ? AND order_id = ?', JSON.stringify(meta), scope, id);
}

/** Any unfinished order on this table blocks a new order for the same table. */
export async function getBlockingOrderForTable(tableId: number): Promise<OfflineOrder | null> {
  const orders = await getOfflineOrders();
  return orders.find((o) =>
    o.tableId === tableId && (o.status === 'sending' || o.status === 'needs_review' || o.status === 'pending')
  ) ?? null;
}
// ids currently being sent by THIS app process. A 'sending' row that is not in
// this set belongs to a dead process (app killed mid-send), so only those are stale.
const inFlight = new Set<string>();
export const markInFlight = (id: string) => { inFlight.add(id); };
export const unmarkInFlight = (id: string) => { inFlight.delete(id); };
export const isInFlight = (id: string) => inFlight.has(id);
