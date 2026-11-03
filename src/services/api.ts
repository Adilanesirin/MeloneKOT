// src/services/api.ts
// All network calls for the KOT flow.
//
// Auth: POST /user-login/ returns a JWT. Every other call automatically sends
// it as `Authorization: Bearer <token>` (read from secure storage). If the
// server answers 401 the session is wiped and the registered
// "unauthorized handler" runs (use it to send the user back to Login).

import {
  LoginCredentials,
  LoginResponse,
  TablesResponse,
  MenuItem,
  KotItemsResponse,
  PlaceOrderPayload,
  PlaceOrderResponse,
} from '../utils/kot';
// (PlaceOrderPayload / PlaceOrderResponse are redefined in kot-types-menu.ts)
import { clearSession, getAuthToken, getSession } from './storage';

const BASE_URL = 'https://melone.in/api';
import NetInfo from '@react-native-community/netinfo';

/** notSent = true means the request provably never reached the server (or was rejected by it). */
export class RequestError extends Error {
  notSent: boolean;
  constructor(message: string, notSent: boolean) {
    super(message);
    this.notSent = notSent;
    Object.setPrototypeOf(this, RequestError.prototype);
  }
}
// synchronous "is there any connection at all" flag, kept fresh by NetInfo
let lastConnected: boolean | null = null;

// screens/gates can subscribe to find out when the network is down
const noNetworkListeners = new Set<() => void>();
export const subscribeNoNetwork = (listener: () => void) => {
  noNetworkListeners.add(listener);
  return () => { noNetworkListeners.delete(listener); };
};
export const notifyNoNetwork = () => noNetworkListeners.forEach((l) => l());

