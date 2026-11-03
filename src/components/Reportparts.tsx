// src/components/ReportParts.tsx
// Shared building blocks for KotReportScreen + SalesReportScreen:
// master-style gradient hero with KOT/Sales toggle, website-style dropdown
// filters (incl. a dependency-free calendar), and a responsive table
// (real table on tablets, cards on phones).

import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
   RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
   View,
  Dimensions,
  useWindowDimensions,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, gradients, radius, shadow, spacing, withAlpha } from '../constants/theme';

export const FONT = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
} as const;

// phones only (shortest side < 500dp, same rule as isPhone); does not change on rotation
const PHONE = Math.min(Dimensions.get('window').width, Dimensions.get('window').height) < 500;

/* ------------------------------ helpers ------------------------------ */
export const money = (n: unknown) => Number(n ?? 0).toFixed(2);
export const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const today = () => ymd(new Date());

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const parse = (iso?: string) => {
  if (!iso) return null;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
};
export const fmtDate = (iso?: string) => {
  const d = parse(iso);
  return d ? `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]} ${d.getFullYear()}` : '—';
};
export const fmtTime = (iso?: string) => {
  const d = parse(iso);
  if (!d) return '';
  const h = d.getHours();
  return `${String(h % 12 || 12).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} ${h >= 12 ? 'pm' : 'am'}`;
};
export const clean = (v: unknown) => {
  const s = v === undefined || v === null ? '' : String(v);
  return s === '—' ? '' : s;
};

export const useReportLayout = () => {
  const { width, height } = useWindowDimensions();
  const compact = Math.min(width, height) >= 600 && width > height; // same rule as master pages
  const wide = width >= 900; // table layout (8" / 10.5" landscape)
  const isPhone = Math.min(width, height) < 500; // phones only; 8" / 10.5" tablets are always above this
  return { width, height, compact, wide, isPhone };
};

/* -------------------------------- hero -------------------------------- */

export type ReportModule = 'kot' | 'sales';

const FOOD_ICONS: { name: keyof typeof MaterialCommunityIcons.glyphMap; left: string; top: string; size: number; rotate: string; color: string }[] = [
  { name: 'pizza', left: '3%', top: '62%', size: 28, rotate: '-16deg', color: withAlpha(colors.white, 0.16) },
  { name: 'coffee', left: '19%', top: '6%', size: 22, rotate: '10deg', color: withAlpha(colors.orange, 0.28) },
  { name: 'hamburger', left: '36%', top: '60%', size: 26, rotate: '8deg', color: withAlpha(colors.white, 0.14) },
  { name: 'noodles', left: '58%', top: '66%', size: 28, rotate: '14deg', color: withAlpha(colors.orange, 0.26) },
  { name: 'cupcake', left: '84%', top: '58%', size: 24, rotate: '12deg', color: withAlpha(colors.white, 0.15) },
  { name: 'fish', left: '92%', top: '8%', size: 22, rotate: '-8deg', color: withAlpha(colors.orange, 0.24) },
];
const REPORT_OPTIONS: { key: ReportModule; title: string }[] = [
  { key: 'kot', title: 'KOT Report' },
  { key: 'sales', title: 'Sales Report' },
];

