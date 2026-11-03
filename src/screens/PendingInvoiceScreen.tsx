// src/screens/PendingInvoiceScreen.tsx
// Pending invoices (all pending KOTs waiting to be billed) — lives in its own
// screen, opened from the side drawer ("Pending invoice", right after Sales).
//  - lists every pending KOT invoice (1 column phone, 2 columns wide tablets)
//  - tap a card to expand its items
//  - "Complete sale" -> payment picker -> converts the KOT to a sale + prints the bill
//  - pull-to-refresh, error banner, empty state

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Alert,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  StatusBar,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing, radius, shadow } from '../constants/theme';
import { convertPendingInvoiceToSale, getPendingInvoices, getTables, PendingInvoice, PendingInvoiceItem } from '../services/api';
import { readLocalCollection, writeLocalCollection } from '../services/localCache';
import { getSession, clearOpenKotForTable } from '../services/storage';
import { printSalesReceipt } from '../utils/printer';
import { RestaurantTable, AuthUser, KotOrder, KotOrderItem, PlaceOrderResponse } from '../utils/kot';
import { PendingInvoiceScreenProps } from '../navigation/AppNavigator';
import PaymentPickerModal from './PaymentPickerModal';

const FONT = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
} as const;

const GRID_GAP = 8;
const MAX_CONTENT = 1440;

