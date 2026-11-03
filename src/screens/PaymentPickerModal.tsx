import React from 'react';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, shadow, spacing, withAlpha } from '../constants/theme';
import { usePaymentMethods, methodLabel, methodIcon } from '../hooks/usePaymentMethods';

interface Props {
  visible: boolean;
  onClose: () => void;
  onConfirm: (method: string) => void;
}

export default function PaymentPickerModal({ visible, onClose, onConfirm }: Props) {
  const { methods, selected, setSelected } = usePaymentMethods(visible);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.card, shadow.card]}>
          <Text style={styles.title}>Payment method</Text>
          <Text style={styles.hint}>Choose how the customer paid</Text>

          <View style={styles.options}>
            {methods.map((m) => {
              const label = methodLabel(m);
              const active = selected === label;
              return (
                <TouchableOpacity
                  key={`${m.id}-${m.code}`}
                  onPress={() => setSelected(label)}
                  style={[styles.option, active && styles.optionActive]}
                >
                  <Ionicons name={methodIcon(label) as any} size={18} color={active ? colors.ink : colors.inkSoft} />
                  <Text style={[styles.optionText, active && styles.optionTextActive]}>{label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.actions}>
            <TouchableOpacity style={styles.cancel} onPress={onClose} activeOpacity={0.85}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.confirm} onPress={() => onConfirm(selected || 'CASH')} activeOpacity={0.9}>
              <Text style={styles.confirmText}>Complete sale</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: withAlpha(colors.inkDeep, 0.45), alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg },
  card: { width: '100%', maxWidth: 360, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg },
  title: { fontFamily: 'Fraunces_600SemiBold', fontSize: 19, color: colors.ink },
  hint: { fontFamily: 'Inter_400Regular', fontSize: 12.5, color: colors.inkSoft, marginTop: 2, marginBottom: spacing.md },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  option: { flexGrow: 1, flexBasis: '30%', minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.background },
  optionActive: { borderColor: colors.ink, backgroundColor: colors.badgeBg },
  optionText: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: colors.inkSoft },
  optionTextActive: { color: colors.ink },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  cancel: { flex: 1, height: 46, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },
  cancelText: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: colors.ink },
  confirm: { flex: 1.4, height: 46, borderRadius: radius.md, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  confirmText: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: colors.orange },
});