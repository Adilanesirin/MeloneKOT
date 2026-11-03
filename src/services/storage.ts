// src/services/storage.ts
// Persistence helpers for the KOT flow:
//  - the JWT access token (kept in the device's encrypted keystore via
//    expo-secure-store, NOT plain AsyncStorage)
//  - the logged-in user profile (AsyncStorage)
//  - remembered client id + username for the "Remember me" checkbox
//  - a persisted cart per table, so an in-progress order survives an
//    accidental app kill/backgrounding

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { AuthUser, CartLine, KotOrder, LoginCredentials, StoredAuthToken } from '../utils/kot';

// ---------------------------------------------------------------------------
// Keys
// ---------------------------------------------------------------------------
const KEYS = {
  SESSION_USER: '@melone_kot/session_user',
  REMEMBERED_CREDENTIALS: '@melone_kot/remembered_credentials',
  CART_PREFIX: '@melone_kot/cart_table_', // + table id
} as const;

// SecureStore keys may only contain alphanumerics, ".", "-" and "_"
// (no "@" or "/"), so it gets its own key format.
const SECURE_TOKEN_KEY = 'melone_kot.auth_token';

// ---------------------------------------------------------------------------
// Auth token (JWT from POST /api/user-login/)
// ---------------------------------------------------------------------------
export async function saveAuthToken(params: {
  token: string;
  tokenType?: string;
  expiresIn?: number; // seconds, straight from the login response
}): Promise<void> {
  const stored: StoredAuthToken = {
    token: params.token,
    tokenType: params.tokenType || 'Bearer',
    // fall back to 30 days if the server ever omits expires_in
    expiresAt: Date.now() + (params.expiresIn ?? 2592000) * 1000,
  };
  try {
    await SecureStore.setItemAsync(SECURE_TOKEN_KEY, JSON.stringify(stored));
  } catch (err) {
    console.warn('storage: failed to save auth token', err);
  }
}

/** Returns the stored token, or null if there is none / it has expired. */
export async function getAuthToken(): Promise<StoredAuthToken | null> {
  try {
    const raw = await SecureStore.getItemAsync(SECURE_TOKEN_KEY);
    if (!raw) return null;
    const stored = JSON.parse(raw) as StoredAuthToken;
    if (!stored.token || Date.now() >= stored.expiresAt) return null;
    return stored;
  } catch (err) {
    console.warn('storage: failed to read auth token', err);
    return null;
  }
}

export async function clearAuthToken(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(SECURE_TOKEN_KEY);
  } catch (err) {
    console.warn('storage: failed to clear auth token', err);
  }
}

// ---------------------------------------------------------------------------
// Session (the logged-in user, after a successful /api/user-login/ call)
// ---------------------------------------------------------------------------
export async function saveSession(user: AuthUser): Promise<void> {
  try {
    await AsyncStorage.setItem(KEYS.SESSION_USER, JSON.stringify(user));
  } catch (err) {
    console.warn('storage: failed to save session', err);
  }
}

/**
 * Returns the logged-in user, or null when there is no valid session.
 * A session is only valid while its token is present and unexpired; otherwise
 * everything is cleared so the app falls back to the login screen.
 */
export async function getSession(): Promise<AuthUser | null> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.SESSION_USER);
    if (!raw) return null;

    const token = await getAuthToken();
    if (!token) {
      await clearSession();
      return null;
    }
    return JSON.parse(raw) as AuthUser;
  } catch (err) {
    console.warn('storage: failed to read session', err);
    return null;
  }
}

/** Logout: removes both the user profile and the access token. */
export async function clearSession(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEYS.SESSION_USER);
  } catch (err) {
    console.warn('storage: failed to clear session', err);
  }
  await clearAuthToken();
}

// ---------------------------------------------------------------------------
// Remembered login fields (only used when "Remember me" is checked; holds
// client id + username, NEVER the password)
// ---------------------------------------------------------------------------
type RememberedFields = Pick<LoginCredentials, 'clientId' | 'username'>;

