
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  PanResponder,
  TextInput,
  Image,
  ActivityIndicator,
  Animated,
  StatusBar,
  Modal,
  Pressable,
  Platform,
  RefreshControl,
  useWindowDimensions,
  Keyboard,
  TouchableWithoutFeedback,

} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, spacing, radius, shadow, gradients, withAlpha } from '../constants/theme';
import { getCategories, getKotItems } from '../services/api';
import { readLocalCollection, writeLocalCollection } from '../services/localCache';
import { getSession, getCartForTable, saveCartForTable } from '../services/storage';
import { MenuItem, CartLine, PortionLabel, AuthUser } from '../utils/kot';
import { MenuScreenProps } from '../navigation/AppNavigator';
import CartDrawer from './CartDrawer';

// ---------------------------------------------------------------------------
// Helpers / constants
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

const MAX_QTY = 99;
const VEG_GREEN = colors.success;

// shadow lives on the outer wrapper: iOS drops shadows on views with overflow:'hidden'
const CARD_SHADOW = {
  shadowColor: colors.inkDeep,
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.1,
  shadowRadius: 10,
  elevation: 3,
} as const;

type FoodFilter = 'all' | 'veg' | 'nonveg';

const FOOD_FILTERS: { key: FoodFilter; label: string; dot?: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'veg', label: 'Veg', dot: VEG_GREEN },
  { key: 'nonveg', label: 'Non-veg', dot: colors.error },
];

type SearchField = 'all' | 'name' | 'code' | 'category';

const SEARCH_FIELDS: { key: SearchField; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'name', label: 'Name' },
  { key: 'code', label: 'Code' },
  { key: 'category', label: 'Category' },
];

const firstLetter = (name: string) => (name.trim().charAt(0) || '?').toUpperCase();
// ---------------------------------------------------------------------------
// Small shared pieces
// ---------------------------------------------------------------------------
const VegMark: React.FC<{ veg: boolean }> = ({ veg }) => {
  const c = veg ? VEG_GREEN : colors.error;
  return (
    <View style={[styles.vegMark, { borderColor: c }]}>
      <View style={[styles.vegMarkDot, { backgroundColor: c }]} />
    </View>
  );
};

// Item photo. Falls back to a built-in placeholder (no image file needed) when the
// item has no image, or when the image URL fails to load.
const ItemImage: React.FC<{ uri?: string | null; style: any; iconSize?: number }> = ({
  uri,
  style,
  iconSize = 28,
}) => {
  const [failed, setFailed] = useState(false);

  // a new image URL gets a fresh chance to load
  useEffect(() => {
    setFailed(false);
  }, [uri]);

  if (uri && !failed) {
    return <Image source={{ uri }} style={style} resizeMode="cover" onError={() => setFailed(true)} />;
  }

    return (
    <View style={[style, styles.imagePlaceholder]}>
      <MaterialCommunityIcons name="silverware-fork-knife" size={iconSize} color={colors.ink} />
    </View>
  );
};

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
  const imageUri = item.image_url || item.image;

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
            <ItemImage uri={imageUri} style={styles.dialogThumb} iconSize={24} />
            <View style={{ flex: 1 }}>
              <View style={styles.dialogNameRow}>
                <VegMark veg={item.food_type === 'veg'} />
                <Text style={styles.dialogTitle} numberOfLines={2}>
                  {item.name}
                </Text>
              </View>
              <Text style={styles.dialogSubtitle} numberOfLines={1}>
                {item.category_name}
                {alreadyInCart > 0 ? `  ·  ${alreadyInCart} already in cart` : ''}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={10} style={styles.dialogClose}>
              <Ionicons name="close" size={18} color={colors.ink} />
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
                    <Text style={[styles.sizeChipPrice, active && styles.sizeChipPriceActive]}>
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
                onPress={() => setQty((q) => Math.min(MAX_QTY, q + 1))}
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
// Menu card (image on top, name, price, add / stepper)
// ---------------------------------------------------------------------------
interface MenuCardProps {
  item: MenuItem;
  index: number;
  qtyInCart: number; // total qty across all portions (only used to show the selected state)
  onOpen: (item: MenuItem) => void; // opens the qty / add-to-cart dialog
}

