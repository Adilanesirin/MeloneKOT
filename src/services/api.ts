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
import { clearSession, getAuthToken } from './storage';

const BASE_URL = 'https://melone.in/api';

// ---------------------------------------------------------------------------
// Session-expired hook — register once from your navigator (see AppNavigator
// snippet in the notes) so any screen's API call that hits a 401 lands the
// user back on Login.
// ---------------------------------------------------------------------------
let unauthorizedHandler: (() => void) | null = null;

export function setUnauthorizedHandler(handler: (() => void) | null): void {
  unauthorizedHandler = handler;
}

// ---------------------------------------------------------------------------
// Internal fetch helper — consistent auth header, error handling + JSON
// parsing for every call below.
// ---------------------------------------------------------------------------
interface RequestOptions extends RequestInit {
  /** Attach the Bearer token (default true). Login itself passes false. */
  auth?: boolean;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { auth = true, headers: extraHeaders, ...fetchOptions } = options;

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
  try {
    res = await fetch(`${BASE_URL}${path}`, { ...fetchOptions, headers });
  } catch (err) {
    throw new Error('Network error. Please check your connection and try again.');
  }

  // Token missing/expired/revoked -> log out locally and bounce to Login.
  if (res.status === 401 && auth) {
    await clearSession();
    unauthorizedHandler?.();
    throw new Error('Session expired. Please log in again.');
  }

  let data: any;
  try {
    data = await res.json();
  } catch (err) {
    throw new Error('Unexpected response from server.');
  }

  if (!res.ok) {
    throw new Error(extractErrorMessage(data, res.status));
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

  if (typeof data === 'object') {
    for (const [key, value] of Object.entries(data)) {
      const first = Array.isArray(value) ? value[0] : value;
      if (typeof first === 'string' && first) return `${key}: ${first}`;
    }
  }
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

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------
// GET /api/kot-tables/ needs the Bearer token (401 without it). The token
// already identifies the client + user, so no query params are sent.
export async function getTables(): Promise<TablesResponse> {
  return request<TablesResponse>('/kot-tables/', { method: 'GET' });
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

// ---------------------------------------------------------------------------
// Place order  —  POST /api/kot/place-order/
// ---------------------------------------------------------------------------
// Body:     { customer_name, table_number, items: [{ menu_item_id, quantity }] }
// Response: { success, order: {...}, billing: {...} }
// The server looks up prices + tax itself, so unit prices are NOT sent.
// The Bearer token identifies the client + user (no client_id/username needed).
export async function placeOrder(payload: PlaceOrderPayload): Promise<PlaceOrderResponse> {
  const data = await request<PlaceOrderResponse>('/kot/place-order/', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  if (!data?.success) {
    throw new Error(data?.message || 'Failed to place order.');
  }
  return data;
}