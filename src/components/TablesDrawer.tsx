import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  TouchableOpacity,
  Animated,
  Easing,
  ScrollView,
  StyleSheet,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing, radius, shadow, withAlpha } from '../constants/theme';

export type DrawerModule = 'kot' | 'sales' | 'pending' | 'reports' | 'masters';
interface TablesDrawerProps {
  visible: boolean;
  onClose: () => void;
  active: DrawerModule;
  userName: string;
  onSelectModule: (module: DrawerModule) => void;
  onOpenSettings: () => void;
    onLogout: () => void;
}

const MODULES: {
  key: DrawerModule;
  title: string;
  hint: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
}[] = [
  { key: 'kot', title: 'KOT', hint: 'Take table orders', icon: 'silverware-fork-knife' },
  { key: 'sales', title: 'Sales', hint: 'Bill tables and sell', icon: 'cash-register' },
  { key: 'pending', title: 'Pending invoice', hint: 'Pending KOTs to bill', icon: 'receipt-text-clock-outline' },
    { key: 'reports', title: 'Reports', hint: 'KOT and sales reports', icon: 'chart-box-outline' },
  { key: 'masters', title: 'Masters', hint: 'Items, categories, taxes, tables', icon: 'database-cog-outline' },
];

const getInitials = (name: string) => {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] || '';
  const second = parts.length > 1 ? parts[1][0] : parts[0]?.[1] || '';
  return (first + second).toUpperCase();
};

const TablesDrawer: React.FC<TablesDrawerProps> = ({
  visible,
  onClose,
  active,
  userName,
  onSelectModule,
  onOpenSettings,
   onLogout,
}) => {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const panelWidth = Math.min(width * 0.82, 320);

  // keep the Modal mounted until the close animation has finished
  const [mounted, setMounted] = useState(visible);
  const progress = useRef(new Animated.Value(0)).current;

  // Actions (open settings, switch module) must wait until this Modal is fully
  // dismissed, otherwise iOS cannot present the next Modal and touches get stuck.
  const pendingAction = useRef<(() => void) | null>(null);
  const runPending = () => {
    const action = pendingAction.current;
    pendingAction.current = null;
    action?.();
  };
  const closeThen = (action: () => void) => {
    pendingAction.current = action;
    onClose();
  };

  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.timing(progress, {
        toValue: 1,
        duration: 260,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    } else if (mounted) {
      Animated.timing(progress, {
        toValue: 0,
        duration: 200,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) {
          setMounted(false);
          // iOS fires Modal onDismiss instead; Android has no such callback
          if (Platform.OS !== 'ios') setTimeout(runPending, 50);
        }
      });
    }
  }, [visible]);

  const translateX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [-panelWidth, 0],
  });

  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
      onDismiss={runPending}
    >
      <View style={styles.root}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: progress }]}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={onClose}
            accessibilityLabel="Close menu"
          />
        </Animated.View>

        <Animated.View
          style={[
            styles.panel,
            shadow.card,
            {
              width: panelWidth,
              paddingTop: insets.top + spacing.lg,
              paddingBottom: Math.max(insets.bottom, spacing.lg),
              transform: [{ translateX }],
            },
          ]}
        >
          {/* header */}
          <View style={styles.header}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{getInitials(userName) || '•'}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.name} numberOfLines={1}>{userName.toUpperCase()}</Text>
              <Text style={styles.subtitle}>Manage your dining floor</Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Close menu"
            >
              <Ionicons name="close" size={22} color={colors.inkSoft} />
            </TouchableOpacity>
          </View>

          <View style={styles.divider} />

          <ScrollView
            style={styles.scroll}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
          {/* modules */}
          <Text style={styles.section}>MODULES</Text>
          {MODULES.map((m) => {
            const selected = m.key === active;
            return (
              <TouchableOpacity
                key={m.key}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => closeThen(() => onSelectModule(m.key))}
                style={[styles.item, selected && styles.itemActive]}
              >
                {selected && <View style={styles.activeBar} />}
                <View style={[styles.iconWrap, selected && styles.iconWrapActive]}>
                  <MaterialCommunityIcons
                    name={m.icon}
                    size={20}
                    color={selected ? colors.ink : colors.inkSoft}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.itemTitle, selected && styles.itemTitleActive]}>{m.title}</Text>
                  <Text style={styles.itemHint}>{m.hint}</Text>
                </View>
              </TouchableOpacity>
            );
          })}

          <View style={styles.divider} />

          {/* settings */}
          <Text style={styles.section}>PREFERENCES</Text>
          <TouchableOpacity
            activeOpacity={0.85}
            accessibilityRole="button"
            onPress={() => closeThen(onOpenSettings)}
            style={styles.item}
          >
            <View style={styles.iconWrap}>
              <Ionicons name="settings-outline" size={20} color={colors.inkSoft} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.itemTitle}>Settings</Text>
              <Text style={styles.itemHint}>Printer and print options</Text>
            </View>
                        <Ionicons name="chevron-forward" size={18} color={colors.muted} />
          </TouchableOpacity>

          </ScrollView>

          <View style={styles.divider} />
          <TouchableOpacity
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Log out"
            onPress={() => closeThen(onLogout)}
            style={styles.logoutRow}
          >
            <View style={styles.logoutIconWrap}>
              <Ionicons name="log-out-outline" size={20} color={colors.error} />
            </View>
            <Text style={styles.logoutText}>Log out</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
};


export default TablesDrawer;

const styles = StyleSheet.create({
  root: { flex: 1, flexDirection: 'row' },
  backdrop: { backgroundColor: withAlpha(colors.inkDeep, 0.45) },
  panel: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    borderTopRightRadius: 28,
    borderBottomRightRadius: 28,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingBottom: spacing.md },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: colors.orange,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontFamily: 'Inter_600SemiBold', fontSize: 16, color: colors.ink },
  name: { fontFamily: 'Poppins_700Bold', fontWeight: '700', fontSize: 18, color: colors.ink },
  subtitle: { fontFamily: 'Inter_400Regular', fontSize: 12, color: colors.inkSoft, marginTop: 2 },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.md },
  section: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
    letterSpacing: 1,
    color: colors.muted,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  item: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    marginBottom: 4,
  },
  itemActive: { backgroundColor: colors.badgeBg },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapActive: { backgroundColor: colors.orange },
  itemTitle: { fontFamily: 'Poppins_600SemiBold', fontWeight: '600', fontSize: 15, color: colors.ink },
  itemTitleActive: { color: colors.ink },
  itemHint: { fontFamily: 'Inter_400Regular', fontSize: 12, color: colors.inkSoft, marginTop: 2 },
  activeBar: { position: 'absolute', left: 0, top: 14, bottom: 14, width: 4, borderRadius: 2, backgroundColor: colors.orange },
  scroll: { flex: 1 },
  logoutRow: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
  },
  logoutIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: colors.errorBackground,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutText: { fontFamily: 'Inter_600SemiBold', fontSize: 15, color: colors.error },
});