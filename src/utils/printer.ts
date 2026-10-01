
import { Platform, PermissionsAndroid } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BLEPrinter } from 'react-native-thermal-receipt-printer'; // LIB

import { PlaceOrderResponse } from '../utils/kot';
import { buildBillText, buildKotText, PRINT_MODE, FirmInfo } from '../utils/receipt';

const PRINTER_KEY = '@melone_kot/printer';
const PRINT_TIMEOUT_MS = 10000;

export interface SavedPrinter {
  name: string;
  address: string; // Bluetooth MAC address
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
  await BLEPrinter.init(); // LIB
  const devices = await BLEPrinter.getDeviceList(); // LIB
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
  try {
    await withTimeout(
      (async () => {
        await BLEPrinter.init(); // LIB
        await BLEPrinter.connectPrinter(printer.address); // LIB
        BLEPrinter.printText(text); // LIB  (try printBill(text) if your printer has an auto-cutter)
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
/** Prints the slip(s) for a placed order (see PRINT_MODE in utils/receipt.ts). */
export function printOrderReceipt(res: PlaceOrderResponse, firm?: FirmInfo): Promise<PrintResult> {
  return enqueue(async () => {
    if (!res.order) return { ok: false, reason: 'error', message: 'No order to print.' } as PrintResult;

    if (PRINT_MODE !== 'bill') {
      const kot = await sendText(buildKotText(res));
      if (!kot.ok) return kot;
    }
    if (PRINT_MODE !== 'kot') {
      return sendText(buildBillText(res, firm));
    }
    return { ok: true } as PrintResult;
  });
}

/** Short test slip for the printer picker. */
export function printTestPage(): Promise<PrintResult> {
  return enqueue(() =>
    sendText('<C>Melone KOT</C>\n<C>Printer test OK</C>\n--------------------------------\n\n\n')
  );
}