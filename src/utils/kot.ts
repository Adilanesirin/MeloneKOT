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
  portion?: string; // 'full' | 'half' | 'quarter' — see note in the chat about backend support
}

export interface PlaceOrderPayload {
  customer_name: string; // required by the API ("Walk-in Guest" when blank)
  table_number: string; // required
  floor?: string; // sent so tables with the same number on different floors don't clash
  items: PlaceOrderItemPayload[]; // required
  customer_phone?: string; // optional, only sent when filled
  special_instructions?: string; // optional, only sent when filled
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
  order_id: number;
  customer_name: string;
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
  order?: KotOrder;
  billing?: KotBilling;
}