const MenuCard: React.FC<MenuCardProps> = React.memo(({ item, index, qtyInCart, onOpen }) => {
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
  const isPortion = item.price_type === 'portion';
  const imageUri = item.image_url || item.image;
  const inCart = qtyInCart > 0;
 

  return (
    <Animated.View
      style={[
        styles.cardOuter,
        CARD_SHADOW,
        {
          opacity: anim,
          transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
        },
      ]}
    >
      <TouchableOpacity
        activeOpacity={0.94}
        onPress={() => onOpen(item)}
        style={[styles.card, inCart && styles.cardSelected]}
      >
        {/* image */}
          <View style={styles.imageWrap}>
          <ItemImage uri={imageUri} style={styles.image} iconSize={32} />

          <View style={styles.vegBadge}>
            <VegMark veg={isVeg} />
          </View>

          {inCart && (
            <View style={styles.checkBadge}>
              <Ionicons name="checkmark" size={14} color={colors.ink} />
            </View>
          )}
        </View>

         {/* info */}
        <Text style={styles.cardName} numberOfLines={2}>
          {item.name}
        </Text>
        <Text style={styles.cardMeta} numberOfLines={1}>
          {item.category_name || 'Others'}
          {item.session_code ? `  ·  #${item.session_code}` : ''}
        </Text>
        <View style={styles.cardFooter}>
          <View style={{ flexShrink: 1 }}>
            {isPortion && <Text style={styles.priceFrom}>From</Text>}
              <Text style={styles.cardPrice}>
                ₹
                {(
                  Math.min(
                    ...[item.price1, item.price2, item.price3].map(toNumber).filter((p) => p > 0)
                  ) || 0
                ).toFixed(0)}
              </Text>      
            </View>

                    {/* display-only "+": not touchable, so the tap goes to the card and opens the dialog */}
          <View style={styles.addBtn} pointerEvents="none">
            <Ionicons name="add" size={20} color={colors.ink} />
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
});

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------
const MenuScreen: React.FC<MenuScreenProps> = ({ navigation, route }) => {
  const { tableId, tableNumber, floor, orderType = 'kot' } = route.params;
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
    // 8" tablets are ~534dp on the short side, so 600 wrongly counted them as phones
  const isTablet = Math.min(windowWidth, windowHeight) >= 500;
  const isTabletLandscape = isTablet && windowWidth > windowHeight;
  // phone: 2 columns. Tablet: as many ~165px cards as fit across the FULL width (4-8),
  // so no empty space is left on either side.
  const MIN_CARD_WIDTH = 130;
  const menuColumns = isTablet
    ? Math.max(4, Math.min(8, Math.floor((windowWidth - spacing.lg * 2 + 10) / (MIN_CARD_WIDTH + 10))))
    : 2;
  const [gridWidth, setGridWidth] = useState(0);
  // tablet search bar matches the Tables screen (max 560, centred); phone keeps full width
  const GRID_PAD = spacing.lg - 5; // list side padding (each card adds 5 more on both sides)
  const itemWidth = Math.floor(((gridWidth || windowWidth) - GRID_PAD * 2) / menuColumns);
  const searchWidth = isTablet ? Math.min(560, windowWidth - spacing.lg * 2) : undefined;
  const insets = useSafeAreaInsets();
  const pageTopInset = insets.top + (isTabletLandscape ? 2 : spacing.sm);
  // Android: keep a minimum barrier even if the device reports 0 inset
  const bottomInset = isTabletLandscape
    ? Math.max(insets.bottom, 4)
    : Platform.OS === 'android' ? Math.max(insets.bottom, 16) : insets.bottom;

  const [user, setUser] = useState<AuthUser | null>(null);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [allCategoryNames, setAllCategoryNames] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
   const [searchFocused, setSearchFocused] = useState(false);
  const [searchField, setSearchField] = useState<SearchField>('all');
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [foodFilter, setFoodFilter] = useState<FoodFilter>('all');
  const [catPickerVisible, setCatPickerVisible] = useState(false);

  const [cart, setCart] = useState<CartLine[]>([]);
    const [cartVisible, setCartVisible] = useState(false);
  const [existingCartVisible, setExistingCartVisible] = useState(false);
  const [existingCartCount, setExistingCartCount] = useState(0);
  const [addTarget, setAddTarget] = useState<MenuItem | null>(null);

  const headerAnim = useRef(new Animated.Value(0)).current;
  const badgeBump = useRef(new Animated.Value(1)).current;
  const cartLoaded = useRef(false); // don't overwrite the saved cart before it has been read
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

    // kept in refs so they survive between calls (they used to reset on every call)
  const lastMenuFetchAt = useRef(0);
  const lastCategoryNames = useRef<string[]>([]);

  const loadMenu = useCallback(async (mode: 'initial' | 'refresh' = 'initial') => {
    if (mode === 'refresh') setRefreshing(true);
    setError(null);

    const cachedItems = await readLocalCollection<MenuItem>('menu_items');
    if (cachedItems?.length && isMounted.current) {
      setItems(prepareItems(cachedItems));
      setLoading(false);
      // fetched within the last 5 minutes: skip the network calls and the SQLite rewrite
      if (mode === 'initial' && Date.now() - lastMenuFetchAt.current < 5 * 60 * 1000) {
        setAllCategoryNames(lastCategoryNames.current);
        return;
      }
    }
    try {
      const list = await getKotItems();
      if (!isMounted.current) return;
      lastMenuFetchAt.current = Date.now();
      setItems(prepareItems(list));
      void writeLocalCollection('menu_items', list, (item) => item.id);
      getCategories()
        .then((cats) => {
          lastCategoryNames.current = cats.map((c) => c.name);
          if (isMounted.current) setAllCategoryNames(lastCategoryNames.current);
        })
        .catch(() => {});
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

           const savedCart = await getCartForTable(tableId, orderType);
      if (!isMounted.current) return;
      setCart(savedCart);
      cartLoaded.current = true;

           if (savedCart.length > 0) {
        setExistingCartCount(savedCart.reduce((sum, c) => sum + c.quantity, 0));
        setExistingCartVisible(true);
      }

      await loadMenu('initial');
    })();
  }, []);

   // header fade-in once the menu is ready
  useEffect(() => {
    if (!loading) {
      Animated.timing(headerAnim, { toValue: 1, duration: 380, useNativeDriver: true }).start();
    }
  }, [loading]);

  // refresh categories/items when returning to this screen (e.g. after creating one)
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      if (cartLoaded.current) loadMenu('initial');
    });
    return unsubscribe;
  }, [navigation, loadMenu]);

  const cartCount = cart.reduce((sum, c) => sum + c.quantity, 0);

  // persist cart
  useEffect(() => {
    if (cartLoaded.current) saveCartForTable(tableId, cart, orderType);
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
    // seed with every saved category so empty ones still get a tab
    allCategoryNames.forEach((name) => counts.set(name, 0));
    items.forEach((i) => {
      const name = i.category_name || 'Others';
      counts.set(name, (counts.get(name) ?? 0) + 1);
    });
    return [
      { name: 'All', count: items.length },
      ...Array.from(counts.entries()).map(([name, count]) => ({ name, count })),
    ];
  }, [items, allCategoryNames]);

  // if a refresh removes the active category, fall back to All
  useEffect(() => {
    if (activeCategory !== 'All' && !categories.some((c) => c.name === activeCategory)) {
      setActiveCategory('All');
    }
  }, [categories]);

  // swipe the grid left / right to change category (horizontal-dominant drags only,
  // so vertical scrolling and taps are untouched)
  const swipeRef = useRef({ names: [] as string[], active: 'All' });
  swipeRef.current = { names: categories.map((c) => c.name), active: activeCategory };
  const swipePan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponderCapture: (_, g) =>
        Math.abs(g.dx) > 14 && Math.abs(g.dx) > Math.abs(g.dy) * 1.6,
      onPanResponderRelease: (_, g) => {
        if (Math.abs(g.dx) < 50) return;
        const { names, active } = swipeRef.current;
        const next = names.indexOf(active) + (g.dx < 0 ? 1 : -1);
        if (next >= 0 && next < names.length) setActiveCategory(names[next]);
      },
    })
  ).current;

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((i) => {
      const cat = i.category_name || 'Others';
      const matchesCategory = activeCategory === 'All' || cat === activeCategory;
      const isVeg = i.food_type === 'veg';
      const matchesFood = foodFilter === 'all' || (foodFilter === 'veg' ? isVeg : !isVeg);
            const inName = i.name.toLowerCase().includes(q);
      const inCode = (i.session_code ?? '').toLowerCase().includes(q);
      const inCat = cat.toLowerCase().includes(q);
      const matchesSearch =
        !q ||
        (searchField === 'name' && inName) ||
        (searchField === 'code' && inCode) ||
        (searchField === 'category' && inCat) ||
        (searchField === 'all' && (inName || inCode || inCat));
      return matchesCategory && matchesFood && matchesSearch;
    });
  }, [items, activeCategory, foodFilter, search, searchField]);

  // total qty per menu item (across portions) — computed once per cart change
  const qtyByItem = useMemo(() => {
    const map = new Map<number, number>();
    cart.forEach((c) => map.set(c.menuItemId, (map.get(c.menuItemId) ?? 0) + c.quantity));
    return map;
  }, [cart]);

  // Keep this stable across cart/search updates; CartDrawer uses it to validate
  // cart lines when the drawer opens.
  const availableMenuItemIds = useMemo(() => items.map((item) => item.id), [items]);

  // Adds `qty` of an item+size. If that item+size is already in the cart,
  // its quantity is increased — the cart always shows ONE line per item/size.
  const addToCart = useCallback((item: MenuItem, portion: PortionLabel, unitPrice: number, qty: number) => {
    setCart((prev) => {
      const existingIndex = prev.findIndex(
        (c) => c.menuItemId === item.id && c.portionLabel === portion
      );
      if (existingIndex >= 0) {
        const next = [...prev];
        next[existingIndex] = {
          ...next[existingIndex],
          quantity: Math.min(MAX_QTY, next[existingIndex].quantity + qty),
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
          hasPortions: item.price_type === 'portion',
          quantity: Math.min(MAX_QTY, qty),
        },
      ];
    });
  }, []);

   

  const handleOpen = useCallback((item: MenuItem) => {
    Keyboard.dismiss();
    setAddTarget(item);
  }, []);
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
      <View style={[styles.root, { paddingTop: pageTopInset }]}>
        <StatusBar barStyle="dark-content" />
        <View style={styles.errorHeader}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={10} style={styles.errorBackBtn}>
            <Ionicons name="chevron-back" size={22} color={colors.ink} />
          </TouchableOpacity>
          <Text style={styles.errorHeaderTitle}>Table No. {tableNumber}</Text>
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

  const sectionTitle = activeCategory === 'All' ? 'All items' : activeCategory;
    const subtitle = `${floor ? `Floor ${floor}  ·  ` : ''}${orderType === 'sales' ? 'Sales order' : 'KOT order'}`;

  // plain function (not a component) so the TextInput keeps focus while typing
  const searchBox = () => (
    <LinearGradient
      colors={[colors.ink, colors.orange]}
      start={{ x: 0, y: 0.5 }}
      end={{ x: 1, y: 0.5 }}
      style={[
        styles.searchBorder,
        searchFocused && styles.searchBorderFocused,
        isTabletLandscape
          ? styles.searchBorderLand
          : searchWidth ? { width: searchWidth, alignSelf: 'center' } : null,
      ]}
    >
      <View style={[styles.searchWrap, isTabletLandscape && styles.searchWrapLand]}>
        <Ionicons name="search-outline" size={18} color={colors.muted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search name, code or category"
          placeholderTextColor={colors.muted}
          value={search}
          onChangeText={setSearch}
          onFocus={() => setSearchFocused(true)}
          onBlur={() => setSearchFocused(false)}
          returnKeyType="search"
          autoCorrect={false}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')} hitSlop={10}>
            <Ionicons name="close-circle" size={18} color={colors.muted} />
          </TouchableOpacity>
        )}
          <TouchableOpacity
          activeOpacity={0.85}
          hitSlop={6}
          style={styles.fieldChip}
          onPress={() => {
            Keyboard.dismiss();
            setCatPickerVisible(true);
          }}
        >
          <Ionicons name="options-outline" size={13} color={colors.orange} />
          <Text style={styles.fieldChipText} numberOfLines={1}>
            {activeCategory === 'All' ? 'Category' : activeCategory}
          </Text>
          <Ionicons name="chevron-down" size={12} color={colors.orange} />
        </TouchableOpacity>
      </View>
    </LinearGradient>
  );

   return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" />

      {/* ---------------- HEADER (light, sits on the page background) ---------------- */}
      <Animated.View
        style={[
          styles.header,
          {
            paddingTop: pageTopInset,
            width: '100%',
            opacity: headerAnim,
            transform: [{ translateY: headerAnim.interpolate({ inputRange: [0, 1], outputRange: [-12, 0] }) }],
          },
        ]}
      >
                <View style={[styles.headerRow, isTabletLandscape && styles.headerRowLand]}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Back"
            onPress={() => navigation.goBack()}
            hitSlop={10}
            activeOpacity={0.85}
            style={styles.roundBtn}
          >
            <Ionicons name="chevron-back" size={22} color={colors.white} />
          </TouchableOpacity>

          {isTabletLandscape ? (
            <>
              <View style={styles.landTableCircle}>
                <Text
                  style={styles.landTableNo}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.6}
                >
                  {tableNumber}
                </Text>
              </View>
                            <View style={styles.landSearchSlot}>{searchBox()}</View>
            </>
          ) : (
            <View pointerEvents="none" style={styles.headerTitleWrap}>
              <Text style={styles.headerTitle} numberOfLines={1}>Table No. {tableNumber}</Text>
              <Text style={styles.headerSubtitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                {subtitle}
              </Text>
            </View>
          )}

          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Open cart"
            onPress={() => setCartVisible(true)}
            hitSlop={8}
            activeOpacity={0.85}
            style={styles.cartPill}
          >
            <Ionicons name="cart-outline" size={18} color={colors.white} />
            <Text style={styles.cartPillText}>Cart</Text>
            {cartCount > 0 && (
              <Animated.View style={[styles.cartPillBadge, { transform: [{ scale: badgeBump }] }]}>
                <Text style={styles.cartPillBadgeText}>{cartCount > 99 ? '99+' : cartCount}</Text>
              </Animated.View>
            )}
          </TouchableOpacity>
        </View>

        {!isTabletLandscape && searchBox()}
      </Animated.View>

      {/* Filter row — category dropdown (left) + All / Veg / Non-veg (right) */}
        <View style={[styles.filterRow, { width: '100%' }, isTabletLandscape && styles.filterRowLand]}>
        {isTabletLandscape && (
          <View style={styles.landSection}>
            <Text style={styles.sectionTitle} numberOfLines={1}>{sectionTitle}</Text>
            <Text style={styles.sectionCount}>{filteredItems.length}</Text>
          </View>
        )}

        <View style={styles.foodToggle}>
          {FOOD_FILTERS.map((f) => {
            const active = foodFilter === f.key;
            return (
              <TouchableOpacity
                key={f.key}
                activeOpacity={0.85}
                onPress={() => setFoodFilter(f.key)}
                style={[styles.foodToggleItem, active && styles.foodToggleItemActive]}
              >
                {f.dot && <View style={[styles.foodToggleDot, { backgroundColor: f.dot }]} />}
                <Text style={[styles.foodToggleText, active && styles.foodToggleTextActive]}>{f.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

    {/* Section title */}
      {!isTabletLandscape && (
      <View style={[styles.sectionRow, { width: '100%' }]}>
        <View style={{ flexShrink: 1 }}>
          <View style={styles.sectionTitleRow}>
            <Text style={styles.sectionTitle} numberOfLines={1}>{sectionTitle}</Text>
            <Text style={styles.sectionCount}>{filteredItems.length}</Text>
          </View>
          <View style={styles.sectionUnderline} />
        </View>
      </View>
        )}
      {/* Soft error (e.g. a refresh failed but we still have items on screen) */}
      {error && (
        <View style={styles.errorBanner}>
          <Ionicons name="alert-circle" size={16} color={colors.error} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {/* Items — swipe left / right to change category */}
      <View
        style={{ flex: 1 }}
        onLayout={(e) => setGridWidth(e.nativeEvent.layout.width)}
        {...swipePan.panHandlers}
      >
      <FlatList
        key={`menu-${menuColumns}`}
        data={filteredItems}
        numColumns={menuColumns}
        keyExtractor={(i) => String(i.id)}
        style={{ flex: 1 }}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: spacing.xxl + bottomInset },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'on-drag' : 'on-drag'}
        onScrollBeginDrag={Keyboard.dismiss}
        initialNumToRender={Math.max(menuColumns * 3, 8)}
        maxToRenderPerBatch={Math.max(menuColumns * 3, 8)}
        updateCellsBatchingPeriod={40}
        windowSize={7}
        removeClippedSubviews={Platform.OS === 'android'}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => loadMenu('refresh')}
            tintColor={colors.ink}
            colors={[colors.orange]}
          />
        }
        renderItem={({ item, index }) => (
          <View style={[styles.menuColumnItem, { width: itemWidth }]}>
             <MenuCard
              item={item}
              index={index}
              qtyInCart={qtyByItem.get(item.id) ?? 0}
              onOpen={handleOpen}
            />
          </View>
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
      </View>

      <View pointerEvents="none" style={[styles.bottomBarrier, { height: bottomInset }]} />

      {/* Category picker */}
      <Modal visible={catPickerVisible} transparent animationType="fade" onRequestClose={() => setCatPickerVisible(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setCatPickerVisible(false)}>
          <Pressable
            style={[styles.catSheet, shadow.card, { maxHeight: windowHeight * 0.7 }]}
            onPress={() => {}}
          >
            <View style={styles.catSheetHeader}>
              <Text style={styles.catSheetTitle}>Filter by category</Text>
              <TouchableOpacity onPress={() => setCatPickerVisible(false)} hitSlop={10} style={styles.dialogClose}>
                <Ionicons name="close" size={18} color={colors.ink} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={categories}
              keyExtractor={(c) => c.name}
              showsVerticalScrollIndicator={false}
              renderItem={({ item: cat }) => {
                const active = cat.name === activeCategory;
                return (
                  <TouchableOpacity
                    activeOpacity={0.85}
                    style={[styles.catRow, active && styles.catRowActive]}
                    onPress={() => {
                      setActiveCategory(cat.name);
                      setCatPickerVisible(false);
                    }}
                  >
                    <Text style={[styles.catRowText, active && styles.catRowTextActive]} numberOfLines={1}>
                      {cat.name}
                    </Text>
                    <Text style={[styles.catRowCount, active && styles.catRowTextActive]}>{cat.count}</Text>
                    {active && <Ionicons name="checkmark" size={16} color={colors.orange} />}
                  </TouchableOpacity>
                );
              }}
            />
          </Pressable>
        </Pressable>
      </Modal>

      <AddToCartDialog
        item={addTarget}
        cart={cart}
        onClose={() => setAddTarget(null)}
        onConfirm={handleConfirmAdd}
      />

            <Modal
        visible={existingCartVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setExistingCartVisible(false)}
      >
        <View style={styles.existingBackdrop}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setExistingCartVisible(false)}
            accessibilityLabel="Close cart notice"
          />
                   <View style={[styles.existingCard, shadow.card]}>
            <View style={styles.existingIconWrap}>
              <Ionicons name="cart-outline" size={20} color={colors.ink} />
            </View>
            <Text style={styles.existingTitle}>Cart has items</Text>
            <Text style={styles.existingMsg}>
              Table {tableNumber} already has {existingCartCount} item{existingCartCount === 1 ? '' : 's'}. View cart?
            </Text>
            <View style={styles.existingActions}>
              <TouchableOpacity
                style={styles.existingCancelBtn}
                activeOpacity={0.85}
                onPress={() => setExistingCartVisible(false)}
              >
                <Text style={styles.existingCancelText}>Continue</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.existingConfirmBtn}
                activeOpacity={0.85}
                onPress={() => {
                  setExistingCartVisible(false);
                  setCartVisible(true);
                }}
              >
                <Text style={styles.existingConfirmText}>View cart</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {user && (
        <CartDrawer
          visible={cartVisible}
          onClose={() => setCartVisible(false)}
          cart={cart}
          setCart={setCart}
          availableMenuItemIds={availableMenuItemIds}
          tableId={tableId}
          tableNumber={tableNumber}
          floor={floor}
          user={user}
          orderType={orderType}
          onOrderPlaced={() => {
            setCartVisible(false);
            if (orderType === 'sales') {
              navigation.navigate('Tables', { orderType: 'sales', finalizedTableId: tableId });
            } else {
              navigation.popToTop();
            }
          }}
        />
         )}
    </View>
    </TouchableWithoutFeedback>
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
  errorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  errorBackBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  errorHeaderTitle: { fontFamily: 'Inter_600SemiBold', fontWeight: '700', fontSize: 22, color: colors.ink },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
  },
  centerTitle: {
    fontFamily: 'Inter_600SemiBold', fontWeight: '700',
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

  // ----- header (light) -----
  header: {
    paddingBottom: 0,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    minHeight: 44,
  },
  headerRowLand: { gap: 10, minHeight: 40 },
    landTableCircle: {
    width: 35,
    height: 35,
    borderRadius: 20,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  landTableNo: { fontFamily: 'Inter_600SemiBold', fontWeight: '700', fontSize: 16, color: colors.white, textAlign: 'center' },
    landSearchSlot: { flex: 1, alignItems: 'center' },
  searchBorderLand: { width: '100%', maxWidth: 560, marginHorizontal: 0, marginTop: 0 },
  searchWrapLand: { height: 38 },
  filterRowLand: { marginTop: 6, marginBottom: 6 },
  landSection: { flex: 1, flexDirection: 'row', alignItems: 'baseline', gap: 6, justifyContent: 'flex-start' },
    headerTitleWrap: {
    position: 'absolute',
    left: 110,
    right: 110,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontFamily: 'Inter_600SemiBold', fontWeight: '700', fontSize: 24, color: colors.ink, textAlign: 'center' },
  headerSubtitle: { fontFamily: 'Inter_400Regular', fontSize: 11.5, color: colors.inkSoft, textAlign: 'center', marginTop: 0 },
  // green button, yellow icon
  roundBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.soft,
  },
  cartPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 38,
    paddingHorizontal: 14,
    borderRadius: 19,
    backgroundColor: colors.ink,
    ...shadow.soft,
  },
  cartPillText: { fontFamily: 'Inter_600SemiBold', fontSize: 12.5, color: colors.white },
  cartPillBadge: {
    position: 'absolute',
    top: -6,
    right: -4,
    minWidth: 19,
    height: 19,
    borderRadius: 10,
    paddingHorizontal: 4,
    backgroundColor: colors.orange,
    borderWidth: 1.5,
    borderColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cartPillBadgeText: { fontFamily: 'Inter_600SemiBold', fontSize: 10, color: colors.inkDarker },

  // search: gradient border (green fading into yellow) around a white field
  searchBorder: {
    marginHorizontal: spacing.lg,
    marginTop: 10,
    borderRadius: 18,
    padding: 1.5,
    ...shadow.soft,
  },
  searchBorderFocused: { padding: 2.5 },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 42,
    backgroundColor: colors.surface,
    borderRadius: 16.5,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
    fieldChip: {
         maxWidth: 130,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    height: 28,
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: colors.ink,
  },
  fieldChipText: { flexShrink: 1, fontFamily: 'Inter_600SemiBold', fontSize: 11.5, color: colors.orange },
    searchInput: {
    flex: 1,
    fontFamily: 'Inter_500Medium',
    fontSize: 13.5,
    color: colors.ink,
  },

  // ----- filter row (category dropdown + veg toggle) -----
    filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: spacing.lg,
    marginTop: 10,
    marginBottom: 10,
    gap: spacing.sm,
  },
  catButton: {
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 18,
    backgroundColor: colors.ink,
    ...shadow.soft,
  },
  catButtonText: { flexShrink: 1, fontFamily: 'Inter_600SemiBold', fontWeight: '700', fontSize: 14, color: colors.orange },

  // category picker sheet
  catSheet: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  catSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  catSheetTitle: { fontFamily: 'Inter_600SemiBold', fontWeight: '700', fontSize: 17, color: colors.ink },
  catRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 12,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
  },
  catRowActive: { backgroundColor: colors.ink },
  catRowText: { flex: 1, fontFamily: 'Inter_600SemiBold', fontWeight: '700', fontSize: 14, color: colors.ink },
  catRowTextActive: { color: colors.orange },
  catRowCount: { fontFamily: 'Inter_500Medium', fontSize: 12, color: colors.muted },

  // ----- section row + veg filter -----
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: 6,
    gap: spacing.sm,
  },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  sectionTitle: { fontFamily: 'Inter_600SemiBold', fontWeight: '700', fontSize: 18, color: colors.ink, flexShrink: 1 },
  sectionCount: { fontFamily: 'Inter_500Medium', fontSize: 12, color: colors.muted },
  sectionUnderline: { width: 24, height: 3, borderRadius: 2, backgroundColor: colors.orange, marginTop: 3 },
  foodToggle: {
    flexDirection: 'row',
    padding: 3,
    borderRadius: 12,
    backgroundColor: colors.neutralSoft,
  },
  foodToggleItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    height: 28,
    borderRadius: 9,
  },
  foodToggleItemActive: {
    backgroundColor: colors.surface,
    shadowColor: colors.black,
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  foodToggleDot: { width: 7, height: 7, borderRadius: 4 },
  foodToggleText: { fontFamily: 'Inter_500Medium', fontSize: 11.5, color: colors.inkSoft },
  foodToggleTextActive: { color: colors.ink, fontFamily: 'Inter_600SemiBold' },

  // ----- errors / empty -----
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
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
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: spacing.xxl,
    gap: spacing.sm,
    width: '100%',
  },
  emptyText: { fontFamily: 'Inter_500Medium', fontSize: 13, color: colors.muted },

  // ----- grid -----
  listContent: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg - 5,
    paddingTop: 0,
  },
  menuColumnItem: { paddingHorizontal: 5, paddingBottom: 9 },

  // ----- card (compact) -----
  cardOuter: {
    borderRadius: 16,
    backgroundColor: colors.surface,
  },
  card: {
    borderRadius: 16,
    padding: 6,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  cardSelected: { borderColor: colors.orange },
  imageWrap: {
    width: '100%',
    aspectRatio: 2.3 ,
    borderRadius: 11,
    overflow: 'hidden',
    backgroundColor: colors.badgeBg,
  },
    image: { width: '100%', height: '100%' },
   imagePlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: colors.badgeBg,
  },
    vegBadge: {
    position: 'absolute',
    top: 5,
    left: 5,
    width: 20,
    height: 20,
    borderRadius: 6,
    backgroundColor: withAlpha(colors.white, 0.95),
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkBadge: {
    position: 'absolute',
    top: 5,
    right: 5,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.orange,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vegMark: {
    width: 12,
    height: 12,
    borderWidth: 1.5,
    borderRadius: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vegMarkDot: { width: 5, height: 5, borderRadius: 3 },
    cardName: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12.5,
    lineHeight: 16,
    color: colors.ink,
    marginTop: 6,
    paddingHorizontal: 2,
  },
     cardMeta: {
    fontFamily: 'Inter_400Regular',
    fontSize: 10.5,
    lineHeight: 13,
    color: colors.muted,
    marginTop: 3,
    paddingHorizontal: 2,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 3,
    paddingHorizontal: 2,
    minHeight: 30,
  },
  priceFrom: { fontFamily: 'Inter_400Regular', fontSize: 9.5, color: colors.muted, marginBottom: -2 },
  cardPrice: { fontFamily: 'Inter_600SemiBold', fontWeight: '700', fontSize: 18, color: colors.ink },

  addBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.orange,
    alignItems: 'center',
    justifyContent: 'center',
  },
 
 
    existingBackdrop: {
    flex: 1,
    backgroundColor: withAlpha(colors.inkDeep, 0.45),
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
    existingCard: {
    width: '100%',
    maxWidth: 270,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
  },
  existingIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.orange,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  existingTitle: { fontFamily: 'Inter_700Bold', fontSize: 16, color: colors.ink },
  existingMsg: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12.5,
    color: colors.inkSoft,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: spacing.md,
  },
  existingActions: { flexDirection: 'row', gap: spacing.sm, width: '100%' },
  existingCancelBtn: {
    flex: 1,
    height: 38,
    borderRadius: radius.md,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  existingCancelText: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: colors.ink },
    existingConfirmBtn: {
    flex: 1,
    height: 38,
    borderRadius: radius.md,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  existingConfirmText: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: colors.orange },
  modalBackdrop: {
    flex: 1,
    backgroundColor: withAlpha(colors.inkDeep, 0.45),
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  dialog: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  dialogHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  dialogThumb: { width: 56, height: 56, borderRadius: 14 },
  thumbFallback: { backgroundColor: colors.badgeBg, alignItems: 'center', justifyContent: 'center' },
  thumbLetter: { fontFamily: 'Inter_600SemiBold', fontWeight: '700', fontSize: 24, color: colors.ink, opacity: 0.35 },
  dialogNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dialogTitle: { flex: 1, fontFamily: 'Inter_600SemiBold', fontWeight: '700', fontSize: 17, color: colors.ink },
  dialogSubtitle: { fontFamily: 'Inter_400Regular', fontSize: 12, color: colors.inkSoft, marginTop: 3 },
  dialogClose: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.badgeBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sizeRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  sizeChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.inputBg,
  },
  sizeChipActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  sizeChipLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: colors.ink },
  sizeChipLabelActive: { color: colors.white },
  sizeChipPrice: { fontFamily: 'Inter_500Medium', fontSize: 12, color: colors.inkSoft, marginTop: 2 },
  sizeChipPriceActive: { color: colors.orange },
  qtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  qtyLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: colors.ink },
  qtyControl: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  qtyBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: colors.badgeBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyValue: {
    minWidth: 28,
    textAlign: 'center',
    fontFamily: 'Inter_600SemiBold', fontWeight: '700',
    fontSize: 20,
    color: colors.ink,
  },
  confirmBtn: {
    height: 52,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  confirmText: { fontFamily: 'Inter_600SemiBold', fontSize: 15, color: colors.white },
  confirmPrice: { fontFamily: 'Inter_600SemiBold', fontWeight: '700', fontSize: 15, color: colors.orange },

  bottomBarrier: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.background,
  },
});
