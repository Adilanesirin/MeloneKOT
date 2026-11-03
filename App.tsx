import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import NetInfo, { useNetInfo } from '@react-native-community/netinfo';
import NoNetworkScreen from './src/components/NoNetworkScreen';
import { isServerReachable } from './src/services/api';
import AnimatedSplash from './src/screens/AnimatedSplash';
import AppNavigator from './src/navigation/AppNavigator';
import { colors } from './src/constants/theme';

// Phones with a large system font would otherwise break fixed-size layouts everywhere.
// Text may still grow a little (accessibility), but never enough to clip.
(Text as any).defaultProps = { ...((Text as any).defaultProps || {}), maxFontSizeMultiplier: 1.15 };
(TextInput as any).defaultProps = { ...((TextInput as any).defaultProps || {}), maxFontSizeMultiplier: 1.15 };

// Check YOUR server instead of Google.

// Check YOUR server instead of Google. Any HTTP answer (even 401/405) means "reachable".
NetInfo.configure({
  reachabilityUrl: 'https://melone.in/api/user-login/',
  reachabilityMethod: 'HEAD',
  reachabilityTest: async (response) => response.status > 0 && response.status < 500,
  reachabilityLongTimeout: 30 * 1000,
  reachabilityShortTimeout: 8 * 1000,
  reachabilityRequestTimeout: 10 * 1000,
});

function AppContent({
  showSplash, offline, blocked, dismissed, onSplashFinish, onRetry, onOk,
}: {
  showSplash: boolean; offline: boolean; blocked: boolean; dismissed: boolean;
  onSplashFinish: () => void; onRetry: () => Promise<void>; onOk: () => void;
}) {
  const insets = useSafeAreaInsets();
    // never cover the app: Tables and Menu work from cache, only placing an order needs the server
  const showScreen = false;
  return (
    <>
      {showSplash ? <AnimatedSplash onFinish={onSplashFinish} /> : <AppNavigator />}
      <NoNetworkScreen visible={showScreen} onRetry={onRetry} onOk={onOk} />
      {/* after OK the screen closes, the banner stays while the problem lasts */}
      {(offline || blocked) && !showSplash && !showScreen && (
        <View pointerEvents="none" style={[styles.networkBanner, { top: insets.top + 6 }]}>
                    <Text style={styles.networkText}>Weak connection · orders may not be sent</Text>
        </View>
      )}
    </>
  );
}

export default function App() {
  const [showSplash, setShowSplash] = useState(true);
   const [blocked, setBlocked] = useState(false);
  const [dismissed, setDismissed] = useState(false); // user pressed OK on the waiter screen
  const netInfo = useNetInfo();

  // trust only a real "no connection"; never the flaky isInternetReachable flag
  const offline = netInfo.isConnected === false;

  // real round-trip to the server, only when the app opens (or Try again is pressed)
  const checkServer = useCallback(async () => {
    setBlocked(!(await isServerReachable(8000)));
  }, []);

  const onSplashFinish = useCallback(() => {
    setShowSplash(false);
    checkServer();
  }, [checkServer]);

  // connection came back while the blocking screen is up: re-check automatically
  useEffect(() => {
    if (blocked && netInfo.isConnected) checkServer();
  }, [blocked, netInfo.isConnected, checkServer]);

  // everything is fine again: re-arm the waiter screen for the next drop
  useEffect(() => {
    if (!offline && !blocked) setDismissed(false);
  }, [offline, blocked]);

  const onOk = useCallback(() => setDismissed(true), []);

  return (
    <SafeAreaProvider>
      <AppContent
        showSplash={showSplash}
        offline={offline}
        blocked={blocked}
        dismissed={dismissed}
        onSplashFinish={onSplashFinish}
        onRetry={checkServer}
        onOk={onOk}
      />
  </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  networkBanner: { position: 'absolute', left: 12, right: 12, zIndex: 100, alignItems: 'center', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 12, backgroundColor: colors.errorDark, elevation: 8 },
  networkText: { color: colors.white, fontSize: 12, fontWeight: '700' },
});
