// src/screens/SalesBillScreen.tsx
// KOT bill for an occupied table. Same look as the Category / Item / Tax pages:
// slim gradient header with scattered food icons, a receipt-style bill card,
// and a sticky bottom bar (total + Save Sales). Save Sales asks for the payment
// method first (PaymentPickerModal).

import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, gradients, radius, spacing, withAlpha } from '../constants/theme';
import { SalesBillScreenProps } from '../navigation/AppNavigator';
import { convertPendingInvoiceToSale } from '../services/api';
import { clearCartForTable, clearOpenKotForTable, getOpenKotForTable, getSession, saveCartForTable } from '../services/storage';
import { getGstDisplayMode, printSalesReceipt } from '../utils/printer';
import type { GstDisplayMode } from '../utils/receipt';
import { CartLine, KotOrder, PlaceOrderResponse } from '../utils/kot';
import PaymentPickerModal from './PaymentPickerModal';

const amount = (value: string | number | undefined) => {
  const parsed = typeof value === 'number' ? value : Number.parseFloat(value ?? '0');
  return Number.isFinite(parsed) ? parsed : 0;
};

// ---- scattered food icons for the header -----------------------------------
const WHITE = (a: number) => withAlpha(colors.white, a);
const GOLD = (a: number) => withAlpha(colors.orange, a);

type FoodIcon = {
  name: keyof typeof MaterialCommunityIcons.glyphMap;
  left: string;
  top: string;
  size: number;
  rotate: string;
  color: string;
};

const FOOD_ICONS: FoodIcon[] = [
  { name: 'pizza',          left: '4%',  top: '55%', size: 24, rotate: '-16deg', color: WHITE(0.16) },
  { name: 'coffee',         left: '20%', top: '4%',  size: 20, rotate: '10deg',  color: GOLD(0.28) },
  { name: 'hamburger',      left: '36%', top: '58%', size: 22, rotate: '8deg',   color: WHITE(0.14) },
  { name: 'ice-cream',      left: '50%', top: '0%',  size: 22, rotate: '-12deg', color: WHITE(0.16) },
  { name: 'noodles',        left: '62%', top: '60%', size: 24, rotate: '14deg',  color: GOLD(0.26) },
  { name: 'food-drumstick', left: '74%', top: '2%',  size: 22, rotate: '-20deg', color: WHITE(0.15) },
  { name: 'cupcake',        left: '86%', top: '55%', size: 22, rotate: '12deg',  color: WHITE(0.15) },
  { name: 'fish',           left: '93%', top: '4%',  size: 20, rotate: '-8deg',  color: GOLD(0.24) },
];

// dashed receipt divider (a dashed box clipped to one line works on iOS + Android)
const Dash = () => (
  <View style={styles.dashWrap}>
    <View style={styles.dash} />
  </View>
);