const ReportSwitcher: React.FC<{ active: ReportModule; onSwitch: (m: ReportModule) => void }> = ({ active, onSwitch }) => {
  const [open, setOpen] = useState(false);
  const { compact } = useReportLayout();
  const current = REPORT_OPTIONS.find((o) => o.key === active) ?? REPORT_OPTIONS[0];

  const pickReport = (key: ReportModule) => {
    setOpen(false);
    if (key === active) return;
    setTimeout(() => onSwitch(key), 60); // let the modal close first
  };

  return (
    <>
      <TouchableOpacity
        style={s.switchTitle}
        activeOpacity={0.85}
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`${current.title}, switch report`}
      >
        <Text style={[s.heroTitle, compact && s.heroTitleCompact, { flexShrink: 1 }]} numberOfLines={1}>
          {current.title}
        </Text>
        <View style={s.switchChevron}>
          <Ionicons name="chevron-down" size={16} color={colors.white} />
        </View>
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setOpen(false)}>
        <View style={s.backdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} />
          <View style={[s.sheet, shadow.card]}>
            <Text style={s.sheetTitle}>Reports</Text>
            {REPORT_OPTIONS.map((o) => {
              const sel = o.key === active;
              return (
                <TouchableOpacity
                  key={o.key}
                  style={[s.sheetRow, sel && s.sheetRowOn]}
                  activeOpacity={0.85}
                  onPress={() => pickReport(o.key)}
                >
                  <Text style={s.sheetRowText}>{o.title}</Text>
                  {sel && <Ionicons name="checkmark" size={18} color={colors.ink} />}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </Modal>
    </>
  );
};

/** Small dropdown inside the search bar: choose which field the search applies to */
const SearchFieldChip: React.FC<{ options: Option[]; value: string; onChange: (v: string) => void; title?: string }> = ({ options, value, onChange, title = 'Search in' }) => {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value) ?? options[0];

  return (
    <>
      <TouchableOpacity
        style={s.searchChip}
        activeOpacity={0.85}
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`Search in ${current.label}`}
      >
        <Text style={s.searchChipText} numberOfLines={1}>{current.label}</Text>
        <Ionicons name="chevron-down" size={13} color={colors.ink} />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setOpen(false)}>
        <View style={s.backdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} />
          <View style={[s.sheet, shadow.card]}>
                        <Text style={s.sheetTitle}>{title}</Text>
            {options.map((o) => {
              const sel = o.value === value;
              return (
                <TouchableOpacity
                  key={o.value}
                  style={[s.sheetRow, sel && s.sheetRowOn]}
                  activeOpacity={0.85}
                  onPress={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                >
                  <Text style={s.sheetRowText}>{o.label}</Text>
                  {sel && <Ionicons name="checkmark" size={18} color={colors.ink} />}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </Modal>
    </>
  );
};

interface HeroProps {
  active: ReportModule;
  onBack: () => void;
  onSwitch: (m: ReportModule) => void;
  search: string;
  onSearch: (t: string) => void;
  searchPlaceholder: string;
  searchFields?: Option[];
  searchField?: string;
  onSearchField?: (v: string) => void;
  /** phones only: a dropdown chip shown at the right end of the search bar */
   phoneChip?: { title: string; options: Option[]; value: string; onChange: (v: string) => void };
  /** when provided, a download icon is shown at the right end of the title row */
  onDownload?: (type: 'excel' | 'pdf') => void;
}
export const ReportHero: React.FC<HeroProps> = ({
  active, onBack, onSwitch, search, onSearch, searchPlaceholder, searchFields, searchField = 'all', onSearchField, phoneChip, onDownload,
}) => {
  const [downloadOpen, setDownloadOpen] = useState(false);
  const insets = useSafeAreaInsets();
  const { width, compact, isPhone } = useReportLayout();
  const wide = width >= 900; // tablets get a fixed-width search

  const fieldLabel = searchFields?.find((o) => o.value === searchField)?.label;

  // phones: full-width bar, plain placeholder | tablets: exactly as before
  const placeholder = isPhone
    ? searchPlaceholder
    : !wide
    ? 'Search…'
    : searchField === 'all' || !fieldLabel
    ? searchPlaceholder
    : `Search ${fieldLabel}…`;

  const searchBox = (
    <View style={[s.heroSearch, isPhone ? s.heroSearchPhone : wide ? s.heroSearchWide : s.heroSearchNear]}>
      <Ionicons name="search" size={16} color={withAlpha(colors.white, 0.75)} style={{ marginLeft: 6 }} />
      <TextInput
        value={search}
        onChangeText={onSearch}
        placeholder={placeholder}
        placeholderTextColor={withAlpha(colors.white, 0.6)}
        style={s.heroSearchInput}
        returnKeyType="search"
      />
      {!!search && (
        <TouchableOpacity onPress={() => onSearch('')} hitSlop={8}>
          <Ionicons name="close-circle" size={16} color={withAlpha(colors.white, 0.75)} />
        </TouchableOpacity>
      )}
          {!isPhone && !!searchFields?.length && !!onSearchField && (
        <SearchFieldChip options={searchFields} value={searchField} onChange={onSearchField} />
      )}
      {/* phones only: e.g. the KOT "All Stages" dropdown in the right corner */}
      {isPhone && !!phoneChip && (
        <SearchFieldChip title={phoneChip.title} options={phoneChip.options} value={phoneChip.value} onChange={phoneChip.onChange} />
      )}
    </View>
  );

  return (
    <LinearGradient
      colors={gradients.button}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[s.hero, { paddingTop: insets.top + spacing.xs }, compact && s.heroCompact]}
    >
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        {FOOD_ICONS.map((f, i) => (
          <MaterialCommunityIcons
            key={f.name + i}
            name={f.name}
            size={f.size}
            color={f.color}
            style={{ position: 'absolute', left: f.left as any, top: f.top as any, transform: [{ rotate: f.rotate }] }}
          />
        ))}
      </View>

      <View style={s.heroRow}>
        <TouchableOpacity onPress={onBack} style={s.heroBack} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={22} color={colors.white} />
        </TouchableOpacity>

        <View style={{ flexShrink: 0 }}>
          <ReportSwitcher active={active} onSwitch={onSwitch} />
        </View>

        {/* tablets: search on the same row as the title (unchanged) */}
        {!isPhone && searchBox}

        {!!onDownload && (
          <TouchableOpacity
            onPress={() => setDownloadOpen(true)}
            style={s.heroDownload}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Download report"
          >
            <Ionicons name="download-outline" size={20} color={colors.white} />
          </TouchableOpacity>
        )}
      </View>

            {/* phones: full-width search bar on its own row below the title */}
      {isPhone && <View style={s.heroPhoneSearchRow}>{searchBox}</View>}

      {!!onDownload && (
        <Modal visible={downloadOpen} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setDownloadOpen(false)}>
          <View style={s.backdrop}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setDownloadOpen(false)} />
            <View style={[s.sheet, shadow.card]}>
              <Text style={s.sheetTitle}>Download report as</Text>
              {([
                { key: 'excel', label: 'Excel (.xlsx)', icon: 'file-excel-outline' },
                { key: 'pdf', label: 'PDF (.pdf)', icon: 'file-pdf-box' },
              ] as const).map((o) => (
                <TouchableOpacity
                  key={o.key}
                  style={s.sheetRow}
                  activeOpacity={0.85}
                   onPress={() => {
                    setDownloadOpen(false);
                    setTimeout(() => onDownload(o.key), 500); // let the modal fully close first
                  }}
                >
                  <MaterialCommunityIcons name={o.icon} size={22} color={colors.ink} style={{ marginRight: 10 }} />
                  <Text style={s.sheetRowText}>{o.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </Modal>
      )}
    </LinearGradient>
  );
};

/* ----------------------------- filter fields ----------------------------- */

export const FilterBar: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { compact } = useReportLayout();
  return <View style={[s.filterBar, compact && { paddingVertical: spacing.xs }]}>{children}</View>;
};

export interface Option {
  value: string;
  label: string;
}

const Field: React.FC<{ label?: string; onPress: () => void; value: string; icon: keyof typeof Ionicons.glyphMap; grow?: number; full?: boolean }> = ({
  label,
  onPress,
  value,
  icon,
  grow = 1,
  full,
}) => (
  <TouchableOpacity activeOpacity={0.85} onPress={onPress} accessibilityRole="button" style={[s.field, { flexGrow: grow }, full && s.fieldFull]}>
        {!!label && <Text style={s.fieldLabel}>{label}</Text>}
    <Text style={s.fieldValue} numberOfLines={1}>{value}</Text>
    <Ionicons name={icon} size={16} color={colors.inkSoft} />
  </TouchableOpacity>
);

export const DropdownField: React.FC<{
  label?: string;
  title: string;
  value: string;
  options: Option[];
  onChange: (v: string) => void;
  full?: boolean;
}> = ({ label, title, value, options, onChange, full }) => {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value)?.label ?? value;
  return (
    <>
      <Field label={label} value={current} icon="chevron-down" onPress={() => setOpen(true)} full={full} />
      <Modal visible={open} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setOpen(false)}>
        <View style={s.backdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} />
          <View style={[s.sheet, shadow.card]}>
            <Text style={s.sheetTitle}>{title}</Text>
            <View style={{ maxHeight: 360 }}>
              <FlatList
                data={options}
                keyExtractor={(o) => o.value}
                renderItem={({ item }) => {
                  const sel = item.value === value;
                  return (
                    <TouchableOpacity
                      activeOpacity={0.85}
                      onPress={() => {
                        setOpen(false);
                        onChange(item.value);
                      }}
                      style={[s.sheetRow, sel && s.sheetRowOn]}
                    >
                      <Text style={s.sheetRowText}>{item.label}</Text>
                      {sel && <Ionicons name="checkmark" size={18} color={colors.ink} />}
                    </TouchableOpacity>
                  );
                }}
              />
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
};

/** Date field that opens a small built-in calendar (no extra package needed). */
export const DateField: React.FC<{ label: string; value: string; onChange: (v: string) => void }> = ({ label, value, onChange }) => {
  const [open, setOpen] = useState(false);
  const base = useMemo(() => parse(`${value}T00:00:00`) ?? new Date(), [value]);
  const [view, setView] = useState({ y: base.getFullYear(), m: base.getMonth() });

  const show = () => {
    setView({ y: base.getFullYear(), m: base.getMonth() });
    setOpen(true);
  };
  const shift = (delta: number) =>
    setView((v) => {
      const d = new Date(v.y, v.m + delta, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });

  const first = new Date(view.y, view.m, 1).getDay();
  const days = new Date(view.y, view.m + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  const todayStr = today();

  return (
    <>
      <Field label={label} value={`${fmtDate(`${value}T00:00:00`)}`} icon="calendar-outline" onPress={show} />
      <Modal visible={open} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setOpen(false)}>
        <View style={s.backdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} />
          <View style={[s.sheet, { maxWidth: 340 }, shadow.card]}>
            <View style={s.calHead}>
              <TouchableOpacity onPress={() => shift(-1)} hitSlop={10} style={s.calNav}>
                <Ionicons name="chevron-back" size={18} color={colors.ink} />
              </TouchableOpacity>
              <Text style={s.calTitle}>{MONTHS_FULL[view.m]} {view.y}</Text>
              <TouchableOpacity onPress={() => shift(1)} hitSlop={10} style={s.calNav}>
                <Ionicons name="chevron-forward" size={18} color={colors.ink} />
              </TouchableOpacity>
            </View>
            <View style={s.calRow}>
              {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
                <Text key={i} style={s.calDow}>{d}</Text>
              ))}
            </View>
            <View style={s.calGrid}>
              {cells.map((d, i) => {
                const str = d ? ymd(new Date(view.y, view.m, d)) : '';
                const sel = str === value;
                return (
                  <View key={i} style={s.calCellWrap}>
                    {d ? (
                      <TouchableOpacity
                        activeOpacity={0.8}
                        onPress={() => {
                          setOpen(false);
                          onChange(str);
                        }}
                        style={[s.calCell, sel && s.calCellOn, !sel && str === todayStr && s.calCellToday]}
                      >
                        <Text style={[s.calDayText, sel && { color: colors.ink, fontFamily: FONT.bold }]}>{d}</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                );
              })}
            </View>
            <TouchableOpacity
              style={s.calToday}
              activeOpacity={0.85}
              onPress={() => {
                setOpen(false);
                onChange(todayStr);
              }}
            >
              <Text style={s.calTodayText}>Today</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
};

export const SearchField: React.FC<{ value: string; onChangeText: (t: string) => void; placeholder: string }> = ({
  value,
  onChangeText,
  placeholder,
}) => (
  <View style={[s.field, s.searchField]}>
    <Ionicons name="search" size={16} color={colors.muted} />
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={colors.muted}
      style={s.searchInput}
      returnKeyType="search"
    />
    {!!value && (
      <TouchableOpacity onPress={() => onChangeText('')} hitSlop={8}>
        <Ionicons name="close-circle" size={16} color={colors.muted} />
      </TouchableOpacity>
    )}
  </View>
);

/* ------------------------------ badges etc ------------------------------ */

export const stageTone = (stage?: string) => {
  const v = (stage || '').toLowerCase();
  if (v === 'invoiced' || v === 'completed' || v === 'paid') return { bg: colors.softGreenAlt, fg: colors.ink };
  if (v === 'pending' || v === 'active') return { bg: colors.warningBackground, fg: colors.orangeText };
  return { bg: colors.background, fg: colors.inkSoft };
};

export const Badge: React.FC<{ text: string; stage?: string }> = ({ text, stage }) => {
  if (!text) return <Text style={s.dash}>—</Text>;
  const tone = stageTone(stage ?? text);
  return (
    <View style={[s.badge, { backgroundColor: tone.bg, borderColor: withAlpha(tone.fg, 0.15) }]}>
      <Text style={[s.badgeText, { color: tone.fg }]} numberOfLines={1}>{text}</Text>
    </View>
  );
};

export const ErrorBanner: React.FC<{ text: string; onRetry: () => void }> = ({ text, onRetry }) => (
  <View style={s.errorBanner}>
    <Ionicons name="alert-circle" size={16} color={colors.error} />
    <Text style={s.errorText}>{text}</Text>
    <TouchableOpacity onPress={onRetry} hitSlop={8}>
      <Text style={s.retryText}>Retry</Text>
    </TouchableOpacity>
  </View>
);

export const StatStrip: React.FC<{ items: { label: string; value: string; accent?: boolean }[] }> = ({ items }) => (
  <View style={s.strip}>
    {items.map((it) => (
      <View key={it.label} style={[s.stat, it.accent && s.statAccent]}>
        <Text style={[s.statLabel, it.accent && { color: withAlpha(colors.white, 0.75) }]} numberOfLines={1}>{it.label}</Text>
        <Text style={[s.statValue, it.accent && { color: colors.orange }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
          {it.value}
        </Text>
      </View>
    ))}
  </View>
);

export const ReportFooter: React.FC<{ left: string; right: string; inline?: boolean }> = ({ left, right, inline }) => {
  const { isPhone } = useReportLayout();

  // always-visible banner; sits inside the screen's SafeAreaView (bottom edge),
  // so it stays above the Android navigation keys / iOS home bar
  return (
            <View style={[s.footer, isPhone && s.footerPhone, isPhone && inline && s.footerPhoneInline]}>
          <Text
        style={[s.footerLeft, isPhone && s.footerLeftPhone, isPhone && inline && s.footerLeftPhoneInline, !isPhone && { flex: 1 }]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.8}
      >
        {left}
      </Text>
      <Text style={[s.footerRight, isPhone && s.footerRightPhone]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
        {right}
      </Text>
    </View>
  );
};

/* ------------------------------ table / cards ------------------------------ */

export interface Column<T = any> {
  key: string;
    label: string;
  flex: number;
  /** fixed pixel width; replaces flex so the columns sit close together */
  width?: number;
  align?: 'left' | 'center' | 'right';
  render?: (row: T, index: number) => React.ReactNode;
  /** how the column is shown in the phone card layout */
  card?: 'title' | 'badge' | 'right' | 'meta' | 'hide';
  /** prefix used when shown as card meta */
  metaLabel?: string;
}

const cellText = <T,>(c: Column<T>, row: any, i: number) => {
  if (c.render) return c.render(row, i);
  const v = clean(row?.[c.key]);
  return <Text style={s.cell} numberOfLines={1}>{v || '—'}</Text>;
};

const TableHeader = <T,>({ columns }: { columns: Column<T>[] }) => (
  <View style={s.thead}>
    {columns.map((c) => (
      <View key={c.key} style={{ ...(c.width ? { width: c.width } : { flex: c.flex }), alignItems: c.align === 'right' ? 'flex-end' : c.align === 'center' ? 'center' : 'flex-start', paddingHorizontal: 6 }}>
                <Text style={s.theadText} numberOfLines={1}>{c.label}</Text>
      </View>
    ))}
  </View>
);

interface TableProps<T> {
  rows: T[];
  columns: Column<T>[];
  wide?: boolean;
  loading: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  emptyText: string;
    rowKey?: (row: T, i: number) => string;
  renderDetail?: (row: T) => React.ReactNode;
  /** rendered inside the scrolling list on phones/portrait (filters live here) */
  topSlot?: React.ReactNode;
}

export function ReportTable<T>({ rows, columns, loading, refreshing, onRefresh, emptyText, rowKey, renderDetail }: TableProps<T>) {
          const [open, setOpen] = useState<string | null>(null);
  const { width: winWidth } = useWindowDimensions();
  const keyOf = (r: T, i: number) => (rowKey ? rowKey(r, i) : String(i));

  // table is at least as wide as its columns; narrower screens scroll sideways
    const COL_UNIT = PHONE ? 72 : 84;
    const minWidth = columns.reduce((sum, c) => sum + (c.width ?? c.flex * COL_UNIT), 0);
  const tableWidth = Math.max(winWidth - spacing.md * 2, minWidth);

  const renderRow = ({ item, index }: { item: T; index: number }) => {
    const k = keyOf(item, index);
    const detail = renderDetail?.(item);
    const expanded = open === k && !!detail;
    const toggle = () => detail && setOpen((p) => (p === k ? null : k));

    return (
      <TouchableOpacity activeOpacity={detail ? 0.8 : 1} onPress={toggle} style={[s.trow, index % 2 === 1 && s.trowAlt]}>
        <View style={s.trowMain}>
          {columns.map((c) => (
            <View
              key={c.key}
              style={{ ...(c.width ? { width: c.width } : { flex: c.flex }), paddingHorizontal: 6, alignItems: c.align === 'right' ? 'flex-end' : c.align === 'center' ? 'center' : 'flex-start', justifyContent: 'center' }}
                          >
              {cellText(c, item, index)}
            </View>
          ))}
        </View>
        {expanded && <View style={s.detail}>{detail}</View>}
      </TouchableOpacity>
    );
  };

  return (
    <ScrollView horizontal nestedScrollEnabled showsHorizontalScrollIndicator style={s.tableWrap}>
      <FlatList
        data={rows}
        keyExtractor={keyOf}
        renderItem={renderRow}
        keyboardShouldPersistTaps="handled"
        stickyHeaderIndices={[0]}
        ListHeaderComponent={<TableHeader columns={columns} />}
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.ink} />
          ) : (
            <View style={s.empty}>
              <Ionicons name="document-text-outline" size={34} color={colors.muted} />
              <Text style={s.emptyText}>{emptyText}</Text>
            </View>
          )
        }
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.ink} />}
        contentContainerStyle={s.tableContent}
        style={{ width: tableWidth }}
      />
    </ScrollView>
  );
}

/** small helpers for screen column definitions */
export const DateTimeCell: React.FC<{ iso?: string }> = ({ iso }) => (
  <View>
    <Text style={s.cell}>{fmtDate(iso)}</Text>
    <Text style={s.cellSub}>{fmtTime(iso)}</Text>
  </View>
);
export const TotalCell: React.FC<{ value: unknown }> = ({ value }) => <Text style={s.totalCell}>{money(value)}</Text>;
export const PillCell: React.FC<{ text: string }> = ({ text }) =>
  text ? (
    <View style={s.pill}>
      <Text style={s.pillText} numberOfLines={1}>{text}</Text>
    </View>
  ) : (
    <Text style={s.dash}>—</Text>
  );
export const StrongText: React.FC<{ text: string }> = ({ text }) => <Text style={s.strong} numberOfLines={1}>{text || '—'}</Text>;
export const DetailLine: React.FC<{ name: string; qty: unknown; amount: unknown }> = ({ name, qty, amount }) => (
  <View style={s.detailLine}>
    <Text style={s.detailName} numberOfLines={1}>{name}</Text>
    <Text style={s.detailQty}>{String(qty)}</Text>
    <Text style={s.detailAmt}>{money(amount)}</Text>
  </View>
);

export const reportRoot = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  body: { flex: 1 },
});

/* -------------------------------- styles -------------------------------- */

const s = StyleSheet.create({
   hero: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, borderBottomLeftRadius: 22, borderBottomRightRadius: 22, overflow: 'hidden' },
  heroCompact: { paddingBottom: spacing.xs, borderBottomLeftRadius: 16, borderBottomRightRadius: 16 },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 2 },
  heroBack: {
    width: 34, height: 34, borderRadius: 11,
    backgroundColor: withAlpha(colors.white, 0.14), borderWidth: 1, borderColor: withAlpha(colors.white, 0.22),
    alignItems: 'center', justifyContent: 'center',
  },
   heroDownload: {
    width: 34, height: 34, borderRadius: 11, marginLeft: 'auto',
    backgroundColor: withAlpha(colors.white, 0.14), borderWidth: 1, borderColor: withAlpha(colors.white, 0.22),
    alignItems: 'center', justifyContent: 'center',
  },
    heroTitle: { fontFamily: 'Poppins_700Bold', fontWeight: '700', fontSize: PHONE ? 18 : 21, color: colors.white },
  heroTitleCompact: { fontSize: 19 },
  heroSubtitle: { fontFamily: 'Poppins_400Regular', fontSize: 12, color: withAlpha(colors.white, 0.78), marginTop: 1 },
  switchTitle: { flexDirection: 'row', alignItems: 'center', gap: 8, maxWidth: '100%' },
   switchChevron: {
    width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
    backgroundColor: withAlpha(colors.white, 0.14), borderWidth: 1, borderColor: withAlpha(colors.white, 0.22),
  },
     heroSearch: {
    flexDirection: 'row', alignItems: 'center', gap: 8, height: 38, paddingHorizontal: 8, borderRadius: 19,
    backgroundColor: withAlpha(colors.white, 0.16), borderWidth: 1, borderColor: withAlpha(colors.white, 0.28),
  },
  heroSearchWide: { flex: 1, maxWidth: 420, minWidth: 0, marginLeft: 56 },
  heroSearchNear: { flex: 1, minWidth: 0, marginLeft: 36 },
  heroSearchPhone: { marginLeft: 0, minWidth: 0 },
  heroPhoneSearchRow: { marginTop: spacing.sm, paddingBottom: 2 },
  searchChip: {
    flexDirection: 'row', alignItems: 'center', gap: 3, height: 26, paddingHorizontal: 9, borderRadius: 13,
    backgroundColor: colors.orange,
  },
  searchChipText: { fontFamily: 'Poppins_600SemiBold', fontSize: 11.5, color: colors.ink },
    heroSearchInput: { flex: 1, fontFamily: FONT.medium, fontSize: PHONE ? 12.5 : 13.5, color: colors.white, paddingVertical: 0 },

   filterBar: { flexDirection: 'row', flexWrap: 'wrap', gap: PHONE ? 8 : 10, paddingHorizontal: spacing.md, paddingVertical: PHONE ? 6 : spacing.sm },
  field: {
    flexBasis: 150, flexShrink: 1, minWidth: 130, height: PHONE ? 40 : 46, flexDirection: 'row', alignItems: 'center', gap: PHONE ? 6 : 8,
    paddingHorizontal: PHONE ? 10 : 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white,
  },
    fieldFull: { flexBasis: '100%' },
   fieldLabel: { fontFamily: FONT.semibold, fontSize: PHONE ? 9 : 10.5, letterSpacing: PHONE ? 0.5 : 1, color: colors.muted },
  fieldValue: { flex: 1, fontFamily: FONT.semibold, fontSize: PHONE ? 12 : 13.5, color: colors.ink },
  searchField: { flexBasis: 240, flexGrow: 2 },
  searchInput: { flex: 1, fontFamily: FONT.medium, fontSize: 13.5, color: colors.ink, paddingVertical: 0 },

  backdrop: { flex: 1, backgroundColor: withAlpha(colors.inkDeep, 0.45), alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg },
  sheet: { width: '100%', maxWidth: 340, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md },
  sheetTitle: { fontFamily: 'Poppins_600SemiBold', fontSize: 15, color: colors.ink, marginBottom: spacing.sm, paddingHorizontal: spacing.sm },
  sheetRow: { flexDirection: 'row', alignItems: 'center', minHeight: 48, paddingHorizontal: spacing.sm, borderRadius: radius.md },
    sheetRowOn: { backgroundColor: colors.background },
  sheetRowText: { flex: 1, fontFamily: 'Poppins_600SemiBold', fontSize: 14.5, color: colors.ink },

  calHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  calNav: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },
  calTitle: { fontFamily: 'Poppins_600SemiBold', fontSize: 15, color: colors.ink },
  calRow: { flexDirection: 'row' },
  calDow: { flex: 1, textAlign: 'center', fontFamily: FONT.semibold, fontSize: 11, color: colors.muted, paddingVertical: 4 },
  calGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  calCellWrap: { width: `${100 / 7}%`, aspectRatio: 1, padding: 2 },
  calCell: { flex: 1, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  calCellOn: { backgroundColor: colors.orange },
  calCellToday: { borderWidth: 1, borderColor: colors.orange },
  calDayText: { fontFamily: FONT.medium, fontSize: 13, color: colors.ink },
  calToday: { marginTop: spacing.sm, height: 42, borderRadius: radius.md, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  calTodayText: { fontFamily: FONT.semibold, fontSize: 13.5, color: colors.orange },

  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, borderWidth: 1 },
  badgeText: { fontFamily: FONT.semibold, fontSize: PHONE ? 10 : 11, textTransform: 'capitalize' },
    dash: { fontFamily: FONT.medium, fontSize: 13, color: colors.muted },

  errorBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginHorizontal: spacing.md, marginTop: spacing.sm,
    backgroundColor: colors.errorBackground, borderWidth: 1, borderColor: colors.error, borderRadius: radius.sm, paddingVertical: 8, paddingHorizontal: 12,
  },
  errorText: { fontFamily: FONT.medium, fontSize: 12.5, color: colors.error, flex: 1 },
  retryText: { fontFamily: FONT.bold, fontSize: 12.5, color: colors.error },

  strip: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: spacing.md, paddingBottom: spacing.sm },
  stat: { flexGrow: 1, flexBasis: 110, paddingVertical: 8, paddingHorizontal: 12, borderRadius: radius.md, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border },
  statAccent: { backgroundColor: colors.ink, borderColor: colors.ink },
  statLabel: { fontFamily: FONT.semibold, fontSize: 10.5, letterSpacing: 0.6, color: colors.inkSoft },
  statValue: { fontFamily: FONT.bold, fontSize: 16, color: colors.ink, marginTop: 2, fontVariant: ['tabular-nums'] },

   footer: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm,
    paddingHorizontal: spacing.lg, paddingVertical: 8, backgroundColor: colors.white, borderTopWidth: 1, borderTopColor: colors.border,
  },
    footerPhone: { flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center', gap: 2, paddingHorizontal: spacing.md, paddingVertical: 8 },
  footerLeftPhone: { fontFamily: FONT.medium, fontWeight: '500', fontSize: 11, lineHeight: 15, color: colors.inkSoft },
    footerRightPhone: { fontSize: 13.5, lineHeight: 18 },
  footerPhoneInline: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  footerLeftPhoneInline: { flex: 1, fontFamily: 'Poppins_700Bold', fontWeight: '700', fontSize: 13, color: colors.ink },
  footerLeft: { fontFamily: 'Poppins_700Bold', fontWeight: '700', fontSize: 15, lineHeight: 17, includeFontPadding: false, color: colors.ink },
  footerRight: { fontFamily: 'Poppins_700Bold', fontWeight: '700', fontSize: 15, lineHeight: 17, includeFontPadding: false, color: colors.ink, fontVariant: ['tabular-nums'] },
  
  /* collapsible footer (phones) */
  footerDock: {
    position: 'absolute', left: spacing.md, right: spacing.md, bottom: spacing.sm,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: spacing.sm,
    zIndex: 10, elevation: 10,
  },
  footerMat: {
    flexDirection: 'row', justifyContent: 'flex-end', overflow: 'hidden',
    backgroundColor: colors.white, borderRadius: 22, borderWidth: 1, borderColor: colors.border,
  },
  footerMatInner: {
    flexShrink: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm,
    paddingHorizontal: 16, paddingVertical: 10,
  },
  footerToggle: {
    width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.ink, ...shadow.soft,
  },
    /* table (tablet landscape) */
  tableWrap: { marginHorizontal: spacing.md },
  tableContent: { paddingBottom: spacing.md },
    thead: { flexDirection: 'row', alignItems: 'center', minHeight: PHONE ? 36 : 44, backgroundColor: colors.ink, borderTopLeftRadius: radius.md, borderTopRightRadius: radius.md },
  theadText: { fontFamily: 'Poppins_600SemiBold', fontSize: PHONE ? 9.5 : 11, letterSpacing: PHONE ? 0.4 : 0.8, color: colors.white, textTransform: 'uppercase' },
  trow: { backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.border, borderLeftWidth: 1, borderRightWidth: 1, borderLeftColor: colors.border, borderRightColor: colors.border },
  trowAlt: { backgroundColor: colors.surface },
   trowMain: { flexDirection: 'row', alignItems: 'center', minHeight: PHONE ? 44 : 52, paddingVertical: PHONE ? 4 : 6 },
  cell: { fontFamily: FONT.medium, fontSize: PHONE ? 11.5 : 12.5, color: colors.ink },
  cellSub: { fontFamily: FONT.regular, fontSize: PHONE ? 10 : 11, color: colors.muted, marginTop: 1 },
  strong: { fontFamily: FONT.bold, fontSize: PHONE ? 11.5 : 12.5, color: colors.ink },
  totalCell: { fontFamily: FONT.bold, fontSize: PHONE ? 12.5 : 13.5, color: colors.ink, fontVariant: ['tabular-nums'] },
  pill: { paddingHorizontal: PHONE ? 8 : 10, paddingVertical: PHONE ? 2 : 3, borderRadius: 12, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border },
  pillText: { fontFamily: FONT.semibold, fontSize: PHONE ? 10 : 11, color: colors.inkSoft, textTransform: 'capitalize' },
  detail: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, paddingTop: 2 },
  detailLine: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 3, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
   detailName: { flex: 1, fontFamily: FONT.medium, fontSize: PHONE ? 11.5 : 12.5, color: colors.ink },
  detailQty: { fontFamily: FONT.semibold, fontSize: PHONE ? 11.5 : 12.5, color: colors.inkSoft, minWidth: 36, textAlign: 'right' },
  detailAmt: { fontFamily: FONT.semibold, fontSize: PHONE ? 11.5 : 12.5, color: colors.ink, minWidth: PHONE ? 60 : 70, textAlign: 'right', fontVariant: ['tabular-nums'] },

  /* cards (phone / tablet portrait) */
  cardsContent: { paddingHorizontal: spacing.md, paddingBottom: spacing.xl + 48, gap: 10 },
    card: { backgroundColor: colors.white, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 12, ...shadow.soft },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitle: { fontFamily: FONT.bold, fontSize: 14.5, color: colors.ink },
  cardMeta: { fontFamily: FONT.medium, fontSize: 12, color: colors.inkSoft, marginTop: 3 },
  cardBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  cardTotal: { fontFamily: FONT.bold, fontSize: 16, color: colors.ink },

  empty: { alignItems: 'center', justifyContent: 'center', paddingTop: spacing.xl * 1.5, gap: spacing.sm },
  emptyText: { fontFamily: FONT.medium, fontSize: 13, color: colors.muted },
});