import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Platform, RefreshControl, ScrollView,
  StatusBar, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View, useWindowDimensions,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, gradients, radius, spacing, withAlpha } from '../constants/theme';
import MasterDropdown from '../components/MasterDropdown';
import { TableMasterScreenProps } from '../navigation/AppNavigator';
import { createMasterTable, CreateMasterTableInput, getMasterTables, MasterTable } from '../services/api';
import { readLocalCollection, writeLocalCollection } from '../services/localCache';
import { useScrollToFocusedInput } from '../hooks/useScrollToFocusedInput';

type HeaderFoodIcon = {
  name: keyof typeof MaterialCommunityIcons.glyphMap;
  left: string;
  top: string;
  size: number;
  rotate: string;
  color: string;
};

const HEADER_FOOD_ICONS: HeaderFoodIcon[] = [
  { name: 'pizza', left: '4%', top: '55%', size: 24, rotate: '-16deg', color: withAlpha(colors.white, 0.16) },
  { name: 'coffee', left: '20%', top: '4%', size: 20, rotate: '10deg', color: withAlpha(colors.orange, 0.28) },
  { name: 'hamburger', left: '36%', top: '58%', size: 22, rotate: '8deg', color: withAlpha(colors.white, 0.14) },
  { name: 'ice-cream', left: '50%', top: '0%', size: 22, rotate: '-12deg', color: withAlpha(colors.white, 0.16) },
  { name: 'noodles', left: '62%', top: '60%', size: 24, rotate: '14deg', color: withAlpha(colors.orange, 0.26) },
  { name: 'food-drumstick', left: '74%', top: '2%', size: 22, rotate: '-20deg', color: withAlpha(colors.white, 0.15) },
  { name: 'cupcake', left: '86%', top: '55%', size: 22, rotate: '12deg', color: withAlpha(colors.white, 0.15) },
  { name: 'fish', left: '93%', top: '4%', size: 20, rotate: '-8deg', color: withAlpha(colors.orange, 0.24) },
];

