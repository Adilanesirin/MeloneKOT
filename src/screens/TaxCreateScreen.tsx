// src/screens/TaxCreateScreen.tsx
// Create taxes (POST /api/taxes/) and see the existing ones.
// Same look as the Category / Item screens: slim gradient header with scattered
// food icons, a "create" card and an "existing" card. Phones stack the cards;
// tablets / landscape show them side by side.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, gradients, radius, spacing, withAlpha } from '../constants/theme';
import MasterDropdown from '../components/MasterDropdown';
import { TaxCreateScreenProps } from '../navigation/AppNavigator';
import { Tax, createTax, getTaxes } from '../services/api';
import { useScrollToFocusedInput } from '../hooks/useScrollToFocusedInput';

const QUICK_RATES = ['0', '5', '12', '18', '28']; // common slabs, tap to fill

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

export default function TaxCreateScreen({ navigation }: TaxCreateScreenProps) {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { scrollViewRef, onInputFocus } = useScrollToFocusedInput();
  const compactLandscape = Math.min(windowWidth, windowHeight) >= 600 && windowWidth > windowHeight;
  const wide = windowWidth >= 700; // tablet / landscape -> two columns

  const [name, setName] = useState('');
  const [percentage, setPercentage] = useState('');
  const [description, setDescription] = useState('');
  const [active, setActive] = useState(true);

  const [list, setList] = useState<Tax[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [highlightId, setHighlightId] = useState<number | null>(null);

  const mounted = useRef(true);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      timers.current.forEach(clearTimeout);
    };
  }, []);

  const later = (fn: () => void, ms: number) => {
    timers.current.push(setTimeout(() => mounted.current && fn(), ms));
  };

  const load = useCallback(async (mode: 'initial' | 'refresh' = 'initial') => {
    if (mode === 'refresh') setRefreshing(true);
    try {
      const data = await getTaxes();
      if (!mounted.current) return;
      setList(data);
      setLoadError(null);
    } catch (err) {
      if (mounted.current) setLoadError(err instanceof Error ? err.message : 'Could not load taxes.');
    } finally {
      if (mounted.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    if (saving) return;
    setNotice(null);
    const pct = Number.parseFloat(percentage);
    if (!name.trim()) {
      setError('Enter the tax name.');
      return;
    }
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      setError('Enter a percentage between 0 and 100.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const created = await createTax({
        name: name.trim(),
        percentage: pct.toFixed(2),
        description: description.trim(),
        status: active ? 'active' : 'inactive',
      });
      if (!mounted.current) return;
      setList((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      setName('');
      setPercentage('');
      setDescription('');
      setActive(true);
      setNotice(`${created.name} ${Number.parseFloat(created.percentage)}% was added.`);
      setHighlightId(created.id);
      later(() => setNotice(null), 3000);
      later(() => setHighlightId(null), 3000);
    } catch (err) {
      if (mounted.current) setError(err instanceof Error ? err.message : 'Could not create the tax. Please try again.');
    } finally {
      if (mounted.current) setSaving(false);
    }
  };

  const canSave = name.trim().length > 0 && percentage.trim().length > 0 && !saving;

  // ---- cards ---------------------------------------------------------------
  const createCard = (
    <View style={[styles.card, wide && styles.cardWide]}>
      <View style={styles.cardHead}>
        <View style={styles.cardIcon}>
          <Ionicons name="add" size={20} color={colors.ink} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>Add tax</Text>
          <Text style={styles.cardHint}>Rates you can apply to menu items</Text>
        </View>
      </View>

      <Text style={styles.label}>Tax name *</Text>
      <View style={styles.inputWrap}>
        <Ionicons name="receipt-outline" size={18} color={colors.inkSoft} />
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={(t) => {
            setName(t);
            setError(null);
          }}
          placeholder="e.g. GST"
          placeholderTextColor={colors.muted}
          autoCapitalize="characters"
          maxLength={40}
          onFocus={onInputFocus}
        />
        {!!name && (
          <TouchableOpacity onPress={() => setName('')} hitSlop={10} accessibilityLabel="Clear name">
            <Ionicons name="close-circle" size={18} color={colors.muted} />
          </TouchableOpacity>
        )}
      </View>

      <Text style={[styles.label, styles.gap]}>Percentage *</Text>
      <View style={styles.inputWrap}>
        <Ionicons name="pricetag-outline" size={18} color={colors.inkSoft} />
        <TextInput
          style={styles.input}
          value={percentage}
          onChangeText={(t) => {
            setPercentage(t.replace(/[^0-9.]/g, ''));
            setError(null);
          }}
          placeholder="e.g. 5"
          placeholderTextColor={colors.muted}
          keyboardType="decimal-pad"
          onFocus={onInputFocus}
        />
        <Text style={styles.suffix}>%</Text>
      </View>

      <View style={styles.quickRow}>
        {QUICK_RATES.map((r) => {
          const selected = percentage === r;
          return (
            <TouchableOpacity
              key={r}
              activeOpacity={0.85}
              onPress={() => {
                setPercentage(r);
                setError(null);
              }}
              style={[styles.quickChip, selected && styles.quickChipActive]}
            >
              <Text style={[styles.quickText, selected && styles.quickTextActive]}>{r}%</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={[styles.label, styles.gap]}>Description</Text>
      <View style={styles.inputWrap}>
        <TextInput
          style={styles.input}
          value={description}
          onChangeText={setDescription}
          placeholder="Optional"
          placeholderTextColor={colors.muted}
          onFocus={onInputFocus}
        />
      </View>

      <View style={[styles.switchRow, styles.gap]}>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>Active</Text>
          <Text style={styles.subLabel}>Inactive taxes can't be picked for new items</Text>
        </View>
        <Switch
          value={active}
          onValueChange={setActive}
          trackColor={{ true: colors.ink, false: colors.border }}
          thumbColor={colors.white}
        />
      </View>

      {!!error && (
        <View style={styles.feedback}>
          <Ionicons name="alert-circle" size={15} color={colors.error} />
          <Text style={[styles.feedbackText, { color: colors.error }]}>{error}</Text>
        </View>
      )}
      {!!notice && !error && (
        <View style={styles.feedback}>
          <Ionicons name="checkmark-circle" size={15} color={colors.ink} />
          <Text style={[styles.feedbackText, { color: colors.ink }]}>{notice}</Text>
        </View>
      )}

      <TouchableOpacity
        style={[styles.createBtn, !canSave && styles.createBtnOff]}
        onPress={save}
        disabled={!canSave}
        activeOpacity={0.9}
        accessibilityRole="button"
      >
        {saving ? (
          <ActivityIndicator color={colors.white} />
        ) : (
          <Ionicons name="checkmark-circle-outline" size={20} color={colors.white} />
        )}
        <Text style={styles.createText}>{saving ? 'Saving…' : 'Create tax'}</Text>
      </TouchableOpacity>
    </View>
  );

  const existingCard = (
    <View style={[styles.card, wide && styles.cardWideRight]}>
      <View style={styles.cardHead}>
        <View style={[styles.cardIcon, { backgroundColor: colors.softGreen }]}>
          <Ionicons name="list-outline" size={18} color={colors.ink} />
        </View>
        <Text style={[styles.cardTitle, { flex: 1 }]}>Existing taxes</Text>
        <View style={styles.countPill}>
          <Text style={styles.countText}>{list.length}</Text>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.ink} style={{ marginVertical: spacing.lg }} />
      ) : loadError ? (
        <TouchableOpacity style={styles.errorBanner} onPress={() => load()} activeOpacity={0.85}>
          <Ionicons name="refresh" size={16} color={colors.error} />
          <Text style={styles.errorBannerText} numberOfLines={2}>{loadError} Tap to retry.</Text>
        </TouchableOpacity>
      ) : list.length === 0 ? (
        <Text style={styles.empty}>No taxes yet. Add your first one.</Text>
      ) : (
        list.map((t, i) => {
          const hl = t.id === highlightId;
          const inactive = t.status !== 'active';
          return (
            <View
              key={t.id}
              style={[styles.row, i > 0 && styles.rowDivider, hl && styles.rowHighlight]}
            >
              <View style={styles.rowIcon}>
                <Ionicons name="receipt-outline" size={16} color={colors.ink} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowName, inactive && styles.rowNameOff]} numberOfLines={1}>
                  {t.name}
                </Text>
                {!!t.description && (
                  <Text style={styles.rowDesc} numberOfLines={1}>{t.description}</Text>
                )}
              </View>
              {inactive && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>INACTIVE</Text>
                </View>
              )}
              <View style={styles.rateTag}>
                <Text style={styles.rateText}>{Number.parseFloat(t.percentage)}%</Text>
              </View>
            </View>
          );
        })
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.root} edges={['left', 'right', 'bottom']}>
      <StatusBar barStyle="light-content" />

      {/* slim header with scattered food icons */}
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
              New tax
            </Text>
            <Text style={styles.heroSubtitle} numberOfLines={1}>
              Rates you can apply to menu items
            </Text>
          </View>

      <MasterDropdown current="taxes" navigation={navigation} />
        </View>
      </LinearGradient>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          ref={scrollViewRef}
          removeClippedSubviews={false}
          scrollEnabled
          nestedScrollEnabled
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => load('refresh')} tintColor={colors.ink} />
          }
          contentContainerStyle={[
            styles.content,
            { maxWidth: wide ? 1000 : 640, width: '100%', alignSelf: 'center' },
            wide && styles.contentWide,
          ]}
        >
          {createCard}
          {existingCard}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },

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
  heroTitle: { fontFamily: 'Poppins_700Bold', fontWeight: '700', fontSize: 22, color: colors.white },
  heroTitleCompact: { fontSize: 18 },
  heroSubtitle: {
    fontFamily: 'Poppins_400Regular',
    fontSize: 12,
    color: withAlpha(colors.white, 0.78),
    marginTop: 1,
  },
  ticket: { flexDirection: 'row', alignItems: 'stretch', alignSelf: 'center' },
  perforation: {
    width: 0,
    marginRight: spacing.sm,
    borderLeftWidth: 1.5,
    borderLeftColor: withAlpha(colors.white, 0.35),
    borderStyle: 'dashed',
  },
  ticketBody: { alignItems: 'center', justifyContent: 'center', minWidth: 52 },
  ticketNumber: { fontFamily: 'Poppins_700Bold', fontSize: 24, color: colors.orange, lineHeight: 28 },
  ticketLabel: { fontFamily: 'Poppins_600SemiBold', fontSize: 8.5, letterSpacing: 1.1, color: withAlpha(colors.white, 0.85) },

  // ---- body ----
  content: { flexGrow: 1, padding: spacing.lg, paddingBottom: spacing.xl * 2, gap: spacing.md },
  contentWide: { flexDirection: 'row', alignItems: 'flex-start' },

  card: {
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardWide: { flex: 1 },
  cardWideRight: { flex: 1.2 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  cardIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: colors.orange,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: { fontFamily: 'Poppins_700Bold', fontWeight: '700', fontSize: 17, color: colors.ink },
  cardHint: { fontFamily: 'Poppins_400Regular', fontSize: 12, color: colors.inkSoft, marginTop: 1 },

  gap: { marginTop: spacing.md },
  label: { fontFamily: 'Poppins_600SemiBold', fontSize: 13, color: colors.ink, marginBottom: spacing.xs },
  subLabel: { fontFamily: 'Poppins_500Medium', fontSize: 11.5, color: colors.inkSoft },

  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 48,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  input: { flex: 1, fontFamily: 'Poppins_500Medium', fontSize: 14.5, color: colors.ink, paddingVertical: 10 },
  suffix: { fontFamily: 'Poppins_600SemiBold', fontSize: 14.5, color: colors.inkSoft },

  quickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs + 2, marginTop: spacing.sm },
  quickChip: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  quickChipActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  quickText: { fontFamily: 'Poppins_600SemiBold', fontSize: 12.5, color: colors.ink },
  quickTextActive: { color: colors.orange },

  switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },

  feedback: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.md },
  feedbackText: { flex: 1, fontFamily: 'Poppins_500Medium', fontSize: 12.5 },

  createBtn: {
    marginTop: spacing.md,
    height: 50,
    borderRadius: radius.md,
    backgroundColor: colors.ink,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  createBtnOff: { opacity: 0.45 },
  createText: { fontFamily: 'Poppins_600SemiBold', fontSize: 14.5, color: colors.white },

  countPill: {
    minWidth: 32,
    height: 26,
    paddingHorizontal: 10,
    borderRadius: 13,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countText: { fontFamily: 'Poppins_600SemiBold', fontSize: 12, color: colors.ink },

  // ---- existing list ----
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: radius.md,
  },
  rowDivider: { borderTopWidth: 1, borderTopColor: colors.border },
  rowHighlight: { backgroundColor: colors.warningBackground },
  rowIcon: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowName: { fontFamily: 'Poppins_600SemiBold', fontSize: 14, color: colors.ink },
  rowNameOff: { color: colors.muted },
  rowDesc: { fontFamily: 'Poppins_400Regular', fontSize: 11.5, color: colors.inkSoft, marginTop: 1 },
  rateTag: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: colors.ink,
  },
  rateText: { fontFamily: 'Poppins_600SemiBold', fontSize: 12.5, color: colors.orange },
  badge: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  badgeText: { fontFamily: 'Poppins_600SemiBold', fontSize: 9, letterSpacing: 0.8, color: colors.inkSoft },

  empty: {
    fontFamily: 'Poppins_400Regular',
    fontSize: 13,
    color: colors.muted,
    textAlign: 'center',
    paddingVertical: spacing.md,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.busySoft,
  },
  errorBannerText: { flex: 1, fontFamily: 'Poppins_500Medium', fontSize: 12.5, color: colors.error },
});