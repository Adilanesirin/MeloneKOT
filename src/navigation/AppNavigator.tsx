// src/navigation/AppNavigator.tsx
// Root stack navigator for the KOT flow: Login -> Tables -> Menu (cart lives
// inside MenuScreen as a slide-up drawer, not a separate route).
//
// Requires: npx expo install @react-navigation/native @react-navigation/native-stack
// react-native-screens react-native-safe-area-context

import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import {
  createNativeStackNavigator,
  NativeStackScreenProps,
} from '@react-navigation/native-stack';
import { View, ActivityIndicator } from 'react-native';

import LoginScreen from '../screens/LoginScreen';
import TablesScreen from '../screens/TablesScreen';
import MenuScreen from '../screens/MenuScreen';
import { getSession } from '../services/storage';
import { colors } from '../constants/theme';

// ---------------------------------------------------------------------------
// Route params
// ---------------------------------------------------------------------------
export type RootStackParamList = {
  Login: undefined;
  Tables: undefined;
  Menu: {
    tableId: number;
    tableNumber: string;
    floor?: string;
  };
};

export type LoginScreenProps = NativeStackScreenProps<RootStackParamList, 'Login'>;
export type TablesScreenProps = NativeStackScreenProps<RootStackParamList, 'Tables'>;
export type MenuScreenProps = NativeStackScreenProps<RootStackParamList, 'Menu'>;

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
        <Stack.Screen name="Menu" component={MenuScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
};

export default AppNavigator;