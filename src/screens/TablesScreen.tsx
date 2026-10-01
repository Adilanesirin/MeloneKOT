import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  RefreshControl,
  Animated,
  ActivityIndicator,
  StatusBar,
  Dimensions,
  TextInput,
  ScrollView,
  ImageBackground,
  Image,
  Modal,
  Pressable,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import { colors, spacing, radius, shadow } from '../constants/theme';
import { getTables } from '../services/api';
import { getSession, clearSession } from '../services/storage';
import { RestaurantTable, AuthUser } from '../utils/kot';
import { TablesScreenProps } from '../navigation/AppNavigator';
import PrinterPickerModal from './PrinterPickerModal';

const { width: SCREEN_W } = Dimensions.get('window');
const CARD_GAP = 10;
const CARD_WIDTH = (SCREEN_W - spacing.lg * 2 - CARD_GAP) / 2;

type StatusFilter = 'all' | 'free' | 'full';
type AcFilter = 'all' | 'ac' | 'nonac';

// floor "1" < "2" < "10"; table "1" < "2" < "A1" — numeric-aware, floor first
const compareTables = (a: RestaurantTable, b: RestaurantTable) =>
  (a.floor ?? '').localeCompare(b.floor ?? '', undefined, { numeric: true }) ||
  a.table_number.localeCompare(b.table_number, undefined, { numeric: true });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const getInitials = (name: string) => {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] || '';
  const second = parts.length > 1 ? parts[1][0] : parts[0]?.[1] || '';
  return (first + second).toUpperCase();
};

const capitalize = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

// "1" -> "01", "10" -> "10", "A1" -> "A1"
const padNumber = (n: string) => (/^\d+$/.test(n) && n.length < 2 ? n.padStart(2, '0') : n);

const getGreeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
};

