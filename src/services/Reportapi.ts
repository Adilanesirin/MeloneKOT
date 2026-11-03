// src/services/reportApi.ts
// KOT + Sales report endpoints (melone.in/api/mobile).
//
// NOTE: services/api.ts already attaches the Bearer token for your other calls.
// If it exposes a shared request helper, you can replace `post()` below with it.
// Otherwise adjust `readToken()` to match your storage helper name.

import * as storage from './storage';
import { notifyNoNetwork } from './api';

const BASE = 'https://melone.in/api/mobile';

export type KotStageFilter = 'all' | 'pending' | 'invoiced';

export interface KotReportParams {
  date_from: string;
  date_to: string;
  session_id?: string;
  pos_identifier: string;
  stage_filter: KotStageFilter;
  report_type?: string;
}

export interface SalesReportParams {
  date_from: string;
  date_to: string;
  session_id?: string;
  pos_identifier: string;
  table_number: string;
  report_type?: string;
}

export interface ReportItemLine {
  name: string;
  quantity: number;
  price?: number;
  item_discount?: number;
}

export type KotStage = 'pending' | 'invoiced';

export interface KotBill {
  key: string;
  stage: KotStage;
  order_type: string;
  kot_number: string;
  invoice_number: string;
  pos_identifier: string;
  customer: string;
  table: string;
  floor: string;
  time: string;
  payment_method: string;
  total: number;
  items: ReportItemLine[];
}

export interface ItemWiseRow {
  time: string;
  stage: KotStage;
  kot_number: string;
  invoice_number: string;
  pos_identifier: string;
  order_type: string;
  payment_method: string;
  name: string;
  quantity: number;
  rate: number;
  total: number;
}

export interface ItemSummaryRow {
  name: string;
  quantity: number;
  total: number;
  rate: number;
}

export interface KotReportResponse {
  success: boolean;
  message?: string;
  client_id: string;
  date_from?: string;
  date_to?: string;
  filters?: {
    session_id: string | null;
    pos_identifier: string;
    stage_filter: KotStageFilter;
    report_type: string;
  };
  counts: { total: number; active: number; invoiced: number };
  summary: { total_revenue: number };
  billwise: KotBill[];
  itemwise: ItemWiseRow[];
  itemsummary: ItemSummaryRow[];
}

export interface CategoryItem {
  id: number;
  name: string;
  session_code?: string;
  food_type?: string;
  price1?: string;
  status?: string;
}

export interface CategoryWiseRow {
  category_id: number;
  category_name: string;
  total_sales: number;
  items: CategoryItem[];
}

export interface PaymentTotal {
  bills: number;
  total: number;
}

export interface SalesReportResponse {
  success: boolean;
  message?: string;
  client_id: string;
  summary: {
    total_bills: number;
    total_revenue: number;
    total_taxable: number;
    total_tax: number;
    total_discount: number;
    payment_totals: Record<string, PaymentTotal>;
  };
  billwise: any[];
  itemwise: any[];
  itemsummary: ItemSummaryRow[];
  categorywise: CategoryWiseRow[];
}

const readToken = async (): Promise<{ token: string; type: string } | null> => {
  const s = storage as any;
  const raw = typeof s.getAuthToken === 'function' ? await s.getAuthToken() : null;
  if (!raw) return null;
  if (typeof raw === 'string') return { token: raw, type: 'Bearer' };
  return { token: raw.token, type: raw.tokenType || 'Bearer' };
};

async function post<T>(path: string, body: object): Promise<T> {
   const auth = await readToken();
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(auth ? { Authorization: `${auth.type} ${auth.token}` } : {}),
      },
      body: JSON.stringify(body),
    });
    } catch {
    notifyNoNetwork();
    throw new Error('No connection. Check your internet and try again.');
  }
  const data = await res.json().catch(() => null);
  if (res.status === 401) throw new Error('Session expired. Please log in again.');
  if (!res.ok || !data || data.success === false) {
    throw new Error(data?.message || data?.detail || `Request failed (${res.status})`);
  }
  return data as T;
}

export const getKotReport = (p: KotReportParams) =>
  post<KotReportResponse>('/kot-report/', { session_id: '', report_type: 'all', ...p });

export const getSalesReport = (p: SalesReportParams) =>
  post<SalesReportResponse>('/sales-report/', { session_id: '', report_type: 'all', ...p });