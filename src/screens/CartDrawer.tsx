// src/screens/CartDrawer.tsx
// Cart drawer — slides in from the RIGHT side, full height.
// Places the order with POST /api/kot/place-order/
//   { customer_name, table_number, floor?, items: [{ menu_item_id, quantity, portion }] }
// then prints the slip on the saved Bluetooth thermal printer.
import React, { useRef, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Image,
  ScrollView,
  Animated,
  useWindowDimensions,
  ActivityIndicator,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, spacing, radius, shadow, gradients, withAlpha } from '../constants/theme';
import { convertPendingInvoiceToSale, placeOrder } from '../services/api';
import { usePaymentMethods } from '../hooks/usePaymentMethods';
import PaymentPickerModal from './PaymentPickerModal';

import { clearCartForTable, clearOpenKotForTable, getOpenKotForTable, getSession, saveOpenKotForTable } from '../services/storage';
import { printOrderReceipt, printSalesReceipt } from '../utils/printer';
import { CartLine, AuthUser, KotOrder, PlaceOrderPayload, PlaceOrderResponse } from '../utils/kot';
import { enqueueOfflineOrder, getBlockingOrderForTable, getOfflineOrders, markInFlight, removeOfflineOrder, unmarkInFlight, updateOfflineOrder } from '../services/localCache';
import { describeOutcome, resendOfflineOrder, takeOrderSnapshot, verifyUnconfirmedOrders } from '../services/orderOutbox';
const DEFAULT_CUSTOMER = 'Walk-in Guest';

/** Build a local KOT snapshot from the submitted cart so Sales can show its
 * items even when the place-order response omits the nested order details. */
function getLocalKotSnapshot(res: PlaceOrderResponse, cart: CartLine[], payload: PlaceOrderPayload): KotOrder {
  const createdAt = new Date().toISOString();
  const serverOrder = res.order;
  const orderItems = serverOrder?.order_items?.length
    ? serverOrder.order_items
    : cart.map((line, index) => {
        const itemTotal = line.unitPrice * line.quantity;
        return {
          id: Date.now() + index,
          menu_item_id: line.menuItemId,
          name: line.name,
          portion: line.hasPortions ? line.portionLabel : 'single',
          quantity: line.quantity,
          price: String(line.unitPrice),
          tax: '0',
          item_total: itemTotal,
          tax_amount: 0,
          item_total_with_tax: itemTotal,
          kitchen_number: null,
          created_at: createdAt,
        };
      });
  const subtotal = orderItems.reduce((sum, item) => sum + Number(item.item_total || 0), 0);

  return {
    ...(serverOrder ?? {}),
    id: serverOrder?.id ?? Date.now(),
    billing_id: res.billing?.billing_id ?? serverOrder?.billing_id ?? '',
    bill_number: res.billing?.bill_number ?? serverOrder?.bill_number,
    kot_number: res.billing?.kot_number ?? serverOrder?.kot_number,
    session_id: serverOrder?.session_id ?? '',
    client_id: serverOrder?.client_id ?? '',
    username: serverOrder?.username ?? '',
    customer_name: serverOrder?.customer_name ?? payload.customer_name,
    customer_phone: serverOrder?.customer_phone ?? payload.customer_phone ?? '',
    table_number: serverOrder?.table_number ?? payload.table_number,
    floor: serverOrder?.floor ?? payload.floor ?? '',
    waiter_name: serverOrder?.waiter_name || payload.waiter_name || '',
    member_count: serverOrder?.member_count ?? 0,
    subtotal: serverOrder?.subtotal ?? String(subtotal),
    tax_amount: serverOrder?.tax_amount ?? '0',
    total_amount: serverOrder?.total_amount ?? String(subtotal),
    status: serverOrder?.status ?? 'open',
    order_type: serverOrder?.order_type ?? 'kot',
    order_time: serverOrder?.order_time ?? createdAt,
    special_instructions: serverOrder?.special_instructions ?? payload.special_instructions ?? '',
    order_items: orderItems,
    item_count: orderItems.reduce((sum, item) => sum + item.quantity, 0),
    created_at: serverOrder?.created_at ?? createdAt,
    updated_at: serverOrder?.updated_at ?? createdAt,
  };
}
// ---- scattered food icons for the header (same as Item / Category screens) --
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

// ---- iOS-style swipe-to-delete wrapper for a cart line ---------------------
// Each row is a tiny horizontal ScrollView: the native scroller does the
// swiping, so it is smooth on iOS + Android and works from ANYWHERE on the
// card. The card keeps its full size; a round Delete button waits to its right.
const DELETE_W = 64;                    // how far the card slides to show the button
const EXTRA = 140;                      // extra drag room for the full-swipe delete
const FULL_SWIPE_X = DELETE_W + 70;     // drag past this and let go = delete now

