// src/screens/MenuScreen.tsx
// Menu for the selected table (data from GET /api/kot-items/):
//  - header with back button, table number and a cart icon (live item-count badge)
//  - search (name / item code / category) + always-visible category chips (with item counts)
//  - compact row cards (image left, info right) so many more items fit on screen
//  - tapping "+" opens a centered dialog: pick size (Full/Half/Quarter, if any) + quantity, then "Add to cart"
//  - cart keeps ONE line per item/size with its quantity (e.g. Lime x4), never 4 separate lines
//  - slim floating cart bar (total) + CartDrawer to review / place the order
//  - pull-to-refresh, and a full-screen retry state if the menu can't be loaded

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ScrollView,
  TextInput,
  Image,
  ActivityIndicator,
  Animated,
  StatusBar,
  Modal,
  Pressable,
  Platform,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, spacing, radius, shadow, gradients } from '../constants/theme';
import { getKotItems } from '../services/api';
import { getSession, getCartForTable, saveCartForTable } from '../services/storage';
import { MenuItem, CartLine, PortionLabel, AuthUser } from '../utils/kot';
import { MenuScreenProps } from '../navigation/AppNavigator';
import CartDrawer from './CartDrawer';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const toNumber = (v: string | number | null | undefined): number => {
  const n = typeof v === 'number' ? v : parseFloat(v ?? '0');
  return Number.isFinite(n) ? n : 0;
};

/** Only active items with a real price are sellable. Sorted by category, then name. */
const prepareItems = (list: MenuItem[]): MenuItem[] =>
  list
    .filter((m) => m.status === 'active' && toNumber(m.price1) > 0)
    .sort(
      (a, b) =>
        (a.category_name || '').localeCompare(b.category_name || '') ||
        a.name.localeCompare(b.name)
    );

// ---------------------------------------------------------------------------
// Add-to-cart dialog — centered. Pick size (portion items) + quantity, then add.
// ---------------------------------------------------------------------------
interface AddDialogProps {
  item: MenuItem | null;
  cart: CartLine[];
  onClose: () => void;
  onConfirm: (item: MenuItem, portion: PortionLabel, price: number, qty: number) => void;
}

