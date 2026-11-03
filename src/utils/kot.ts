// src/utils/kot.ts
// >>> Replace your existing `MenuItem` interface with this one, and add
// >>> `KotItemsResponse` next to it. Everything else in kot.ts stays as is.

/** One item from GET /api/kot-items/ */
export interface MenuItem {
  id: number;
  session_code: string;
  name: string;
  category: number;
  category_name: string;
  kitchen: number | null;
  kitchen_name: string | null;
  status: 'active' | 'inactive' | string;
  food_type: 'veg' | 'non_veg' | string;
  price_type: 'single' | 'portion' | string;
  price_category: string;
  meal_type: string[];
  meal_types: string[];
  remark: string;
  // prices arrive as decimal strings, e.g. "230.00"
  price1: string; // full / single price
  price2: string; // half   (portion items only, "0.00" otherwise)
  price3: string; // quarter (portion items only, "0.00" otherwise)
  tax: number | null;
  hsn_code: string;
  image: string | null;
  image_url: string | null;
  username: string;
  client_id: string;
  created_at: string;
  updated_at: string;
}

export type PortionLabel = 'full' | 'half' | 'quarter';

export interface CartLine {
  menuItemId: number;
  name: string;
  imageUrl: string;
  unitPrice: number;
  portionLabel: PortionLabel;
  hasPortions: boolean;
  quantity: number;
}

export interface AuthUser {
  [key: string]: unknown;
}

export interface LoginCredentials {
  clientId: string;
  username: string;
  password: string;
}

export interface StoredAuthToken {
  token: string;
  tokenType: string;
  expiresAt: number;
}

export interface LoginResponse {
  success: boolean;
  message?: string;
  user?: AuthUser;
  token?: string;
  token_type?: string;
  expires_in?: number;
  needs_credential_reset?: boolean;
}

export interface RestaurantTable {
  id: number;
  table_number: string;
  table_name?: string | null;
  floor?: string | null;
  capacity: number;
  /** True when at least one seat is occupied, even if the table is not full. */
  occupied: boolean;
  occupied_seats: number;
  free_seats: number;
  availability_status: 'free' | 'partial' | 'full' | string;
  status: 'active' | 'inactive' | string;
  color_code?: string | null;
  is_ac: boolean;
}

export interface TablesResponse {
  success: boolean;
  tables: RestaurantTable[];
  message?: string;
}

/** Envelope returned by GET /api/kot-items/ */
export interface KotItemsResponse {
  success: boolean;
  count: number;
  items: MenuItem[];
  message?: string;
}

// ---------------------------------------------------------------------------
// Place order  —  POST /api/kot/place-order/
// >>> DELETE your old `PlaceOrderPayload` and `PlaceOrderResponse` from kot.ts
// >>> and paste everything below in their place.
// ---------------------------------------------------------------------------

export interface PlaceOrderItemPayload {
  menu_item_id: number;
  quantity: number;
  portion?: string; // Omit for items sold at one price.
}

export interface PlaceOrderPayload {
  customer_name: string;
  waiter_name?: string;
  kot_number?: string | number | null;
  table_number: string;
  floor?: string;
  items: PlaceOrderItemPayload[];
  customer_phone?: string;
  special_instructions?: string;
  payment_method?: string; // sales only
}

export interface KotOrderItem {
  id: number;
  menu_item_id: number;
  name: string;
  portion: string;
  quantity: number;
  price: string;
  tax: string;
  item_total: number;
  tax_amount: number;
  item_total_with_tax: number;
  kitchen_number: string | null;
  created_at: string;
}

export interface KotOrder {
  id: number;
  kot_number?: string | number | null;
  /** Billing ID for the open KOT, used to complete it as a sale. */
  billing_id?: string;
  /** Customer-facing bill number used by the pending-invoice conversion API. */
  bill_number?: string;
  session_id: string;
  client_id: string;
  username: string;
  customer_name: string;
  customer_phone: string;
  table_number: string;
  floor: string;
  waiter_name: string;
  member_count: number;
  subtotal: string;
  tax_amount: string;
  total_amount: string;
  status: string;
  order_type: string;
  order_time: string;
  special_instructions: string;
  order_items: KotOrderItem[];
  item_count: number;
  created_at: string;
  updated_at: string;
}

export interface KotBilling {
  billing_id: string;
  bill_number: string;
  kot_number?: string | number | null;
  waiter_name?: string | null;
  order_id: number;
  customer_name: string;
  customer_phone?: string;
  table_number: string;
  subtotal: string;
  tax_amount: string;
  discount_amount: string;
  total_amount: string;
  payment_method: string;
  order_type: string;
  created_at: string;
}

export interface PlaceOrderResponse {
  success: boolean;
  message?: string;
  merged?: boolean;    // true = items were added to the table's existing KOT
  appended?: number;
  bumped?: number;
  order?: KotOrder;
  billing?: KotBilling;
}
