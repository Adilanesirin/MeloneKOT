import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import {
  createNativeStackNavigator,
  NativeStackScreenProps,
} from '@react-navigation/native-stack';
import { View, ActivityIndicator } from 'react-native';
import NetInfo from '@react-native-community/netinfo';

import LoginScreen from '../screens/LoginScreen';
import TablesScreen from '../screens/TablesScreen';
import MenuScreen from '../screens/MenuScreen';
import SalesScreen from '../screens/SalesScreen';
import SalesBillScreen from '../screens/SalesBillScreen';
import ItemCreateScreen from '../screens/ItemCreateScreen';
import CategoryCreateScreen from '../screens/CategoryCreateScreen';
import TaxCreateScreen from '../screens/TaxCreateScreen';
import TableMasterScreen from '../screens/TableMasterScreen';
import PendingInvoiceScreen from '../screens/PendingInvoiceScreen';
import KotReportScreen from '../screens/Kotreportscreen';
import SalesReportScreen from '../screens/Salesreportscreen';
import { getSession } from '../services/storage';
import { colors } from '../constants/theme';
import { syncOfflineOrders } from '../services/orderOutbox';

export type RootStackParamList = {
  Login: undefined;
  Tables: { orderType?: 'kot' | 'sales'; finalizedTableId?: number } | undefined;
  Sales: undefined;
  SalesBill: { tableId: number; tableNumber: string; floor?: string };
  Menu: {
    tableId: number;
    tableNumber: string;
    floor?: string;
    orderType?: 'kot' | 'sales';
  };
  ItemCreate: undefined;
  CategoryCreate: undefined;
  TaxCreate: undefined;
  TableMaster: undefined;
  PendingInvoice: undefined;
  KotReport: undefined;
  SalesReport: undefined;
};

export type LoginScreenProps = NativeStackScreenProps<RootStackParamList, 'Login'>;
export type TablesScreenProps = NativeStackScreenProps<RootStackParamList, 'Tables'>;
export type MenuScreenProps = NativeStackScreenProps<RootStackParamList, 'Menu'>;
export type SalesScreenProps = NativeStackScreenProps<RootStackParamList, 'Sales'>;
export type SalesBillScreenProps = NativeStackScreenProps<RootStackParamList, 'SalesBill'>;
export type ItemCreateScreenProps = NativeStackScreenProps<RootStackParamList, 'ItemCreate'>;
export type CategoryCreateScreenProps = NativeStackScreenProps<RootStackParamList, 'CategoryCreate'>;
export type TaxCreateScreenProps = NativeStackScreenProps<RootStackParamList, 'TaxCreate'>;
export type TableMasterScreenProps = NativeStackScreenProps<RootStackParamList, 'TableMaster'>;
export type PendingInvoiceScreenProps = NativeStackScreenProps<RootStackParamList, 'PendingInvoice'>;
export type KotReportScreenProps = NativeStackScreenProps<RootStackParamList, 'KotReport'>;
export type SalesReportScreenProps = NativeStackScreenProps<RootStackParamList, 'SalesReport'>;
const Stack = createNativeStackNavigator<RootStackParamList>();

// ---------------------------------------------------------------------------
// Root navigator
// ---------------------------------------------------------------------------
const AppNavigator: React.FC = () => {
  // null = still checking storage, true/false = resolved
  const [hasSession, setHasSession] = useState<boolean | null>(null);

  useEffect(() => {
    (async () => {
      const session = await getSession();
      setHasSession(!!session);
    })();
  }, []);

  useEffect(() => {
    if (!hasSession) return;
    const syncIfOnline = (state: { isConnected: boolean | null; isInternetReachable: boolean | null }) => {
      if (state.isConnected === true && state.isInternetReachable !== false) {
        void syncOfflineOrders();
      }
    };
    const unsubscribe = NetInfo.addEventListener(syncIfOnline);
    NetInfo.fetch().then(syncIfOnline).catch(() => {});
    return unsubscribe;
  }, [hasSession]);

  if (hasSession === null) {
    // brief splash while AsyncStorage is checked, so a returning user
    // doesn't flash the login screen before landing on Tables
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.ink} />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName={hasSession ? 'Tables' : 'Login'}
        screenOptions={{
          headerShown: false,
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="Tables" component={TablesScreen} />
        <Stack.Screen name="Sales" component={SalesScreen} />
        <Stack.Screen name="SalesBill" component={SalesBillScreen} />
        <Stack.Screen name="Menu" component={MenuScreen} />
        <Stack.Screen name="ItemCreate" component={ItemCreateScreen} />
        <Stack.Screen name="CategoryCreate" component={CategoryCreateScreen} />
        <Stack.Screen name="TaxCreate" component={TaxCreateScreen} />
        <Stack.Screen name="TableMaster" component={TableMasterScreen} />
        <Stack.Screen name="PendingInvoice" component={PendingInvoiceScreen} />
        <Stack.Screen name="KotReport" component={KotReportScreen} />
        <Stack.Screen name="SalesReport" component={SalesReportScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
};

export default AppNavigator;