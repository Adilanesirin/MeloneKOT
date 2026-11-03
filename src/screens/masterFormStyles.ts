// src/screens/masterFormStyles.ts
import { StyleSheet } from 'react-native';
import { colors, radius, spacing } from '../constants/theme';

export const formStyles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  header: {
    minHeight: 70,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.sm,
  },
  headerCompact: { minHeight: 44, paddingHorizontal: spacing.sm },
  iconButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  headerText: { flex: 1 },
  title: { fontFamily: 'Poppins_700Bold', fontSize: 21, color: colors.ink },
  titleCompact: { fontSize: 18 },
  subtitle: { fontFamily: 'Poppins_400Regular', fontSize: 12, color: colors.inkSoft, marginTop: 2 },
  subtitleCompact: { fontSize: 10, marginTop: 0 },

  content: { padding: spacing.lg, paddingBottom: spacing.xl * 2, gap: spacing.md },
  card: {
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
  },
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
  suffix: { fontFamily: 'Poppins_600SemiBold', fontSize: 14, color: colors.inkSoft, marginLeft: 6 },

  switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },

  error: { textAlign: 'center', color: colors.error, fontFamily: 'Poppins_500Medium', fontSize: 12.5 },
  success: { textAlign: 'center', color: colors.ink, fontFamily: 'Poppins_500Medium', fontSize: 12.5 },
  saveBtn: {
    height: 52,
    borderRadius: radius.md,
    backgroundColor: colors.ink,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveText: { fontFamily: 'Poppins_600SemiBold', fontSize: 14.5, color: colors.white },

  listHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  count: { fontFamily: 'Poppins_600SemiBold', fontSize: 12, color: colors.inkSoft },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  listName: { flex: 1, fontFamily: 'Poppins_600SemiBold', fontSize: 14, color: colors.ink },
  listMeta: { fontFamily: 'Poppins_500Medium', fontSize: 12.5, color: colors.inkSoft },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, backgroundColor: colors.background },
  badgeText: { fontFamily: 'Poppins_600SemiBold', fontSize: 10.5, color: colors.inkSoft },
  empty: { fontFamily: 'Poppins_400Regular', fontSize: 13, color: colors.muted, textAlign: 'center', paddingVertical: spacing.md },
});
