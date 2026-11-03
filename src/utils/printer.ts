
import { Platform, PermissionsAndroid } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getBLEPrinter } from './nativeModules'; // adjust the path to where you saved it

import { PlaceOrderResponse } from '../utils/kot';
import { buildKotText, buildSalesBillText, FirmInfo, GstDisplayMode, PaperWidth } from '../utils/receipt';
import { getCompanyInfo } from '../services/api';

const PRINTER_KEY = '@melone_kot/printer';
const SALES_BILL_PRINTING_KEY = '@melone_kot/print_sales_bill';
const GST_DISPLAY_KEY = '@melone_kot/gst_display_mode';
const PRINT_TIMEOUT_MS = 10000;

export type SalesPrintMode = 'kot' | 'sales' | 'both';

export async function getSalesPrintMode(): Promise<SalesPrintMode> {
  try {
    const saved = await AsyncStorage.getItem(SALES_BILL_PRINTING_KEY);
    if (saved === 'kot' || saved === 'sales' || saved === 'both') return saved;
    // Migrate the previous on/off setting: on printed KOT + bill; off printed KOT.
    return saved === 'false' ? 'kot' : 'both';
  } catch { return 'both'; }
}
export async function setSalesPrintMode(mode: SalesPrintMode): Promise<void> {
  await AsyncStorage.setItem(SALES_BILL_PRINTING_KEY, mode);
}

export async function getGstDisplayMode(): Promise<GstDisplayMode> {
  try { return (await AsyncStorage.getItem(GST_DISPLAY_KEY)) === 'split' ? 'split' : 'single'; }
  catch { return 'single'; }
}

export async function setGstDisplayMode(mode: GstDisplayMode): Promise<void> {
  await AsyncStorage.setItem(GST_DISPLAY_KEY, mode);
}

export interface SavedPrinter {
  name: string;
  address: string; // Bluetooth MAC address
  paperWidth?: PaperWidth;
}

const DEFAULT_PAPER_WIDTH: PaperWidth = 2;

export async function getPaperWidth(): Promise<PaperWidth> {
  const printer = await getSavedPrinter();
  const width = printer?.paperWidth;
  return width === 3 || width === 4 || width === 5 ? width : DEFAULT_PAPER_WIDTH;
}

export async function savePaperWidth(paperWidth: PaperWidth): Promise<void> {
  const printer = await getSavedPrinter();
  if (printer) await savePrinter({ ...printer, paperWidth });
}

export type PrintResult =
  | { ok: true }
  | { ok: false; reason: 'no-printer' | 'permission' | 'error'; message: string };

// ---------------------------------------------------------------------------
// Saved printer
// ---------------------------------------------------------------------------
export async function getSavedPrinter(): Promise<SavedPrinter | null> {
  try {
    const raw = await AsyncStorage.getItem(PRINTER_KEY);
    return raw ? (JSON.parse(raw) as SavedPrinter) : null;
  } catch {
    return null;
  }
}

export async function savePrinter(printer: SavedPrinter): Promise<void> {
  try {
    await AsyncStorage.setItem(PRINTER_KEY, JSON.stringify(printer));
  } catch (err) {
    console.warn('printer: failed to save printer', err);
  }
}

export async function clearPrinter(): Promise<void> {
  try {
    await AsyncStorage.removeItem(PRINTER_KEY);
  } catch (err) {
    console.warn('printer: failed to clear printer', err);
  }
}

// ---------------------------------------------------------------------------
// Permissions (Android 12+ needs runtime Bluetooth permissions)
// ---------------------------------------------------------------------------
async function ensurePermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  if (Number(Platform.Version) < 31) return true; // older Android: install-time permission
  const res = await PermissionsAndroid.requestMultiple([
    PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
    PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
  ]);
  return Object.values(res).every((v) => v === PermissionsAndroid.RESULTS.GRANTED);
}

// ---------------------------------------------------------------------------
// Paired printers (for the picker)
// ---------------------------------------------------------------------------
export async function listPairedPrinters(): Promise<SavedPrinter[]> {
    if (!(await ensurePermission())) throw new Error('Bluetooth permission was denied.');
  const BLEPrinter = getBLEPrinter();
  if (!BLEPrinter) throw new Error('Printing needs a development build (not available in Expo Go).');
  await BLEPrinter.init();
  const devices = await BLEPrinter.getDeviceList();
  return devices.map((d: { device_name: string; inner_mac_address: string }) => ({
    name: d.device_name || d.inner_mac_address,
    address: d.inner_mac_address,
  }));
}