NetInfo.addEventListener((s) => {
  lastConnected = s.isConnected;
  if (s.isConnected === false) notifyNoNetwork();
});
/** Real round-trip to our server. Any HTTP answer counts as reachable. */
export async function isServerReachable(timeoutMs = 5000): Promise<boolean> {
  if (lastConnected === false) return false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    await fetch(`${BASE_URL}/user-login/`, { method: 'HEAD', signal: controller.signal });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Session-expired hook — register once from your navigator (see AppNavigator
// snippet in the notes) so any screen's API call that hits a 401 lands the
// user back on Login.
// ---------------------------------------------------------------------------
let unauthorizedHandler: (() => void) | null = null;

export function setUnauthorizedHandler(handler: (() => void) | null): void {
  unauthorizedHandler = handler;
}

interface RequestOptions extends RequestInit {
  auth?: boolean;
  timeoutMs?: number;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { auth = true, timeoutMs, headers: extraHeaders, ...fetchOptions } = options;
  const method = (fetchOptions.method || 'GET').toUpperCase();

  if (lastConnected === false) {
    notifyNoNetwork();
    throw new RequestError('No internet connection.', true);
  }
    const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...(extraHeaders as Record<string, string> | undefined),
  };

  if (auth) {
    const stored = await getAuthToken();
    if (stored) {
      headers.Authorization = `${stored.tokenType || 'Bearer'} ${stored.token}`;
    }
  }

  let res: Response;
  let data: any = null;
  let parseFailed = false;
  const controller = new AbortController();
  // the timer now covers the response BODY too, not only the headers
  const timer = setTimeout(() => controller.abort(), timeoutMs ?? (method === 'GET' ? 10000 : 15000));
  try {
    res = await fetch(`${BASE_URL}${path}`, { ...fetchOptions, headers, signal: controller.signal });
    const raw = await res.text();
    try { data = JSON.parse(raw); } catch {
      parseFailed = true;
      console.log('[API] Non-JSON response', JSON.stringify({ path, status: res.status, contentType: res.headers.get('content-type'), body: raw.slice(0, 500) }));
    }
   } catch {
    // timeouts (aborted) are a slow-network case, not "no network"
    if (!controller.signal.aborted) notifyNoNetwork();
    throw new RequestError(
      controller.signal.aborted ? 'Poor Connection. Please try again.' : 'Network error. Please check your connection and try again.',
      false,
    );
  } finally {
    clearTimeout(timer);
  }
  if (controller.signal.aborted && parseFailed) {
    throw new RequestError('Poor Connection. Please try again.', false);
  }

  if (res.status === 401 && auth) {
    await clearSession();
    unauthorizedHandler?.();
    throw new RequestError('Session expired. Please log in again.', true);
  }
  if (parseFailed) throw new RequestError('Unexpected response from server.', false);

  if (!res.ok) {
    console.error('[API] Request failed', JSON.stringify({ method, endpoint: path, status: res.status, response: data }));
    // a 4xx means the server looked at the request and refused it: nothing was created
    throw new RequestError(extractErrorMessage(data, res.status), res.status >= 400 && res.status < 500);
  }
  return data as T;
}


/**
 * Turns whatever the Django backend sends back into one readable line:
 *  { message } | { detail } | { error } | { field: ["msg"] } (DRF validation)
 */
function extractErrorMessage(data: any, status: number): string {
  const fallback = `Request failed (${status})`;
  if (!data) return fallback;
  if (typeof data === 'string') return data;
  if (typeof data.message === 'string' && data.message) return data.message;
  if (typeof data.detail === 'string' && data.detail) return data.detail;
  if (typeof data.error === 'string' && data.error) return data.error;

  const findMessage = (value: unknown, path: string): string | null => {
    if (typeof value === 'string' && value) return `${path}: ${value}`;
    if (Array.isArray(value)) {
      for (const entry of value) {
        const message = findMessage(entry, path);
        if (message) return message;
      }
    } else if (value && typeof value === 'object') {
      for (const [key, entry] of Object.entries(value)) {
        const message = findMessage(entry, path ? `${path}.${key}` : key);
        if (message) return message;
      }
    }
    return null;
  };
  const validationMessage = findMessage(data.errors ?? data, '');
  if (validationMessage) return validationMessage.replace(/^\.:?/, '');
  return fallback;
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
export async function login(credentials: LoginCredentials): Promise<LoginResponse> {
  return request<LoginResponse>('/user-login/', {
    method: 'POST',
    auth: false, // no token yet; also a 401 here means "wrong credentials", not "expired session"
    body: JSON.stringify({
      client_id: credentials.clientId.trim(),
      username: credentials.username.trim(),
      password: credentials.password,
    }),
  });
}

/** Logout: wipes the token + user profile from the device. */
export async function logout(): Promise<void> {
  await clearSession();
}

export interface CompanyInfo {
  client_id?: string;
  firm_name?: string;
  place?: string;
  address?: string;
  phone?: string;
  email?: string;
  gst_number?: string;
  whatsapp?: string;
  [key: string]: unknown;
}

/** Company details used on printed sales bills. */
export async function getCompanyInfo(): Promise<CompanyInfo | null> {
  const data = await request<{ success?: boolean; company?: CompanyInfo }>('/mobile/company-info/', { method: 'GET' });
  return data?.success && data.company ? data.company : null;
}

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------
// GET /api/kot-tables/ needs the Bearer token (401 without it). The token
// already identifies the client + user, so no query params are sent.
export async function getTables(): Promise<TablesResponse> {
  return request<TablesResponse>('/kot-tables/', { method: 'GET' });
}

export interface MasterTable {
  id: number;
  table_number: string;
  table_name: string;
  capacity: number;
  table_type: string;
  occupied_seats?: number;
  occupied?: boolean;
  floor: string;
  is_ac: boolean;
  availability_status?: string;
  free_seats?: number;
  color_code?: string;
  status: 'active' | 'inactive' | string;
  client_id?: string;
  username?: string;
}

export type CreateMasterTableInput = Pick<MasterTable, 'table_number' | 'table_name' | 'capacity' | 'table_type' | 'floor' | 'is_ac' | 'status'>;

export async function getMasterTables(): Promise<MasterTable[]> {
  const data = await request<any>('/mobile/tables/', { method: 'GET' });
  if (Array.isArray(data)) return data;
  const list = data?.tables ?? data?.results ?? data?.data ?? [];
  return Array.isArray(list) ? list : [];
}

export async function createMasterTable(input: CreateMasterTableInput): Promise<MasterTable> {
  const data = await request<{ success?: boolean; table?: MasterTable; message?: string }>('/mobile/tables/', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  if (data?.success === false || !data?.table) throw new Error(data?.message || 'Could not create table.');
  return data.table;
}

export interface PendingInvoiceItem {
  name?: string | null;
  item_name?: string | null;
  menu_item_name?: string | null;
  quantity?: number | string | null;
  portion?: string | null;
  price?: number | string | null;
  item_total?: number | string | null;
  item_total_with_tax?: number | string | null;
  [key: string]: unknown;
}

export interface PendingInvoice {
  billing_id: string;
  bill_number?: string | null;
  kot_number?: string | number | null;
  waiter_name?: string | null;
  order_id?: number | string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  table_number?: string | null;
  floor?: string | null;
  total_amount?: string | number | null;
  created_at?: string | null;
  items?: PendingInvoiceItem[] | null;
  order_items?: PendingInvoiceItem[] | null;
  order?: { items?: PendingInvoiceItem[] | null; order_items?: PendingInvoiceItem[] | null; customer_phone?: string | null } | null;
  [key: string]: unknown;
}

export interface PendingInvoicesResponse {
  success: boolean;
  count: number;
  bills: PendingInvoice[];
  message?: string;
}

export async function getPendingInvoices(): Promise<PendingInvoice[]> {
  const data = await request<PendingInvoicesResponse>('/kot/pending-invoices/', { method: 'GET' });
  if (!data?.success) throw new Error(data?.message || 'Could not load pending KOTs.');
  return Array.isArray(data.bills) ? data.bills : [];
}

export async function convertPendingInvoiceToSale(
  billNumber: string,
  paymentMethod?: string,
  billingId?: string,
  kotNumber?: string | number | null,
  waiterName?: string,
): Promise<{ success: boolean; message?: string; [key: string]: unknown }> {
  if (!billNumber.trim()) throw new Error('Bill number is required to complete this sale.');
  const session = (await getSession()) as { username?: string } | null;
  const resolvedWaiter = waiterName?.trim() || session?.username?.trim();
  console.log('[Convert] Request body', { billNumber, billingId: billingId ?? null, kotNumber: kotNumber ?? null, waiterName: resolvedWaiter ?? null, paymentMethod });
  const data = await request<{ success: boolean; message?: string; [key: string]: unknown }>('/kot/pending-invoices/to-sale/', {
    method: 'POST',
    body: JSON.stringify({
      bill_number: billNumber,
      ...(billingId ? { billing_id: billingId } : {}),
      ...(kotNumber != null ? { kot_number: String(kotNumber) } : {}),
      ...(resolvedWaiter ? { waiter_name: resolvedWaiter } : {}),
      ...(paymentMethod?.trim() ? { payment_method: paymentMethod.trim() } : {}),
    }),
  });
  if (!data?.success) throw new Error(data?.message || 'Could not complete this sale.');
  return data;
}

// ---------------------------------------------------------------------------
// Menu items  —  GET /api/kot-items/
// ---------------------------------------------------------------------------
// Same pattern as kot-tables: the Bearer token already identifies the client
// + user, so NO query params are sent.
//
// Response shape:
//   { success: true, count: 17, items: [ { id, name, category_name, ... } ] }
//
// Returns the plain MenuItem[] (a bare array response is tolerated too, in
// case the backend ever changes).
export async function getKotItems(): Promise<MenuItem[]> {
  const data = await request<KotItemsResponse | MenuItem[]>('/kot-items/', { method: 'GET' });

  if (Array.isArray(data)) return data;

  if (data?.success === false) {
    throw new Error(data.message || 'Failed to load menu items.');
  }

  return Array.isArray(data?.items) ? data.items : [];
}

export const PLACE_ORDER_TIMEOUT_MS = 45000; // slow networks need time; aborting early creates "unknown" cases

export async function placeOrder(
  payload: PlaceOrderPayload,
  orderType: 'kot' | 'sales' = 'kot',
  requestId?: string,
  preflight = true, // callers that already did a real server read pass false (no second 5s wait)
): Promise<PlaceOrderResponse> {
  const endpoint = orderType === 'sales' ? '/sales/place-order/' : '/kot/place-order/';

  if (preflight && !(await isServerReachable(5000))) {
    throw new RequestError('No stable connection.', true);
  }

  const data = await request<PlaceOrderResponse>(endpoint, {
    method: 'POST',
    timeoutMs: PLACE_ORDER_TIMEOUT_MS,
    // the backend should store client_request_id and return the existing order if it sees it twice
    body: JSON.stringify(requestId ? { ...payload, client_request_id: requestId } : payload),
  });

  if (!data?.success) {
    throw new RequestError(data?.message || 'Failed to place order.', true); // server answered "no": nothing created
  }
  console.log('[Order] Server acknowledged order', {
    orderType,
    orderId: data.order?.id ?? null,
    billingId: data.billing?.billing_id ?? null,
    billNumber: data.billing?.bill_number ?? null,
    kotNumber: data.billing?.kot_number ?? data.order?.kot_number ?? null,
    waiterName: data.order?.waiter_name ?? null,
    paymentMethod: data.billing?.payment_method ?? null,
  });
  // success:true means the order exists. A missing or oddly-typed order record
  // must NOT become an "unknown outcome" error, so only warn.
  if (!data.order || !Number.isFinite(Number(data.order.id))) {
    console.warn('[Order] success=true but order record missing/odd', JSON.stringify(data));
  }
  return data;
}

export interface PaymentMethod {
  id: number;
  code: string;
  name: string;
  client_id?: string;
  username?: string;
}

// GET /currency/ returns rows for ALL clients, so keep only the logged-in
// client's rows, then dedupe by name (e.g. two "upi" rows become one).
export async function getPaymentMethods(): Promise<PaymentMethod[]> {
  const data = await request<PaymentMethod[] | { results?: PaymentMethod[] }>('/currency/', { method: 'GET' });
  const all = Array.isArray(data) ? data : data?.results ?? [];

  const session = (await getSession()) as { client_id?: string; username?: string } | null;
  const clientId = session?.client_id?.trim().toLowerCase();
  const list = clientId
    ? all.filter((m) => (m.client_id || '').trim().toLowerCase() === clientId)
    : all; // no client_id in session -> don't filter (avoids wrongly creating duplicates)

  const seen = new Set<string>();
  return list.filter((m) => {
    const key = (m.name || '').trim().toUpperCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// POST /currency/  { client_id, username, code, name }
// The backend requires client_id + username in the body (it doesn't take them from the token).
export async function createPaymentMethod(code: string, name: string): Promise<PaymentMethod> {
  const session = (await getSession()) as { client_id?: string; clientId?: string; username?: string } | null;
  const client_id = session?.client_id || session?.clientId;
  const username = session?.username;
  if (!client_id || !username) {
    throw new Error('Missing client_id/username in session. Please log in again.');
  }
  return request<PaymentMethod>('/currency/', {
    method: 'POST',
    body: JSON.stringify({ client_id, username, code, name }),
  });
}

// Returns all methods and auto-adds "card" if none exists yet.
let inflight: Promise<PaymentMethod[]> | null = null;
export function getPaymentMethodsWithCard(): Promise<PaymentMethod[]> {
  if (inflight) return inflight; // avoids double-creating card from two screens
  inflight = (async () => {
    let list = await getPaymentMethods();
    if (!list.some((m) => /card/i.test(m.name))) {
  // code is based only on THIS client's existing codes (non-numeric like "C" count as 0)
  const next = String(Math.max(0, ...list.map((m) => parseInt(m.code, 10) || 0)) + 1).padStart(3, '0');
  try {
    list = [...list, await createPaymentMethod(next, 'card')];
  } catch {
    list = [...list, { id: -1, code: next, name: 'card' }]; // local fallback
  }
}
return list;
  })().finally(() => { inflight = null; });
  return inflight;
}
// ---------------------------------------------------------------------------
// Menu item creation  —  POST /api/menu-items/
// ---------------------------------------------------------------------------
export interface CreateMenuItemInput {
  session_code?: string;
  name: string;
  category: number;
  status: 'active' | 'inactive';
  food_type: 'veg' | 'non_veg';
  price_type: 'single' | 'portion';
  price_category?: string;
  price1: string;
  price2?: string;
  price3?: string;
  tax?: number | null;
  hsn_code?: string;
  remark?: string;
}

export interface CreatedMenuItem {
  id: number;
  name: string;
  session_code?: string | null;
  category: number;
  category_name?: string | null;
  price1: string;
  [key: string]: unknown;
}

// The backend needs client_id + username in the body (same as /currency/).
export async function createMenuItem(input: CreateMenuItemInput): Promise<CreatedMenuItem> {
  const session = (await getSession()) as { client_id?: string; clientId?: string; username?: string } | null;
  const client_id = session?.client_id || session?.clientId;
  const username = session?.username;
  if (!client_id || !username) {
    throw new Error('Missing client_id/username in session. Please log in again.');
  }

  const body: Record<string, unknown> = {
    ...input,
    price_category: input.price_category || 'regular',
    username,
    client_id,
  };
  // don't send empty optionals — let the server apply its defaults
  Object.keys(body).forEach((k) => {
    if (body[k] === '' || body[k] === undefined || body[k] === null) delete body[k];
  });

  return request<CreatedMenuItem>('/menu-items/', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}
// ---------------------------------------------------------------------------
// Categories  —  GET / POST /api/categories/
// ---------------------------------------------------------------------------
export interface Category {
  id: number;
  name: string;
  client_id?: string;
  username?: string;
}

// The server scopes GET /categories/ by client_id + username in the query string
// (without them it returns []), so we always send them.
export async function getCategories(): Promise<Category[]> {
  const session = (await getSession()) as { client_id?: string; clientId?: string; username?: string } | null;
  const rawClientId = session?.client_id || session?.clientId || '';
  const username = session?.username || '';
  if (!rawClientId || !username) {
    throw new Error('Missing client_id/username in session. Please log in again.');
  }

  const data = await request<any>(
    `/categories/?client_id=${encodeURIComponent(rawClientId)}&username=${encodeURIComponent(username)}`,
    { method: 'GET' }
  );
  const all: Category[] = Array.isArray(data)
    ? data
    : data?.results ?? data?.data ?? data?.categories ?? [];

  // safety net: even if the server ignores the query, only show this client's rows
  const clientId = rawClientId.trim().toLowerCase();
  const list = all.filter((c) => (c.client_id || '').trim().toLowerCase() === clientId);

  console.log('[Categories] rows', all.length, 'matched client', list.length);

  return [...list].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
}

export async function createCategory(name: string): Promise<Category> {
  const session = (await getSession()) as { client_id?: string; clientId?: string; username?: string } | null;
  const client_id = session?.client_id || session?.clientId;
  const username = session?.username;
  if (!client_id || !username) {
    throw new Error('Missing client_id/username in session. Please log in again.');
  }
  return request<Category>('/categories/', {
    method: 'POST',
    body: JSON.stringify({ name: name.trim(), client_id, username }),
  });
}

// ---------------------------------------------------------------------------
// Taxes  —  GET / POST /api/taxes/
// ---------------------------------------------------------------------------
export interface Tax {
  id: number;
  name: string;
  percentage: string;
  description?: string;
  status: 'active' | 'inactive';
  username?: string;
}

export interface CreateTaxInput {
  name: string;
  percentage: string;
  description?: string;
  status: 'active' | 'inactive';
}

// Tax rows carry no client_id, so we can only scope them by username.
// If your backend already scopes /taxes/ by token, this filter is harmless.
export async function getTaxes(): Promise<Tax[]> {
  const session = (await getSession()) as { username?: string } | null;
  const rawUsername = session?.username || '';
  const query = rawUsername ? `?username=${encodeURIComponent(rawUsername)}` : '';

  const data = await request<Tax[] | { results?: Tax[] }>(`/taxes/${query}`, { method: 'GET' });
  const all = Array.isArray(data) ? data : data?.results ?? [];

  const username = rawUsername.trim().toLowerCase();
  const list = username ? all.filter((t) => (t.username || '').trim().toLowerCase() === username) : all;
  return [...list].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
}

export async function createTax(input: CreateTaxInput): Promise<Tax> {
  const session = (await getSession()) as { username?: string } | null;
  if (!session?.username) throw new Error('Missing username in session. Please log in again.');
  return request<Tax>('/taxes/', {
    method: 'POST',
    body: JSON.stringify({
      name: input.name.trim(),
      percentage: input.percentage,
      description: input.description?.trim() || '',
      status: input.status,
      username: session.username,
    }),
  });
}