const AddToCartDialog: React.FC<AddDialogProps> = ({ item, cart, onClose, onConfirm }) => {
  const [portion, setPortion] = useState<PortionLabel>('full');
  const [qty, setQty] = useState(1);

  // reset every time a different item is opened
  useEffect(() => {
    setPortion('full');
    setQty(1);
  }, [item?.id]);

  if (!item) return null;

  const isPortion = item.price_type === 'portion';

  const options: { label: PortionLabel; display: string; price: number }[] = isPortion
    ? [
        { label: 'full' as PortionLabel, display: 'Full', price: toNumber(item.price1) },
        { label: 'half' as PortionLabel, display: 'Half', price: toNumber(item.price2) },
        { label: 'quarter' as PortionLabel, display: 'Quarter', price: toNumber(item.price3) },
      ].filter((o) => o.price > 0)
    : [{ label: 'full' as PortionLabel, display: 'Full', price: toNumber(item.price1) }];

  const selected = options.find((o) => o.label === portion) ?? options[0];
  const lineTotal = selected.price * qty;

  const alreadyInCart =
    cart.find((c) => c.menuItemId === item.id && c.portionLabel === selected.label)?.quantity ?? 0;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        {/* inner Pressable swallows taps so the dialog doesn't close when tapped */}
        <Pressable style={[styles.dialog, shadow.card]} onPress={() => {}}>
          <View style={styles.dialogHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.dialogTitle} numberOfLines={2}>
                {item.name}
              </Text>
              <Text style={styles.dialogSubtitle}>
                {item.category_name}
                {alreadyInCart > 0 ? `  ·  ${alreadyInCart} already in cart` : ''}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={20} color={colors.ink} />
            </TouchableOpacity>
          </View>

          {/* Size picker — only for portion items */}
          {isPortion && (
            <View style={styles.sizeRow}>
              {options.map((opt) => {
                const active = opt.label === selected.label;
                return (
                  <TouchableOpacity
                    key={opt.label}
                    style={[styles.sizeChip, active && styles.sizeChipActive]}
                    activeOpacity={0.85}
                    onPress={() => setPortion(opt.label)}
                  >
                    <Text style={[styles.sizeChipLabel, active && styles.sizeChipLabelActive]}>
                      {opt.display}
                    </Text>
                    <Text style={[styles.sizeChipPrice, active && styles.sizeChipLabelActive]}>
                      ₹{opt.price.toFixed(0)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {/* Quantity */}
          <View style={styles.qtyRow}>
            <Text style={styles.qtyLabel}>Quantity</Text>
            <View style={styles.qtyControl}>
              <TouchableOpacity
                style={[styles.qtyBtn, qty <= 1 && { opacity: 0.4 }]}
                disabled={qty <= 1}
                onPress={() => setQty((q) => Math.max(1, q - 1))}
              >
                <Ionicons name="remove" size={18} color={colors.ink} />
              </TouchableOpacity>
              <Text style={styles.qtyValue}>{qty}</Text>
              <TouchableOpacity
                style={styles.qtyBtn}
                onPress={() => setQty((q) => Math.min(99, q + 1))}
              >
                <Ionicons name="add" size={18} color={colors.ink} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Confirm */}
          <TouchableOpacity
            activeOpacity={0.92}
            onPress={() => onConfirm(item, selected.label, selected.price, qty)}
          >
            <LinearGradient
              colors={gradients.button}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.confirmBtn, shadow.button]}
            >
              <Text style={styles.confirmText}>Add to cart</Text>
              <Text style={styles.confirmPrice}>₹{lineTotal.toFixed(0)}</Text>
            </LinearGradient>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

// ---------------------------------------------------------------------------
// Compact menu card (row layout)
// ---------------------------------------------------------------------------
interface MenuCardProps {
  item: MenuItem;
  index: number;
  qtyInCart: number; // total qty across all portions
  onAdd: (item: MenuItem) => void;
}

const MenuCard: React.FC<MenuCardProps> = React.memo(({ item, index, qtyInCart, onAdd }) => {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: 1,
      duration: 260,
      delay: Math.min(index, 8) * 25,
      useNativeDriver: true,
    }).start();
  }, []);

  const isVeg = item.food_type === 'veg';
  const dotColor = isVeg ? '#1f8a4c' : colors.error;
  const isPortion = item.price_type === 'portion';
  const imageUri = item.image_url || item.image;

  return (
    <Animated.View
      style={[
        styles.menuCard,
        {
          opacity: anim,
          transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
        },
      ]}
    >
      {imageUri ? (
        <Image source={{ uri: imageUri }} style={styles.menuImage} resizeMode="cover" />
      ) : (
        <View style={[styles.menuImage, styles.menuImageFallback]}>
          <Ionicons name="restaurant-outline" size={22} color={colors.muted} />
        </View>
      )}

      <View style={styles.menuInfo}>
        <View style={styles.nameRow}>
          <View style={[styles.foodTypeDot, { borderColor: dotColor }]}>
            <View style={[styles.foodTypeDotInner, { backgroundColor: dotColor }]} />
          </View>
          <Text style={styles.menuName} numberOfLines={1}>
            {item.name}
          </Text>
        </View>
        <Text style={styles.menuCategory} numberOfLines={1}>
          {item.category_name}
          {item.session_code ? `  ·  #${item.session_code}` : ''}
        </Text>
        <Text style={styles.menuPrice}>
          {isPortion ? 'From ' : ''}₹{toNumber(item.price1).toFixed(0)}
        </Text>
      </View>

      {/* Action area — always opens the add-to-cart dialog */}
      <TouchableOpacity style={styles.addBtn} activeOpacity={0.85} onPress={() => onAdd(item)}>
        <Ionicons name="add" size={20} color={colors.ink} />
        {qtyInCart > 0 && (
          <View style={styles.addBtnBadge}>
            <Text style={styles.addBtnBadgeText}>{qtyInCart}</Text>
          </View>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
});

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------
const MenuScreen: React.FC<MenuScreenProps> = ({ navigation, route }) => {
 const { tableId, tableNumber, floor } = route.params;
  const insets = useSafeAreaInsets();
  // Android: keep a minimum barrier even if the device reports 0 inset
  const bottomInset = Platform.OS === 'android' ? Math.max(insets.bottom, 16) : insets.bottom;

  const [user, setUser] = useState<AuthUser | null>(null);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('All');

  const [cart, setCart] = useState<CartLine[]>([]);
  const [cartVisible, setCartVisible] = useState(false);
  const [addTarget, setAddTarget] = useState<MenuItem | null>(null);

  const cartBarAnim = useRef(new Animated.Value(0)).current;
  const badgeBump = useRef(new Animated.Value(1)).current;
  const cartLoaded = useRef(false); // don't overwrite the saved cart before it has been read
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  // ---- menu loading (GET /api/kot-items/) ---------------------------------
  const loadMenu = useCallback(async (mode: 'initial' | 'refresh' = 'initial') => {
    if (mode === 'refresh') setRefreshing(true);
    setError(null);
    try {
      const list = await getKotItems();
      if (!isMounted.current) return;
      setItems(prepareItems(list));
    } catch (err) {
      if (!isMounted.current) return;
      setError(err instanceof Error ? err.message : 'Failed to load menu.');
    } finally {
      if (isMounted.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  // ---- initial load: session -> saved cart -> menu -------------------------
  useEffect(() => {
    (async () => {
      const session = await getSession();
      if (!session) {
        navigation.replace('Login');
        return;
      }
      if (!isMounted.current) return;
      setUser(session);

      // Load the saved cart on its own, so a menu-API failure can never wipe it.
      const savedCart = await getCartForTable(tableId);
      if (!isMounted.current) return;
      setCart(savedCart);
      cartLoaded.current = true;

      await loadMenu('initial');
    })();
  }, []);

  const cartCount = cart.reduce((sum, c) => sum + c.quantity, 0);
  const cartTotal = cart.reduce((sum, c) => sum + c.unitPrice * c.quantity, 0);

  // persist cart + animate bar
  useEffect(() => {
    if (cartLoaded.current) saveCartForTable(tableId, cart);

    Animated.spring(cartBarAnim, {
      toValue: cart.length > 0 ? 1 : 0,
      useNativeDriver: true,
      speed: 16,
    }).start();
  }, [cart]);

  // bump the header badge
  useEffect(() => {
    if (cartCount === 0) return;
    badgeBump.setValue(1.35);
    Animated.spring(badgeBump, {
      toValue: 1,
      useNativeDriver: true,
      friction: 4,
      tension: 160,
    }).start();
  }, [cartCount]);

  // categories with item counts
  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    items.forEach((i) => {
      const name = i.category_name || 'Others';
      counts.set(name, (counts.get(name) ?? 0) + 1);
    });
    return [
      { name: 'All', count: items.length },
      ...Array.from(counts.entries()).map(([name, count]) => ({ name, count })),
    ];
  }, [items]);

  // if a refresh removes the active category, fall back to All
  useEffect(() => {
    if (activeCategory !== 'All' && !categories.some((c) => c.name === activeCategory)) {
      setActiveCategory('All');
    }
  }, [categories]);

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((i) => {
      const cat = i.category_name || 'Others';
      const matchesCategory = activeCategory === 'All' || cat === activeCategory;
      const matchesSearch =
        !q ||
        i.name.toLowerCase().includes(q) ||
        (i.session_code ?? '').toLowerCase().includes(q) ||
        cat.toLowerCase().includes(q);
      return matchesCategory && matchesSearch;
    });
  }, [items, activeCategory, search]);

  // total qty per menu item (across portions) — computed once per cart change
  const qtyByItem = useMemo(() => {
    const map = new Map<number, number>();
    cart.forEach((c) => map.set(c.menuItemId, (map.get(c.menuItemId) ?? 0) + c.quantity));
    return map;
  }, [cart]);

  // Adds `qty` of an item+size. If that item+size is already in the cart,
  // its quantity is increased — the cart always shows ONE line per item/size.
  const addToCart = (item: MenuItem, portion: PortionLabel, unitPrice: number, qty: number) => {
    setCart((prev) => {
      const existingIndex = prev.findIndex(
        (c) => c.menuItemId === item.id && c.portionLabel === portion
      );
      if (existingIndex >= 0) {
        const next = [...prev];
        next[existingIndex] = {
          ...next[existingIndex],
          quantity: next[existingIndex].quantity + qty,
        };
        return next;
      }
      return [
        ...prev,
        {
          menuItemId: item.id,
          name: item.name,
          imageUrl: item.image_url || item.image || '',
          unitPrice,
          portionLabel: portion,
          quantity: qty,
        },
      ];
    });
  };

  const handleAdd = useCallback((item: MenuItem) => setAddTarget(item), []);

  const handleConfirmAdd = (item: MenuItem, portion: PortionLabel, price: number, qty: number) => {
    addToCart(item, portion, price, qty);
    setAddTarget(null);
  };

  // ---- loading state -------------------------------------------------------
  if (loading) {
    return (
      <View style={styles.loadingRoot}>
        <StatusBar barStyle="dark-content" />
        <ActivityIndicator size="large" color={colors.ink} />
        <Text style={styles.loadingText}>Loading menu…</Text>
      </View>
    );
  }

  // ---- hard error (nothing to show) ----------------------------------------
  if (error && items.length === 0) {
    return (
      <View style={[styles.root, { paddingTop: insets.top + spacing.sm }]}>
        <StatusBar barStyle="dark-content" />
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={10} style={styles.iconBtn}>
            <Ionicons name="chevron-back" size={22} color={colors.ink} />
          </TouchableOpacity>
          <Text style={styles.tableTitle}>Table {tableNumber}</Text>
          <View style={{ width: 40 }} />
        </View>

        <View style={styles.centerState}>
          <Ionicons name="cloud-offline-outline" size={40} color={colors.muted} />
          <Text style={styles.centerTitle}>Couldn't load the menu</Text>
          <Text style={styles.centerSubtitle}>{error}</Text>
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={() => {
              setLoading(true);
              loadMenu('initial');
            }}
          >
            <LinearGradient
              colors={gradients.button}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.retryBtn, shadow.button]}
            >
              <Ionicons name="refresh" size={16} color={colors.orange} />
              <Text style={styles.retryText}>Try again</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top + spacing.sm }]}>
      <StatusBar barStyle="dark-content" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={10} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.ink} />
        </TouchableOpacity>

        <Text style={styles.tableTitle}>Table {tableNumber}</Text>

        <TouchableOpacity
          onPress={() => setCartVisible(true)}
          hitSlop={10}
          style={styles.iconBtn}
          activeOpacity={0.85}
        >
          <Ionicons name="cart-outline" size={22} color={colors.ink} />
          {cartCount > 0 && (
            <Animated.View style={[styles.cartBadge, { transform: [{ scale: badgeBump }] }]}>
              <Text style={styles.cartBadgeText}>{cartCount > 99 ? '99+' : cartCount}</Text>
            </Animated.View>
          )}
        </TouchableOpacity>
      </View>

      {/* Search */}
      <View style={styles.searchWrap}>
        <Ionicons name="search-outline" size={17} color={colors.muted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search name, code or category"
          placeholderTextColor={colors.muted}
          value={search}
          onChangeText={setSearch}
          returnKeyType="search"
          autoCorrect={false}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')} hitSlop={10}>
            <Ionicons name="close-circle" size={17} color={colors.muted} />
          </TouchableOpacity>
        )}
      </View>

      {/* Categories — fixed-height ScrollView so it can never collapse or stretch */}
      <View style={styles.categoryWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryList}
          keyboardShouldPersistTaps="handled"
        >
          {categories.map((cat) => {
            const active = cat.name === activeCategory;
            return (
              <TouchableOpacity
                key={cat.name}
                style={[styles.categoryChip, active && styles.categoryChipActive]}
                activeOpacity={0.85}
                onPress={() => setActiveCategory(cat.name)}
              >
                <Text
                  style={[styles.categoryChipText, active && styles.categoryChipTextActive]}
                  numberOfLines={1}
                >
                  {cat.name}
                </Text>
                <Text
                  style={[styles.categoryChipCount, active && styles.categoryChipCountActive]}
                >
                  {cat.count}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Soft error (e.g. a refresh failed but we still have items on screen) */}
      {error && (
        <View style={styles.errorBanner}>
          <Ionicons name="alert-circle" size={16} color={colors.error} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {/* Items */}
      <FlatList
        data={filteredItems}
        keyExtractor={(i) => String(i.id)}
        style={{ flex: 1 }}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: (cart.length > 0 ? 96 : spacing.xxl) + bottomInset },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={10}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => loadMenu('refresh')}
            tintColor={colors.ink}
            colors={[colors.orange]}
          />
        }
        renderItem={({ item, index }) => (
          <MenuCard
            item={item}
            index={index}
            qtyInCart={qtyByItem.get(item.id) ?? 0}
            onAdd={handleAdd}
          />
        )}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="fast-food-outline" size={32} color={colors.muted} />
            <Text style={styles.emptyText}>
              {items.length === 0 ? 'No menu items available' : 'No items found'}
            </Text>
          </View>
        }
      />

      {/* Floating cart bar */}
      {cart.length > 0 && (
        <Animated.View
          style={[
            styles.cartBarWrap,
            {
              bottom: bottomInset + spacing.sm,
              opacity: cartBarAnim,
              transform: [
                { translateY: cartBarAnim.interpolate({ inputRange: [0, 1], outputRange: [80, 0] }) },
              ],
            },
          ]}
        >
          <TouchableOpacity activeOpacity={0.92} onPress={() => setCartVisible(true)}>
            <LinearGradient
              colors={gradients.button}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.cartBar, shadow.button]}
            >
              <View style={styles.cartBarCountBadge}>
                <Text style={styles.cartBarCountText}>{cartCount}</Text>
              </View>
              <Text style={styles.cartBarLabel}>View cart</Text>
              <Text style={styles.cartBarTotal}>₹{cartTotal.toFixed(0)}</Text>
            </LinearGradient>
          </TouchableOpacity>
        </Animated.View>
      )}

      <View pointerEvents="none" style={[styles.bottomBarrier, { height: bottomInset }]} />

      <AddToCartDialog
        item={addTarget}
        cart={cart}
        onClose={() => setAddTarget(null)}
        onConfirm={handleConfirmAdd}
      />

      {user && (
        <CartDrawer
          visible={cartVisible}
          onClose={() => setCartVisible(false)}
          cart={cart}
          setCart={setCart}
          tableId={tableId}
          tableNumber={tableNumber}
          floor={floor}
          user={user}
          onOrderPlaced={() => {
            setCartVisible(false);
            navigation.goBack();
          }}
        />
      )}
    </View>
  );
};

