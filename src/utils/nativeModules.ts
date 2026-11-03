import Constants, { ExecutionEnvironment } from 'expo-constants';

export const isExpoGo =
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

let cachedBLEPrinter: any = null;

export function getBLEPrinter() {
  if (isExpoGo) return null;
  if (cachedBLEPrinter) return cachedBLEPrinter;
  try {
    cachedBLEPrinter = require('react-native-thermal-receipt-printer').BLEPrinter;
    return cachedBLEPrinter;
  } catch (e) {
    console.log('Thermal printer module not available');
    return null;
  }
}