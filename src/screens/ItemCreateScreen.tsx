// src/screens/ItemCreateScreen.tsx
// Create a new menu item (POST /api/menu-items/). Reachable from the side drawer.
// Compact gradient header (same look as the Category screen, but slimmer because
// this form has a lot of content), sectioned cards, and a sticky save bar.
// Phones stack the cards; tablets / landscape show two columns.

import React, { useCallback, useMemo, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
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
import { ItemCreateScreenProps } from '../navigation/AppNavigator';
import { createMenuItem, getCategories, getTaxes, Tax } from '../services/api';
import { useScrollToFocusedInput } from '../hooks/useScrollToFocusedInput';

type FoodType = 'veg' | 'non_veg';
type PriceType = 'single' | 'portion';

interface CategoryOption {
  id: number;
  name: string;
}

const toPrice = (v: string) => {
  const n = Number.parseFloat(v);
  return Number.isFinite(n) && n >= 0 ? n.toFixed(2) : '';
};

// ---- scattered food icons for the header (kept sparse: header is slim) ------
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

// ---- small reusable pieces (defined outside so they don't remount) ----------
function SectionHead({
  icon,
  title,
  hint,
  tint,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  hint?: string;
  tint?: string;
}) {
  return (
    <View style={styles.sectionHead}>
      <View style={[styles.sectionIcon, tint ? { backgroundColor: tint } : null]}>
        <Ionicons name={icon} size={16} color={colors.ink} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {!!hint && <Text style={styles.sectionHint}>{hint}</Text>}
      </View>
    </View>
  );
}

function Segment<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { key: T; label: string; dot?: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <View style={styles.segment}>
      {options.map((o) => {
        const selected = o.key === value;
        return (
          <TouchableOpacity
            key={o.key}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            activeOpacity={0.85}
            onPress={() => onChange(o.key)}
            style={[styles.segmentBtn, selected && styles.segmentBtnActive]}
          >
            {o.dot && <View style={[styles.dot, { backgroundColor: o.dot }]} />}
            <Text style={[styles.segmentText, selected && styles.segmentTextActive]}>{o.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export default function ItemCreateScreen({ navigation }: ItemCreateScreenProps) {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { scrollViewRef, onInputFocus } = useScrollToFocusedInput();
  const compactLandscape = Math.min(windowWidth, windowHeight) >= 600 && windowWidth > windowHeight;
  const wide = windowWidth >= 700; // tablet / landscape -> two columns

  // form
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [manualCategory, setManualCategory] = useState('');
  const [foodType, setFoodType] = useState<FoodType>('veg');
  const [priceType, setPriceType] = useState<PriceType>('single');
  const [price1, setPrice1] = useState('');
  const [price2, setPrice2] = useState('');
  const [price3, setPrice3] = useState('');
  const [tax, setTax] = useState<string>('');
  const [hsn, setHsn] = useState('');
  const [remark, setRemark] = useState('');
  const [active, setActive] = useState(true);

  // lookups
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [taxOptions, setTaxOptions] = useState<Tax[]>([]);
  const [loadingLookups, setLoadingLookups] = useState(true);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      Promise.all([getCategories(), getTaxes()])
        .then(([cats, taxes]) => {
          if (!alive) return;
          setCategories(cats.map((c) => ({ id: c.id, name: c.name })));
          setTaxOptions(taxes.filter((t) => t.status === 'active'));
        })
        .catch(() => {})
        .finally(() => alive && setLoadingLookups(false));
      return () => {
        alive = false;
      };
    }, [])
  );

  const resolvedCategory = useMemo(() => {
    if (categoryId !== null) return categoryId;
    const n = Number.parseInt(manualCategory, 10);
    return Number.isFinite(n) ? n : null;
  }, [categoryId, manualCategory]);

  const resetForm = useCallback(() => {
    setName('');
    setCode('');
    setPrice1('');
    setPrice2('');
    setPrice3('');
    setHsn('');
    setRemark('');
    setError(null);
  }, []);

  const validate = (): string | null => {
    if (!name.trim()) return 'Enter the item name.';
    if (resolvedCategory === null) return 'Choose a category.';
    if (!(Number.parseFloat(price1) > 0)) return priceType === 'portion' ? 'Enter the full portion price.' : 'Enter a valid price.';
    return null;
  };

  const save = async () => {
    if (saving) return;
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const created = await createMenuItem({
        session_code: code.trim(),
        name: name.trim(),
        category: resolvedCategory as number,
        status: active ? 'active' : 'inactive',
        food_type: foodType,
        price_type: priceType,
        price_category: 'regular',
        price1: toPrice(price1),
        price2: priceType === 'portion' ? toPrice(price2) || '0.00' : '0.00',
        price3: priceType === 'portion' ? toPrice(price3) || '0.00' : '0.00',
        tax: tax.trim() ? Number.parseInt(tax, 10) : null,
        hsn_code: hsn.trim(),
        remark: remark.trim(),
      });
      Alert.alert('Item created', `“${created.name}” was added to your menu.`, [
        { text: 'Add another', onPress: resetForm },
        { text: 'Done', onPress: () => navigation.goBack() },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the item. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const priceField = (label: string, value: string, setter: (v: string) => void, placeholder = '0.00') => (
    <View style={styles.priceCol}>
      <Text style={styles.subLabel}>{label}</Text>
      <View style={styles.inputWrap}>
        <Text style={styles.rupee}>₹</Text>
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={(t) => {
            setter(t.replace(/[^0-9.]/g, ''));
            setError(null);
          }}
          placeholder={placeholder}
          placeholderTextColor={colors.muted}
          keyboardType="decimal-pad"
          onFocus={onInputFocus}
        />
      </View>
    </View>
  );

  // ---- cards ---------------------------------------------------------------
  const basicsCard = (
    <View style={styles.card}>
      <SectionHead icon="restaurant-outline" title="Basics" hint="Name, code and food type" />

      <Text style={styles.label}>Item name *</Text>
      <View style={styles.inputWrap}>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={(t) => {
            setName(t);
            setError(null);
          }}
          placeholder="e.g. Masala tea"
          placeholderTextColor={colors.muted}
          autoCapitalize="words"
          onFocus={onInputFocus}
        />
      </View>

      <Text style={[styles.label, styles.gap]}>Item code</Text>
      <View style={styles.inputWrap}>
        <TextInput
          style={styles.input}
          value={code}
          onChangeText={setCode}
          placeholder="Optional, e.g. 507"
          placeholderTextColor={colors.muted}
          autoCapitalize="characters"
          onFocus={onInputFocus}
        />
      </View>

      <Text style={[styles.label, styles.gap]}>Food type</Text>
      <Segment
        value={foodType}
        onChange={setFoodType}
        options={[
          { key: 'veg', label: 'Veg', dot: colors.successBright },
          { key: 'non_veg', label: 'Non-veg', dot: colors.error },
        ]}
      />
    </View>
  );

  const categoryCard = (
    <View style={styles.card}>
      <SectionHead icon="pricetags-outline" title="Category *" hint="Where this item appears on the menu" tint={colors.softGreen} />

      {loadingLookups ? (
        <ActivityIndicator style={{ alignSelf: 'flex-start', marginVertical: spacing.sm }} color={colors.ink} />
      ) : (
        <View style={styles.chips}>
          {categories.map((c) => {
            const selected = categoryId === c.id;
            return (
              <TouchableOpacity
                key={c.id}
                activeOpacity={0.85}
                onPress={() => {
                  setCategoryId(selected ? null : c.id);
                  setManualCategory('');
                  setError(null);
                }}
                style={[styles.chip, selected && styles.chipActive]}
              >
                <Text style={[styles.chipText, selected && styles.chipTextActive]}>{c.name}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      <Text style={[styles.subLabel, styles.gap]}>
        {categories.length ? 'Or enter a category ID' : 'Category ID'}
      </Text>
      <View style={styles.inputWrap}>
        <TextInput
          style={styles.input}
          value={manualCategory}
          onChangeText={(t) => {
            setManualCategory(t.replace(/[^0-9]/g, ''));
            setCategoryId(null);
            setError(null);
          }}
          placeholder="e.g. 152"
          placeholderTextColor={colors.muted}
          keyboardType="number-pad"
          onFocus={onInputFocus}
        />
      </View>
    </View>
  );

  const pricingCard = (
    <View style={styles.card}>
      <SectionHead icon="cash-outline" title="Pricing & tax" hint="Single price or portion-wise" />

      <Segment
        value={priceType}
        onChange={setPriceType}
        options={[
          { key: 'single', label: 'Single price' },
          { key: 'portion', label: 'Portions' },
        ]}
      />
      <View style={[styles.priceRow, styles.gap]}>
        {priceField(priceType === 'portion' ? 'Full *' : 'Price *', price1, setPrice1)}
        {priceType === 'portion' && priceField('Half', price2, setPrice2)}
        {priceType === 'portion' && priceField('Quarter', price3, setPrice3)}
      </View>

      <Text style={[styles.label, styles.gap]}>Tax</Text>
      {taxOptions.length > 0 && (
        <View style={styles.chips}>
          {taxOptions.map((t) => {
            const selected = tax === String(t.id);
            return (
              <TouchableOpacity
                key={t.id}
                activeOpacity={0.85}
                onPress={() => setTax(selected ? '' : String(t.id))}
                style={[styles.chip, selected && styles.chipActive]}
              >
                <Text style={[styles.chipText, selected && styles.chipTextActive]}>
                  {t.name} {Number.parseFloat(t.percentage)}%
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
      <View style={[styles.inputWrap, taxOptions.length > 0 && { marginTop: spacing.sm }]}>
        <TextInput
          style={styles.input}
          value={tax}
          onChangeText={(t) => setTax(t.replace(/[^0-9]/g, ''))}
          placeholder="Tax ID (optional)"
          placeholderTextColor={colors.muted}
          keyboardType="number-pad"
          onFocus={onInputFocus}
        />
      </View>

      <Text style={[styles.label, styles.gap]}>HSN code</Text>
      <View style={styles.inputWrap}>
        <TextInput
          style={styles.input}
          value={hsn}
          onChangeText={setHsn}
          placeholder="Optional"
          placeholderTextColor={colors.muted}
          keyboardType="number-pad"
          onFocus={onInputFocus}
        />
      </View>
    </View>
  );

  const extrasCard = (
    <View style={styles.card}>
      <SectionHead icon="create-outline" title="Extras" hint="Notes and visibility" tint={colors.softGreen} />

      <Text style={styles.label}>Remark</Text>
      <View style={[styles.inputWrap, { height: 76, alignItems: 'flex-start' }]}>
        <TextInput
          style={[styles.input, { textAlignVertical: 'top', paddingTop: 10 }]}
          value={remark}
          onChangeText={setRemark}
          placeholder="Optional note"
          placeholderTextColor={colors.muted}
          multiline
          onFocus={onInputFocus}
        />
      </View>

      <View style={[styles.switchRow, styles.gap]}>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>Active</Text>
          <Text style={styles.subLabel}>Inactive items are hidden from the menu</Text>
        </View>
        <Switch
          value={active}
          onValueChange={setActive}
          trackColor={{ true: colors.ink, false: colors.border }}
          thumbColor={colors.white}
        />
      </View>
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
              New item
            </Text>
            <Text style={styles.heroSubtitle} numberOfLines={1}>
              Add a dish or drink to your menu
            </Text>
          </View>

       <MasterDropdown current="items" navigation={navigation} />
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
          contentContainerStyle={[
            styles.content,
            { maxWidth: wide ? 1000 : 640, width: '100%', alignSelf: 'center' },
          ]}
        >
          {wide ? (
            <View style={styles.columns}>
              <View style={styles.column}>
                {basicsCard}
                {categoryCard}
              </View>
              <View style={styles.column}>
                {pricingCard}
                {extrasCard}
              </View>
            </View>
          ) : (
            <>
              {basicsCard}
              {categoryCard}
              {pricingCard}
              {extrasCard}
            </>
          )}
        </ScrollView>

        {/* sticky save bar */}
        <View style={styles.footer}>
          <View style={[styles.footerInner, { maxWidth: wide ? 1000 : 640 }]}>
            {!!error && (
              <View style={styles.errorRow}>
                <Ionicons name="alert-circle" size={15} color={colors.error} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}
            <TouchableOpacity
              style={[styles.saveBtn, saving && { opacity: 0.6 }]}
              onPress={save}
              disabled={saving}
              activeOpacity={0.9}
              accessibilityRole="button"
            >
              {saving ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <Ionicons name="checkmark-circle-outline" size={20} color={colors.white} />
              )}
              <Text style={styles.saveText}>{saving ? 'Saving…' : 'Create item'}</Text>
            </TouchableOpacity>
          </View>
        </View>
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

  // ---- body ----
  content: { flexGrow: 1, padding: spacing.md, paddingBottom: spacing.lg, gap: spacing.md },
  columns: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  column: { flex: 1, gap: spacing.md },

  card: {
    padding: spacing.md + 2,
    borderRadius: radius.lg,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  sectionIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: colors.orange,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: { fontFamily: 'Poppins_700Bold', fontWeight: '700', fontSize: 16, color: colors.ink },
  sectionHint: { fontFamily: 'Poppins_400Regular', fontSize: 11.5, color: colors.inkSoft, marginTop: 1 },

  gap: { marginTop: spacing.md },
  label: { fontFamily: 'Poppins_600SemiBold', fontSize: 13, color: colors.ink, marginBottom: spacing.xs },
  subLabel: { fontFamily: 'Poppins_500Medium', fontSize: 11.5, color: colors.inkSoft, marginBottom: 4 },

  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 46,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  input: { flex: 1, fontFamily: 'Poppins_500Medium', fontSize: 14, color: colors.ink, paddingVertical: 8 },
  rupee: { fontFamily: 'Poppins_600SemiBold', fontSize: 14, color: colors.inkSoft, marginRight: 6 },

  segment: {
    flexDirection: 'row',
    padding: 4,
    gap: 4,
    borderRadius: radius.md,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  segmentBtn: {
    flex: 1,
    height: 40,
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md - 2,
  },
  segmentBtnActive: { backgroundColor: colors.ink },
  segmentText: { fontFamily: 'Poppins_600SemiBold', fontSize: 13, color: colors.ink },
  segmentTextActive: { color: colors.orange },
  dot: { width: 8, height: 8, borderRadius: 4 },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs + 2 },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  chipActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipText: { fontFamily: 'Poppins_500Medium', fontSize: 12.5, color: colors.ink },
  chipTextActive: { color: colors.orange },

  priceRow: { flexDirection: 'row', gap: spacing.sm },
  priceCol: { flex: 1 },

  switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },

  // ---- sticky footer ----
  footer: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  footerInner: { width: '100%', alignSelf: 'center', gap: spacing.xs },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  errorText: { flex: 1, fontFamily: 'Poppins_500Medium', fontSize: 12.5, color: colors.error },
  saveBtn: {
    alignSelf: 'center',
    minWidth: 150,
    paddingHorizontal: spacing.md,
    height: 50,
    borderRadius: radius.md,
    backgroundColor: colors.ink,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveText: { fontFamily: 'Poppins_600SemiBold', fontSize: 14.5, color: colors.white },
});