export async function saveRememberedCredentials(fields: RememberedFields): Promise<void> {
  try {
    await AsyncStorage.setItem(KEYS.REMEMBERED_CREDENTIALS, JSON.stringify(fields));
  } catch (err) {
    console.warn('storage: failed to save remembered credentials', err);
  }
}

export async function getRememberedCredentials(): Promise<RememberedFields | null> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.REMEMBERED_CREDENTIALS);
    return raw ? (JSON.parse(raw) as RememberedFields) : null;
  } catch (err) {
    console.warn('storage: failed to read remembered credentials', err);
    return null;
  }
}

export async function clearRememberedCredentials(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEYS.REMEMBERED_CREDENTIALS);
  } catch (err) {
    console.warn('storage: failed to clear remembered credentials', err);
  }
}

// ---------------------------------------------------------------------------
// Per-table cart (so switching tables or backgrounding the app doesn't lose
// an order in progress)
// ---------------------------------------------------------------------------
type CartModule = 'kot' | 'sales';
const cartKey = (tableId: number, module: CartModule = 'kot') => `${KEYS.CART_PREFIX}${module}_${tableId}`;
export async function saveCartForTable(tableId: number, cart: CartLine[], module: CartModule = 'kot'): Promise<void> {
  try {
    await AsyncStorage.setItem(cartKey(tableId, module), JSON.stringify(cart));
  } catch (err) {
    console.warn('storage: failed to save cart', err);
  }
}

export async function getCartForTable(tableId: number, module: CartModule = 'kot'): Promise<CartLine[]> {
  try {
    const raw = await AsyncStorage.getItem(cartKey(tableId, module));
    return raw ? (JSON.parse(raw) as CartLine[]) : [];
  } catch (err) {
    console.warn('storage: failed to read cart', err);
    return [];
  }
}

export async function clearCartForTable(tableId: number, module: CartModule = 'kot'): Promise<void> {
  try {
    await AsyncStorage.removeItem(cartKey(tableId, module));
  } catch (err) {
    console.warn('storage: failed to clear cart', err);
  }
}

const openKotKey = (tableId: number) => `@melone_kot/open_kot_${tableId}`;

/** Keep the active KOT on-device so Sales can show and carry it into the final bill. */
export async function getOpenKotForTable(tableId: number): Promise<KotOrder | null> {
  try {
    const raw = await AsyncStorage.getItem(openKotKey(tableId));
    return raw ? (JSON.parse(raw) as KotOrder) : null;
  } catch (err) {
    console.warn('storage: failed to read open KOT', err);
    return null;
  }
}

export async function saveOpenKotForTable(tableId: number, order: KotOrder, replace = false): Promise<void> {
  try {
    if (replace) {
      // Server already merged the items; its order is the source of truth.
      await AsyncStorage.setItem(openKotKey(tableId), JSON.stringify(order));
      return;
    }
    const previous = await getOpenKotForTable(tableId);
    const merged = new Map<string, KotOrder['order_items'][number]>();
    [...(previous?.order_items ?? []), ...order.order_items].forEach((item) => {
      const key = `${item.menu_item_id}_${String(item.portion || 'full').toLowerCase()}`;
      const existing = merged.get(key);
      merged.set(key, existing ? { ...existing, quantity: existing.quantity + item.quantity } : item);
    });
    const items = Array.from(merged.values());
    await AsyncStorage.setItem(openKotKey(tableId), JSON.stringify({
      ...order,
      ...(previous ? { id: previous.id, order_time: previous.order_time } : {}),
      order_items: items,
      item_count: items.reduce((sum, item) => sum + item.quantity, 0),
    }));
  } catch (err) {
    console.warn('storage: failed to save open KOT', err);
  }
}

export async function clearOpenKotForTable(tableId: number): Promise<void> {
  try {
    await AsyncStorage.removeItem(openKotKey(tableId));
  } catch (err) {
    console.warn('storage: failed to clear open KOT', err);
  }
}