export default function SalesBillScreen({ navigation, route }: SalesBillScreenProps) {
  const { tableId, tableNumber, floor } = route.params;
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const compactLandscape = Math.min(windowWidth, windowHeight) >= 600 && windowWidth > windowHeight;
  const wide = windowWidth >= 700;

  const [order, setOrder] = useState<KotOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [gstDisplayMode, setGstDisplayMode] = useState<GstDisplayMode>('single');

  useEffect(() => {
    let active = true;
    getGstDisplayMode().then((mode) => { if (active) setGstDisplayMode(mode); });
    getOpenKotForTable(tableId).then((saved) => {
      if (active) {
        setOrder(saved);
        setLoading(false);
      }
    });
    return () => { active = false; };
  }, [tableId]);

  const addMoreItems = async () => {
    if (!order) return;
    const cart: CartLine[] = order.order_items.map((item) => {
      const portion = String(item.portion || 'full').toLowerCase();
      return {
        menuItemId: item.menu_item_id,
        name: item.name,
        imageUrl: '',
        unitPrice: amount(item.price),
        portionLabel: portion === 'half' || portion === 'quarter' ? portion : 'full',
        hasPortions: !['single', ''].includes(portion),
        quantity: item.quantity,
      };
    });
    await clearCartForTable(tableId, 'sales');
    await saveCartForTable(tableId, cart, 'sales');
    navigation.navigate('Menu', { tableId, tableNumber, floor, orderType: 'sales' });
  };

  const saveSales = async (paymentMethod: string) => {
    if (!order || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      const billingId = order.billing_id || `KOT-${order.id}`;
      if (!order.bill_number) throw new Error('Bill number missing for this KOT. Refresh pending invoices and try again.');
      const session = await getSession();
      const waiterName = order.waiter_name || (typeof session?.username === 'string' ? session.username : undefined);
      const conversion = await convertPendingInvoiceToSale(order.bill_number, paymentMethod, order.billing_id, order.kot_number, waiterName);      const convertedOrder = conversion.order as KotOrder | undefined;
      const convertedBilling = conversion.billing as PlaceOrderResponse['billing'];
      const result = conversion.order
        ? {
            ...conversion,
            order: {
              ...convertedOrder!,
              kot_number: convertedOrder?.kot_number ?? convertedBilling?.kot_number ?? order.kot_number,
              waiter_name: convertedOrder?.waiter_name || convertedBilling?.waiter_name || waiterName || '',
              customer_phone: convertedOrder?.customer_phone || convertedBilling?.customer_phone || order.customer_phone || '',
            },
            billing: convertedBilling,
          } as PlaceOrderResponse
        : {
            success: true,
            order: {
              ...order,
              kot_number: order.kot_number ?? convertedBilling?.kot_number,
              waiter_name: order.waiter_name || convertedBilling?.waiter_name || waiterName || '',
            },
            billing: {
              ...(convertedBilling ?? {}),
              billing_id: billingId,
              bill_number: order.bill_number,
              kot_number: convertedBilling?.kot_number ?? order.kot_number,
              waiter_name: convertedBilling?.waiter_name || waiterName || order.waiter_name || '',
              order_id: order.id,
              customer_name: order.customer_name || 'Walk-in Guest',
              table_number: String(tableNumber),
              subtotal: String(order.subtotal),
              tax_amount: String(order.tax_amount),
              discount_amount: '0',
              total_amount: String(order.total_amount),
              payment_method: paymentMethod,
              order_type: 'sales',
              created_at: order.order_time,
            },
          } satisfies PlaceOrderResponse;

      // The sale is saved on the server; clear the local open KOT and cart now.
      await clearOpenKotForTable(tableId);
      await clearCartForTable(tableId, 'sales');
      setOrder(null);

      const firmUser = session as ({ firm_name?: string; place?: string; gst_number?: string; phone?: string; whatsapp?: string } | null);
      const printResult = await printSalesReceipt(result, {
        name: firmUser?.firm_name,
        place: firmUser?.place,
        gstNumber: firmUser?.gst_number,
        phone: firmUser?.phone || firmUser?.whatsapp,
      }, paymentMethod);
      const printMessage = printResult.ok ? '' : ` The sale was saved, but the bill could not be printed: ${printResult.message}`;
      Alert.alert('Sale saved', `${conversion.message || `The sale for Table ${tableNumber} has been saved.`}${printMessage}`, [
        { text: 'Done', onPress: () => navigation.popToTop() },
      ]);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save the sale. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const itemCount = order ? order.order_items.reduce((sum, i) => sum + i.quantity, 0) : 0;
  const maxW = wide ? 720 : 640;

  return (
    <SafeAreaView style={styles.root} edges={['left', 'right', 'bottom']}>
      <StatusBar barStyle="light-content" />

      {/* slim gradient header */}
      <LinearGradient
        colors={gradients.button}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[
          styles.hero,
          { paddingTop: insets.top + (compactLandscape ? spacing.xs : spacing.sm) },
          compactLandscape && styles.heroCompact,
        ]}
      >
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          {FOOD_ICONS.map((f, i) => (
            <MaterialCommunityIcons
              key={f.name + i}
              name={f.name}
              size={f.size}
              color={f.color}
              style={{
                position: 'absolute',
                left: f.left as any,
                top: f.top as any,
                transform: [{ rotate: f.rotate }],
              }}
            />
          ))}
        </View>

        <View style={styles.heroRow}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.heroBack}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <Ionicons name="chevron-back" size={20} color={colors.white} />
          </TouchableOpacity>

          <View style={styles.heroText}>
            <Text style={[styles.heroTitle, compactLandscape && styles.heroTitleCompact]} numberOfLines={1}>
              KOT Bill
            </Text>
            <Text style={styles.heroSubtitle} numberOfLines={1}>
              Table {tableNumber}{floor ? ` · Floor ${floor}` : ''}
            </Text>
          </View>

          <TouchableOpacity
            onPress={addMoreItems}
            disabled={!order || loading}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Add more items"
            style={[styles.addPill, (!order || loading) && styles.disabled]}
          >
            <Ionicons name="add" size={18} color={colors.ink} />
            <Text style={styles.addPillText}>Add items</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.ink} />
        </View>
      ) : order ? (
        <>
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[
              styles.content,
              compactLandscape && styles.contentCompact,
              { maxWidth: maxW, width: '100%', alignSelf: 'center' },
            ]}
          >
            {/* receipt-style bill card */}
            <View style={styles.billCard}>
                           <View style={styles.headRow}>
                <View style={styles.kotBadge}>
                  <View style={styles.dot} />
                  <Text style={styles.kotBadgeText}>KOT OPEN</Text>
                </View>
                <Text style={styles.guestName} numberOfLines={1}>{order.customer_name || 'Walk-in Guest'}</Text>
                <Text style={styles.headMeta}>#{order.id} · {itemCount} {itemCount === 1 ? 'item' : 'items'}</Text>
              </View>

              <LinearGradient
                pointerEvents="none"
                colors={[withAlpha(colors.orange, 0), colors.orange, withAlpha(colors.orange, 0)]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.fadeLine}
              />

              {order.order_items.map((item, index) => {
                const portion = String(item.portion || '').toLowerCase();
                const showPortion = portion && !['single', 'full'].includes(portion);
                return (
                  <View key={`${item.menu_item_id}-${item.portion}-${index}`} style={styles.itemRow}>
                    <View style={styles.qtyBadge}>
                      <Text style={styles.qtyText}>{item.quantity}</Text>
                    </View>
                    <View style={styles.itemText}>
                      <Text style={styles.itemName} numberOfLines={2}>{item.name}</Text>
                      <Text style={styles.itemMeta}>
                        ₹{amount(item.price).toFixed(2)} each{showPortion ? ` · ${portion}` : ''}
                      </Text>
                    </View>
                    <Text style={styles.itemPrice}>₹{amount(item.item_total_with_tax).toFixed(2)}</Text>
                  </View>
                );
              })}

              <Dash />

              <View style={styles.sumRow}>
                <Text style={styles.sumLabel}>Subtotal</Text>
                <Text style={styles.sumValue}>₹{amount(order.subtotal).toFixed(2)}</Text>
              </View>
              {gstDisplayMode === 'split' ? (() => {
                const tax = amount(order.tax_amount);
                const subtotal = amount(order.subtotal);
                const halfRate = subtotal > 0 ? (tax / subtotal * 100) / 2 : 0;
                const rate = Number.isInteger(halfRate) ? String(halfRate) : halfRate.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
                return <>
                  <View style={styles.sumRow}>
                    <Text style={styles.sumLabel}>SGST {rate}%</Text>
                    <Text style={styles.sumValue}>₹{(tax / 2).toFixed(2)}</Text>
                  </View>
                  <View style={styles.sumRow}>
                    <Text style={styles.sumLabel}>CGST {rate}%</Text>
                    <Text style={styles.sumValue}>₹{(tax - tax / 2).toFixed(2)}</Text>
                  </View>
                </>;
              })() : <View style={styles.sumRow}>
                <Text style={styles.sumLabel}>GST</Text>
                <Text style={styles.sumValue}>₹{amount(order.tax_amount).toFixed(2)}</Text>
              </View>}

              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Current KOT total</Text>
                <Text style={styles.totalValue}>₹{amount(order.total_amount).toFixed(2)}</Text>
              </View>
            </View>
          </ScrollView>

          {/* sticky bottom bar */}
          <View style={styles.footer}>
            <View style={[styles.footerInner, { maxWidth: maxW }]}>
              {!!saveError && (
                <View style={styles.errorRow}>
                  <Ionicons name="alert-circle" size={15} color={colors.error} />
                  <Text style={styles.errorText}>{saveError}</Text>
                </View>
              )}
              <TouchableOpacity
                style={[styles.saveBtn, saving && styles.disabled]}
                onPress={() => setPayOpen(true)}
                disabled={saving}
                activeOpacity={0.9}
                accessibilityRole="button"
              >
                {saving ? (
                  <ActivityIndicator color={colors.orangeText} />
                ) : (
                  <Ionicons name="checkmark-circle-outline" size={19} color={colors.orangeText} />
                )}
                <Text style={styles.saveText}>{saving ? 'Saving sale…' : 'Save Sales'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </>
      ) : (
        <View style={styles.center}>
          <View style={styles.emptyIcon}>
            <Ionicons name="receipt-outline" size={30} color={colors.ink} />
          </View>
          <Text style={styles.emptyTitle}>KOT items unavailable</Text>
          <Text style={styles.emptyText}>
            This device has no saved KOT details for this table. Open KOTs placed before this update cannot be loaded from the current app data.
          </Text>
        </View>
      )}

      <PaymentPickerModal
        visible={payOpen}
        onClose={() => setPayOpen(false)}
        onConfirm={(method) => {
          setPayOpen(false);
          saveSales(method);
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  disabled: { opacity: 0.45 },

  // ---- header (slim) ----
  hero: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    borderBottomLeftRadius: 22,
    borderBottomRightRadius: 22,
    overflow: 'hidden',
  },
  heroCompact: { paddingBottom: spacing.sm, borderBottomLeftRadius: 16, borderBottomRightRadius: 16 },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  heroBack: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: withAlpha(colors.white, 0.14),
    borderWidth: 1,
    borderColor: withAlpha(colors.white, 0.22),
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroText: { flex: 1 },
  heroTitle: { fontFamily: 'Fraunces_600SemiBold', fontSize: 22, color: colors.white },
  heroTitleCompact: { fontSize: 18 },
  heroSubtitle: { fontFamily: 'Inter_400Regular', fontSize: 12, color: withAlpha(colors.white, 0.78), marginTop: 1 },
  addPill: {
    height: 38,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingLeft: 10,
    paddingRight: 14,
    borderRadius: 19,
    backgroundColor: colors.orange,
  },
  addPillText: { fontFamily: 'Inter_600SemiBold', fontSize: 12.5, color: colors.ink },

  // ---- body ----
  content: { padding: spacing.md, paddingBottom: spacing.lg, gap: spacing.md },
  contentCompact: { paddingBottom: spacing.sm },

  billCard: {
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
  },
    headRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  guestName: { flex: 1, fontFamily: 'Inter_600SemiBold', fontSize: 14.5, color: colors.ink },
  headMeta: { fontFamily: 'Inter_600SemiBold', fontSize: 11.5, color: colors.inkSoft },
  fadeLine: { height: 2, borderRadius: 1, marginVertical: spacing.sm + 2 },
  billNumber: { fontFamily: 'Inter_600SemiBold', fontSize: 12, color: colors.inkSoft },

  kotBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: colors.warningBackground,
  },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.orangeDeep },
  kotBadgeText: { fontFamily: 'Inter_600SemiBold', fontSize: 10, color: colors.warning, letterSpacing: 0.6 },
  dashWrap: { height: 1, overflow: 'hidden', marginVertical: spacing.md },
  dash: { height: 2, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border, borderRadius: 1 },

  itemRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 8 },
  qtyBadge: {
    minWidth: 30,
    height: 30,
    paddingHorizontal: 6,
    borderRadius: 10,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyText: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: colors.orange },
  itemText: { flex: 1 },
  itemName: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: colors.ink },
  itemMeta: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11.5,
    color: colors.inkSoft,
    marginTop: 2,
    textTransform: 'capitalize',
  },
  itemPrice: { fontFamily: 'Inter_600SemiBold', fontSize: 13.5, color: colors.ink },

  sumRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 3 },
  sumLabel: { fontFamily: 'Inter_500Medium', fontSize: 13, color: colors.inkSoft },
  sumValue: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: colors.ink },

  totalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.sm },
  totalLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: colors.ink },
  totalValue: { fontFamily: 'Fraunces_600SemiBold', fontSize: 22, color: colors.ink },
  addMore: {
    height: 46,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.border,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addMoreText: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: colors.ink },

  // ---- sticky footer ----
  footer: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  footerInner: { width: '100%', alignSelf: 'center', gap: spacing.xs },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  errorText: { flex: 1, fontFamily: 'Inter_500Medium', fontSize: 12.5, color: colors.error },
  footerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  footerLabel: { fontFamily: 'Inter_500Medium', fontSize: 11, color: colors.inkSoft },
  footerTotal: { fontFamily: 'Fraunces_600SemiBold', fontSize: 20, color: colors.ink, marginTop: 1 },
   saveBtn: {
    alignSelf: 'center',
    minWidth: 190,
    height: 44,
    paddingHorizontal: 28,
    borderRadius: radius.md,
    backgroundColor: colors.orange,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveText: { fontFamily: 'Inter_600SemiBold', fontSize: 14.5, color: colors.orangeText },

  // ---- empty / loading ----
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: colors.softGreen,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: { fontFamily: 'Fraunces_600SemiBold', fontSize: 19, color: colors.ink, marginTop: spacing.md },
  emptyText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: colors.inkSoft,
    textAlign: 'center',
    lineHeight: 19,
    marginTop: spacing.sm,
  },
});