const pendingInvoiceAsOrder = (invoice: PendingInvoice): PlaceOrderResponse => {
  const source = invoice as Record<string, unknown>;
  const lines = invoice.order_items ?? invoice.items ?? invoice.order?.order_items ?? invoice.order?.items ?? [];
  const numeric = (value: unknown) => {
    const parsed = typeof value === 'number' ? value : Number.parseFloat(String(value ?? '0'));
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const text = (value: unknown, fallback = '') => value == null ? fallback : String(value);
  const orderId = numeric(invoice.order_id) || numeric(source.id);
  const now = new Date().toISOString();
  const orderItems: KotOrderItem[] = lines.map((line: PendingInvoiceItem, index) => {
    const quantity = numeric(line.quantity) || 1;
    const itemTotal = line.item_total == null ? numeric(line.price) * quantity : numeric(line.item_total);
    const totalWithTax = line.item_total_with_tax == null ? itemTotal : numeric(line.item_total_with_tax);
    return {
      id: index + 1,
      menu_item_id: numeric(line.menu_item_id),
      name: text(line.name ?? line.item_name ?? line.menu_item_name, 'Item'),
      portion: text(line.portion, 'single'),
      quantity,
      price: text(line.price, '0'),
      tax: text(line.tax, '0'),
      item_total: itemTotal,
      tax_amount: Math.max(0, totalWithTax - itemTotal),
      item_total_with_tax: totalWithTax,
      kitchen_number: null,
      created_at: text(line.created_at, now),
    };
  });
  const subtotal = text(source.subtotal, String(orderItems.reduce((sum, line) => sum + line.item_total, 0)));
  const taxAmount = text(source.tax_amount, String(orderItems.reduce((sum, line) => sum + line.tax_amount, 0)));
  const total = text(invoice.total_amount ?? source.total_amount, String(orderItems.reduce((sum, line) => sum + line.item_total_with_tax, 0)));
  const customerName = text(invoice.customer_name, 'Walk-in Guest');
  const tableNumber = text(invoice.table_number, '');
  const createdAt = text(invoice.created_at, now);
  const order: KotOrder = {
    id: orderId,
    kot_number: invoice.kot_number,
    session_id: '', client_id: '', username: '',
    customer_name: customerName,
    customer_phone: text(source.customer_phone ?? invoice.customer_phone ?? invoice.order?.customer_phone),
    table_number: tableNumber,
    floor: text(invoice.floor),
    waiter_name: invoice.waiter_name ?? '', member_count: 0,
    subtotal, tax_amount: taxAmount, total_amount: total,
    status: 'completed', order_type: 'sales', order_time: createdAt,
    special_instructions: '', order_items: orderItems,
    item_count: orderItems.reduce((sum, line) => sum + line.quantity, 0),
    created_at: createdAt, updated_at: createdAt,
  };
  const billing = {
    billing_id: invoice.billing_id,
    bill_number: text(invoice.bill_number, invoice.billing_id),
    kot_number: invoice.kot_number,
    waiter_name: invoice.waiter_name ?? '',
    order_id: orderId,
    customer_name: customerName,
    table_number: tableNumber,
    subtotal, tax_amount: taxAmount,
    discount_amount: text(source.discount_amount, '0'),
    total_amount: total,
    payment_method: text(source.payment_method, 'Cash'),
    order_type: 'sales',
    created_at: createdAt,
  };
  return { success: true, order, billing };
};

const PendingInvoiceScreen: React.FC<PendingInvoiceScreenProps> = ({ navigation }) => {
  const { width: windowWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const sidePad = spacing.md + Math.max(insets.left, insets.right);
  const gridWidth = Math.min(windowWidth, MAX_CONTENT) - sidePad * 2;
  // cards stay compact: as many ~380px columns as fit; a single column never grows past 560
  // phones: 1 card per row. Tablets (8" and 10.5"): cards sit side by side and share the full width
const MIN_INVOICE_WIDTH = 320;
const invoiceCols = windowWidth < 600
  ? 1
  : Math.max(1, Math.floor((gridWidth + GRID_GAP) / (MIN_INVOICE_WIDTH + GRID_GAP)));
const invoiceWidth = Math.floor((gridWidth - GRID_GAP * (invoiceCols - 1)) / invoiceCols);

  const [user, setUser] = useState<AuthUser | null>(null);
  const [invoices, setInvoices] = useState<PendingInvoice[]>([]);
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [convertingBillingId, setConvertingBillingId] = useState<string | null>(null);
  const [payTarget, setPayTarget] = useState<PendingInvoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  const loadInvoices = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    const cached = await readLocalCollection<PendingInvoice>('pending_kots');
    if (cached?.length && isMounted.current) {
      setInvoices(cached);
      setLoading(false);
    }
    try {
      setError(null);
      const list = await getPendingInvoices();
      if (!isMounted.current) return;
      setInvoices(list);
      void writeLocalCollection('pending_kots', list, (invoice) => invoice.billing_id);
    } catch (err) {
      if (isMounted.current) setError(err instanceof Error ? err.message : 'Could not load pending invoices.');
    } finally {
      if (isMounted.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  // tables are only needed to clear the table's open-KOT marker after a sale
  const loadTables = useCallback(async () => {
    const cached = await readLocalCollection<RestaurantTable>('tables');
    if (cached?.length && isMounted.current) setTables(cached);
    try {
      const res = await getTables();
      if (res.success && isMounted.current) setTables(res.tables);
    } catch {
      /* optional — cached tables are enough */
    }
  }, []);

  useEffect(() => {
    (async () => {
      const session = await getSession();
      if (!session) {
        navigation.replace('Login');
        return;
      }
      if (!isMounted.current) return;
      setUser(session);
      loadTables();
      await loadInvoices();
    })();
  }, [loadInvoices, loadTables, navigation]);

  // reload when coming back to this screen — skips the first focus
  const firstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      if (firstFocus.current) {
        firstFocus.current = false;
        return;
      }
      loadInvoices();
    }, [user, loadInvoices])
  );

  const handleConvertInvoice = async (invoice: PendingInvoice, paymentMethod: string) => {
    if (!invoice.billing_id || convertingBillingId) return;
    setConvertingBillingId(invoice.billing_id);
    setError(null);
    try {
      if (!invoice.bill_number) throw new Error('Bill number is missing for this pending invoice. Refresh and try again.');
        const sessionName = typeof user?.username === 'string' ? user.username : undefined;
        const result = await convertPendingInvoiceToSale(invoice.bill_number, paymentMethod, invoice.billing_id, invoice.kot_number, invoice.waiter_name || sessionName);      const matchingTable = tables.find((table) =>
        (table.table_name || table.table_number) === invoice.table_number &&
        (!invoice.floor || table.floor === invoice.floor)
      );
      if (matchingTable) await clearOpenKotForTable(matchingTable.id);
      setInvoices((current) => current.filter((item) => item.billing_id !== invoice.billing_id));
      const returnedOrder = result.order as PlaceOrderResponse['order'] | undefined;
      const returnedBilling = result.billing as PlaceOrderResponse['billing'] | undefined;
      const localResponse = pendingInvoiceAsOrder(invoice);
      const printResponse: PlaceOrderResponse = {
        ...localResponse,
        ...(returnedOrder
          ? {
              order: {
                ...returnedOrder,
                kot_number: returnedOrder.kot_number ?? returnedBilling?.kot_number ?? invoice.kot_number,
                waiter_name: returnedOrder.waiter_name || returnedBilling?.waiter_name || invoice.waiter_name || '',
                customer_phone: returnedOrder.customer_phone || returnedBilling?.customer_phone || invoice.customer_phone || invoice.order?.customer_phone || '',
              },
            }
          : {
              order: localResponse.order
                ? {
                    ...localResponse.order,
                    kot_number: localResponse.order.kot_number ?? returnedBilling?.kot_number,
                    waiter_name: localResponse.order.waiter_name || returnedBilling?.waiter_name || '',
                  }
                : undefined,
            }),
        billing: returnedBilling
          ? { ...localResponse.billing, ...returnedBilling }
          : localResponse.billing,
      };
      const firm = user as (AuthUser & { firm_name?: string; place?: string; gst_number?: string; phone?: string; whatsapp?: string }) | null;
      const printed = await printSalesReceipt(printResponse, {
        name: firm?.firm_name,
        place: firm?.place,
        gstNumber: firm?.gst_number,
        phone: firm?.phone || firm?.whatsapp,
      }, paymentMethod);
      const saveMessage = result.message || `Bill ${invoice.bill_number || invoice.billing_id} was saved as a sale.`;
      const printMessage = printed.ok ? '' : ` The sale was saved, but printing failed: ${printed.message}`;
      Alert.alert('Sale saved', `${saveMessage}${printMessage}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not complete this sale.');
    } finally {
      setConvertingBillingId(null);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingRoot}>
        <StatusBar barStyle="dark-content" backgroundColor={colors.white} />
        <ActivityIndicator size="large" color={colors.ink} />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.white} />

      {/* ---------------- white header ---------------- */}
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <View style={[styles.headerInner, { paddingHorizontal: sidePad }]}>
          <View style={styles.topRow}>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Back"
              onPress={() => navigation.goBack()}
              hitSlop={8}
              activeOpacity={0.8}
              style={styles.backBtn}
            >
              <Ionicons name="chevron-back" size={22} color={colors.white} />
            </TouchableOpacity>

            <View pointerEvents="none" style={styles.titleWrap}>
              <Text style={styles.title} numberOfLines={1}>Pending invoices</Text>
              <Text style={styles.subtitle} numberOfLines={1}>KOTs waiting to be billed</Text>
            </View>

            <View style={{ flex: 1 }} />
            <View style={styles.countBadge}>
              <Text style={styles.countBadgeText}>{invoices.length}</Text>
            </View>
          </View>
        </View>
        <LinearGradient
          pointerEvents="none"
          colors={[colors.ink, colors.orange]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.headerStripe}
        />
      </View>

      {error && (
        <View style={styles.errorBanner}>
          <Ionicons name="alert-circle" size={16} color={colors.error} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {/* ---------------- LIST ---------------- */}
      <FlatList<PendingInvoice>
        key={`inv${invoiceCols}`}
        style={styles.list}
        data={invoices}
        keyExtractor={(item) => item.billing_id}
        numColumns={invoiceCols}
        columnWrapperStyle={invoiceCols > 1 ? { gap: GRID_GAP } : undefined}
        contentContainerStyle={[styles.listContent, { paddingHorizontal: sidePad }]}
        showsVerticalScrollIndicator={false}
        removeClippedSubviews={Platform.OS === 'android'}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => loadInvoices(true)}
            tintColor={colors.ink}
            colors={[colors.ink]}
          />
        }
        ItemSeparatorComponent={() => <View style={{ height: GRID_GAP }} />}
        renderItem={({ item: invoice }) => {
          const amount = Number(invoice.total_amount ?? 0);
          const busy = convertingBillingId === invoice.billing_id;
          const lines = invoice.order_items ?? invoice.items ?? invoice.order?.order_items ?? invoice.order?.items ?? [];
          const open = expanded === invoice.billing_id;
          return (
            <View style={[styles.invoiceCard, { width: invoiceWidth }]}>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={`${open ? 'Hide' : 'Show'} items for table ${invoice.table_number || ''}`}
                accessibilityState={{ expanded: open }}
                onPress={() => setExpanded(open ? null : invoice.billing_id)}
                activeOpacity={0.8}
              >
                <View style={styles.invoiceHeader}>
                  <View style={styles.invoiceTile}>
                    <Text style={styles.invoiceTileText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>{invoice.table_number || '—'}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.invoiceTitle} numberOfLines={1}>{invoice.customer_name || 'Walk-in Guest'}</Text>
                    <Text style={styles.invoiceMeta} numberOfLines={1}>
                      Table {invoice.table_number || '—'}{invoice.floor ? ` · Floor ${invoice.floor}` : ''} · {invoice.bill_number || invoice.billing_id}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 2 }}>
                    <Text style={styles.invoiceTotal}>₹{(Number.isFinite(amount) ? amount : 0).toFixed(2)}</Text>
                    <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={17} color={colors.inkSoft} />
                  </View>
                </View>
                {open && (
                  <View style={styles.invoiceItems}>
                    {lines.length ? lines.map((line: PendingInvoiceItem, lineIndex: number) => {
                      const lineAmount = Number(line.item_total_with_tax ?? line.item_total ?? line.price ?? 0);
                      const lineName = line.name || line.item_name || line.menu_item_name || 'Item';
                      return (
                        <View key={`${invoice.billing_id}-item-${lineIndex}`} style={styles.invoiceItemRow}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.invoiceItemName}>{lineName}</Text>
                            <Text style={styles.invoiceItemMeta}>{line.quantity ?? 1} × {line.portion || 'Full'}</Text>
                          </View>
                          <Text style={styles.invoiceItemAmount}>₹{(Number.isFinite(lineAmount) ? lineAmount : 0).toFixed(2)}</Text>
                        </View>
                      );
                    }) : <Text style={styles.invoiceItemsEmpty}>Item details are not included in this pending KOT response.</Text>}
                  </View>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                accessibilityRole="button"
                onPress={() => setPayTarget(invoice)}
                disabled={!!convertingBillingId}
                activeOpacity={0.9}
                style={[styles.convertButton, !!convertingBillingId && styles.convertButtonDisabled]}
              >
                {busy ? (
                  <ActivityIndicator size="small" color={colors.white} />
                ) : (
                  <>
                    <Text style={styles.convertButtonText}>Complete sale</Text>
                    <Ionicons name="arrow-forward" size={14} color={colors.orange} />
                  </>
                )}
              </TouchableOpacity>
            </View>
          );
        }}
        ListEmptyComponent={
          !error ? (
            <View style={styles.emptyState}>
              <Ionicons name="receipt-outline" size={32} color={colors.muted} />
              <Text style={styles.emptyText}>No pending invoices</Text>
            </View>
          ) : null
        }
      />

      <PaymentPickerModal
        visible={!!payTarget}
        onClose={() => setPayTarget(null)}
        onConfirm={(method) => {
          const invoice = payTarget;
          setPayTarget(null);
          if (invoice) handleConvertInvoice(invoice, method);
        }}
      />
    </View>
  );
};

export default PendingInvoiceScreen;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  loadingRoot: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },

  // ----- white header -----
  header: {
    backgroundColor: colors.white,
    paddingBottom: 18,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    shadowColor: colors.inkDeep,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 5,
    zIndex: 2,
  },
  headerInner: { width: '100%', maxWidth: MAX_CONTENT, alignSelf: 'center' },
  headerStripe: { position: 'absolute', left: 36, right: 36, bottom: 0, height: 4, borderRadius: 2 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 42 },
  titleWrap: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: FONT.semibold, fontWeight: '700', fontSize: 22, color: colors.ink },
  subtitle: { fontFamily: FONT.medium, fontSize: 12, color: colors.inkSoft, marginTop: 0 },
  backBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center', ...shadow.soft },
  countBadge: { minWidth: 34, height: 34, paddingHorizontal: 10, borderRadius: 17, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  countBadgeText: { fontFamily: FONT.bold, fontSize: 13, color: colors.orange },

  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    backgroundColor: colors.errorBackground,
    borderWidth: 1,
    borderColor: colors.error,
    borderRadius: radius.md,
    paddingVertical: 8,
    paddingHorizontal: spacing.md,
  },
  errorText: { fontFamily: FONT.medium, fontSize: 12.5, color: colors.error, flex: 1 },

  // ----- list -----
  list: { width: '100%', maxWidth: MAX_CONTENT, alignSelf: 'center', flex: 1 },
  listContent: { flexGrow: 1, width: '100%', paddingTop: 16, paddingBottom: spacing.xl * 1.5 },
  emptyState: { alignItems: 'center', justifyContent: 'center', paddingTop: spacing.xxl, gap: spacing.sm, width: '100%' },
  emptyText: { fontFamily: FONT.medium, fontSize: 13, color: colors.muted },

  // ----- pending invoice card -----
  invoiceCard: {
    borderRadius: radius.lg,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 5,
    borderLeftColor: colors.orange,
    paddingVertical: 8,
    paddingHorizontal: 12,
    gap: 6,
  },
  invoiceHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  invoiceTile: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.warningBackground, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  invoiceTileText: { fontFamily: FONT.bold, fontSize: 13, color: colors.orangeText },
  invoiceTitle: { fontFamily: FONT.semibold, fontSize: 14, color: colors.ink },
  invoiceMeta: { fontFamily: FONT.regular, fontSize: 11, color: colors.inkSoft, marginTop: 1 },
  invoiceTotal: { fontFamily: FONT.bold, fontSize: 15, color: colors.ink, fontVariant: ['tabular-nums'] },
  invoiceItems: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, marginTop: 6, paddingTop: 2 },
  invoiceItemRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 3 },
  invoiceItemName: { fontFamily: FONT.medium, fontSize: 13, color: colors.ink },
  invoiceItemMeta: { fontFamily: FONT.regular, fontSize: 11, color: colors.inkSoft, marginTop: 2, textTransform: 'capitalize' },
  invoiceItemAmount: { fontFamily: FONT.medium, fontSize: 12, color: colors.ink, marginLeft: spacing.sm },
  invoiceItemsEmpty: { fontFamily: FONT.regular, fontSize: 12, color: colors.muted, paddingVertical: spacing.xs },
  convertButton: {  alignSelf: 'center', height: 34, paddingHorizontal: 16, borderRadius: 17, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 },
  convertButtonDisabled: { opacity: 0.55 },
  convertButtonText: { fontFamily: FONT.semibold, fontSize: 12.5, color: colors.orange },
});
