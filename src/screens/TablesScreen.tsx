import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  useWindowDimensions,
  TextInput,
  ScrollView,
  Modal,
  Pressable,
  Platform,
  Image,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { blendColors, colors, gradients, radius, shadow, spacing, withAlpha } from '../constants/theme';
import { getTables, getKotItems } from '../services/api';
import {
  getOfflineOrders,
  readLocalCollection,
  removeOfflineOrder,
  writeLocalCollection,
} from '../services/localCache';
import type { OfflineOrder } from '../services/localCache';
import { describeOutcome, resendOfflineOrder, syncOfflineOrders } from '../services/orderOutbox';
import { getSession, clearSession } from '../services/storage';
import { RestaurantTable, AuthUser } from '../utils/kot';
import { TablesScreenProps } from '../navigation/AppNavigator';
import PrinterPickerModal from './PrinterPickerModal';
import TablesDrawer from '../components/TablesDrawer';
import { getGstDisplayMode, getSavedPrinter, getSalesPrintMode, setGstDisplayMode, setSalesPrintMode, SalesPrintMode } from '../utils/printer';
import type { GstDisplayMode } from '../utils/receipt';
import type { SavedPrinter } from '../utils/printer';
const FONT = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
} as const;

const GRID_GAP = 8;
const BANNER_IMG = require('../../assets/meloneBanner-whitebg.png');

type BannerFoodIcon = {
  name: keyof typeof MaterialCommunityIcons.glyphMap;
  left: string;
  top: string;
  size: number;
  rotate: string;
  color: string;
};
const BANNER_FOOD_ICONS: BannerFoodIcon[] = [
  { name: 'pizza', left: '4%', top: '55%', size: 24, rotate: '-16deg', color: withAlpha(colors.white, 0.16) },
  { name: 'coffee', left: '20%', top: '4%', size: 20, rotate: '10deg', color: withAlpha(colors.orange, 0.28) },
  { name: 'hamburger', left: '36%', top: '58%', size: 22, rotate: '8deg', color: withAlpha(colors.white, 0.14) },
  { name: 'ice-cream', left: '50%', top: '0%', size: 22, rotate: '-12deg', color: withAlpha(colors.white, 0.16) },
  { name: 'noodles', left: '62%', top: '60%', size: 24, rotate: '14deg', color: withAlpha(colors.orange, 0.26) },
  { name: 'food-drumstick', left: '74%', top: '2%', size: 22, rotate: '-20deg', color: withAlpha(colors.white, 0.15) },
  { name: 'cupcake', left: '86%', top: '55%', size: 22, rotate: '12deg', color: withAlpha(colors.white, 0.15) },
  { name: 'fish', left: '93%', top: '4%', size: 20, rotate: '-8deg', color: withAlpha(colors.orange, 0.24) },
];

const headingLetters = (text: string, base: string) => {
  return text.split('').map((ch, i, arr) => {
    const t = arr.length > 1 ? Math.pow(i / (arr.length - 1), 2.4) : 0;
    return { ch, color: blendColors(base, colors.orange, t) };
  });
};

const MAX_CONTENT = 1440;
const BANNER_GRADIENT = gradients.button;
const RED = colors.busy;
const TONE = {
  free: { bg: [colors.white, colors.white] as [string, string], border: colors.freeBorder, num: colors.inkSoft, sub: colors.inkSoft, dot: colors.successBright, halo: withAlpha(colors.successBright, 0.18), label: 'Free' },
  busy: { bg: [colors.white, colors.white] as [string, string], border: RED, num: RED, sub: colors.inkSoft, dot: RED, halo: withAlpha(RED, 0.2), label: 'Occupied' },
    off: { bg: [colors.offBackground, colors.offBackground] as [string, string], border: colors.offBorder, num: colors.muted, sub: colors.muted, dot: colors.muted, halo: withAlpha(colors.neutralMuted, 0.2), label: 'Off' },
} as const;

type StatusFilter = 'all' | 'free' | 'full';
type AcFilter = 'all' | 'ac' | 'nonac';

const compareTables = (a: RestaurantTable, b: RestaurantTable) =>
  (a.floor ?? '').localeCompare(b.floor ?? '', undefined, { numeric: true }) ||
  a.table_number.localeCompare(b.table_number, undefined, { numeric: true });

const padNumber = (n: string) => (/^\d+$/.test(n) && n.length < 2 ? n.padStart(2, '0') : n);

interface TableCardProps {
  table: RestaurantTable;
  orderType: 'kot' | 'sales';
  cardWidth?: number;
  onPress: (table: RestaurantTable) => void;
}

