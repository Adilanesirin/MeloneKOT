// src/screens/CartDrawer.tsx
// Cart drawer — slides in from the RIGHT side, full height.
// Places the order with POST /api/kot/place-order/
//   { customer_name, table_number, floor, items: [{ menu_item_id, quantity }] }
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
  Dimensions,
  ActivityIndicator,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

import { colors, spacing, radius, shadow, gradients } from '../constants/theme';
import { placeOrder } from '../services/api';
import { clearCartForTable } from '../services/storage';
import { printOrderReceipt } from '../utils/printer';
import { CartLine, AuthUser, PlaceOrderPayload, PlaceOrderResponse } from '../utils/kot';

const { width: SCREEN_W } = Dimensions.get('window');
const DRAWER_W = Math.min(SCREEN_W * 0.88, 400);

const DEFAULT_CUSTOMER = 'Walk-in Guest';

interface CartDrawerProps {
  visible: boolean;
  onClose: () => void;
  cart: CartLine[];
  setCart: React.Dispatch<React.SetStateAction<CartLine[]>>;
  tableId: number;
  tableNumber: string;
  floor?: string;
  user: AuthUser; // used for the firm name on the printed bill
  onOrderPlaced: () => void;
}

const CartDrawer: React.FC<CartDrawerProps> = ({
  visible,
  onClose,
  cart,
  setCart,
  tableId,
  tableNumber,
  floor,
  user,
  onOrderPlaced,
}) => {
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PlaceOrderResponse | null>(null); // set after a successful order
  const [printFailed, setPrintFailed] = useState<string | null>(null); // message when the slip could not be printed
  const [reprinting, setReprinting] = useState(false);

  // order details typed by the waiter
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [notes, setNotes] = useState('');

  // keep the Modal mounted until the slide-out animation finishes
  const [mounted, setMounted] = useState(visible);

  const slideAnim = useRef(new Animated.Value(DRAWER_W)).current; // 0 = open, DRAWER_W = off-screen right
  const doneTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (visible) {
      setError(null);
      setResult(null);
      setPrintFailed(null);
      setMounted(true);
      slideAnim.setValue(DRAWER_W);
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        speed: 16,
        bounciness: 2,
      }).start();
    } else if (mounted) {
      Animated.timing(slideAnim, {
        toValue: DRAWER_W,
        duration: 220,
        useNativeDriver: true,
      }).start(() => setMounted(false));
    }
  }, [visible]);

  // clear the "close after success" timer if the drawer unmounts first
  useEffect(() => {
    return () => {
      if (doneTimer.current) clearTimeout(doneTimer.current);
    };
  }, []);

  // backdrop fades in step with the drawer
  const backdropOpacity = slideAnim.interpolate({
    inputRange: [0, DRAWER_W],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  // pre-tax estimate; the server adds tax and returns the final bill
  const total = cart.reduce((sum, c) => sum + c.unitPrice * c.quantity, 0);

  const lineKey = (line: CartLine) => `${line.menuItemId}_${line.portionLabel}`;

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

  // firm name + place for the printed bill header (only if the saved user has them)
  const getFirm = () => {
    const f = user as { firm_name?: string; place?: string };
    return { name: f?.firm_name, place: f?.place };
  };

  const handleReprint = async () => {
    if (!result || reprinting) return;
    setReprinting(true);
    const r = await printOrderReceipt(result, getFirm());
    setReprinting(false);
    if (r.ok) onOrderPlaced();
    else setPrintFailed(r.message);
  };

  const handlePlaceOrder = async () => {
    if (cart.length === 0 || placing) return;
    setPlacing(true);
    setError(null);
    try {
      const phone = customerPhone.trim();
      const instructions = notes.trim();

      const payload: PlaceOrderPayload = {
        customer_name: customerName.trim() || DEFAULT_CUSTOMER,
        table_number: String(tableNumber),
        ...(floor ? { floor } : {}),
        items: cart.map((c) => ({
          menu_item_id: c.menuItemId,
          quantity: c.quantity,
          portion: c.portionLabel,
        })),
        ...(phone ? { customer_phone: phone } : {}),
        ...(instructions ? { special_instructions: instructions } : {}),
      };

      const res = await placeOrder(payload); // throws on failure

      setResult(res);
      setPrintFailed(null);
      await clearCartForTable(tableId);
      setCart([]);
      setCustomerName('');
      setCustomerPhone('');
      setNotes('');

      // Print the slip. The order is already placed, so a print problem must
      // never turn into an order error: on success auto-close as before, on
      // failure stay open so the user can reprint.
      const printed = await printOrderReceipt(res, getFirm());
      if (printed.ok) {
        doneTimer.current = setTimeout(() => {
          onOrderPlaced();
        }, 1800);
      } else {
        setPrintFailed(printed.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to place order.');
    } finally {
      setPlacing(false);
    }
  };

  const order = result?.order;
  const billing = result?.billing;

  return (
    <Modal visible={mounted} transparent animationType="none" onRequestClose={onClose}>
      <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
      </Animated.View>

      <Animated.View style={[styles.sheet, shadow.card, { transform: [{ translateX: slideAnim }] }]}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          {result ? (
            <View style={styles.successWrap}>
              <View style={styles.successIconCircle}>
                <Ionicons name="checkmark" size={30} color={colors.white} />
              </View>
              <Text style={styles.successTitle}>Order placed!</Text>
              <Text style={styles.successSubtitle}>
                Sent to the kitchen for Table {order?.table_number ?? tableNumber}
              </Text>

              {(billing || order) && (
                <View style={styles.receipt}>
                  <View style={styles.receiptRow}>
                    <Text style={styles.receiptLabel}>Bill no.</Text>
                    <Text style={styles.receiptValue}>
                      {billing?.bill_number ?? (order ? `KOT-${order.id}` : '—')}
                    </Text>
                  </View>
                  <View style={styles.receiptRow}>
                    <Text style={styles.receiptLabel}>Subtotal</Text>
                    <Text style={styles.receiptValue}>
                      ₹{parseFloat(order?.subtotal ?? billing?.subtotal ?? '0').toFixed(0)}
                    </Text>
                  </View>
                  <View style={styles.receiptRow}>
                    <Text style={styles.receiptLabel}>Tax</Text>
                    <Text style={styles.receiptValue}>
                      ₹{parseFloat(order?.tax_amount ?? billing?.tax_amount ?? '0').toFixed(0)}
                    </Text>
                  </View>
                  <View style={[styles.receiptRow, styles.receiptTotalRow]}>
                    <Text style={styles.receiptTotalLabel}>Total</Text>
                    <Text style={styles.receiptTotalValue}>
                      ₹{parseFloat(order?.total_amount ?? billing?.total_amount ?? '0').toFixed(0)}
                    </Text>
                  </View>
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
                  <TouchableOpacity onPress={onOrderPlaced} style={{ alignSelf: 'center' }}>
                    <Text style={styles.doneText}>Done</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          ) : (
            <>
              <View style={styles.headerRow}>
                <Text style={styles.headerTitle}>Your order</Text>
                <TouchableOpacity onPress={onClose} hitSlop={10}>
                  <Ionicons name="close" size={22} color={colors.ink} />
                </TouchableOpacity>
              </View>
              <Text style={styles.headerSubtitle}>
              Table {tableNumber}{floor ? ` · Floor ${floor}` : ''}
            </Text>

              <ScrollView
                style={styles.lineList}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{ paddingBottom: spacing.md, flexGrow: 1 }}
              >
                {cart.length === 0 ? (
                  <View style={styles.emptyCart}>
                    <Ionicons name="cart-outline" size={30} color={colors.muted} />
                    <Text style={styles.emptyCartText}>Your cart is empty</Text>
                  </View>
                ) : (
                  <>
                    {cart.map((line) => (
                      <View key={lineKey(line)} style={styles.line}>
                        {line.imageUrl ? (
                          <Image source={{ uri: line.imageUrl }} style={styles.lineImage} />
                        ) : (
                          <View style={[styles.lineImage, styles.lineImageFallback]}>
                            <Ionicons name="restaurant-outline" size={18} color={colors.muted} />
                          </View>
                        )}
                        <View style={styles.lineInfo}>
                          <Text style={styles.lineName} numberOfLines={1}>{line.name}</Text>
                          <Text style={styles.linePortion}>
                            {line.portionLabel !== 'full' ? `${line.portionLabel} · ` : ''}
                            ₹{line.unitPrice.toFixed(0)} each
                          </Text>
                        </View>

                        <View style={styles.qtyControl}>
                          <TouchableOpacity
                            style={styles.qtyBtn}
                            onPress={() =>
                              line.quantity === 1 ? removeLine(line) : updateQty(line, -1)
                            }
                          >
                            <Ionicons
                              name={line.quantity === 1 ? 'trash-outline' : 'remove'}
                              size={14}
                              color={colors.ink}
                            />
                          </TouchableOpacity>
                          <Text style={styles.qtyValue}>{line.quantity}</Text>
                          <TouchableOpacity style={styles.qtyBtn} onPress={() => updateQty(line, 1)}>
                            <Ionicons name="add" size={14} color={colors.ink} />
                          </TouchableOpacity>
                        </View>
                      </View>
                    ))}

                    {/* Order details the API needs / accepts */}
                    <Text style={styles.sectionLabel}>Order details</Text>

                    <Text style={styles.fieldLabel}>Customer name</Text>
                    <View style={styles.inputWrap}>
                      <Ionicons name="person-outline" size={16} color={colors.muted} />
                      <TextInput
                        style={styles.input}
                        value={customerName}
                        onChangeText={setCustomerName}
                        placeholder={DEFAULT_CUSTOMER}
                        placeholderTextColor={colors.muted}
                        autoCapitalize="words"
                        returnKeyType="next"
                        maxLength={60}
                      />
                    </View>

                    <Text style={styles.fieldLabel}>Phone (optional)</Text>
                    <View style={styles.inputWrap}>
                      <Ionicons name="call-outline" size={16} color={colors.muted} />
                      <TextInput
                        style={styles.input}
                        value={customerPhone}
                        onChangeText={setCustomerPhone}
                        placeholder="Customer phone"
                        placeholderTextColor={colors.muted}
                        keyboardType="phone-pad"
                        maxLength={15}
                      />
                    </View>

                    <Text style={styles.fieldLabel}>Notes for kitchen (optional)</Text>
                    <View style={[styles.inputWrap, styles.notesWrap]}>
                      <TextInput
                        style={[styles.input, styles.notesInput]}
                        value={notes}
                        onChangeText={setNotes}
                        placeholder="e.g. less spicy, no onion"
                        placeholderTextColor={colors.muted}
                        multiline
                        maxLength={200}
                      />
                    </View>
                  </>
                )}
              </ScrollView>

              {error && (
                <View style={styles.errorBanner}>
                  <Ionicons name="alert-circle" size={16} color={colors.error} />
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              )}

              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Total</Text>
                <Text style={styles.totalValue}>₹{total.toFixed(0)}</Text>
              </View>
              <Text style={styles.taxNote}>Tax is added when the bill is generated</Text>

              <TouchableOpacity
                activeOpacity={0.92}
                disabled={cart.length === 0 || placing}
                onPress={handlePlaceOrder}
              >
                <LinearGradient
                  colors={gradients.button}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[styles.placeOrderBtn, shadow.button, cart.length === 0 && { opacity: 0.5 }]}
                >
                  {placing ? (
                    <ActivityIndicator color={colors.orange} />
                  ) : (
                    <>
                      <Text style={styles.placeOrderText}>Place Order</Text>
                      <Ionicons name="arrow-forward" size={16} color={colors.orange} style={{ marginLeft: 8 }} />
                    </>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </>
          )}
        </KeyboardAvoidingView>
      </Animated.View>
    </Modal>
  );
};

export default CartDrawer;

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(22,58,46,0.4)',
  },
  sheet: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: DRAWER_W,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderBottomLeftRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xxl,   // clears the status bar / notch
    paddingBottom: spacing.xl, // clears the home indicator
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: {
    fontFamily: 'Fraunces_600SemiBold',
    fontSize: 20,
    color: colors.ink,
  },
  headerSubtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12.5,
    color: colors.inkSoft,
    marginTop: 2,
    marginBottom: spacing.md,
  },
  lineList: {
    flex: 1,
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
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.sm,
  },
  lineImage: {
    width: 44,
    height: 44,
    borderRadius: radius.sm,
    backgroundColor: colors.badgeBg,
  },
  lineImageFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  lineInfo: {
    flex: 1,
  },
  lineName: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: colors.ink,
  },
  linePortion: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11.5,
    color: colors.inkSoft,
    marginTop: 2,
    textTransform: 'capitalize',
  },
  qtyControl: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  qtyBtn: {
    width: 26,
    height: 26,
    borderRadius: radius.sm,
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
    backgroundColor: colors.inputBg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    height: 42,
    gap: spacing.sm,
  },
  input: {
    flex: 1,
    fontFamily: 'Inter_500Medium',
    fontSize: 13.5,
    color: colors.ink,
    paddingVertical: 0,
  },
  notesWrap: {
    height: 68,
    alignItems: 'flex-start',
    paddingVertical: spacing.sm,
  },
  notesInput: {
    height: '100%',
    textAlignVertical: 'top',
  },

  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.sm,
    backgroundColor: '#FDECEC',
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
  },
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
  taxNote: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: colors.muted,
    marginBottom: spacing.sm,
  },
  placeOrderBtn: {
    flexDirection: 'row',
    height: 54,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
  doneText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: colors.inkSoft,
  },
});