const SwipeLine: React.FC<{ width: number; onDelete: () => void; children: React.ReactNode }> = ({ width, onDelete, children }) => {
  const hAnim = useRef(new Animated.Value(0)).current;
  const opAnim = useRef(new Animated.Value(1)).current;
  const hRef = useRef(0);
  const deleting = useRef(false);
  const [collapsing, setCollapsing] = useState(false);
  const onDeleteRef = useRef(onDelete);
  onDeleteRef.current = onDelete;

  // fade + collapse the row, THEN remove it from the cart
  const triggerDelete = () => {
    if (deleting.current) return;
    deleting.current = true;
    hAnim.setValue(hRef.current);
    setCollapsing(true);
    Animated.parallel([
      Animated.timing(opAnim, { toValue: 0, duration: 120, useNativeDriver: false }),
      Animated.timing(hAnim, { toValue: 0, duration: 200, delay: 60, useNativeDriver: false }),
    ]).start(() => onDeleteRef.current());
  };

  return (
    <Animated.View
      style={[styles.lineWrap, collapsing && { height: hAnim, opacity: opAnim, overflow: 'hidden' }]}
      onLayout={(e) => { if (!deleting.current) hRef.current = e.nativeEvent.layout.height; }}
    >
      <ScrollView
        horizontal
        nestedScrollEnabled
        style={{ width }}
        scrollEnabled={!collapsing}
        bounces={false}
        overScrollMode="never"
        directionalLockEnabled
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        decelerationRate="fast"
        disableIntervalMomentum
        snapToOffsets={[0, DELETE_W]}
        snapToStart
        snapToEnd={false}
        scrollEventThrottle={16}
        onScrollEndDrag={(e) => {
          if (e.nativeEvent.contentOffset.x > FULL_SWIPE_X) triggerDelete();
        }}
      >
        <View style={{ width }}>{children}</View>
        <View style={styles.swipeDelete}>
          <TouchableOpacity
            style={styles.swipeDeleteBtn}
            activeOpacity={0.8}
            onPress={triggerDelete}
            accessibilityRole="button"
            accessibilityLabel="Delete item"
          >
            <Ionicons name="trash-outline" size={18} color={colors.white} />
          </TouchableOpacity>
        </View>
      </ScrollView>
    </Animated.View>
  );
};

interface CartDrawerProps {
  visible: boolean;
  onClose: () => void;
  cart: CartLine[];
  setCart: React.Dispatch<React.SetStateAction<CartLine[]>>;
  availableMenuItemIds: number[];
  tableId: number;
  tableNumber: string;
  floor?: string;
  user: AuthUser; // used for the firm name on the printed bill
  onOrderPlaced: () => void;
  orderType?: 'kot' | 'sales';
}

const CartDrawer: React.FC<CartDrawerProps> = ({
  visible,
  onClose,
  cart,
  setCart,
  availableMenuItemIds,
  tableId,
  tableNumber,
  floor,
  user,
  onOrderPlaced,
  orderType = 'kot',
}) => {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const compactLandscape = Math.min(windowWidth, windowHeight) >= 600 && windowWidth > windowHeight;
  const insets = useSafeAreaInsets();
  const drawerWidth = windowWidth < 600 ? windowWidth : Math.min(windowWidth * 0.55, 560);
    const [placing, setPlacing] = useState(false);
  const placingRef = useRef(false);                 // instant lock; state is too slow to stop a double tap
  const aliveRef = useRef(true);
  const checkIdRef = useRef<string | null>(null);
  const [slow, setSlow] = useState(false);          // true after 6s of waiting for the server
  const [check, setCheck] = useState<null | { id: string; stage: 'checking' | 'sent' | 'not_sent' | 'stuck'; text: string }>(null);

  useEffect(() => {
    aliveRef.current = true;
    return () => { aliveRef.current = false; };
  }, []);
  const [sendFailed, setSendFailed] = useState(false); // last attempt was NOT sent -> button says "Send Again"
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PlaceOrderResponse | null>(null); // set after a successful order
  const [queuedLocally, setQueuedLocally] = useState(false);
  const [printFailed, setPrintFailed] = useState<string | null>(null); // message when the slip could not be printed
  const [reprinting, setReprinting] = useState(false);
  const { selected: paymentMethod, setSelected: setPaymentMethod } = usePaymentMethods(true);
  const [payOpen, setPayOpen] = useState(false); // sales: payment picker before finalizing

  // order details typed by the waiter
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [customerInfoVisible, setCustomerInfoVisible] = useState(false);

  // keep the Modal mounted until the slide-out animation finishes
  const [mounted, setMounted] = useState(visible);

  const slideAnim = useRef(new Animated.Value(drawerWidth)).current; // 0 = open, drawerWidth = off-screen right

    useEffect(() => {
      if (visible) {
      checkIdRef.current = null;
      setCheck(null);
      setSlow(false);
      setError(null);
      setSendFailed(false);
      setResult(null);
      setQueuedLocally(false);
      setPrintFailed(null);
      setMounted(true);
      slideAnim.setValue(drawerWidth);
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        speed: 16,
        bounciness: 2,
      }).start();
    } else if (mounted) {
      Animated.timing(slideAnim, {
        toValue: drawerWidth,
        duration: 220,
        useNativeDriver: true,
      }).start(() => setMounted(false));
    }
  }, [visible, drawerWidth]);

  // backdrop fades in step with the drawer
  const backdropOpacity = slideAnim.interpolate({
    inputRange: [0, drawerWidth],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  // pre-tax estimate; the server adds tax and returns the final bill
  const total = cart.reduce((sum, c) => sum + c.unitPrice * c.quantity, 0);
  const itemCount = cart.reduce((sum, c) => sum + c.quantity, 0);

  const lineKey = (line: CartLine) => `${line.menuItemId}_${line.portionLabel}`;

  // whole numbers show without decimals, anything else shows 2 decimals
  const fmtPrice = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));
  const updateQty = (line: CartLine, delta: number) => {
    setCart((prev) => {
      const next = prev
        .map((c) =>
          lineKey(c) === lineKey(line) ? { ...c, quantity: c.quantity + delta } : c
        )
        .filter((c) => c.quantity > 0);
      return next;
    });
  };

const removeLine = (line: CartLine) => {
  setCart((prev) => prev.filter((c) => lineKey(c) !== lineKey(line)));
};