const TableCard: React.FC<TableCardProps> = React.memo(({ table, orderType, cardWidth, onPress }) => {
    const inactive = table.status !== 'active';
  const hasKotOrder = orderType === 'sales' && table.occupied;
  const occupied = !inactive && (hasKotOrder || table.occupied || table.availability_status !== 'free');
  const tone = inactive ? TONE.off : occupied ? TONE.busy : TONE.free;
  const w = cardWidth ?? 64;
   const numSize = w >= 100 ? 30 : w >= 88 ? 27 : w >= 72 ? 24 : 22;

  const content = (
    <>
      <View style={styles.cardTop}>
        <View style={[styles.dotHalo, { backgroundColor: tone.halo }]}>
          <View style={[styles.statusDot, { backgroundColor: tone.dot }]} />
        </View>
        <MaterialCommunityIcons name={table.is_ac ? 'snowflake' : 'fan'} size={11} color={tone.sub} />
      </View>
            <Text
        style={[styles.cardNumber, { color: tone.num, fontSize: numSize }]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.5}
        maxFontSizeMultiplier={1}
      >
        {padNumber(table.table_number)}
      </Text>
      <Text style={[styles.floorText, { color: tone.sub }]} numberOfLines={1} maxFontSizeMultiplier={1}>{table.floor ? `Floor ${table.floor}` : ' '}</Text>
    </>
  );

  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={`Table ${table.table_number}, ${tone.label}`}
      activeOpacity={0.85}
      onPress={() => onPress(table)}
            style={[
        styles.cardOuter,
        { width: cardWidth ?? '100%', height: Math.max(cardWidth ?? 84, 84) },
        occupied && styles.cardOuterBusy,
        inactive && { opacity: 0.55 },
      ]}
    >
            <View
        style={[
          styles.card,
          { backgroundColor: tone.bg[0], borderColor: tone.border },
          occupied && styles.cardBusy,
        ]}
      >
        {content}
      </View>
    </TouchableOpacity>
  );
});

// warm the menu cache while the waiter is on Tables, so Menu opens from cache on a slow network
const prefetchMenu = async () => {
  try {
    if (await readLocalCollection('menu_items')) return;
    const list = await getKotItems();
    await writeLocalCollection('menu_items', list, (item) => item.id);
  } catch {}
};