export default function TableMasterScreen({ navigation }: TableMasterScreenProps) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { scrollViewRef, onInputFocus } = useScrollToFocusedInput();
  const wide = width >= 700;
  const [tableNumber, setTableNumber] = useState('');
  const [tableName, setTableName] = useState('');
  const [capacity, setCapacity] = useState('4');
  const [floor, setFloor] = useState('');
  const [tableType, setTableType] = useState<'sharing' | 'private'>('sharing');
  const [isAc, setIsAc] = useState(true);
  const [active, setActive] = useState(true);
  const [tables, setTables] = useState<MasterTable[]>([]);
  const [selectedFloor, setSelectedFloor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const floors = useMemo(() => Array.from(new Set(tables.map((table) => (table.floor ?? '').trim()).filter(Boolean)).values()).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })), [tables]);
  const visibleTables = useMemo(() => selectedFloor === null ? tables : tables.filter((table) => (table.floor ?? '').trim() === selectedFloor), [tables, selectedFloor]);
  useEffect(() => {
    if (selectedFloor !== null && !floors.includes(selectedFloor)) setSelectedFloor(null);
  }, [floors, selectedFloor]);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    const cached = await readLocalCollection<MasterTable>('table_master');
    if (cached?.length) {
      setTables(cached);
      setLoading(false);
    }
    try {
      const rows = await getMasterTables();
      setTables(rows.sort((a, b) => a.table_number.localeCompare(b.table_number, undefined, { numeric: true })));
      void writeLocalCollection('table_master', rows, (table) => table.id);
      setError('');
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load tables.'); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    const number = tableNumber.trim();
    const name = tableName.trim();
    const seats = Number(capacity);
    setNotice('');
        if (!number || !name || !Number.isInteger(seats) || seats < 1) {
      setError('Enter a table number, name, and a capacity of at least 1.'); return;
    }
    if (tables.some((t) => t.table_number.trim().toLowerCase() === number.toLowerCase())) {
      setError('That table number already exists.'); return;
    }
    setSaving(true); setError('');
    try {
      const payload: CreateMasterTableInput = { table_number: number, table_name: name, capacity: seats, table_type: tableType, floor: floor.trim(), is_ac: isAc, status: active ? 'active' : 'inactive' };
      const created = await createMasterTable(payload);
      setTables((prev) => [...prev, created].sort((a, b) => a.table_number.localeCompare(b.table_number, undefined, { numeric: true })));
      void writeLocalCollection('table_master', [...tables, created], (table) => table.id);
      setNotice(`Table ${created.table_number} was added.`);
      setTableNumber(''); setTableName(''); setCapacity('4');
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not create table.'); }
    finally { setSaving(false); }
  };

  const field = (label: string, value: string, change: (v: string) => void, placeholder: string, numeric = false) => (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputWrap}><TextInput value={value} onChangeText={change} placeholder={placeholder} placeholderTextColor={colors.muted} style={styles.input} keyboardType={numeric ? 'number-pad' : 'default'} onFocus={onInputFocus} /></View>
    </View>
  );

  return (
    <SafeAreaView style={styles.root} edges={['left', 'right', 'bottom']}>
      <StatusBar barStyle="light-content" />
      <LinearGradient colors={gradients.button} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.hero, { paddingTop: insets.top + spacing.sm }]}>
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          {HEADER_FOOD_ICONS.map((food, index) => (
            <MaterialCommunityIcons
              key={`${food.name}-${index}`}
              name={food.name}
              size={food.size}
              color={food.color}
              style={{
                position: 'absolute',
                left: food.left as any,
                top: food.top as any,
                transform: [{ rotate: food.rotate }],
              }}
            />
          ))}
        </View>
        <TouchableOpacity onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Back" style={styles.back}><Ionicons name="chevron-back" size={20} color={colors.white} /></TouchableOpacity>
        <View style={{ flex: 1 }}><Text style={styles.heroTitle}>Table Master</Text><Text style={styles.heroSub}>Set up your dining floor</Text></View>
        <MasterDropdown current="tables" navigation={navigation} />
       </LinearGradient> 
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView ref={scrollViewRef} removeClippedSubviews={false} scrollEnabled nestedScrollEnabled keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.ink} />} contentContainerStyle={[styles.content, { maxWidth: wide ? 1000 : 640 }, wide && styles.wide]}>
          <View style={[styles.card, wide && styles.cardWide]}>
            <View style={styles.cardHead}><View style={styles.cardIcon}><Ionicons name="add" size={20} color={colors.ink} /></View><View><Text style={styles.cardTitle}>Add a table</Text><Text style={styles.cardSub}>Enter the table details</Text></View></View>
            <View style={wide ? styles.fieldRow : undefined}>
              {field('Table number', tableNumber, setTableNumber, 'e.g. 9', true)}
              {field('Table name', tableName, setTableName, 'e.g. Patio')}
            </View>
            <View style={wide ? styles.fieldRow : undefined}>
              {field('Capacity', capacity, setCapacity, 'Seats', true)}
              {field('Floor (optional)', floor, setFloor, 'e.g. 1')}
            </View>
            <Text style={[styles.label, { marginTop: spacing.md }]}>Table type</Text>
            <View style={styles.options}>{(['sharing', 'private'] as const).map((type) => <TouchableOpacity key={type} onPress={() => setTableType(type)} style={[styles.option, tableType === type && styles.optionActive]}><Text style={[styles.optionText, tableType === type && styles.optionTextActive]}>{type === 'sharing' ? 'Sharing' : 'Private'}</Text></TouchableOpacity>)}</View>
            <View style={styles.switchRow}><View style={{ flex: 1 }}><Text style={styles.switchTitle}>Air conditioned</Text><Text style={styles.switchHint}>This table is in an AC area</Text></View><Switch value={isAc} onValueChange={setIsAc} trackColor={{ true: colors.ink, false: colors.border }} thumbColor={colors.white} /></View>
            <View style={[styles.switchRow, styles.switchBorder]}><View style={{ flex: 1 }}><Text style={styles.switchTitle}>Active</Text><Text style={styles.switchHint}>Inactive tables are hidden from service</Text></View><Switch value={active} onValueChange={setActive} trackColor={{ true: colors.ink, false: colors.border }} thumbColor={colors.white} /></View>
            {!!error && <Text style={styles.error}>{error}</Text>}{!!notice && <Text style={styles.notice}>{notice}</Text>}
            <TouchableOpacity onPress={save} disabled={saving} style={[styles.save, saving && { opacity: 0.7 }]}>{saving ? <ActivityIndicator color={colors.white} /> : <Ionicons name="checkmark-circle-outline" size={20} color={colors.white} />}<Text style={styles.saveText}>{saving ? 'Saving…' : 'Create table'}</Text></TouchableOpacity>
          </View>
          <View style={[styles.card, wide && styles.cardWide]}>
            <View style={styles.cardHead}><View style={[styles.cardIcon, { backgroundColor: colors.softGreen }]}><Ionicons name="grid-outline" size={18} color={colors.ink} /></View><Text style={[styles.cardTitle, { flex: 1 }]}>Existing tables</Text><View style={styles.count}><Text style={styles.countText}>{visibleTables.length}</Text></View></View>
            {tables.length > 0 && <View style={styles.floorFilter}>
              <Text style={styles.floorLabel}>Show tables by floor</Text>
              <View style={styles.floorOptions}>
                <TouchableOpacity accessibilityRole="button" accessibilityState={{ selected: selectedFloor === null }} onPress={() => setSelectedFloor(null)} style={[styles.floorChip, selectedFloor === null && styles.floorChipActive]}><Text style={[styles.floorChipText, selectedFloor === null && styles.floorChipTextActive]}>All</Text></TouchableOpacity>
                {floors.map((floorName) => <TouchableOpacity key={floorName} accessibilityRole="button" accessibilityState={{ selected: selectedFloor === floorName }} onPress={() => setSelectedFloor(floorName)} style={[styles.floorChip, selectedFloor === floorName && styles.floorChipActive]}><Text style={[styles.floorChipText, selectedFloor === floorName && styles.floorChipTextActive]}>Floor {floorName}</Text></TouchableOpacity>)}
              </View>
            </View>}
            {loading ? <ActivityIndicator color={colors.ink} style={{ marginVertical: spacing.lg }} /> : error && tables.length === 0 ? <TouchableOpacity onPress={() => load()}><Text style={styles.error}>{error} Tap to retry.</Text></TouchableOpacity> : tables.length === 0 ? <Text style={styles.empty}>No tables yet. Add your first one.</Text> : visibleTables.length === 0 ? <Text style={styles.empty}>No tables on Floor {selectedFloor}.</Text> : visibleTables.map((table, i) => <View key={table.id} style={[styles.row, i > 0 && styles.rowDivider]}><View style={styles.number}><Text style={styles.numberText}>{table.table_number}</Text></View><View style={{ flex: 1 }}><Text style={styles.rowName} numberOfLines={1}>{table.table_name}</Text><Text style={styles.rowMeta}>Floor {table.floor} · {table.capacity} seats · {table.table_type}</Text></View><View style={[styles.status, table.status === 'active' ? styles.statusActive : styles.statusInactive]}><Text style={[styles.statusText, table.status === 'active' ? { color: colors.success } : { color: colors.muted }]}>{table.status.toUpperCase()}</Text></View></View>)}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  hero: { minHeight: 94, paddingHorizontal: spacing.md, paddingBottom: spacing.md, borderBottomLeftRadius: 22, borderBottomRightRadius: 22, overflow: 'hidden', flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  back: { width: 38, height: 38, borderRadius: 12, backgroundColor: withAlpha(colors.white, 0.14), borderWidth: 1, borderColor: withAlpha(colors.white, 0.22), alignItems: 'center', justifyContent: 'center' },
  heroTitle: { fontFamily: 'Poppins_700Bold', fontWeight: '700', fontSize: 22, color: colors.white }, heroSub: { fontFamily: 'Poppins_400Regular', fontSize: 12, color: withAlpha(colors.white, 0.78), marginTop: 1 },
  counter: { alignItems: 'center', minWidth: 52 }, counterNum: { fontFamily: 'Poppins_700Bold', fontSize: 24, color: colors.orange }, counterLabel: { fontFamily: 'Poppins_600SemiBold', fontSize: 8.5, letterSpacing: 1, color: withAlpha(colors.white, 0.85) },
  content: { flexGrow: 1, width: '100%', alignSelf: 'center', padding: spacing.lg, paddingBottom: spacing.xl * 2, gap: spacing.md }, wide: { flexDirection: 'row', alignItems: 'flex-start' },
  card: { padding: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border }, cardWide: { flex: 1 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md }, cardIcon: { width: 36, height: 36, borderRadius: 12, backgroundColor: colors.orange, alignItems: 'center', justifyContent: 'center' }, cardTitle: { fontFamily: 'Poppins_700Bold', fontWeight: '700', fontSize: 17, color: colors.ink }, cardSub: { fontFamily: 'Poppins_400Regular', fontSize: 12, color: colors.inkSoft, marginTop: 1 },
  fieldRow: { flexDirection: 'row', gap: spacing.md }, field: { flex: 1, marginTop: spacing.md }, label: { fontFamily: 'Poppins_600SemiBold', fontSize: 13, color: colors.ink, marginBottom: spacing.xs }, inputWrap: { minHeight: 48, justifyContent: 'center', paddingHorizontal: spacing.md, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.background }, input: { fontFamily: 'Poppins_500Medium', fontSize: 14.5, color: colors.ink, paddingVertical: 10 },
  options: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs }, option: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 18, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background }, optionActive: { backgroundColor: colors.ink, borderColor: colors.ink }, optionText: { fontFamily: 'Poppins_600SemiBold', fontSize: 12.5, color: colors.ink }, optionTextActive: { color: colors.orange },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingTop: spacing.md }, switchBorder: { borderTopWidth: 1, borderTopColor: colors.border, marginTop: spacing.md }, switchTitle: { fontFamily: 'Poppins_600SemiBold', fontSize: 13, color: colors.ink }, switchHint: { fontFamily: 'Poppins_400Regular', fontSize: 11.5, color: colors.inkSoft, marginTop: 2 },
  save: { marginTop: spacing.md, height: 50, borderRadius: radius.md, backgroundColor: colors.ink, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' }, saveText: { fontFamily: 'Poppins_600SemiBold', fontSize: 14.5, color: colors.white }, error: { color: colors.error, fontFamily: 'Poppins_500Medium', fontSize: 12.5, marginTop: spacing.md }, notice: { color: colors.ink, fontFamily: 'Poppins_500Medium', fontSize: 12.5, marginTop: spacing.md },
  count: { minWidth: 32, height: 26, paddingHorizontal: 10, borderRadius: 13, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }, countText: { fontFamily: 'Poppins_600SemiBold', fontSize: 12, color: colors.ink }, empty: { fontFamily: 'Poppins_400Regular', fontSize: 13, color: colors.muted, textAlign: 'center', paddingVertical: spacing.md },
  floorFilter: { gap: spacing.xs, marginBottom: spacing.sm }, floorLabel: { fontFamily: 'Poppins_600SemiBold', fontSize: 12, color: colors.inkSoft }, floorOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }, floorChip: { paddingVertical: 7, paddingHorizontal: 12, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background }, floorChipActive: { backgroundColor: colors.ink, borderColor: colors.ink }, floorChipText: { fontFamily: 'Poppins_600SemiBold', fontSize: 11.5, color: colors.ink }, floorChipTextActive: { color: colors.orange },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 10, paddingHorizontal: 4 }, rowDivider: { borderTopWidth: 1, borderTopColor: colors.border }, number: { width: 34, height: 34, borderRadius: 11, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }, numberText: { fontFamily: 'Poppins_700Bold', fontSize: 13, color: colors.ink }, rowName: { fontFamily: 'Poppins_600SemiBold', fontSize: 14, color: colors.ink }, rowMeta: { fontFamily: 'Poppins_400Regular', fontSize: 11.5, color: colors.inkSoft, marginTop: 2 }, status: { paddingVertical: 4, paddingHorizontal: 8, borderRadius: 10 }, statusActive: { backgroundColor: colors.successBackground }, statusInactive: { backgroundColor: colors.background }, statusText: { fontFamily: 'Poppins_600SemiBold', fontSize: 9, letterSpacing: 0.6 },
});