const timeAgo = (iso: string) => {
  const mins = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  if (isNaN(mins) || mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};

const STATE = {
  available: { label: 'Available', text: '#1F7A4D', bg: '#E9F6EE' },
  partial: { label: 'Partial', text: '#B45309', bg: '#FEF3E2' },
  occupied: { label: 'Occupied', text: '#B42318', bg: '#FDEDEC' },
  inactive: { label: 'Inactive', text: '#6B7280', bg: '#F1F2F3' },
} as const;

interface StatCardProps {
  value: number;
  label: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  tint: string;
  iconBg: string;
  iconColor: string;
  active: boolean;
  onPress: () => void;
}

const StatCard: React.FC<StatCardProps> = ({
  value, label, icon, tint, iconBg, iconColor, active, onPress,
}) => (
  <TouchableOpacity
    activeOpacity={0.85}
    onPress={onPress}
    style={[styles.statCard, { backgroundColor: tint }, active && styles.statCardActive]}
  >
    <View style={[styles.statIcon, { backgroundColor: iconBg }]}>
      <MaterialCommunityIcons name={icon} size={17} color={iconColor} />
    </View>
    <View style={{ flex: 1 }}>
      <Text style={styles.statNumber}>{value}</Text>
      <Text style={styles.statCaption} numberOfLines={1} adjustsFontSizeToFit>
        {label}
      </Text>
    </View>
  </TouchableOpacity>
);


// ---------------------------------------------------------------------------
// Corner vector illustration (pre-rendered transparent PNGs of the vector art).
// The tablecloth colour follows the table status.
// PNGs live in src/assets/.
// ---------------------------------------------------------------------------
const TABLE_ART = {
  available: require('../assets/table-available.png'),
  partial: require('../assets/table-partial.png'),
  occupied: require('../assets/table-occupied.png'),
  inactive: require('../assets/table-inactive.png'),
} as const;

// ---------------------------------------------------------------------------
// Single animated table card — neutral white card; status shown only by the
// number ring, the small pill and the seat dots (no coloured corners/edges)
// ---------------------------------------------------------------------------
interface TableCardProps {
  table: RestaurantTable;
  index: number;
  onPress: (table: RestaurantTable) => void;
}

const TableCard: React.FC<TableCardProps> = ({ table, index, onPress }) => {
  const anim = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(1)).current;

  const isFull = table.availability_status === 'full';
  const inactive = table.status !== 'active';
  const isPartial = !isFull && table.occupied_seats > 0 && table.free_seats > 0;
  const state = inactive ? 'inactive' : isFull ? 'occupied' : isPartial ? 'partial' : 'available';
  const meta = STATE[state];
  const dotColor =
    state === 'partial'
      ? '#F59E0B'
      : state === 'inactive'
      ? '#9CA3AF'
      : table.color_code || (isFull ? '#ef4444' : '#22c55e');

  useEffect(() => {
    Animated.timing(anim, {
      toValue: 1,
      duration: 360,
      delay: Math.min(index, 10) * 40,
      useNativeDriver: true,
    }).start();
  }, []);

  const pressIn = () =>
    Animated.spring(scale, { toValue: 0.97, useNativeDriver: true, speed: 40 }).start();
  const pressOut = () =>
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 28 }).start();

  return (
    <Animated.View
      style={{
        opacity: anim,
        transform: [
          { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) },
          { scale },
        ],
      }}
    >
      <TouchableOpacity
        activeOpacity={0.92}
        onPress={() => onPress(table)}
        onPressIn={pressIn}
        onPressOut={pressOut}
        style={[styles.card, shadow.soft, inactive && { opacity: 0.55 }]}
      >
     {/* left: number ring + seats under it · right: status pill */}
      <View style={styles.topRow}>
        <View style={styles.leftCol}>
          <View style={[styles.numberCircle, { borderColor: dotColor }]}>
            <Text style={styles.numberText} adjustsFontSizeToFit numberOfLines={1}>
              {padNumber(table.table_number)}
            </Text>
          </View>
          <Text style={styles.seatText}>
            {inactive ? '—' : `${table.occupied_seats}/${table.capacity} seats`}
          </Text>
          <View style={styles.tagRow}>
            {!!table.floor && (
              <View style={styles.tag}>
                <Text style={styles.tagText}>F{table.floor}</Text>
              </View>
            )}
            <View style={[styles.tag, table.is_ac ? styles.tagAc : styles.tagNonAc]}>
              <MaterialCommunityIcons
                name={table.is_ac ? 'snowflake' : 'fan'}
                size={11}
                color={table.is_ac ? '#1D6FB8' : '#6B7280'}
              />
            </View>
          </View>
        </View>

        <View style={[styles.statusPill, { backgroundColor: meta.bg }]}>
          <View style={[styles.pillDot, { backgroundColor: dotColor }]} />
          <Text style={[styles.pillText, { color: meta.text }]}>{meta.label}</Text>
        </View>
      </View>

        {/* corner illustration — absolutely placed, no extra height */}
        <Image
          source={TABLE_ART[state]}
          style={styles.illus}
          resizeMode="contain"
          pointerEvents="none"
        />
      </TouchableOpacity>
    </Animated.View>
  );
};

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------
const TablesScreen: React.FC<TablesScreenProps> = ({ navigation }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [floorFilter, setFloorFilter] = useState<string>('all');
  const [acFilter, setAcFilter] = useState<AcFilter>('all');
  const [logoutVisible, setLogoutVisible] = useState(false);
  const [printerVisible, setPrinterVisible] = useState(false);

  const headerAnim = useRef(new Animated.Value(0)).current;

  const loadTables = useCallback(async (_session: AuthUser) => {
    try {
      setError(null);
      const res = await getTables(); // Bearer token is attached by services/api
      if (res.success) {
        setTables([...res.tables].sort(compareTables));
      } else {
        setError('Could not load tables.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tables.');
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
      Animated.timing(headerAnim, { toValue: 1, duration: 440, useNativeDriver: true }).start();
    })();
  }, []);

  const onRefresh = useCallback(async () => {
    if (!user) return;
    setRefreshing(true);
    await loadTables(user);
    setRefreshing(false);
  }, [user, loadTables]);

  // reload when coming back to this screen (e.g. after placing an order) — skips the first focus
  const firstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      if (firstFocus.current) {
        firstFocus.current = false; // initial load is already done by the mount effect
        return;
      }
      loadTables(user);
    }, [user, loadTables])
  );

  const handleTablePress = (table: RestaurantTable) => {
    navigation.navigate('Menu', {
      tableId: table.id,
      tableNumber: table.table_name || table.table_number,
      floor: table.floor ?? '',
    });
  };

 const handleLogout = async () => {
  setLogoutVisible(false);
  await clearSession();
  navigation.replace('Login');
};

  const freeCount = tables.filter((t) => t.availability_status === 'free').length;
  const fullCount = tables.filter((t) => t.availability_status === 'full').length;

  // distinct floors present in the data, e.g. ["1", "2"]
  const floors = useMemo(
    () =>
      Array.from(new Set(tables.map((t) => t.floor).filter(Boolean))).sort((a, b) =>
        a.localeCompare(b, undefined, { numeric: true })
      ),
    [tables]
  );

  const filteredTables = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tables.filter((t) => {
      const matchesStatus = statusFilter === 'all' || t.availability_status === statusFilter;
      const matchesFloor = floorFilter === 'all' || t.floor === floorFilter;
      const matchesAc =
        acFilter === 'all' || (acFilter === 'ac' ? t.is_ac : !t.is_ac);
      const matchesSearch =
        !q ||
        t.table_number.toLowerCase().includes(q) ||
        (t.table_name ?? '').toLowerCase().includes(q) ||
        `floor ${t.floor}`.includes(q);
      return matchesStatus && matchesFloor && matchesAc && matchesSearch;
    });
  }, [tables, statusFilter, floorFilter, acFilter, search]);



  if (loading) {
    return (
      <View style={styles.loadingRoot}>
        <StatusBar barStyle="light-content" />
        <ActivityIndicator size="large" color={colors.orange} />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />

      {/* ---------------- HERO (unchanged) ---------------- */}
      <Animated.View
        style={{
          opacity: headerAnim,
          transform: [
            { translateY: headerAnim.interpolate({ inputRange: [0, 1], outputRange: [-16, 0] }) },
          ],
        }}
      >
        <ImageBackground
          source={require('../../assets/hotel.jpg')}
          resizeMode="cover"
          style={styles.hero}
        >
          <LinearGradient
            colors={['rgba(10,40,28,0.94)', 'rgba(10,40,28,0.6)', 'rgba(10,40,28,0.2)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0.4 }}
            style={StyleSheet.absoluteFill}
          />

          <View style={styles.heroTopRow}>
           <View style={{ flex: 1 }}>
          <Text style={styles.greetSmall}>{getGreeting()},</Text>

          <Text style={styles.greetName}>
            {capitalize((user?.full_name || user?.username || '').split(' ')[0])} 👋
          </Text>

          <Text style={styles.greetSub}>Manage your dining floor</Text>
        </View>
           <View style={styles.heroActions}>
            <TouchableOpacity
              onPress={() => setPrinterVisible(true)}
              hitSlop={10}
              activeOpacity={0.85}
              style={styles.avatar}
            >
              <Ionicons name="print-outline" size={22} color={colors.ink} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setLogoutVisible(true)}
              hitSlop={10}
              activeOpacity={0.85}
              style={styles.avatar}
            >
              <Ionicons name="log-out-outline" size={22} color={colors.ink} />
            </TouchableOpacity>
          </View>
          </View>

         
        <View style={styles.statsRow}>
          <StatCard
          value={tables.length}
          label="Total tables"
          icon="table-furniture"
          tint="#FDF0C8"
          iconBg="#F9DE8F"
          iconColor="#B45309"
          active={statusFilter === 'all'}
          onPress={() => setStatusFilter('all')}
        />
          <StatCard
            value={freeCount}
            label="Available"
            icon="check"
            tint="#D6EEE0"
            iconBg="rgba(31,122,77,0.15)"
            iconColor="#1F7A4D"
            active={statusFilter === 'free'}
            onPress={() => setStatusFilter(statusFilter === 'free' ? 'all' : 'free')}
          />
         <StatCard
          value={fullCount}
          label="Occupied"
          icon="account-group-outline"
          tint="#FCDEDC"
          iconBg="#F6C4C0"
          iconColor="#B42318"
          active={statusFilter === 'full'}
          onPress={() => setStatusFilter(statusFilter === 'full' ? 'all' : 'full')}
        />
        </View>
        </ImageBackground>
      </Animated.View>

      {/* ---------------- SEARCH ---------------- */}
      <View style={styles.searchWrap}>
        <Ionicons name="search-outline" size={17} color={colors.muted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search table, name or floor..."
          placeholderTextColor={colors.muted}
          value={search}
          onChangeText={setSearch}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')} hitSlop={8}>
            <Ionicons name="close-circle" size={17} color={colors.muted} />
          </TouchableOpacity>
        )}
      </View>

      {/* ---------------- FLOOR / AC FILTERS ---------------- */}
      {(floors.length > 1 || tables.some((t) => t.is_ac) ) && (
        <View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipRow}
          >
            {floors.length > 1 &&
              ['all', ...floors].map((f) => (
                <TouchableOpacity
                  key={`floor-${f}`}
                  activeOpacity={0.85}
                  onPress={() => setFloorFilter(f)}
                  style={[styles.chip, floorFilter === f && styles.chipActive]}
                >
                  <Text style={[styles.chipText, floorFilter === f && styles.chipTextActive]}>
                    {f === 'all' ? 'All floors' : `Floor ${f}`}
                  </Text>
                </TouchableOpacity>
              ))}
            {(['ac', 'nonac'] as const).map((k) => (
              <TouchableOpacity
                key={`ac-${k}`}
                activeOpacity={0.85}
                onPress={() => setAcFilter(acFilter === k ? 'all' : k)}
                style={[styles.chip, acFilter === k && styles.chipActive]}
              >
                <MaterialCommunityIcons
                  name={k === 'ac' ? 'snowflake' : 'fan'}
                  size={13}
                  color={acFilter === k ? colors.white : colors.inkSoft}
                />
                <Text style={[styles.chipText, acFilter === k && styles.chipTextActive]}>
                  {k === 'ac' ? 'AC' : 'Non-AC'}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {error && (
        <View style={styles.errorBanner}>
          <Ionicons name="alert-circle" size={16} color={colors.error} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {/* ---------------- LIST ---------------- */}
      <FlatList
        data={filteredTables}
        keyExtractor={(item) => String(item.id)}
        numColumns={2}
        columnWrapperStyle={{ gap: CARD_GAP }}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
                    <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.orange}
            colors={[colors.orange]}
          />
        }
        renderItem={({ item, index }) => (
          <TableCard table={item} index={index} onPress={handleTablePress} />
        )}
        ItemSeparatorComponent={() => <View style={{ height: CARD_GAP }} />}
        ListEmptyComponent={
          !error ? (
            <View style={styles.emptyState}>
              <Ionicons name="restaurant-outline" size={32} color={colors.muted} />
              <Text style={styles.emptyText}>
                {tables.length ? 'No tables match your filters' : 'No tables found'}
              </Text>
            </View>
          ) : null
        }
       />

      {/* Bluetooth printer picker */}
      <PrinterPickerModal visible={printerVisible} onClose={() => setPrinterVisible(false)} />

      {/* Logout confirmation */}
      <Modal
        visible={logoutVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setLogoutVisible(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setLogoutVisible(false)}>
          <Pressable style={[styles.logoutCard, shadow.card]} onPress={() => {}}>
            <View style={styles.logoutIconWrap}>
              <Ionicons name="log-out-outline" size={26} color={colors.ink} />
            </View>
            <Text style={styles.logoutTitle}>Log out?</Text>
            <Text style={styles.logoutMsg}>
              You'll need to sign in again to take orders.
            </Text>

            <View style={styles.logoutActions}>
              <TouchableOpacity
                style={styles.cancelBtn}
                activeOpacity={0.85}
                onPress={() => setLogoutVisible(false)}
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.confirmLogoutBtn}
                activeOpacity={0.85}
                onPress={handleLogout}
              >
                <Text style={styles.confirmLogoutText}>Log out</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
};

export default TablesScreen;

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingRoot: {
    flex: 1,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },

hero: {
  paddingTop: 56, 
   paddingBottom: 24,
  paddingHorizontal: spacing.lg,
  borderBottomLeftRadius: radius.xl,
  borderBottomRightRadius: radius.xl,
  overflow: 'hidden',
  backgroundColor: colors.ink,
},
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  heroActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
 greetSmall: { fontFamily: 'Inter_400Regular', fontSize: 13, color: 'rgba(255,255,255,0.85)' },
 greetName: { fontFamily: 'Fraunces_600SemiBold', fontSize: 30, color: colors.white,textTransform: 'uppercase' },

  greetSub: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 4,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.orange,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    color: colors.ink,
  },
   modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(22,58,46,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
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
  logoutTitle: {
    fontFamily: 'Fraunces_600SemiBold',
    fontSize: 20,
    color: colors.ink,
  },
  logoutMsg: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13.5,
    color: colors.inkSoft,
    textAlign: 'center',
    marginTop: 6,
    marginBottom: spacing.lg,
  },
  logoutActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    width: '100%',
  },
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
  cancelText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: colors.ink,
  },
  confirmLogoutBtn: {
    flex: 1,
    height: 46,
    borderRadius: radius.md,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmLogoutText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: colors.orange,
  },
statsRow: { flexDirection: 'row', gap: spacing.sm, marginTop: 12 },
statCard: {
  flex: 1,
  flexDirection: 'row',
  alignItems: 'center',
  gap: 6,
  borderRadius: radius.md,
  padding: 6,
  borderWidth: 1.5,
  borderColor: '#FFFFFF',
},
statCardActive: { borderColor: colors.orange, borderWidth: 2 },
statIcon: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
statNumber: { fontFamily: 'Fraunces_600SemiBold', fontSize: 18, color: colors.ink },

  statCaption: {
    fontFamily: 'Inter_500Medium',
    fontSize: 8.5,
    letterSpacing: 0.3,
    color: colors.muted,
    textTransform: 'uppercase',
  },
searchWrap: {
  flexDirection: 'row',
  alignItems: 'center',
  marginHorizontal: spacing.lg,
  marginTop: 12,
  marginBottom: 10,
  backgroundColor: colors.surface,
  borderRadius: 16,
  borderWidth: 1,
  borderColor: colors.border,
  paddingHorizontal: spacing.md,
  height: 42,
  gap: spacing.sm,
},
  searchInput: {
    flex: 1,
    fontFamily: 'Inter_500Medium',
    fontSize: 13.5,
    color: colors.ink,
  },

  // status segments
  segment: {
    flexDirection: 'row',
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    marginBottom: spacing.md,
    padding: 4,
    borderRadius: 14,
    backgroundColor: '#ECEFEC',
  },
  segmentItem: {
    flex: 1,
    height: 38,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  segmentItemActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  segmentText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12.5,
    color: '#6B7280',
  },
  segmentTextActive: {
    color: '#14342A',
  },
  segmentCount: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    color: '#9CA3AF',
  },
  segmentCountActive: {
    color: '#14342A',
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
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    paddingBottom: spacing.xxl,
  },
card: {
  width: CARD_WIDTH,
  backgroundColor: colors.surface,
  borderRadius: 18,
  borderWidth: 1,
  borderColor: colors.border,
  padding: 14,
},
topRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
numberCircle: {
  width: 46,
  height: 46,
  borderRadius: 23,
  borderWidth: 2,
  backgroundColor: colors.white,
  alignItems: 'center',
  justifyContent: 'center',
  paddingHorizontal: 4,
},
numberText: { fontFamily: 'Fraunces_600SemiBold', fontSize: 17, color: colors.ink },
leftCol: { alignItems: 'flex-start', gap: 8 },
statusPill: {
  flexDirection: 'row',
  alignItems: 'center',
  gap: 4,
  paddingHorizontal: 8,
  paddingVertical: 3,
  borderRadius: 999,
},
pillDot: { width: 6, height: 6, borderRadius: 3 },
pillText: { fontFamily: 'Inter_600SemiBold', fontSize: 10, letterSpacing: 0.2 },
seatText: { fontFamily: 'Inter_600SemiBold', fontSize: 12, color: colors.inkSoft },
illus: {
  position: 'absolute',
  right: 8,
  bottom: 8,
  width: 80,
  height: 58,
},
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#E3E7E2',
    marginTop: 12,
    marginBottom: 10,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  footerText: {
    flex: 1,
    fontFamily: 'Inter_400Regular',
    fontSize: 10.5,
    color: colors.muted,
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

  // ----- floor / AC tags on the card -----
  tagRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    height: 20,
    borderRadius: 6,
    backgroundColor: '#F1F2F3',
  },
  tagText: { fontFamily: 'Inter_600SemiBold', fontSize: 10, color: colors.inkSoft },
  tagAc: { backgroundColor: '#E6F1FB' },
  tagNonAc: { backgroundColor: '#F1F2F3' },

  // ----- filter chips -----
  chipRow: {
    paddingHorizontal: spacing.lg,
    paddingBottom: 8,
    gap: 8,
    alignItems: 'center',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipText: { fontFamily: 'Inter_600SemiBold', fontSize: 12, color: colors.inkSoft },
  chipTextActive: { color: colors.white },
});