const TablesScreen: React.FC<TablesScreenProps> = ({ navigation, route }) => {
  const orderType = route.params?.orderType ?? 'kot';
  const { width: windowWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const wide = windowWidth >= 720;          
  const sidePad = spacing.md + Math.max(insets.left, insets.right);
  const contentWidth = Math.min(windowWidth, MAX_CONTENT);
  const gridWidth = contentWidth - sidePad * 2;
    const minCard = windowWidth < 600 ? 72 : 84;
  const numColumns = Math.max(3, Math.min(12, Math.floor((gridWidth + GRID_GAP) / (minCard + GRID_GAP))));
  const cardWidth = Math.floor((gridWidth - GRID_GAP * (numColumns - 1)) / numColumns);

  const [user, setUser] = useState<AuthUser | null>(null);
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [offlineOrders, setOfflineOrders] = useState<OfflineOrder[]>([]);
    const [offlineOrdersExpanded, setOfflineOrdersExpanded] = useState(false);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [floorFilter, setFloorFilter] = useState<string>('all');
  const [acFilter, setAcFilter] = useState<AcFilter>('all');
  const [logoutVisible, setLogoutVisible] = useState(false);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [printerVisible, setPrinterVisible] = useState(false);
  const [salesPrintMode, setSalesPrintModeState] = useState<SalesPrintMode>('both');
  const [gstDisplayMode, setGstDisplayModeState] = useState<GstDisplayMode>('single');
  const [savedPrinter, setSavedPrinter] = useState<SavedPrinter | null>(null);

  const searchRef = useRef<TextInput>(null);

    const refreshOfflineOrders = useCallback(async () => {
    setOfflineOrders(await getOfflineOrders()); // show the list immediately
    const outcomes = await syncOfflineOrders(); // verifies unconfirmed orders; never re-posts by itself
    setOfflineOrders(await getOfflineOrders());
    outcomes.forEach((o) => {
      const d = describeOutcome(o);
      Alert.alert(d.title, d.message);
    });
  }, []);

  const handleResend = (item: OfflineOrder) => {
    const run = async (override = false) => {
      setResendingId(item.id);
      const r = await resendOfflineOrder(item.id, override); // verifies with the server first
      setResendingId(null);
      setOfflineOrders(await getOfflineOrders());
      if (r.ok) {
        Alert.alert('Done', r.message ?? 'The order is on the server.');
        if (user) loadTables(user);
        return;
      }
      if (r.canOverride) {
        Alert.alert(
          'Still not confirmed',
          `${r.message}\n\nOpen Pending invoices. If Table ${item.tableNumber} does NOT show this order, you can send it anyway. If it DOES show, do not send.`,
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Not there, send anyway', style: 'destructive', onPress: () => run(true) },
          ],
        );
        return;
      }
      Alert.alert(r.unconfirmed ? 'Not confirmed yet' : 'Not sent', r.message ?? 'Please check the connection and try again.');
    };
    run();
  };

  const handleDiscard = (item: OfflineOrder) =>
    Alert.alert(
      'Discard this order?',
      item.status === 'needs_review'
        ? 'This order is NOT confirmed yet. It may already be on the server, or it may be missing. If you discard it and it is missing, the kitchen will never get it.'
        : 'It will be deleted from this device and will not be sent.',
      [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: async () => {
        await removeOfflineOrder(item.id);
        setOfflineOrders(await getOfflineOrders());
      } },
    ]);

    useFocusEffect(useCallback(() => {
    refreshOfflineOrders();
    const timer = setInterval(() => { refreshOfflineOrders(); }, 15000);
    return () => clearInterval(timer);
  }, [refreshOfflineOrders]));

  const loadTables = useCallback(async (_session: AuthUser) => {
    const cached = await readLocalCollection<RestaurantTable>('tables');
    if (cached?.length) {
      setTables([...cached].sort(compareTables));
      setLoading(false);
    }
    try {
      setError(null);
      const res = await getTables(); // Bearer token is attached by services/api
           if (res.success) {
        const sorted = [...res.tables].sort(compareTables);
                setTables(sorted);
        void writeLocalCollection('tables', sorted, (table) => table.id);
        void prefetchMenu();
      }
       else {
        setError('Could not load tables.');
      }
       } catch (err) {
      // cached tables are already on screen: stay quiet and let the waiter keep working
      if (!cached?.length) setError(err instanceof Error ? err.message : 'Failed to load tables.');
    }
  }, []);

  useEffect(() => {
    (async () => {
      const session = await getSession();
      if (!session) {
        navigation.replace('Login');
        return;
      }
      setUser(session);
      await loadTables(session);
      setLoading(false);
    })();
  }, [loadTables, navigation]);

  useEffect(() => {
    if (!settingsVisible) return;
    getSavedPrinter().then(setSavedPrinter);
    getSalesPrintMode().then(setSalesPrintModeState);
    getGstDisplayMode().then(setGstDisplayModeState);
  }, [settingsVisible]);

  const onRefresh = useCallback(async () => {
    if (!user) return;
    setRefreshing(true);
    await loadTables(user);
    setRefreshing(false);
  }, [user, loadTables]);
  const firstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      if (firstFocus.current) {
        firstFocus.current = false;
        return;
      }
      loadTables(user);
    }, [user, loadTables])
  );

    const handleTablePress = useCallback((table: RestaurantTable) => {
    const unfinished = offlineOrders.find(
      (o) => o.tableId === table.id && (o.status === 'needs_review' || o.status === 'sending' || o.status === 'pending'),
    );
    if (unfinished) {
      Alert.alert(
        `Table ${table.table_number} has an unfinished order`,
        unfinished.status === 'pending'
          ? 'The server confirmed this order was NOT received. Use "Send again" in the banner above, or discard it, before taking a new order for this table.'
          : 'This order is still being confirmed with the server. Wait for the result so the same order is never sent twice.',
      );
      return;
    }
    if (orderType === 'sales' && table.occupied) {
      navigation.navigate('SalesBill', {
        tableId: table.id,
        tableNumber: table.table_number,
        floor: table.floor ?? '',
      });
      return;
    }
    navigation.navigate('Menu', {
      tableId: table.id,
      tableNumber: table.table_number,
      floor: table.floor ?? '',
      orderType,
    });
    }, [navigation, orderType, offlineOrders]);

  const handleLogout = async () => {
    setLogoutVisible(false);
    await clearSession();
    navigation.replace('Login');
  };

  const freeCount = tables.filter((t) => t.availability_status === 'free').length;
  const fullCount = tables.filter((t) => t.availability_status === 'full').length;

  const floors = useMemo(
    () =>
      Array.from(new Set(tables.map((t) => t.floor ?? '').filter((floor) => floor.length > 0))).sort((a, b) =>
        a.localeCompare(b, undefined, { numeric: true })
      ),
    [tables]
  );

  const filteredTables = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tables.filter((t) => {
      const matchesStatus = statusFilter === 'all' || t.availability_status === statusFilter;
      const matchesFloor = floorFilter === 'all' || t.floor === floorFilter;
      const matchesAc = acFilter === 'all' || (acFilter === 'ac' ? t.is_ac : !t.is_ac);
      const matchesSearch =
        !q ||
        t.table_number.toLowerCase().includes(q) ||
        (t.table_name ?? '').toLowerCase().includes(q) ||
        `floor ${t.floor}`.includes(q);
      return matchesStatus && matchesFloor && matchesAc && matchesSearch;
    });
  }, [tables, statusFilter, floorFilter, acFilter, search]);

  const hasAc = tables.some((t) => t.is_ac);
  const showCategories = floors.length > 1 || hasAc;

  const menuButton = () => (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel="Open menu"
      onPress={() => setDrawerVisible(true)}
      hitSlop={8}
      activeOpacity={0.8}
      style={[styles.iconBtn, wide && styles.iconBtnWide]}
    >
      <Ionicons name="menu" size={22} color={colors.ink} />
    </TouchableOpacity>
  );

  const searchBar = () => (
    <View style={[styles.searchWrap, wide && styles.searchWrapWide, searchFocused && styles.searchWrapFocused]}>
      <TextInput
        ref={searchRef}
        style={styles.searchInput}
        placeholder="Search table, name or floor"
        placeholderTextColor={colors.muted}
        selectionColor={colors.ink}
        value={search}
        onChangeText={setSearch}
        onFocus={() => setSearchFocused(true)}
        onBlur={() => setSearchFocused(false)}
      />
      {search.length > 0 && (
        <TouchableOpacity onPress={() => setSearch('')} hitSlop={8} accessibilityLabel="Clear search">
          <Ionicons name="close-circle" size={18} color={colors.muted} />
        </TouchableOpacity>
      )}
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => searchRef.current?.focus()}
        accessibilityRole="button"
        accessibilityLabel="Search"
        style={styles.searchBtn}
      >
        <Ionicons name="search" size={18} color={colors.ink} />
      </TouchableOpacity>
    </View>
  );

  const heroBanner = () => (
    <LinearGradient
      colors={BANNER_GRADIENT}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.banner, wide && styles.bannerWide]}
    >
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, wide && { display: 'none' }]}>
        {BANNER_FOOD_ICONS.map((food, index) => (
          <MaterialCommunityIcons
            key={`${food.name}-${index}`}
            name={food.name}
            size={food.size}
            color={food.color}
            style={{ position: 'absolute', left: food.left as any, top: food.top as any, transform: [{ rotate: food.rotate }] }}
          />
        ))}
      </View>
      <Text style={[styles.bannerTitle, wide && styles.bannerTitleWide]} numberOfLines={wide ? 1 : 2}>
        {wide
          ? (orderType === 'sales' ? 'Bill?' : 'Order?')
          : (orderType === 'sales' ? 'Pick a table to bill' : 'Ready to take an order?')}
      </Text>
      {(
        <View style={styles.bannerStats}>
          {([
            { key: 'free', label: 'Free', value: freeCount, dot: colors.successBright },
            { key: 'full', label: 'Busy', value: fullCount, dot: colors.busyHighlight },
          ] as const).map((s) => {
            const on = statusFilter === s.key;
            return (
              <TouchableOpacity
                key={s.key}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                onPress={() => setStatusFilter(on ? 'all' : s.key)}
                                style={[styles.statBox, wide && styles.statBoxWide, on && styles.statBoxOn]}
              >
                <View style={[styles.statDot, { backgroundColor: on ? colors.ink : s.dot }]} />
                <Text style={[styles.statNum, on && styles.statNumOn]}>{s.value}</Text>
                <Text style={[styles.statLabel, on && styles.statLabelOn]}>{s.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </LinearGradient>
  );

  const categoryRow = () => {
    const items: { key: string; label: string; count: number; on: boolean; onPress: () => void; icon: string }[] = [];
    if (floors.length > 1) {
      items.push({ key: 'floor-all', label: 'All floors', count: tables.length, on: floorFilter === 'all', onPress: () => setFloorFilter('all'), icon: 'view-grid-outline' });
      floors.forEach((f) =>
        items.push({ key: `floor-${f}`, label: `Floor ${f}`, count: tables.filter((t) => t.floor === f).length, on: floorFilter === f, onPress: () => setFloorFilter(f), icon: 'stairs' })
      );
    }
    if (hasAc) {
      items.push({ key: 'ac', label: 'AC', count: tables.filter((t) => t.is_ac).length, on: acFilter === 'ac', onPress: () => setAcFilter(acFilter === 'ac' ? 'all' : 'ac'), icon: 'snowflake' });
      items.push({ key: 'nonac', label: 'Non-AC', count: tables.filter((t) => !t.is_ac).length, on: acFilter === 'nonac', onPress: () => setAcFilter(acFilter === 'nonac' ? 'all' : 'nonac'), icon: 'fan' });
    }
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        style={styles.chipScroll}
        contentContainerStyle={styles.chipRow}
      >
        {items.map((c) => (
          <TouchableOpacity
            key={c.key}
            activeOpacity={0.85}
            onPress={c.onPress}
            style={[styles.chip, c.on && styles.chipOn]}
            accessibilityRole="button"
            accessibilityState={{ selected: c.on }}
          >
            <MaterialCommunityIcons name={c.icon as any} size={15} color={colors.ink} />
            <Text style={[styles.chipText, c.on && styles.chipTextOn]} numberOfLines={1}>{c.label}</Text>
            <View style={[styles.chipCount, c.on && styles.chipCountOn]}>
              <Text style={styles.chipCountText}>{c.count}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
    );
  };


  const hasReview = offlineOrders.some((item) => item.status === 'needs_review');

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.white} />

           <View style={[styles.header, wide && styles.headerWide, { paddingTop: insets.top + (wide ? 4 : 10) }]}>
        <View style={[styles.headerInner, { paddingHorizontal: sidePad }]}>
          {wide ? (
            <View style={styles.inlineRow}>
              <View style={styles.inlineSide}>
                {menuButton()}
                <View style={styles.bannerLogoBox}>
                  <Image source={BANNER_IMG} resizeMode="contain" style={styles.bannerLogoImg} />
                </View>
              </View>
              <View style={styles.inlineCenter}>{searchBar()}</View>
              <View style={[styles.inlineSide, { justifyContent: 'flex-end' }]}>
                {heroBanner()}
              </View>
            </View>
          ) : (
            <>
              <View style={styles.topRow}>
              <View pointerEvents="none" style={styles.brandWrap}>
              {orderType === 'sales' ? (
                <Text style={[styles.brandName, styles.brandNameSales, { color: colors.ink }]} numberOfLines={1}>Sales</Text>
              ) : (
                <Text style={styles.brandName} numberOfLines={1}>
                  {headingLetters('Melone', colors.ink).map((l, i) => (
                    <Text key={i} style={{ color: l.color }}>{l.ch}</Text>
                  ))}
                </Text>
              )}
              <Text style={styles.brandSub} numberOfLines={1}>
                {orderType === 'sales' ? 'Billing made easy' : 'Restaurant made easy'}
              </Text>
            </View>
                {menuButton()}
                <View style={{ flex: 1 }} />
              </View>
              <View style={{ marginTop: 16 }}>{searchBar()}</View>
            </>
          )}
        </View>
        <LinearGradient
          pointerEvents="none"
          colors={[withAlpha(colors.ink, 0), colors.ink, colors.orange, withAlpha(colors.orange, 0)]}
          locations={[0, 0.22, 0.78, 1]}
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

      {offlineOrders.length > 0 && (
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={() => setOfflineOrdersExpanded((value) => !value)}
          style={[styles.offlineOrdersBanner, hasReview && styles.offlineOrdersNeedsReview]}
        >
          <Ionicons name={hasReview ? 'alert-circle' : 'cloud-upload-outline'} size={18} color={hasReview ? colors.errorDark : colors.ink} />
          <View style={{ flex: 1 }}>
            <Text style={styles.offlineOrdersTitle}>
                            {hasReview ? 'Order being confirmed with the server' : `${offlineOrders.length} saved order(s) waiting to send`}
            </Text>
            {offlineOrdersExpanded && offlineOrders.map((item) => (
              <View key={item.id} style={styles.offlineOrderItem}>
                <Text style={styles.offlineOrdersDetail}>
                                    Table {item.tableNumber} · {item.orderType.toUpperCase()} · {item.status === 'needs_review' ? 'Not confirmed yet. Checking the server. Do NOT send again.' : item.status === 'sale_close_pending' ? 'Sale confirmed; closing previous KOT' : item.status === 'sending' ? 'Sending…' : 'Confirmed NOT sent. Tap Send again'}
                </Text>
                {(item.status === 'pending' || item.status === 'needs_review') && (
                  <View style={{ flexDirection: 'row', gap: 18, paddingTop: 6 }}>
                    <TouchableOpacity disabled={resendingId === item.id} onPress={() => handleResend(item)}>
                                            <Text style={styles.offlineRetryText}>{resendingId === item.id ? 'Checking…' : item.status === 'needs_review' ? 'Check, send if missing' : 'Send again'}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity disabled={resendingId === item.id} onPress={() => handleDiscard(item)}>
                      <Text style={styles.offlineRetryText}>Discard</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            ))}
          </View>
          <Ionicons name={offlineOrdersExpanded ? 'chevron-up' : 'chevron-down'} size={16} color={colors.inkSoft} />
        </TouchableOpacity>
      )}

      <FlatList<RestaurantTable>
        key={`${orderType}-${numColumns}`}
                style={styles.list}
        data={filteredTables}
        keyExtractor={(item) => String(item.id)}
        numColumns={numColumns}
        initialNumToRender={Math.max(numColumns * 5, 20)}
        maxToRenderPerBatch={Math.max(numColumns * 4, 16)}
        updateCellsBatchingPeriod={40}
        windowSize={9}
        removeClippedSubviews={Platform.OS === 'android'}
        columnWrapperStyle={numColumns > 1 ? { gap: GRID_GAP } : undefined}
        contentContainerStyle={[styles.listContent, { paddingHorizontal: sidePad }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
            <View>
            {!wide && heroBanner()}
            {showCategories && categoryRow()}
            <View style={{ height: wide ? 6 : 12 }} />
          </View>
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.ink}
            colors={[colors.ink]}
          />
        }
        renderItem={({ item }) => (
          <TableCard
            table={item}
            orderType={orderType}
            cardWidth={cardWidth}
            onPress={handleTablePress}
          />
        )}
        ItemSeparatorComponent={() => <View style={{ height: GRID_GAP }} />}
               ListEmptyComponent={
          loading ? (
            <View style={styles.emptyState}>
              <ActivityIndicator size="small" color={colors.ink} />
              <Text style={styles.emptyText}>Loading tables…</Text>
            </View>
          ) : !error ? (
            <View style={styles.emptyState}>
              <Ionicons name="restaurant-outline" size={32} color={colors.muted} />
              <Text style={styles.emptyText}>
                {tables.length ? 'No tables match your filters' : 'No tables found'}
              </Text>
            </View>
          ) : null
        }
      />

      <TablesDrawer
        visible={drawerVisible}
        onClose={() => setDrawerVisible(false)}
        active={orderType === 'sales' ? 'sales' : 'kot'}
        userName={String(user?.full_name || user?.username || 'Restaurant')}
        onSelectModule={(module) => {
          if (module === 'masters') navigation.navigate('ItemCreate'); // default master
          else if (module === 'pending') navigation.navigate('PendingInvoice');
          else if (module === 'reports') navigation.navigate('KotReport'); // KOT shown first
          else if (module !== orderType) navigation.navigate('Tables', { orderType: module });
        }}
        onOpenSettings={() => setSettingsVisible(true)}
        onLogout={() => setLogoutVisible(true)}
      />

      <Modal visible={settingsVisible} transparent animationType="fade" onRequestClose={() => setSettingsVisible(false)}>
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setSettingsVisible(false)} accessibilityLabel="Close settings" />
          <ScrollView style={[styles.settingsCard, shadow.card]} contentContainerStyle={styles.settingsContent} showsVerticalScrollIndicator={false}>
            <View style={styles.settingsHeader}>
              <View style={styles.settingsIcon}><Ionicons name="settings-outline" size={22} color={colors.settingsAccent} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.settingsTitle}>Settings</Text>
                <Text style={styles.settingsSubtitle}>{String(user?.full_name || user?.username || 'Restaurant')}</Text>
              </View>
              <TouchableOpacity onPress={() => setSettingsVisible(false)} hitSlop={10}><Ionicons name="close" size={22} color={colors.inkSoft} /></TouchableOpacity>
            </View>
            <Text style={styles.settingsSection}>PRINTER DETAILS</Text>
            <TouchableOpacity style={styles.settingsRow} onPress={() => { setSettingsVisible(false); setPrinterVisible(true); }}>
              <Ionicons name="print-outline" size={21} color={colors.ink} />
              <View style={{ flex: 1 }}>
                <Text style={styles.settingsRowTitle}>{savedPrinter?.name || 'Choose a printer'}</Text>
                <Text style={styles.settingsRowHint}>{savedPrinter?.address || 'Bluetooth printer not selected'}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.muted} />
            </TouchableOpacity>
            <View style={styles.settingsDivider} />
            <Text style={styles.settingsSection}>GST ON CUSTOMER BILL</Text>
            {([
              ['single', 'Single GST', 'Show one GST line with the full tax amount'],
              ['split', 'Split GST', 'Show SGST and CGST as equal halves of GST'],
            ] as const).map(([mode, title, hint]) => {
              const selected = gstDisplayMode === mode;
              return (
                <TouchableOpacity
                  key={mode}
                  style={styles.printModeRow}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  onPress={async () => {
                    setGstDisplayModeState(mode);
                    await setGstDisplayMode(mode);
                  }}
                >
                  <Ionicons name={selected ? 'radio-button-on' : 'radio-button-off'} size={21} color={selected ? colors.orange : colors.muted} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.settingsRowTitle}>{title}</Text>
                    <Text style={styles.settingsRowHint}>{hint}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
            <View style={styles.settingsDivider} />
            <Text style={styles.settingsSection}>SALES PRINT OPTIONS</Text>
            {([
              ['kot', 'KOT only', 'Print the kitchen order slip'],
              ['sales', 'Sales only', 'Print the customer sales bill'],
              ['both', 'KOT and sales', 'Print both slips when saving a sale'],
            ] as const).map(([mode, title, hint]) => {
              const selected = salesPrintMode === mode;
              return (
                <TouchableOpacity
                  key={mode}
                  style={styles.printModeRow}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  onPress={async () => {
                    setSalesPrintModeState(mode);
                    await setSalesPrintMode(mode);
                  }}
                >
                  <Ionicons name={selected ? 'radio-button-on' : 'radio-button-off'} size={21} color={selected ? colors.orange : colors.muted} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.settingsRowTitle}>{title}</Text>
                    <Text style={styles.settingsRowHint}>{hint}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </Modal>
      <PrinterPickerModal visible={printerVisible} onClose={() => { setPrinterVisible(false); getSavedPrinter().then(setSavedPrinter); }} />

      <Modal
        visible={logoutVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setLogoutVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setLogoutVisible(false)} accessibilityLabel="Close logout confirmation" />
          <View style={[styles.logoutCard, shadow.card]}>
            <View style={styles.logoutIconWrap}>
              <Ionicons name="log-out-outline" size={26} color={colors.ink} />
            </View>
            <Text style={styles.logoutTitle}>Log out?</Text>
            <Text style={styles.logoutMsg}>
              You'll need to sign in again to take orders.
            </Text>

            <View style={styles.logoutActions}>
              <TouchableOpacity style={styles.cancelBtn} activeOpacity={0.85} onPress={() => setLogoutVisible(false)}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmLogoutBtn} activeOpacity={0.85} onPress={handleLogout}>
                <Text style={styles.confirmLogoutText}>Log out</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

export default TablesScreen;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  loadingRoot: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },

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
  headerWide: { paddingBottom: 8, borderBottomLeftRadius: 18, borderBottomRightRadius: 18 },
  inlineRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  inlineSide: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  inlineCenter: { flex: 1.3, maxWidth: 480 },
    iconBtnWide: { width: 40, height: 40, borderRadius: 13 },
  bannerLogoBox: { width: 164, height: 44, overflow: 'hidden' },
  bannerLogoImg: { position: 'absolute', width: 200, height: 200, left: -18, top: -70 },
  headerInner: { width: '100%', maxWidth: MAX_CONTENT, alignSelf: 'center' },
  headerStripe: { position: 'absolute', left: 36, right: 36, bottom: 0, height: 4, borderRadius: 2 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 46 },
  brandWrap: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  brandName: { fontFamily: 'Fraunces_600SemiBold', fontSize: 25, lineHeight: 30, letterSpacing: 0.4 },
  brandNameSales: { fontFamily: 'Poppins_700Bold', fontWeight: '700' },
  brandNameWide: { fontSize: 38, lineHeight: 44, letterSpacing: 0.6 },
  brandSub: { fontFamily: FONT.medium, fontSize: 12, color: colors.inkSoft, marginTop: 1 },
  brandSubWide: { fontSize: 15, marginTop: 2 },
  iconBtn: {
    width: 46,
    height: 46,
    borderRadius: 16,
    backgroundColor: colors.softGreenAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },

  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 54,
    gap: 8,
    paddingLeft: 20,
    paddingRight: 7,
    borderRadius: 27,
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: colors.border,
    shadowColor: colors.inkDeep,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },
  searchWrapWide: { height: 44, borderRadius: 22, paddingLeft: 16, paddingRight: 5 },
  searchWrapFocused: { borderColor: colors.ink },
    searchInput: { flex: 1, fontFamily: FONT.medium, fontSize: 14.5, color: colors.ink, paddingVertical: 0 },
  searchBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.orange, alignItems: 'center', justifyContent: 'center' },

  banner: { minHeight: 64, borderRadius: 20, paddingVertical: 8, paddingLeft: 10, paddingRight: 8, overflow: 'hidden', flexDirection: 'row', alignItems: 'center', gap: 10, ...shadow.soft },
  bannerWide: { minHeight: 38, borderRadius: 14, paddingVertical: 3, paddingLeft: 10, paddingRight: 5, gap: 6 },
  bannerTitleWide: { flex: 0, flexShrink: 1, marginRight: 4, fontSize: 12.5, lineHeight: 16 },
  statBoxWide: { height: 28, paddingHorizontal: 7 },
    bannerTitle: { flex: 1, minWidth: 0, fontFamily: 'Fraunces_600SemiBold', fontSize: 16, lineHeight: 20, color: colors.white },
  bannerStats: { flexDirection: 'row', gap: 6 },
  statBox: { height: 34, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, borderRadius: 18, backgroundColor: withAlpha(colors.white, 0.15), borderWidth: 1, borderColor: withAlpha(colors.white, 0.28) },
  statBoxOn: { backgroundColor: colors.orange, borderColor: colors.orange },
  statDot: { width: 6, height: 6, borderRadius: 3 },
  statNum: { fontFamily: FONT.bold, fontSize: 15, color: colors.white, fontVariant: ['tabular-nums'] },
  statNumOn: { color: colors.ink },
  statLabel: { fontFamily: FONT.semibold, fontSize: 11.5, color: withAlpha(colors.white, 0.88) },
  statLabelOn: { color: colors.ink },

  chipScroll: { marginHorizontal: -2, flexGrow: 0 },
  chipRow: { paddingTop: 12, paddingBottom: 2, paddingHorizontal: 2, gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 18,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipOn: { backgroundColor: colors.orange, borderColor: colors.orange },
  chipText: { fontFamily: FONT.semibold, fontSize: 12.5, color: colors.inkSoft },
  chipTextOn: { color: colors.ink },
  chipCount: { minWidth: 20, height: 20, paddingHorizontal: 6, borderRadius: 10, backgroundColor: colors.softGreenAlt, alignItems: 'center', justifyContent: 'center' },
  chipCountOn: { backgroundColor: withAlpha(colors.white, 0.65) },
  chipCountText: { fontFamily: FONT.bold, fontSize: 10.5, color: colors.ink },

  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    backgroundColor: colors.errorBackground,
    borderWidth: 1,
    borderColor: colors.error,
    borderRadius: radius.sm,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  errorText: { fontFamily: FONT.medium, fontSize: 12.5, color: colors.error, flex: 1 },
  offlineOrdersBanner: { marginHorizontal: spacing.md, marginTop: spacing.sm, padding: 12, borderRadius: radius.sm, backgroundColor: colors.warningBackground, borderWidth: 1, borderColor: colors.warningBorder, flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  offlineOrdersNeedsReview: { backgroundColor: colors.busySoft, borderColor: colors.errorBorder },
  offlineOrdersTitle: { fontFamily: FONT.semibold, fontSize: 12.5, color: colors.ink },
  offlineOrdersDetail: { fontFamily: FONT.medium, fontSize: 11.5, color: colors.inkSoft, marginTop: 5 },
  offlineOrderItem: { paddingTop: 2 },
  offlineRetryText: { fontFamily: FONT.semibold, fontSize: 11.5, color: colors.errorDark, paddingTop: 6 },

  list: { width: '100%', maxWidth: MAX_CONTENT, alignSelf: 'center', flex: 1 },
  listContent: {
    flexGrow: 1,
    width: '100%',
    paddingTop: 8,
    paddingBottom: spacing.xl * 1.5,
  },
  emptyState: { alignItems: 'center', justifyContent: 'center', paddingTop: spacing.xxl, gap: spacing.sm, width: '100%' },
  emptyText: { fontFamily: FONT.medium, fontSize: 13, color: colors.muted },

  cardOuter: {
    alignSelf: 'flex-start',
   
    borderRadius: 16,
    backgroundColor: colors.white,
    shadowColor: colors.inkDeep,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  cardOuterBusy: { shadowColor: RED, shadowOpacity: 0.22, shadowRadius: 10, elevation: 3 },
  card: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 7,
    paddingTop: 6,
    paddingBottom: 6,
    justifyContent: 'space-between',
    alignItems: 'center',
    overflow: 'hidden',
  },
   cardBusy: { borderWidth: 2, borderColor: RED },
  cardTop: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dotHalo: { width: 14, height: 14, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
    cardNumber: { fontFamily: FONT.semibold, letterSpacing: -0.4, textAlign: 'center', fontVariant: ['tabular-nums'], includeFontPadding: false },
  floorText: { fontFamily: FONT.bold, fontSize: 10, includeFontPadding: false },

  modalBackdrop: {
    flex: 1,
    backgroundColor: withAlpha(colors.inkDeep, 0.45),
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  settingsCard: {
    width: '100%', maxWidth: 390, maxHeight: '90%', backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderTopWidth: 5, borderTopColor: colors.orange,
  },
  settingsContent: { padding: spacing.lg },
  settingsHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.lg },
  settingsIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.warningBackground, alignItems: 'center', justifyContent: 'center' },
  settingsTitle: { fontFamily: FONT.bold, fontSize: 19, color: colors.ink },
  settingsSubtitle: { fontFamily: FONT.regular, fontSize: 12, color: colors.inkSoft, marginTop: 2 },
  settingsSection: { fontFamily: FONT.semibold, fontSize: 11, letterSpacing: 1, color: colors.muted, marginBottom: spacing.xs },
  settingsRow: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  settingsRowTitle: { fontFamily: FONT.semibold, fontSize: 14, color: colors.ink },
  settingsRowHint: { fontFamily: FONT.regular, fontSize: 12, color: colors.inkSoft, marginTop: 3 },
  settingsDivider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.xs },
  printModeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  logoutCard: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    alignItems: 'center',
  },
  logoutIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.orange,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  logoutTitle: { fontFamily: FONT.bold, fontSize: 19, color: colors.ink },
  logoutMsg: {
    fontFamily: FONT.regular,
    fontSize: 13.5,
    color: colors.inkSoft,
    textAlign: 'center',
    marginTop: 6,
    marginBottom: spacing.lg,
  },
  logoutActions: { flexDirection: 'row', gap: spacing.sm, width: '100%' },
  cancelBtn: {
    flex: 1,
    height: 46,
    borderRadius: radius.md,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: { fontFamily: FONT.semibold, fontSize: 14, color: colors.ink },
  confirmLogoutBtn: {
    flex: 1,
    height: 46,
    borderRadius: radius.md,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmLogoutText: { fontFamily: FONT.semibold, fontSize: 14, color: colors.orange },
});