export default MenuScreen;

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingRoot: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  loadingText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: colors.muted,
  },

  // full-screen error / retry
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
  },
  centerTitle: {
    fontFamily: 'Fraunces_600SemiBold',
    fontSize: 18,
    color: colors.ink,
    marginTop: spacing.sm,
  },
  centerSubtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: colors.inkSoft,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 48,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.md,
    gap: spacing.sm,
  },
  retryText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14.5,
    color: colors.orange,
  },

  // header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  tableTitle: {
    fontFamily: 'Fraunces_600SemiBold',
    fontSize: 18,
    color: colors.ink,
    textAlign: 'center',
  },
  cartBadge: {
    position: 'absolute',
    top: -6,
    right: -6,
    minWidth: 19,
    height: 19,
    paddingHorizontal: 4,
    borderRadius: 10,
    backgroundColor: colors.orange,
    borderWidth: 1.5,
    borderColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cartBadgeText: {
    fontFamily: 'Inter_700Bold' as any,
    fontSize: 10,
    color: colors.ink,
  },

  // search
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    backgroundColor: colors.inputBg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    height: 44,
    gap: spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontFamily: 'Inter_500Medium',
    fontSize: 13.5,
    color: colors.ink,
    paddingVertical: 0,
  },

  // categories
  categoryWrap: {
    height: 52,
    flexGrow: 0,
    flexShrink: 0,
  },
  categoryList: {
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 34,
    paddingHorizontal: 14,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: spacing.sm,
    flexShrink: 0,
  },
  categoryChipActive: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
  categoryChipText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: colors.ink,
  },
  categoryChipTextActive: {
    color: colors.white,
  },
  categoryChipCount: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    color: colors.muted,
    marginLeft: 6,
  },
  categoryChipCountActive: {
    color: 'rgba(255,255,255,0.7)',
  },

  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
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

  // list + compact card
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
  },
  menuCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
    marginBottom: spacing.sm,
    gap: spacing.md,
  },
  menuImage: {
    width: 68,
    height: 68,
    borderRadius: radius.sm,
    backgroundColor: colors.badgeBg,
  },
  menuImageFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  foodTypeDot: {
    width: 14,
    height: 14,
    borderRadius: 3,
    borderWidth: 1.5,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  foodTypeDotInner: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  menuName: {
    flex: 1,
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13.5,
    color: colors.ink,
  },
  menuCategory: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11.5,
    color: colors.muted,
    marginTop: 2,
  },
  menuPrice: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: colors.ink,
    marginTop: 4,
  },
  addBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    backgroundColor: colors.orange,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtnBadge: {
    position: 'absolute',
    top: -6,
    right: -6,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtnBadgeText: {
    fontFamily: 'Inter_700Bold' as any,
    fontSize: 10,
    color: colors.white,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: spacing.xxl,
    gap: spacing.sm,
    width: '100%',
  },
  emptyText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: colors.muted,
  },

  // floating cart bar
  cartBarWrap: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    bottom: spacing.lg,
  },
  cartBar: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 52,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  cartBarCountBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cartBarCountText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    color: colors.orange,
  },
  cartBarLabel: {
    flex: 1,
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14.5,
    color: colors.orange,
  },
  cartBarTotal: {
    fontFamily: 'Inter_700Bold' as any,
    fontSize: 15,
    color: colors.orange,
  },

  // centered portion dialog
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(22,58,46,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  dialog: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  dialogHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  dialogTitle: {
    fontFamily: 'Fraunces_600SemiBold',
    fontSize: 18,
    color: colors.ink,
  },
  dialogSubtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12.5,
    color: colors.inkSoft,
    marginTop: 2,
  },
  sizeRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  sizeChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  sizeChipActive: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
  sizeChipLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13.5,
    color: colors.ink,
  },
  sizeChipPrice: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    color: colors.inkSoft,
    marginTop: 2,
  },
  sizeChipLabelActive: {
    color: colors.white,
  },
  qtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginBottom: spacing.md,
  },
  qtyLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    color: colors.ink,
  },
  qtyControl: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  qtyBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    backgroundColor: colors.badgeBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyValue: {
    fontFamily: 'Inter_700Bold' as any,
    fontSize: 18,
    color: colors.ink,
    minWidth: 28,
    textAlign: 'center',
  },
  confirmBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 52,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
  },
  confirmText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    color: colors.orange,
  },
  confirmPrice: {
    fontFamily: 'Inter_700Bold' as any,
    fontSize: 15,
    color: colors.orange,
  },
  bottomBarrier: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.background,
  },
});