const clearAll = () => {
  if (cart.length === 0) return;
  Alert.alert('Clear cart', 'Remove all items from this cart?', [
    { text: 'Cancel', style: 'cancel' },
    {
      text: 'Clear all',
      style: 'destructive',
      onPress: async () => {
        setCart([]);
        setError(null);
        try {
          await clearCartForTable(tableId, orderType); // also wipe the saved copy
        } catch {}
      },
    },
  ]);
};

  // firm name + place for the printed bill header (only if the saved user has them)
  const getFirm = () => {
    const f = user as { firm_name?: string; place?: string; gst_number?: string; phone?: string; whatsapp?: string };
    return { name: f?.firm_name, place: f?.place, gstNumber: f?.gst_number, phone: f?.phone || f?.whatsapp };
  };

  const handleReprint = async () => {
    if (!result || reprinting) return;
    setReprinting(true);
    const r = orderType === 'sales'
      ? await printSalesReceipt(result, getFirm(), paymentMethod)
      : await printOrderReceipt(result, getFirm());
    setReprinting(false);
    if (r.ok) setPrintFailed(null);
    else setPrintFailed(r.message);
  };
    // Outcome unknown: keep checking the server and tell the waiter the TRUE result.
  const startCheck = async (id: string) => {
    checkIdRef.current = id;
    setCheck({
      id,
      stage: 'checking',
      text: `No reply from the server yet, so we do not know if Table ${tableNumber}'s order arrived. Checking now. Please do NOT send it again.`,
    });
    for (let attempt = 0; attempt < 9; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, attempt === 0 ? 3000 : 10000));
      if (!aliveRef.current || checkIdRef.current !== id) return;

      const outcomes = await verifyUnconfirmedOrders();
      if (!aliveRef.current || checkIdRef.current !== id) return;

      const mine = outcomes.find((o) => o.orderId === id);
      if (mine) {
        if (mine.result === 'sent' && mine.slip) {
          setResult(mine.slip);
          setCheck(null);
          setPrintFailed(mine.printed ? null : (mine.printMessage ?? 'printer error'));
        } else {
          setCheck({ id, stage: mine.result === 'sent' ? 'sent' : 'not_sent', text: describeOutcome(mine).message });
        }
        return;
      }

      // another screen may already have resolved it
      const row = (await getOfflineOrders()).find((o) => o.id === id);
      if (!row) {
        setCheck({ id, stage: 'sent', text: `Table ${tableNumber}: the server confirmed it received this order. It was not sent twice.` });
        return;
      }
      if (row.status === 'pending') {
        setCheck({ id, stage: 'not_sent', text: `Table ${tableNumber}: the server confirmed it never received this order. Tap Send Again to place it.` });
        return;
      }
    }
    setCheck({
      id,
      stage: 'stuck',
      text: `We still cannot confirm Table ${tableNumber}'s order. It is saved on this device and was NOT sent again. Do NOT send it again by hand. We keep checking in the background; the result will show on the Tables screen.`,
    });
  };

  // "Send Again" after the server proved the order never arrived
  const resendChecked = async () => {
    if (!check || placingRef.current) return;
    const id = check.id;
    placingRef.current = true;
    setPlacing(true);
    const r = await resendOfflineOrder(id);
    placingRef.current = false;
    setPlacing(false);
    if (r.ok) {
      if (r.slip) {
        setResult(r.slip);
        setCheck(null);
        setPrintFailed(r.printed ? null : (r.printMessage ?? 'printer error'));
      } else {
        setCheck({ id, stage: 'sent', text: r.message ?? 'The order was confirmed on the server.' });
      }
    } else if (r.unconfirmed) {
      startCheck(id);
    } else {
      setCheck({ id, stage: 'not_sent', text: r.message ?? 'Not sent. Check the connection and try again.' });
    }
  };
  const handlePlaceOrder = async (method?: string) => {
    if (cart.length === 0 || placingRef.current) return;
    const payMethod = method ?? paymentMethod;
    const availableIds = new Set(availableMenuItemIds);
    const invalidLines = cart.filter((line) => !availableIds.has(line.menuItemId));
    if (invalidLines.length > 0) {
      const invalidIds = new Set(invalidLines.map((line) => line.menuItemId));
      setCart((current) => current.filter((line) => !invalidIds.has(line.menuItemId)));
      setError(
        `${invalidLines.map((line) => line.name).join(', ')} ${invalidLines.length === 1 ? 'is' : 'are'} no longer on this menu. Removed ${invalidLines.length === 1 ? 'it' : 'them'} from the cart; review the updated cart and try again.`,
      );
      return;
    }
        placingRef.current = true; // no await between the guard above and this line, so two fast taps cannot both pass
    setPlacing(true);
    setError(null);
    setSlow(false);
    let outboxId: string | undefined;
    let flightId: string | undefined;
    let slowTimer: ReturnType<typeof setTimeout> | undefined;
    try {
      // a table with an unfinished order can never place a second one
      const blocking = await getBlockingOrderForTable(tableId);
      if (blocking) {
        setError(`Table ${tableNumber} already has an order that is not finished (${blocking.status === 'pending' ? 'confirmed NOT sent' : 'being confirmed with the server'}). Open the Tables screen and finish or confirm it first, so the same order is never sent twice.`);
        return;
      }

      const phone = customerPhone.trim();
      const instructions = notes.trim();
      const session = await getSession();
      const waiterName = typeof session?.username === 'string' ? session.username.trim() : '';
      const openKot = orderType === 'sales' ? await getOpenKotForTable(tableId) : null;

      const payload: PlaceOrderPayload = {
        customer_name: customerName.trim() || DEFAULT_CUSTOMER,
        ...(waiterName ? { waiter_name: waiterName } : {}),
        ...(orderType === 'sales' && openKot?.kot_number != null ? { kot_number: openKot.kot_number } : {}),
        table_number: String(tableNumber),
        ...(floor?.trim() ? { floor: floor.trim() } : {}),
        items: cart.map((c) => ({
          menu_item_id: c.menuItemId,
          quantity: c.quantity,
          ...(c.hasPortions ? { portion: c.portionLabel } : {}),
        })),
        ...(phone ? { customer_phone: phone } : {}),
        ...(instructions ? { special_instructions: instructions } : {}),
        ...(orderType === 'sales' && payMethod ? { payment_method: payMethod.trim() } : {}),
        };

            // ONE real server read: proves the network works AND records the table's current state.
      // If this fails, NOTHING has been sent.
      let snapshot: Awaited<ReturnType<typeof takeOrderSnapshot>>;
      try {
        snapshot = await takeOrderSnapshot(orderType, String(tableNumber), floor?.trim() || undefined);
      } catch {
        setError('Order NOT sent. The network is too weak to even start sending. Nothing reached the server and your cart is safe. Tap Send Again when the connection is better.');
        setSendFailed(true);
        return;
      }

      const outboxInput = {
        tableId,
        tableNumber: String(tableNumber),
        orderType,
        payload,
        closeBillNumber: openKot?.bill_number,
        meta: {
          kind: orderType,
          baseline: snapshot.baseline,
          salesBefore: snapshot.salesBefore,
          lines: cart,
          attemptAt: Date.now(),
        },
      };

      const savedOrder = await enqueueOfflineOrder(outboxInput, 'sending');
      outboxId = savedOrder.id;
      flightId = savedOrder.id;
      markInFlight(flightId);

      console.log('[Order] Submitting order', {
        orderType,
        tableNumber: payload.table_number,
        floor: payload.floor,
        itemCount: payload.items.length,
        items: payload.items,
        paymentMethod: payload.payment_method ?? null,
        hasCustomerPhone: Boolean(phone),
        hasSpecialInstructions: Boolean(instructions),
      });

      slowTimer = setTimeout(() => setSlow(true), 6000);

      // outboxId doubles as client_request_id; preflight=false because the snapshot above was the real check
      const res = await placeOrder(payload, orderType, outboxId, false);
      if (orderType === 'sales' && openKot?.bill_number) {
        await updateOfflineOrder(outboxId, 'sale_close_pending');
      } else {
        await removeOfflineOrder(outboxId);
        outboxId = undefined;
      }
      // Preserve the locally entered number for printing if the API omits it.
      const printableRes = res.order && phone && !res.order.customer_phone
        ? { ...res, order: { ...res.order, customer_phone: phone } }
        : res;

     // On a merged KOT the server returns ALL items; the kitchen slip must list only the new ones.
const kitchenRes: PlaceOrderResponse =
  orderType === 'kot' && res.merged && printableRes.order
    ? {
        ...printableRes,
        order: {
          ...printableRes.order,
          order_items: cart.map((c, i) => ({
            id: i + 1,
            menu_item_id: c.menuItemId,
            name: c.name,
            portion: c.hasPortions ? c.portionLabel : 'single',
            quantity: c.quantity,
            price: String(c.unitPrice),
            tax: '0',
            item_total: c.unitPrice * c.quantity,
            tax_amount: 0,
            item_total_with_tax: c.unitPrice * c.quantity,
            kitchen_number: null,
            created_at: new Date().toISOString(),
          })),
        },
      }
    : printableRes;

  setResult(kitchenRes);
  setSendFailed(false);
  setPrintFailed(null);
  if (orderType === 'kot') {
    await saveOpenKotForTable(tableId, getLocalKotSnapshot(res, cart, payload), !!res.merged);
  }
      let salesReceiptRes = printableRes;
      let kotConversionError: string | null = null;
      if (orderType === 'sales' && openKot) {
        try {
          if (!openKot.bill_number) throw new Error('Bill number missing for the open KOT. Refresh pending invoices and try again.');
          const conversion = await convertPendingInvoiceToSale(openKot.bill_number, payMethod, openKot.billing_id, openKot.kot_number, waiterName);
          const convertedBilling = conversion.billing as PlaceOrderResponse['billing'] | undefined;
          if (convertedBilling) {
            salesReceiptRes = {
              ...printableRes,
              order: printableRes.order
                ? {
                    ...printableRes.order,
                    kot_number: printableRes.order.kot_number ?? convertedBilling.kot_number ?? openKot.kot_number,
                    waiter_name: printableRes.order.waiter_name || convertedBilling.waiter_name || waiterName || '',
                  }
                : printableRes.order,
              billing: { ...printableRes.billing, ...convertedBilling },
            };
            setResult(salesReceiptRes);
          }
          await clearOpenKotForTable(tableId);
          if (outboxId) {
            await removeOfflineOrder(outboxId);
            outboxId = undefined;
          }
        } catch (err) {
          kotConversionError = err instanceof Error ? err.message : 'The previous KOT could not be closed.';
          if (outboxId) await updateOfflineOrder(outboxId, 'sale_close_pending', kotConversionError);
          outboxId = undefined; // the sale itself was accepted; only KOT closing remains queued
        }
      }
      await clearCartForTable(tableId, orderType);
      setCart([]);
      setCustomerName('');
      setCustomerPhone('');
      setNotes('');

      // Print the slip. The order is already placed, so a print problem must
      // never turn into an order error: on success auto-close as before, on
      // failure stay open so the user can reprint.
     const printed = orderType === 'sales'
  ? await printSalesReceipt(salesReceiptRes, getFirm(), payMethod)
  : await printOrderReceipt(kitchenRes, getFirm());
      if (!printed.ok || kotConversionError) {
        const issues = [
          !printed.ok ? `Printing failed: ${printed.message}` : '',
          kotConversionError ? `The previous KOT is still open: ${kotConversionError}` : '',
        ].filter(Boolean);
        setPrintFailed(issues.join(' '));
      }
          } catch (err) {
      console.log('[Order] placeOrder failed:', (err as Error)?.message, 'notSent=', (err as any)?.notSent);
      const message = err instanceof Error ? err.message : 'Failed to place order.';
      const notSent = (err as { notSent?: boolean })?.notSent === true;
      if (outboxId && notSent) {
        // the server refused it or it never left the phone: provably not created
        await removeOfflineOrder(outboxId);
        setError(`Order NOT sent: ${message} Your cart is safe. Tap Send Again.`);
        setSendFailed(true);
      } else if (outboxId) {
        // OUTCOME UNKNOWN: the request may or may not have reached the server.
        // Keep the order safely in the outbox, empty the cart so it cannot be re-entered, and verify.
        await updateOfflineOrder(outboxId, 'needs_review', message);
        try { await clearCartForTable(tableId, orderType); } catch {}
        setCart([]);
        startCheck(outboxId);
      } else {
        setError(message);
      }
    } finally {
      if (slowTimer) clearTimeout(slowTimer);
      setSlow(false);
      if (flightId) unmarkInFlight(flightId);
      placingRef.current = false;
      setPlacing(false);
    }
  };

    // KOT places straight away; Sales must pick a payment method first
  const onPrimaryPress = () => {
    if (cart.length === 0 || placing) return;
    if (orderType === 'sales') setPayOpen(true);
    else handlePlaceOrder();
  };

  const sheetPadH = compactLandscape ? spacing.md : spacing.lg;
  const sheetPadTop = compactLandscape ? Math.max(insets.top, spacing.xs) : Math.max(insets.top, spacing.lg);

  const order = result?.order;
  const billing = result?.billing;

  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      presentationStyle="overFullScreen"
      onRequestClose={onClose}
    >
      <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
      </Animated.View>

      <Animated.View style={[styles.sheet, shadow.card, { width: drawerWidth, paddingHorizontal: compactLandscape ? spacing.md : spacing.lg, paddingTop: compactLandscape ? Math.max(insets.top, spacing.xs) : Math.max(insets.top, spacing.lg), paddingBottom: compactLandscape ? Math.max(insets.bottom, 4) : Math.max(insets.bottom, spacing.md), transform: [{ translateX: slideAnim }] }]}>
        <View style={{ flex: 1 }}>
                    {check ? (
            <View style={styles.successWrap}>
              <View style={[styles.successIconCircle, check.stage === 'not_sent' && { backgroundColor: colors.error }]}>
                {check.stage === 'checking' ? (
                  <ActivityIndicator color={colors.white} />
                ) : (
                  <Ionicons
                    name={check.stage === 'sent' ? 'checkmark' : check.stage === 'not_sent' ? 'close' : 'time-outline'}
                    size={30}
                    color={colors.white}
                  />
                )}
              </View>
              <Text style={styles.successTitle}>
                {check.stage === 'checking' ? 'Confirming your order…'
                  : check.stage === 'sent' ? 'Order confirmed'
                  : check.stage === 'not_sent' ? 'Order NOT sent'
                  : 'Still not confirmed'}
              </Text>
              <Text style={[styles.successSubtitle, { textAlign: 'center', paddingHorizontal: spacing.md }]}>{check.text}</Text>

              {check.stage === 'not_sent' && (
                <TouchableOpacity style={[styles.reprintBtn, { alignSelf: 'stretch' }]} activeOpacity={0.9} disabled={placing} onPress={resendChecked}>
                  {placing ? <ActivityIndicator color={colors.white} /> : <Text style={styles.reprintText}>Send Again</Text>}
                </TouchableOpacity>
              )}
              {check.stage !== 'checking' && (
                <TouchableOpacity onPress={onOrderPlaced} style={styles.doneButton}>
                  <Text style={styles.doneText}>{check.stage === 'not_sent' ? 'Close (order stays saved)' : 'Done'}</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : result || queuedLocally ? (
            <View style={styles.successWrap}>
              <View style={styles.successIconCircle}>
                <Ionicons name={queuedLocally ? 'cloud-upload-outline' : 'checkmark'} size={30} color={colors.white} />
              </View>
              <Text style={styles.successTitle}>
                {queuedLocally ? 'Order saved on device' : orderType === 'sales' ? 'Sale completed!' : result?.merged ? 'Added to existing KOT!' : 'Order placed!'}
              </Text>
              <Text style={styles.successSubtitle}>
                {queuedLocally ? `Saved for Table ${tableNumber}. It will send automatically when the connection returns.` : orderType === 'sales' ? 'Sale recorded for Table' : 'Sent to the kitchen for Table'} {queuedLocally ? '' : (order?.table_number ?? tableNumber)}
              </Text>

              {(billing || order) && (
                <View style={styles.receipt}>
                  <View style={styles.receiptRow}>
                    <Text style={styles.receiptLabel}>Bill no.</Text>
                    <Text style={styles.receiptValue}>
                      {billing?.bill_number ?? (order ? `${orderType === 'sales' ? 'SALE' : 'KOT'}-${order.id}` : '—')}
                    </Text>
                  </View>
                  <View style={styles.receiptRow}>
                    <Text style={styles.receiptLabel}>KOT no.</Text>
                    <Text style={styles.receiptValue}>{order?.kot_number ?? billing?.billing_id ?? order?.billing_id ?? order?.id ?? '—'}</Text>
                  </View>
                  {order?.order_items.map((item) => (
                    <View key={item.id} style={styles.receiptRow}>
                      <Text style={styles.receiptLabel} numberOfLines={2}>
                        {item.quantity} x {item.name}
                        {item.portion && !['single', 'full'].includes(item.portion.toLowerCase())
                          ? ` (${item.portion})`
                          : ''}
                      </Text>
                    </View>
                  ))}
                </View>
              )}

              {printFailed && (
                <View style={styles.printFailWrap}>
                  <Text style={styles.printFailText}>Print failed: {printFailed}</Text>
                  <TouchableOpacity
                    style={styles.reprintBtn}
                    activeOpacity={0.9}
                    disabled={reprinting}
                    onPress={handleReprint}
                  >
                    {reprinting ? (
                      <ActivityIndicator color={colors.white} />
                    ) : (
                      <Text style={styles.reprintText}>Reprint</Text>
                    )}
                  </TouchableOpacity>
                </View>
              )}
              <TouchableOpacity onPress={onOrderPlaced} style={styles.doneButton}>
                <Text style={styles.doneText}>Done</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
                                  <LinearGradient
                colors={gradients.button}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[
                  styles.hero,
                  {
                    marginHorizontal: -sheetPadH,
                    marginTop: -sheetPadTop,
                    paddingHorizontal: spacing.md,
                    paddingTop: sheetPadTop + (compactLandscape ? spacing.xs : spacing.sm),
                  },
                  compactLandscape && styles.heroCompact,
                ]}
              >
                {/* icons sit behind the content */}
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
                    onPress={onClose}
                    style={styles.heroBack}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityLabel="Close cart"
                  >
                    <Ionicons name="chevron-back" size={20} color={colors.white} />
                  </TouchableOpacity>

                  <View style={styles.heroText}>
                    <Text style={[styles.heroTitle, compactLandscape && styles.heroTitleCompact]} numberOfLines={1}>
                      {orderType === 'sales' ? 'Sales Cart' : 'Kot Cart'}
                    </Text>
                    <Text style={styles.heroSubtitle} numberOfLines={1}>
                      Table {tableNumber}{floor ? ` · Floor ${floor}` : ''}{itemCount > 0 ? ` · ${itemCount} item${itemCount === 1 ? '' : 's'}` : ''}
                    </Text>
                  </View>

                  {cart.length > 0 && (
                    <TouchableOpacity
                      onPress={clearAll}
                      accessibilityRole="button"
                      accessibilityLabel="Clear all items"
                      style={styles.clearAllButton}
                      activeOpacity={0.8}
                      hitSlop={6}
                      disabled={placing}
                    >
                      <Ionicons name="trash-outline" size={15} color={colors.white} />
                      <Text style={styles.clearAllText}>Clear all</Text>
                    </TouchableOpacity>
                  )}

                  <TouchableOpacity
                    onPress={() => setCustomerInfoVisible(true)}
                    accessibilityRole="button"
                    accessibilityLabel="Add customer and kitchen details"
                    style={styles.heroBadge}
                    activeOpacity={0.8}
                    hitSlop={6}
                  >
                    <Ionicons name="person-add" size={18} color={colors.orange} />
                    {(customerName.trim() || customerPhone.trim() || notes.trim()) ? <View style={styles.customerInfoDot} /> : null}
                  </TouchableOpacity>
                </View>
              </LinearGradient>

              <ScrollView
                style={styles.lineList}
                directionalLockEnabled
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{ paddingBottom: compactLandscape ? spacing.xs : spacing.md, flexGrow: 1 }}
              >
                {cart.length === 0 ? (
                  <View style={styles.emptyCart}>
                    <Ionicons name="cart-outline" size={30} color={colors.muted} />
                    <Text style={styles.emptyCartText}>Your cart is empty</Text>
                  </View>
                ) : (
                  <>
                    {cart.map((line) => (
                      <SwipeLine key={lineKey(line)} width={drawerWidth - sheetPadH * 2} onDelete={() => removeLine(line)}>
                      <View style={styles.line}>
                        {line.imageUrl ? (
                          <Image source={{ uri: line.imageUrl }} style={styles.lineImage} />
                        ) : (
                          <View style={[styles.lineImage, styles.lineImageFallback]}>
                            <Ionicons name="restaurant-outline" size={18} color={colors.muted} />
                          </View>
                        )}
                        <View style={styles.lineInfo}>
                          <View style={styles.lineNameRow}>
                            <Text style={styles.lineName} numberOfLines={1}>{line.name}</Text>
                          </View>
                          <Text style={styles.linePortion} numberOfLines={1}>
                            {line.portionLabel !== 'full' ? `${line.portionLabel} · ` : ''}
                            ₹{fmtPrice(line.unitPrice)}
                          </Text>
                        </View>

                        <View style={styles.lineRight}>
                        <Text style={styles.lineTotalLabel} numberOfLines={1}>
                          Total{'  '}
                          <Text style={styles.lineItemTotal}>₹{fmtPrice(line.unitPrice * line.quantity)}</Text>
                        </Text>
                        <View style={styles.qtyControl}>
                          <TouchableOpacity
                            style={[styles.qtyBtn, line.quantity <= 1 && { opacity: 0.4 }]}
                            disabled={line.quantity <= 1}
                            onPress={() => updateQty(line, -1)}
                          >
                            <Ionicons name="remove" size={14} color={colors.ink} />
                          </TouchableOpacity>
                          <Text style={styles.qtyValue}>{line.quantity}</Text>
                          <TouchableOpacity style={[styles.qtyBtn, styles.qtyBtnAdd]} onPress={() => updateQty(line, 1)}>
                            <Ionicons name="add" size={14} color={colors.white} />
                          </TouchableOpacity>
                        </View>
                        </View>
                      </View>
                      </SwipeLine>
                    ))}

                  </>
                )}
              </ScrollView>

              {error && (
                <View style={styles.errorBanner}>
                  <Ionicons name="alert-circle" size={16} color={colors.error} />
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              )}

                            {placing && (
                <Text style={[styles.taxNote, { textAlign: 'center', color: colors.inkSoft, marginTop: spacing.sm }]}>
                  {slow
                    ? 'Slow network. Still waiting for the server. Do not close the app or tap again.'
                    : 'Sending order…'}
                </Text>
              )}

              <View style={[styles.totalRow, compactLandscape && styles.totalRowCompact]}>
                <View>
                  <Text style={styles.totalLabel}>Total</Text>
                  <Text style={styles.taxNote}>Tax is added when the bill is generated</Text>
                </View>
                <Text style={[styles.totalValue, compactLandscape && styles.totalValueCompact]}>₹{total.toFixed(0)}</Text>
              </View>

              <TouchableOpacity
                activeOpacity={0.92}
                disabled={cart.length === 0 || placing}
                onPress={onPrimaryPress}
                style={{ alignSelf: 'center', width: '100%', maxWidth: 320 }}
              >
                <LinearGradient
                  colors={gradients.button}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[styles.placeOrderBtn, compactLandscape && styles.placeOrderBtnCompact, shadow.button, cart.length === 0 && { opacity: 0.5 }]}
                >
                  {placing ? (
                    <ActivityIndicator color={colors.orange} />
                  ) : (
                    <>
                                            <Text style={styles.placeOrderText}>{sendFailed ? 'Send Again' : orderType === 'sales' ? 'Finalize Sale' : 'Place Order'}</Text>
                      <Ionicons name="arrow-forward" size={16} color={colors.orange} style={{ marginLeft: 8 }} />
                    </>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </>
          )}
        </View>
      </Animated.View>
      {customerInfoVisible && !result && (
        <KeyboardAvoidingView
          style={styles.customerInfoOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top : 0}
        >
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => setCustomerInfoVisible(false)}
            accessibilityLabel="Close customer details"
          />
          <View style={styles.customerInfoCard}>
            <View style={styles.customerInfoHeader}>
              <View>
                <Text style={styles.customerInfoTitle}>Customer & kitchen details</Text>
                <Text style={styles.customerInfoSubtitle}>All fields are optional</Text>
              </View>
              <TouchableOpacity onPress={() => setCustomerInfoVisible(false)} hitSlop={8} accessibilityLabel="Close details">
                <Ionicons name="close" size={22} color={colors.ink} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ flexShrink: 1 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text style={styles.fieldLabel}>Customer name</Text>
              <View style={styles.inputWrap}>
                <Ionicons name="person-outline" size={16} color={colors.muted} />
                <TextInput
                  style={styles.customerTextInput}
                  value={customerName}
                  onChangeText={setCustomerName}
                  placeholder={DEFAULT_CUSTOMER}
                  placeholderTextColor={colors.muted}
                  autoCapitalize="words"
                  returnKeyType="next"
                  underlineColorAndroid="transparent"
                  maxLength={60}
                />
              </View>

              <Text style={styles.fieldLabel}>Phone (optional)</Text>
              <View style={styles.inputWrap}>
                <Ionicons name="call-outline" size={16} color={colors.muted} />
                <TextInput
                  style={styles.customerTextInput}
                  value={customerPhone}
                  onChangeText={setCustomerPhone}
                  placeholder="Customer phone"
                  placeholderTextColor={colors.muted}
                  keyboardType="phone-pad"
                  underlineColorAndroid="transparent"
                  maxLength={15}
                />
              </View>

              <Text style={styles.fieldLabel}>Notes for kitchen (optional)</Text>
              <View style={[styles.inputWrap, styles.notesWrap]}>
                <TextInput
                  style={[styles.customerTextInput, styles.notesInput]}
                  value={notes}
                  onChangeText={setNotes}
                  placeholder="e.g. less spicy, no onion"
                  placeholderTextColor={colors.muted}
                  multiline
                  underlineColorAndroid="transparent"
                  maxLength={200}
                />
              </View>
            </ScrollView>

            <TouchableOpacity style={styles.customerInfoDone} onPress={() => setCustomerInfoVisible(false)}>
              <Text style={styles.customerInfoDoneText}>Done</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      )}
      <PaymentPickerModal
        visible={payOpen}
        onClose={() => setPayOpen(false)}
        onConfirm={(method) => {
          setPayOpen(false);
          setPaymentMethod(method);
          handlePlaceOrder(method);
        }}
      />
    </Modal>
  );
};

