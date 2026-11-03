// src/screens/CategoryCreateScreen.tsx
// Categories: gradient header with scattered food icons, a "create" card
// (name only) and a compact "existing" card of chips. Phones stack the cards;
// tablets / landscape show them side by side.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, gradients, spacing, radius, withAlpha } from '../constants/theme';
import MasterDropdown from '../components/MasterDropdown';
import { CategoryCreateScreenProps } from '../navigation/AppNavigator';
import { Category, createCategory, getCategories } from '../services/api';
import { useScrollToFocusedInput } from '../hooks/useScrollToFocusedInput';

const COLLAPSED_COUNT = 12; // chips shown before "Show all"
const SEARCH_THRESHOLD = 10; // search box appears once there are this many

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
  { name: 'pizza',          left: '3%',  top: '62%', size: 30, rotate: '-16deg', color: WHITE(0.16) },
  { name: 'coffee',         left: '19%', top: '6%',  size: 24, rotate: '10deg',  color: GOLD(0.28) },
  { name: 'hamburger',      left: '33%', top: '60%', size: 28, rotate: '8deg',   color: WHITE(0.14) },
  { name: 'ice-cream',      left: '47%', top: '2%',  size: 26, rotate: '-12deg', color: WHITE(0.16) },
  { name: 'noodles',        left: '58%', top: '66%', size: 30, rotate: '14deg',  color: GOLD(0.26) },
  { name: 'food-drumstick', left: '70%', top: '4%',  size: 26, rotate: '-20deg', color: WHITE(0.15) },
  { name: 'cupcake',        left: '84%', top: '58%', size: 26, rotate: '12deg',  color: WHITE(0.15) },
  { name: 'fish',           left: '91%', top: '8%',  size: 24, rotate: '-8deg',  color: GOLD(0.24) },
  { name: 'french-fries',   left: '10%', top: '34%', size: 20, rotate: '18deg',  color: WHITE(0.12) },
  { name: 'food-croissant', left: '40%', top: '30%', size: 20, rotate: '-10deg', color: GOLD(0.2) },
  { name: 'glass-cocktail', left: '78%', top: '32%', size: 20, rotate: '9deg',   color: WHITE(0.12) },
];

