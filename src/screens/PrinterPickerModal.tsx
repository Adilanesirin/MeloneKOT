// src/screens/PrinterPickerModal.tsx
// Lets the waiter/cashier choose which paired Bluetooth printer to use, and
// send a test slip. Pair the printer first in Android Settings > Bluetooth.

import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Pressable,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, spacing, radius, shadow } from '../constants/theme';
import {
  SavedPrinter,
  listPairedPrinters,
  getSavedPrinter,
  savePrinter,
  clearPrinter,
  printTestPage,
} from '../utils/printer';

interface Props {
  visible: boolean;
  onClose: () => void;
}

const PrinterPickerModal: React.FC<Props> = ({ visible, onClose }) => {
  const [printers, setPrinters] = useState<SavedPrinter[]>([]);
  const [selected, setSelected] = useState<SavedPrinter | null>(null);
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      setSelected(await getSavedPrinter());
      setPrinters(await listPairedPrinters());
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not list printers.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (visible) load();
  }, [visible, load]);

  const choose = async (p: SavedPrinter) => {
    await savePrinter(p);
    setSelected(p);
    setMessage(null);
  };

  const remove = async () => {
    await clearPrinter();
    setSelected(null);
  };

  const test = async () => {
    setTesting(true);
    setMessage(null);
    const res = await printTestPage();
    setMessage(res.ok ? 'Test slip sent.' : res.message);
    setTesting(false);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.dialog, shadow.card]} onPress={() => {}}>
          <View style={styles.header}>
            <Text style={styles.title}>Bluetooth printer</Text>
            <TouchableOpacity onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={20} color={colors.ink} />
            </TouchableOpacity>
          </View>
          <Text style={styles.hint}>
            Pair the printer in your phone's Bluetooth settings first, then pick it here.
          </Text>

          {loading ? (
            <ActivityIndicator style={{ marginVertical: spacing.lg }} color={colors.ink} />
          ) : (
            <FlatList
              data={printers}
              keyExtractor={(p) => p.address}
              style={{ maxHeight: 260 }}
              ListEmptyComponent={
                <Text style={styles.empty}>No paired Bluetooth devices found.</Text>
              }
              renderItem={({ item }) => {
                const active = selected?.address === item.address;
                return (
                  <TouchableOpacity
                    style={[styles.row, active && styles.rowActive]}
                    activeOpacity={0.85}
                    onPress={() => choose(item)}
                  >
                    <Ionicons name="print-outline" size={18} color={active ? colors.white : colors.ink} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.rowName, active && styles.rowTextActive]} numberOfLines={1}>
                        {item.name}
                      </Text>
                      <Text style={[styles.rowAddr, active && styles.rowTextActive]}>{item.address}</Text>
                    </View>
                    {active && <Ionicons name="checkmark-circle" size={18} color={colors.white} />}
                  </TouchableOpacity>
                );
              }}
            />
          )}

          {message && <Text style={styles.message}>{message}</Text>}

          <View style={styles.actions}>
            <TouchableOpacity style={styles.secondaryBtn} onPress={load} activeOpacity={0.85}>
              <Ionicons name="refresh" size={16} color={colors.ink} />
              <Text style={styles.secondaryText}>Refresh</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.primaryBtn, !selected && { opacity: 0.4 }]}
              disabled={!selected || testing}
              onPress={test}
              activeOpacity={0.85}
            >
              {testing ? (
                <ActivityIndicator color={colors.white} size="small" />
              ) : (
                <Text style={styles.primaryText}>Test print</Text>
              )}
            </TouchableOpacity>
          </View>

          {selected && (
            <TouchableOpacity onPress={remove} style={{ alignSelf: 'center', marginTop: spacing.sm }}>
              <Text style={styles.removeText}>Remove selected printer</Text>
            </TouchableOpacity>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
};

export default PrinterPickerModal;

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(22,58,46,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  dialog: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontFamily: 'Fraunces_600SemiBold', fontSize: 18, color: colors.ink },
  hint: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12.5,
    color: colors.inkSoft,
    marginTop: 4,
    marginBottom: spacing.md,
  },
  empty: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: colors.muted,
    textAlign: 'center',
    paddingVertical: spacing.lg,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
    backgroundColor: colors.background,
  },
  rowActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  rowName: { fontFamily: 'Inter_600SemiBold', fontSize: 13.5, color: colors.ink },
  rowAddr: { fontFamily: 'Inter_400Regular', fontSize: 11.5, color: colors.muted, marginTop: 2 },
  rowTextActive: { color: colors.white },
  message: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12.5,
    color: colors.inkSoft,
    marginTop: spacing.sm,
  },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  secondaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  secondaryText: { fontFamily: 'Inter_600SemiBold', fontSize: 13.5, color: colors.ink },
  primaryBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.ink,
  },
  primaryText: { fontFamily: 'Inter_600SemiBold', fontSize: 13.5, color: colors.white },
  removeText: { fontFamily: 'Inter_500Medium', fontSize: 12.5, color: colors.error },
});