export default CartDrawer;

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: withAlpha(colors.inkDeep, 0.4),
  },
  sheet: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderBottomLeftRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xxl,   // clears the status bar / notch
    paddingBottom: spacing.xl, // clears the home indicator
  },
    // ---- header (same look as Category / Item create screens) ----
  hero: {
    paddingBottom: spacing.md,
    marginBottom: spacing.md,
    borderTopLeftRadius: radius.xl,
    borderBottomLeftRadius: 22,
    borderBottomRightRadius: 22,
    overflow: 'hidden',
  },
  heroCompact: {
    paddingBottom: spacing.sm,
    marginBottom: spacing.xs,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
  },
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
heroTitle: { fontFamily: 'Inter_600SemiBold', fontWeight: '700', fontSize: 22, color: colors.white },  heroTitleCompact: { fontSize: 18 },
  heroSubtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: withAlpha(colors.white, 0.78),
    marginTop: 1,
  },
  heroBadge: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: withAlpha(colors.white, 0.12),
    borderWidth: 1,
    borderColor: withAlpha(colors.white, 0.22),
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    height: 34,
    borderRadius: 12,
    backgroundColor: withAlpha(colors.white, 0.14),
    borderWidth: 1,
    borderColor: withAlpha(colors.white, 0.22),
  },
  clearAllText: { fontFamily: 'Inter_600SemiBold', fontSize: 12, color: colors.white },
  customerInfoDot: {
    position: 'absolute',
    top: 5,
    right: 5,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.orange,
    borderWidth: 1,
    borderColor: colors.white,
  },
   lineList: {
    flex: 1,
  },
  lineTotalLabel: {
    fontSize: 11.5,
    color: colors.inkSoft,
  },
  lineItemTotal: {
    fontWeight: '800',
    fontSize: 17,
    color: colors.ink,
  },
  lineSummaryTotal: {
    fontFamily: 'Inter_600SemiBold',
    color: colors.ink,
  },
  emptyCart: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxl,
    gap: spacing.sm,
  },
  emptyCartText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: colors.muted,
  },
  lineWrap: { paddingBottom: spacing.sm },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.background,
    gap: spacing.sm,
  },
  swipeDelete: {
    width: DELETE_W + EXTRA,
    paddingLeft: (DELETE_W - 40) / 2,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  swipeDeleteBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.error,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lineImage: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.badgeBg,
  },
  lineRight: {
    alignItems: 'flex-end',
    gap: 6,
  },
  lineImageFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  lineInfo: {
    flex: 1,
  },
  lineName: {
    flex: 1,
    fontWeight: '700',
    fontSize: 15,
    color: colors.ink,
  },
  linePortion: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11.5,
    color: colors.inkSoft,
    marginTop: 2,
    textTransform: 'capitalize',
  },
  lineNameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  lineTotal: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: colors.ink },
  qtyControl: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  qtyBtnAdd: { backgroundColor: colors.ink },
  qtyBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.badgeBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyValue: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: colors.ink,
    minWidth: 16,
    textAlign: 'center',
  },

  // order details form
  sectionLabel: {
    fontFamily: 'Fraunces_600SemiBold',
    fontSize: 15,
    color: colors.ink,
    marginTop: spacing.lg,
    marginBottom: spacing.xs,
  },
  fieldLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    color: colors.inkSoft,
    marginTop: spacing.sm,
    marginBottom: 4,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.softGreenAlt,
    borderWidth: 0,
    borderColor: 'transparent',
    borderRadius: radius.md,
    overflow: 'hidden',
    paddingHorizontal: spacing.md,
    height: 42,
    gap: spacing.sm,
  },
  notesWrap: {
    minHeight: 68,
    height: 88,
    alignItems: 'flex-start',
    paddingVertical: spacing.sm,
  },
  notesInput: {
    height: '100%',
    textAlignVertical: 'top',
  },
  customerTextInput: {
    flex: 1,
    backgroundColor: 'transparent',
    borderWidth: 0,
    borderColor: 'transparent',
    fontFamily: 'Inter_500Medium',
    fontSize: 13.5,
    color: colors.ink,
    paddingVertical: 0,
  },
  customerInfoOverlay: {
    ...StyleSheet.absoluteFill,
    zIndex: 20,
    elevation: 20,
    backgroundColor: withAlpha(colors.inkDeep, 0.45),
    borderWidth: 0,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  customerInfoCard: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '90%',
    flexShrink: 1,
    backgroundColor: colors.surface,
    borderWidth: 0,
    borderColor: 'transparent',
    borderRadius: radius.xl,
    padding: spacing.lg,
    ...shadow.card,
  },
  customerInfoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
 customerInfoTitle: {
  fontFamily: 'Inter_600SemiBold',
  fontWeight: '700',
  fontSize: 17,
  color: colors.ink,
},
  customerInfoSubtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: colors.muted,
    marginTop: 2,
  },
  customerInfoDone: {
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.ink,
  },
  customerInfoDoneText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: colors.white,
  },

  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.sm,
    backgroundColor: colors.errorBackground,
    borderWidth: 1,
    borderColor: colors.error,
    borderRadius: radius.md,
    paddingVertical: 8,
    paddingHorizontal: spacing.md,
  },
  errorText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12.5,
    color: colors.error,
    flex: 1,
  },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.md,
    marginBottom: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.background,
  },
  totalRowCompact: { marginTop: spacing.xs },
  totalLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    color: colors.inkSoft,
  },
  totalValue: {
    fontFamily: 'Fraunces_700Bold',
    fontSize: 22,
    color: colors.ink,
  },
  totalValueCompact: { fontSize: 18 },
  taxNote: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: colors.muted,
    marginTop: 1,
  },
  paymentSection: { marginBottom: spacing.md },
  paymentSectionCompact: { marginBottom: spacing.xs },
  paymentLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 12, color: colors.inkSoft, marginBottom: spacing.xs },
  paymentLabelCompact: { fontSize: 11, marginBottom: 2 },
  paymentOptions: { flexDirection: 'row', gap: spacing.sm, paddingRight: spacing.sm },
  paymentOptionsCompact: { gap: spacing.xs },
  paymentOption: { minHeight: 38, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.background },
  paymentOptionCompact: { minHeight: 32, gap: 4 },
  paymentOptionSelected: { borderColor: colors.ink, backgroundColor: colors.badgeBg },
  paymentOptionText: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: colors.inkSoft },
  paymentOptionTextSelected: { color: colors.ink },
  placeOrderBtn: {
    flexDirection: 'row',
    height: 54,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeOrderBtnCompact: { height: 42 },
  placeOrderText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15.5,
    color: colors.orange,
    letterSpacing: 0.2,
  },

  // success + receipt
  successWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxl,
    gap: spacing.sm,
  },
  successIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  successTitle: {
    fontFamily: 'Fraunces_600SemiBold',
    fontSize: 20,
    color: colors.ink,
  },
  successSubtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: colors.inkSoft,
  },
  receipt: {
    alignSelf: 'stretch',
    marginTop: spacing.lg,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    gap: 6,
  },
  receiptRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  receiptLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12.5,
    color: colors.inkSoft,
  },
  receiptValue: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: colors.ink,
  },
  receiptTotalRow: {
    marginTop: 4,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  receiptTotalLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: colors.ink,
  },
  receiptTotalValue: {
    fontFamily: 'Fraunces_700Bold',
    fontSize: 18,
    color: colors.ink,
  },

  // print failure + reprint
  printFailWrap: {
    alignSelf: 'stretch',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  printFailText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12.5,
    color: colors.error,
    textAlign: 'center',
  },
  reprintBtn: {
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reprintText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: colors.white,
  },
  doneButton: {
    alignSelf: 'center',
    minWidth: 120,
    minHeight: 44,
    marginTop: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.background,
  },
  doneText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: colors.inkSoft,
  },
});