// ---------------------------------------------------------------------------
// Sending text — one job at a time, with a timeout
// ---------------------------------------------------------------------------
let chain: Promise<unknown> = Promise.resolve();
function enqueue<T>(job: () => Promise<T>): Promise<T> {
  const run = chain.then(job, job);
  chain = run.catch(() => undefined);
  return run;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('Printer did not respond. Is it on and in range?')), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

async function sendText(text: string): Promise<PrintResult> {
  const printer = await getSavedPrinter();
  if (!printer) return { ok: false, reason: 'no-printer', message: 'No printer selected.' };
  if (!(await ensurePermission())) {
    return { ok: false, reason: 'permission', message: 'Bluetooth permission was denied.' };
  }
    const BLEPrinter = getBLEPrinter();
  if (!BLEPrinter) {
    return { ok: false, reason: 'error', message: 'Printing needs a development build (not available in Expo Go).' };
  }
  try {
    await withTimeout(
      (async () => {
        await BLEPrinter.init();
        await BLEPrinter.connectPrinter(printer.address);
        // printBill includes the end-of-receipt feed/cut sequence. printText
        // can leave short jobs buffered on some ESC/POS printers.
        await Promise.resolve(BLEPrinter.printBill(text));
      })(),
      PRINT_TIMEOUT_MS
    );
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      reason: 'error',
      message: err instanceof Error ? err.message : 'Could not print.',
    };
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
/** A KOT order always prints its kitchen slip. */
export function printOrderReceipt(res: PlaceOrderResponse, firm?: FirmInfo): Promise<PrintResult> {
  return enqueue(async () => {
    if (!res.order) return { ok: false, reason: 'error', message: 'No order to print.' } as PrintResult;
    const width = await getPaperWidth();
    const billFirm = await getReceiptFirm(firm);
    return sendText(buildKotText(res, width, billFirm));
  });
}

let companyCache: { at: number; value: Awaited<ReturnType<typeof getCompanyInfo>> } | null = null;

async function getReceiptFirm(firm?: FirmInfo): Promise<FirmInfo> {
  try {
    if (!companyCache || Date.now() - companyCache.at > 30 * 60 * 1000) {
      companyCache = { at: Date.now(), value: await getCompanyInfo() };
    }
    const company = companyCache.value;
    return {
      ...firm,
      name: company?.firm_name || firm?.name,
      place: company?.place || firm?.place,
      gstNumber: company?.gst_number || firm?.gstNumber,
      phone: company?.phone || company?.whatsapp || firm?.phone,
    };
  } catch (err) {
    console.warn('printer: could not load company details for receipt', err);
    return firm ?? {};
  }
}

/** Prints the selected receipt(s) when a sale is saved. */
export function printSalesReceipt(res: PlaceOrderResponse, firm?: FirmInfo, paymentMethod: string = 'CASH'): Promise<PrintResult> {
  return enqueue(async () => {
    if (!res.order) return { ok: false, reason: 'error', message: 'No order to print.' } as PrintResult;
    const width = await getPaperWidth();
    const mode = await getSalesPrintMode();
    const gstMode = await getGstDisplayMode();
    const billFirm = await getReceiptFirm(firm);
    if (mode === 'kot') return sendText(buildKotText(res, width, billFirm));
    if (mode === 'sales') return sendText(buildSalesBillText(res, billFirm, width, paymentMethod, gstMode));
    const kot = await sendText(buildKotText(res, width, billFirm));
    if (!kot.ok) return kot;
    return sendText(buildSalesBillText(res, billFirm, width, paymentMethod, gstMode));
  });
}

/** Short test slip for the printer picker. */
export function printTestPage(): Promise<PrintResult> {
  return enqueue(async () => {
    const width = await getPaperWidth();
    const columns = { 2: 32, 3: 48, 4: 64, 5: 80 }[width];
    return sendText(`<C>Melone KOT</C>\n<C>Printer test OK</C>\n${'-'.repeat(columns)}\n\n\n`);
  });
}