export default function CategoryCreateScreen({ navigation }: CategoryCreateScreenProps) {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { scrollViewRef, onInputFocus } = useScrollToFocusedInput();
  const compactLandscape = Math.min(windowWidth, windowHeight) >= 600 && windowWidth > windowHeight;
  const wide = windowWidth >= 700; // tablet / landscape -> two columns

  const [name, setName] = useState('');
  const [list, setList] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState('');
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
      const data = await getCategories();
      if (!mounted.current) return;
      setList(data);
      setLoadError(null);
    } catch (err) {
      if (mounted.current) setLoadError(err instanceof Error ? err.message : 'Could not load categories.');
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
    const trimmed = name.trim();
    setNotice(null);
    if (!trimmed) {
      setError('Enter the category name.');
      return;
    }
    if (list.some((c) => c.name.trim().toLowerCase() === trimmed.toLowerCase())) {
      setError(`“${trimmed}” already exists.`);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const created = await createCategory(trimmed);
      if (!mounted.current) return;
      setList((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      setName('');
      setQuery('');
      setNotice(`“${created.name}” was added.`);
      setHighlightId(created.id);
      later(() => setNotice(null), 3000);
      later(() => setHighlightId(null), 3000);
      load(); // quietly sync with the server
    } catch (err) {
      if (mounted.current) setError(err instanceof Error ? err.message : 'Could not create the category. Please try again.');
    } finally {
      if (mounted.current) setSaving(false);
    }
  };

  const searching = query.trim().length > 0;
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? list.filter((c) => c.name.toLowerCase().includes(q)) : list;
  }, [list, query]);

  const showAll = expanded || searching;
  const visible = showAll ? matches : matches.slice(0, COLLAPSED_COUNT);
  const hiddenCount = matches.length - visible.length;

  const canSave = name.trim().length > 0 && !saving;

  // ---- cards ---------------------------------------------------------------
  const createCard = (
    <View style={[styles.card, wide && styles.cardWide]}>
      <View style={styles.cardHead}>
        <View style={styles.cardIcon}>
          <Ionicons name="add" size={20} color={colors.ink} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>Add category</Text>
          <Text style={styles.cardHint}>Only a name is needed</Text>
        </View>
      </View>

      <Text style={styles.label}>Category name</Text>
      <View style={[styles.inputWrap, !!error && styles.inputWrapError]}>
        <Ionicons name="pricetag-outline" size={18} color={colors.inkSoft} />
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={(t) => {
            setName(t);
            setError(null);
          }}
          placeholder="e.g. Starters, Biryani, Drinks"
          placeholderTextColor={colors.muted}
          autoCapitalize="words"
          returnKeyType="done"
          onSubmitEditing={save}
          maxLength={60}
          onFocus={onInputFocus}
        />
        {!!name && (
          <TouchableOpacity onPress={() => setName('')} hitSlop={10} accessibilityLabel="Clear name">
            <Ionicons name="close-circle" size={18} color={colors.muted} />
          </TouchableOpacity>
        )}
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
        <Text style={styles.createText}>{saving ? 'Saving…' : 'Create category'}</Text>
      </TouchableOpacity>
    </View>
  );

  const existingCard = (
    <View style={[styles.card, wide && styles.cardWideRight]}>
      <View style={styles.cardHead}>
        <View style={[styles.cardIcon, { backgroundColor: colors.softGreen }]}>
          <Ionicons name="pricetags-outline" size={18} color={colors.ink} />
        </View>
        <Text style={[styles.cardTitle, { flex: 1 }]}>Existing categories</Text>
        <View style={styles.countPill}>
          <Text style={styles.countText}>{list.length}</Text>
        </View>
      </View>

      {list.length >= SEARCH_THRESHOLD && (
        <View style={styles.searchBar}>
          <Ionicons name="search" size={16} color={colors.muted} />
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Search"
            placeholderTextColor={colors.muted}
            returnKeyType="search"
            onFocus={onInputFocus}
          />
          {!!query && (
            <TouchableOpacity onPress={() => setQuery('')} hitSlop={10} accessibilityLabel="Clear search">
              <Ionicons name="close-circle" size={16} color={colors.muted} />
            </TouchableOpacity>
          )}
        </View>
      )}

      {loading ? (
        <ActivityIndicator color={colors.ink} style={{ marginVertical: spacing.lg }} />
      ) : loadError ? (
        <TouchableOpacity style={styles.errorBanner} onPress={() => load()} activeOpacity={0.85}>
          <Ionicons name="refresh" size={16} color={colors.error} />
          <Text style={styles.errorBannerText} numberOfLines={2}>{loadError} Tap to retry.</Text>
        </TouchableOpacity>
      ) : list.length === 0 ? (
        <Text style={styles.empty}>No categories yet. Add your first one.</Text>
      ) : matches.length === 0 ? (
        <Text style={styles.empty}>Nothing matches “{query}”.</Text>
      ) : (
        <>
          <View style={styles.chips}>
            {visible.map((c) => {
              const hl = c.id === highlightId;
              return (
                <View key={`${c.id}-${c.name}`} style={[styles.chip, hl && styles.chipHighlight]}>
                  <Text style={styles.chipText} numberOfLines={1}>{c.name}</Text>
                  {hl && <Ionicons name="checkmark-circle" size={15} color={colors.ink} />}
                </View>
              );
            })}
          </View>

          {(hiddenCount > 0 || (expanded && !searching && matches.length > COLLAPSED_COUNT)) && (
            <TouchableOpacity
              style={styles.moreBtn}
              onPress={() => setExpanded((v) => !v)}
              activeOpacity={0.8}
              accessibilityRole="button"
            >
              <Text style={styles.moreText}>{expanded ? 'Show less' : `Show all (${matches.length})`}</Text>
              <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={colors.ink} />
            </TouchableOpacity>
          )}
        </>
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.root} edges={['left', 'right', 'bottom']}>
      <StatusBar barStyle="light-content" />

      {/* header with scattered food icons */}
      <LinearGradient
        colors={gradients.button}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[
          styles.hero,
{ paddingTop: insets.top + (compactLandscape ? spacing.xs : spacing.sm) },          compactLandscape && styles.heroCompact,
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
            onPress={() => navigation.goBack()}
            style={styles.heroBack}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <Ionicons name="chevron-back" size={22} color={colors.white} />
          </TouchableOpacity>

          <View style={styles.heroText}>
          
            <Text style={[styles.heroTitle, compactLandscape && styles.heroTitleCompact]} numberOfLines={1}>
              New category
            </Text>
            <Text style={styles.heroSubtitle} numberOfLines={1}>
              Group your menu items
            </Text>
          </View>

        <MasterDropdown current="categories" navigation={navigation} />
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
  // ---- header ----
  hero: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomLeftRadius: 22,
    borderBottomRightRadius: 22,
    overflow: 'hidden',
  },
  heroCompact: { paddingBottom: spacing.sm, borderBottomLeftRadius: 16, borderBottomRightRadius: 16 },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 2 },
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
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 1 },
  eyebrowBar: { width: 18, height: 3, borderRadius: 2, backgroundColor: colors.orange },
  eyebrow: { fontFamily: 'Poppins_600SemiBold', fontSize: 10.5, letterSpacing: 1.6, color: colors.orange },
  heroTitle: { fontFamily: 'Poppins_700Bold', fontWeight: '700', fontSize: 23, color: colors.white },
  heroTitleCompact: { fontSize: 20 },
  heroSubtitle: {
    fontFamily: 'Poppins_400Regular',
    fontSize: 12,
    color: withAlpha(colors.white, 0.78),
    marginTop: 1,
  },
  ticket: { flexDirection: 'row', alignItems: 'stretch', alignSelf: 'center' },
  perforation: {
    width: 0,
    marginRight: spacing.md,
    borderLeftWidth: 1.5,
    borderLeftColor: withAlpha(colors.white, 0.35),
    borderStyle: 'dashed',
  },
  ticketBody: { alignItems: 'center', justifyContent: 'center', minWidth: 62 },
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
  cardWideRight: { flex: 1.3 },
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

  label: { fontFamily: 'Poppins_600SemiBold', fontSize: 13, color: colors.ink, marginBottom: spacing.xs },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 50,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  inputWrapError: { borderColor: colors.error },
  input: { flex: 1, fontFamily: 'Poppins_500Medium', fontSize: 14.5, color: colors.ink, paddingVertical: 10 },

  feedback: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.sm },
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

  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    height: 42,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: 21,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: { flex: 1, fontFamily: 'Poppins_400Regular', fontSize: 14, color: colors.ink, paddingVertical: 0 },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs + 2 },
  chip: {
    maxWidth: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipHighlight: { backgroundColor: colors.warningBackground, borderColor: colors.orange },
  chipText: { flexShrink: 1, fontFamily: 'Poppins_500Medium', fontSize: 13, color: colors.ink },

  moreBtn: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: spacing.md,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  moreText: { fontFamily: 'Poppins_600SemiBold', fontSize: 13, color: colors.ink },

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