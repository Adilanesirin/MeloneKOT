// src/components/MasterDropdown.tsx
import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, radius, shadow, spacing, withAlpha } from '../constants/theme';

export type MasterKey = 'items' | 'categories' | 'taxes' | 'tables';

const MASTERS: { key: MasterKey; title: string; route: string; icon: keyof typeof MaterialCommunityIcons.glyphMap }[] = [
  { key: 'items', title: 'Item Master', route: 'ItemCreate', icon: 'food-fork-drink' },
  { key: 'categories', title: 'Category Master', route: 'CategoryCreate', icon: 'shape-outline' },
  { key: 'taxes', title: 'Tax Master', route: 'TaxCreate', icon: 'percent-outline' },
  { key: 'tables', title: 'Table Master', route: 'TableMaster', icon: 'table-chair' },
];

export default function MasterDropdown({ current, navigation }: { current: MasterKey; navigation: any }) {
  const [open, setOpen] = useState(false);
  const active = MASTERS.find((m) => m.key === current)!;

  const pick = (m: (typeof MASTERS)[number]) => {
    setOpen(false);
    if (m.key === current) return;
    setTimeout(() => navigation.replace(m.route), 60); // replace = back still returns to Tables
  };

  return (
    <>
        <TouchableOpacity
        style={styles.badge}
        activeOpacity={0.85}
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`${active.title}, switch master`}
      >
      <MaterialCommunityIcons name="view-grid" size={25} color={colors.ink} />
        <Ionicons name="chevron-down" size={16} color={colors.ink} />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={styles.backdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} />
          <View style={[styles.sheet, shadow.card]}>
            <Text style={styles.sheetTitle}>Masters</Text>
            {MASTERS.map((m) => {
              const sel = m.key === current;
              return (
                <TouchableOpacity
                  key={m.key}
                  style={[styles.row, sel && styles.rowActive]}
                  activeOpacity={0.85}
                  onPress={() => pick(m)}
                >
                  <MaterialCommunityIcons name={m.icon} size={20} color={colors.ink} />
                  <Text style={styles.rowText}>{m.title}</Text>
                  {sel && <Ionicons name="checkmark" size={18} color={colors.ink} />}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  badge: {
    height: 38,
    paddingHorizontal: 10,
    borderRadius: 19,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: colors.orange,
    borderWidth: 1,
    borderColor: withAlpha(colors.white, 0.35),
  },
  backdrop: { flex: 1, backgroundColor: withAlpha(colors.inkDeep, 0.45), alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg },
  sheet: { width: '100%', maxWidth: 340, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md },
  sheetTitle: { fontFamily: 'Poppins_600SemiBold', fontSize: 15, color: colors.ink, marginBottom: spacing.sm, paddingHorizontal: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 50, paddingHorizontal: spacing.sm, borderRadius: radius.md },
  rowActive: { backgroundColor: colors.badgeBg },
  rowText: { flex: 1, fontFamily: 'Poppins_600SemiBold', fontSize: 14.5, color: colors.ink },
});