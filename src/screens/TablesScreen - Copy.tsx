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
  ImageBackground,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, spacing, radius, shadow } from '../constants/theme';
import { getTables } from '../services/api';
import { getSession, clearSession } from '../services/storage';
import { RestaurantTable, AuthUser } from '../utils/kot';
import { TablesScreenProps } from '../navigation/AppNavigator';

const { width: SCREEN_W } = Dimensions.get('window');
const CARD_GAP = 10;
const CARD_WIDTH = (SCREEN_W - spacing.lg * 2 - CARD_GAP) / 2;

type StatusFilter = 'all' | 'free' | 'full';

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
const TINT = {
  available: { bg: '#F1F9F4', border: '#D3EBDD', bar: '#1f6443' },
  partial:   { bg: '#FFF8E8', border: '#F8E0A8', bar: '#F2A71B' },
  occupied:  { bg: '#FDF0EE', border: '#F6D0CC', bar: '#E5484D' },
  inactive:  { bg: '#F4F5F4', border: '#E3E5E3', bar: '#9CA3AF' },
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
// Single animated table card — clean white card, all details, whole card taps
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

  const shown = Math.min(table.capacity, 8);
  const taken = Math.min(table.occupied_seats, shown);

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
               style={[
          styles.card,
          shadow.soft,
          {
            backgroundColor: TINT[state].bg,
            borderColor: TINT[state].border,
            borderLeftColor: TINT[state].bar,
          },
          inactive && { opacity: 0.6 },
        ]}
      >
                <View style={styles.topRow}>
          <Text style={styles.tableNumber}>
            <Text style={styles.tableLabel}>Table </Text>
            {padNumber(table.table_number)}
          </Text>
          <View style={[styles.statusPill, { backgroundColor: meta.bg }]}>
            <View style={[styles.pillDot, { backgroundColor: dotColor }]} />
            <Text style={[styles.pillText, { color: meta.text }]}>{meta.label}</Text>
          </View>
        </View>

        {!!table.table_name && (
          <Text style={styles.tableName} numberOfLines={1}>
            {table.table_name}
          </Text>
        )}

        <View style={styles.seatLine}>
          <View style={styles.seatRow}>
            {Array.from({ length: shown }).map((_, i) => (
              <View
                key={i}
                style={[
                  styles.seatDot,
                  i < taken && { backgroundColor: meta.text, borderColor: meta.text },
                ]}
              />
            ))}
          </View>
          <Text style={styles.seatText}>
            {inactive ? '—' : `${table.occupied_seats}/${table.capacity}`}
          </Text>
        </View>

        <View
          style={[
            styles.cta,
            { backgroundColor: state === 'available' ? colors.orange : colors.ink },
          ]}
        >
          <Text
            style={[
              styles.ctaText,
              { color: state === 'available' ? colors.ink : colors.white },
            ]}
          >
            {inactive ? 'Unavailable' : state === 'available' ? 'Open Table' : 'View Order'}
          </Text>
          <Ionicons
            name="arrow-forward"
            size={13}
            color={state === 'available' ? colors.ink : colors.white}
          />
        </View>
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

  const headerAnim = useRef(new Animated.Value(0)).current;

  const loadTables = useCallback(async (session: AuthUser) => {
    try {
      setError(null);
      const res = await getTables(session.client_id, session.username);
      if (res.success) {
        setTables(res.tables);
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

  const handleTablePress = (table: RestaurantTable) => {
    navigation.navigate('Menu', {
      tableId: table.id,
      tableNumber: table.table_name || table.table_number,
    });
  };

  const handleLogout = async () => {
    await clearSession();
    navigation.replace('Login');
  };

  const freeCount = tables.filter((t) => t.availability_status === 'free').length;
  const fullCount = tables.filter((t) => t.availability_status === 'full').length;

  const filteredTables = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tables.filter((t) => {
      const matchesStatus = statusFilter === 'all' || t.availability_status === statusFilter;
      const matchesSearch =
        !q ||
        t.table_number.toLowerCase().includes(q) ||
        (t.table_name ?? '').toLowerCase().includes(q);
      return matchesStatus && matchesSearch;
    });
  }, [tables, statusFilter, search]);



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
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {getInitials(user?.full_name || user?.username || '?')}
                </Text>
              </View>
              <TouchableOpacity onPress={handleLogout} hitSlop={10} style={styles.logoutBtn}>
                <Ionicons name="log-out-outline" size={19} color={colors.white} />
              </TouchableOpacity>
            </View>
          </View>

         
        <View style={styles.statsRow}>
          <StatCard
            value={tables.length}
            label="Total tables"
            icon="table-furniture"
            tint="rgba(214,238,224,0.92)"
            iconBg="rgba(31,122,77,0.15)"
            iconColor="#1F7A4D"
            active={statusFilter === 'all'}
            onPress={() => setStatusFilter('all')}
          />
          <StatCard
            value={freeCount}
            label="Available"
            icon="check"
            tint="rgba(214,238,224,0.92)"
            iconBg="rgba(31,122,77,0.15)"
            iconColor="#1F7A4D"
            active={statusFilter === 'free'}
            onPress={() => setStatusFilter(statusFilter === 'free' ? 'all' : 'free')}
          />
          <StatCard
            value={fullCount}
            label="Occupied"
            icon="account-group-outline"
            tint="rgba(252,222,220,0.92)"
            iconBg="rgba(180,35,24,0.14)"
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
          placeholder="Search table name or number..."
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
  logoutBtn: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
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
  borderColor: 'rgba(255,255,255,0.5)',
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
  borderRadius: 14,
  borderWidth: 1,
  borderLeftWidth: 3,
  padding: 10,
},
topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
statusPill: {
  flexDirection: 'row',
  alignItems: 'center',
  gap: 4,
  paddingHorizontal: 6,
  paddingVertical: 2,
  borderRadius: 999,
},
pillDot: { width: 6, height: 6, borderRadius: 3 },
pillText: { fontFamily: 'Inter_600SemiBold', fontSize: 9, letterSpacing: 0.3, textTransform: 'uppercase' },
tableLabel: { fontFamily: 'Inter_400Regular', fontSize: 11, color: colors.muted },
tableNumber: { fontFamily: 'Fraunces_600SemiBold', fontSize: 20, lineHeight: 24, color: colors.ink },
tableName: { fontFamily: 'Inter_400Regular', fontSize: 11, color: colors.inkSoft, marginTop: 1 },
seatLine: {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginTop: 6,
},
seatRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
seatDot: { width: 8, height: 8, borderRadius: 4, borderWidth: 1.2, borderColor: '#B9C7BF' },
seatText: { fontFamily: 'Inter_500Medium', fontSize: 11, color: colors.ink },
cta: {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginTop: 8,
  height: 28,
  borderRadius: 10,
  paddingHorizontal: 10,
},
ctaText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
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
});