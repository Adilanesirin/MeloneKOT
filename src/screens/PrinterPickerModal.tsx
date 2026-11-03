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
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, spacing, radius, shadow, withAlpha } from '../constants/theme';
import {
  SavedPrinter,
  listPairedPrinters,
  getSavedPrinter,
  savePrinter,
  clearPrinter,
  printTestPage,
  savePaperWidth,
} from '../utils/printer';
import { PaperWidth } from '../utils/receipt';

interface Props {
  visible: boolean;
  onClose: () => void;
}

const PrinterPickerModal: React.FC<Props> = ({ visible, onClose }) => {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const compactLandscape = Math.min(windowWidth, windowHeight) >= 600 && windowWidth > windowHeight;
  const [printers, setPrinters] = useState<SavedPrinter[]>([]);
  const [selected, setSelected] = useState<SavedPrinter | null>(null);
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [paperWidth, setPaperWidth] = useState<PaperWidth>(2);

  const load = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const saved = await getSavedPrinter();
      setSelected(saved);
      setPaperWidth(saved?.paperWidth === 3 || saved?.paperWidth === 4 || saved?.paperWidth === 5 ? saved.paperWidth : 2);
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
    const next = { ...p, paperWidth };
    await savePrinter(next);
    setSelected(next);
    setMessage(null);
  };

  const chooseWidth = async (width: PaperWidth) => {
    setPaperWidth(width);
    if (selected) {
      const next = { ...selected, paperWidth: width };
      await savePaperWidth(width);
      setSelected(next);
    }
  };

  const remove = async (printer: SavedPrinter) => {
    if (selected?.address !== printer.address) return;
    await clearPrinter();
    setSelected(null);
    setMessage('Saved printer removed. To unpair it from Bluetooth, use your phone settings.');
  };

  const test = async () => {
    setTesting(true);
    setMessage(null);
    const res = await printTestPage();
    setMessage(res.ok ? 'Print command sent. Check the printer for the test slip.' : res.message);
    setTesting(false);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close printer picker" />
        <View style={[styles.dialog, compactLandscape && styles.dialogCompact, shadow.card, { maxHeight: windowHeight * (compactLandscape ? 0.98 : 0.92) }]}>
          <View style={[styles.header, compactLandscape && styles.headerCompact]}>
            <Text style={[styles.title, compactLandscape && styles.titleCompact]}>Bluetooth printer</Text>
            <TouchableOpacity onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={20} color={colors.ink} />
            </TouchableOpacity>
          </View>
          <Text style={[styles.hint, compactLandscape && styles.hintCompact]}>
            Pair the printer in your phone's Bluetooth settings first, then pick it here.
          </Text>

          {loading ? (
            <ActivityIndicator style={{ marginVertical: spacing.lg }} color={colors.ink} />
          ) : (
            <FlatList
              data={printers}
              keyExtractor={(p) => p.address}
              style={{ maxHeight: Math.min(windowHeight * 0.28, 300) }}
              ListEmptyComponent={
                <Text style={styles.empty}>No paired Bluetooth devices found.</Text>
              }
              renderItem={({ item }) => {
                const active = selected?.address === item.address;
                return (
                  <View style={[styles.row, active && styles.rowActive]}>
                    <TouchableOpacity
                      style={styles.rowSelect}
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
                    {active && (
                      <TouchableOpacity
                        style={styles.removeButton}
                        accessibilityRole="button"
                        accessibilityLabel={`Remove ${item.name} as the saved printer`}
                        hitSlop={8}
                        onPress={() => remove(item)}
                      >
                        <Ionicons name="trash-outline" size={19} color={colors.white} />
                      </TouchableOpacity>
                    )}
                  </View>
                );
              }}
            />
          )}

          <Text style={styles.widthTitle}>Receipt paper width</Text>
          <Text style={styles.widthHint}>Choose the roll fitted in your printer.</Text>
          <View style={styles.widthOptions}>
            {([2, 3, 4, 5] as PaperWidth[]).map((width) => {
              const active = paperWidth === width;
              const labels: Record<PaperWidth, string> = { 2: '2″ · 58mm', 3: '3″ · 80mm', 4: '4″ · 102mm', 5: '5″ · 127mm' };
              return (
                <TouchableOpacity
                  key={width}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  style={[styles.widthOption, active && styles.widthOptionActive]}
                  onPress={() => chooseWidth(width)}
                  activeOpacity={0.85}
                >
                  <Ionicons name={active ? 'radio-button-on' : 'radio-button-off'} size={17} color={active ? colors.white : colors.inkSoft} />
                  <Text style={[styles.widthOptionText, active && styles.rowTextActive]}>{labels[width]}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

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

        </View>
      </View>
    </Modal>
  );
};

export default PrinterPickerModal;

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: withAlpha(colors.inkDeep, 0.45),
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
  dialogCompact: { maxWidth: 500, padding: spacing.md },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerCompact: { marginBottom: 0 },
  title: { fontFamily: 'Fraunces_600SemiBold', fontSize: 18, color: colors.ink },
  titleCompact: { fontSize: 16 },
  hint: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12.5,
    color: colors.inkSoft,
    marginTop: 4,
    marginBottom: spacing.md,
  },
  hintCompact: { marginBottom: spacing.xs },
  empty: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: colors.muted,
    textAlign: 'center',
    paddingVertical: spacing.lg,
  },
  widthTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: colors.ink, marginTop: spacing.md },
  widthHint: { fontFamily: 'Inter_400Regular', fontSize: 11.5, color: colors.inkSoft, marginTop: 2, marginBottom: spacing.sm },
  widthOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  widthOption: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 8, paddingHorizontal: 9, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background },
  widthOptionActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  widthOptionText: { fontFamily: 'Inter_500Medium', fontSize: 11.5, color: colors.ink },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
    backgroundColor: colors.background,
  },
  rowSelect: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md },
  removeButton: { padding: spacing.md },
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
});
