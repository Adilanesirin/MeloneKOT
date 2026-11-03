import React, { useEffect } from 'react';
import { ActivityIndicator, StatusBar, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../constants/theme';
import { SalesScreenProps } from '../navigation/AppNavigator';

/**
 * Sales uses the same table and menu flow as KOT. The `orderType` parameter
 * keeps its cart separate and makes the cart submit to the Sales API.
 */
export default function SalesScreen({ navigation }: SalesScreenProps) {
  useEffect(() => {
    navigation.replace('Tables', { orderType: 'sales' });
  }, [navigation]);

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.ink} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
