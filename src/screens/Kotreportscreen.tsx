// src/screens/KotReportScreen.tsx
// KOT report — dropdown filters like the website, table on tablets, cards on phones.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StatusBar, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getKotReport, KotBill, KotReportResponse, KotStageFilter } from '../services/Reportapi';
import { getSession } from '../services/storage';
import { KotReportScreenProps } from '../navigation/AppNavigator';
import {
  Badge,
  Column,
  DateField,
  DateTimeCell,
  DetailLine,
  DropdownField,
  ErrorBanner,
FilterBar,
  Option,
  PillCell,
  ReportFooter,
  ReportHero,
  ReportTable,
  StrongText,
  TotalCell,
  clean,
  money,
  reportRoot as rr,
  today,
  useReportLayout,
} from '../components/Reportparts';

type View_ = 'bill' | 'item' | 'summary';

const VIEW_OPTIONS = [
  { value: 'bill', label: 'Bill Wise' },
  { value: 'item', label: 'Item Wise' },
  { value: 'summary', label: 'Item Summary' },
];
const SEARCH_FIELDS: Record<View_, Option[]> = {
  bill: [
    { value: 'all', label: 'All' },
    { value: 'customer', label: 'Customer' },
    { value: 'table', label: 'Table' },
    { value: 'kot_number', label: 'KOT Number' },
    { value: 'invoice_number', label: 'Invoice' },
    { value: 'pos_identifier', label: 'POS' },
    { value: 'payment_method', label: 'Payment' },
  ],
  item: [
    { value: 'all', label: 'All' },
    { value: 'name', label: 'Item' },
    { value: 'kot_number', label: 'KOT Number' },
       { value: 'invoice_number', label: 'Invoice' },
    { value: 'pos_identifier', label: 'POS' },
    { value: 'payment_method', label: 'Payment' },
  ],
  summary: [
    { value: 'all', label: 'All' },
    { value: 'name', label: 'Item' },
  ],
};
const STAGE_OPTIONS = [
  { value: 'all', label: 'All Stages' },
  { value: 'pending', label: 'Pending' },
  { value: 'invoiced', label: 'Invoiced' },
];

const idx: Column = { key: '#', label: '#', flex: 0.4, align: 'center', card: 'hide', render: (_r, i) => <StrongText text={String(i + 1)} /> };
const dateCol: Column = { key: 'time', label: 'Date & Time', flex: 1.3, card: 'hide', render: (r) => <DateTimeCell iso={r.time} /> };
const stageCol: Column = { key: 'stage', label: 'Stage', flex: 1, align: 'center', card: 'badge', render: (r) => <Badge text={clean(r.stage)} stage={r.stage} /> };

const BILL_COLS: Column<KotBill>[] = [
  idx,
  dateCol,
  { key: 'order_type', label: 'Type', flex: 0.9, align: 'center', card: 'hide', render: (r) => <PillCell text={(r.order_type || '').replace(/_/g, ' ')} /> },
  { key: 'kot_number', label: 'KOT Number', flex: 1.1, card: 'title', render: (r) => <StrongText text={clean(r.kot_number) || 'Draft bill'} /> },
  { key: 'invoice_number', label: 'Invoice No.', flex: 1.3, card: 'meta' },
    { key: 'pos_identifier', label: 'POS', flex: 0.8, align: 'center', card: 'meta' },
  { key: 'customer', label: 'Customer', flex: 1.2, card: 'meta' },
  { key: 'table', label: 'Table', flex: 0.7, align: 'center', card: 'meta', metaLabel: 'Table' },
  { key: 'floor', label: 'Floor', flex: 0.7, align: 'center', card: 'meta', metaLabel: 'Floor' },
  { key: 'payment_method', label: 'Payment', flex: 0.9, align: 'center', card: 'meta' },
  { key: 'total', label: 'Total', flex: 1, align: 'right', card: 'right', render: (r) => <TotalCell value={r.total} /> },
  stageCol,
];

const ITEM_COLS: Column[] = [
  idx,
  dateCol,
  { key: 'kot_number', label: 'KOT Number', flex: 1.1, card: 'meta' },
  { key: 'invoice_number', label: 'Invoice', flex: 1.3, card: 'meta' },
   { key: 'pos_identifier', label: 'POS', flex: 0.8, align: 'center', card: 'meta' },
  { key: 'payment_method', label: 'Payment', flex: 0.9, align: 'center', card: 'meta' },
  { key: 'name', label: 'Item', flex: 2, card: 'title', render: (r) => <StrongText text={r.name} /> },
  { key: 'quantity', label: 'Qty', flex: 0.6, align: 'center', card: 'meta', metaLabel: 'Qty' },
  { key: 'rate', label: 'Rate', flex: 0.9, align: 'right', card: 'meta', metaLabel: 'Rate', render: (r) => <TotalCell value={r.rate} /> },
  { key: 'total', label: 'Total', flex: 1, align: 'right', card: 'right', render: (r) => <TotalCell value={r.total} /> },
  stageCol,
];

const SUMMARY_COLS: Column[] = [
  idx,
  { key: 'name', label: 'Item', flex: 3, card: 'title', render: (r) => <StrongText text={r.name} /> },
  { key: 'quantity', label: 'Qty', flex: 0.8, align: 'center', card: 'meta', metaLabel: 'Qty' },
  { key: 'rate', label: 'Rate', flex: 1, align: 'right', card: 'meta', metaLabel: 'Rate', render: (r) => <TotalCell value={r.rate} /> },
  { key: 'total', label: 'Total', flex: 1.2, align: 'right', card: 'right', render: (r) => <TotalCell value={r.total} /> },
];

// ISO (UTC) → device-local YYYY-MM-DD
const localYmd = (iso?: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

const KotReportScreen: React.FC<KotReportScreenProps> = ({ navigation }) => {
       const { wide, isPhone } = useReportLayout();
    const isMounted = useRef(true);
  const reqId = useRef(0);

  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  const [pos, setPos] = useState('ALL');
  const [posList, setPosList] = useState<string[]>(['ALL']);
  const [stage, setStage] = useState<KotStageFilter>('all');
  const [view, setView] = useState<View_>('bill');
  const [item, setItem] = useState('ALL');
 const [search, setSearch] = useState('');
  const [searchField, setSearchField] = useState('all');
  const [data, setData] = useState<KotReportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    isMounted.current = true;
    (async () => {
      const session = await getSession();
      if (!session && isMounted.current) navigation.replace('Login');
    })();
    return () => {
      isMounted.current = false;
    };
  }, [navigation]);

  const load = useCallback(
    async (pull = false) => {
    const myReq = ++reqId.current;
      pull ? setRefreshing(true) : setLoading(true);
      setError(null);
      try {
        const res = await getKotReport({
          date_from: from,
          date_to: to,
          session_id: '',
          pos_identifier: pos,
          stage_filter: stage,
          report_type: 'all',
        });
        if (!isMounted.current || myReq !== reqId.current) return;
        setData(res);
                const seen = (res.billwise || []).map((b) => clean(b.pos_identifier).trim()).filter((v) => v && v !== '-');
        setPosList((prev) => Array.from(new Set([...prev, ...seen])));
      } catch (e) {
    if (isMounted.current && myReq === reqId.current) setError(e instanceof Error ? e.message : 'Could not load report.');
      } finally {
        if (isMounted.current && myReq === reqId.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [from, to, pos, stage]
  );

  useEffect(() => {
    load();
  }, [load]);

  // keep the range valid when one end is changed past the other
  const changeFrom = (v: string) => {
    setFrom(v);
    if (v > to) setTo(v);
  };
  const changeTo = (v: string) => {
    setTo(v);
    if (v < from) setFrom(v);
  };

   const q = search.trim().toLowerCase();

  const itemOptions = useMemo(() => {
        const names = Array.from(
      new Set((data?.itemwise ?? []).filter((r) => { const d = localYmd(r.time); return !d || (d >= from && d <= to); }).map((r) => r.name))
    ).sort((a, b) => a.localeCompare(b));
    return [{ value: 'ALL', label: 'All Items' }, ...names.map((n) => ({ value: n, label: n }))];
  }, [data, from, to]);

   const inRange = (r: { time?: string }) => {
    const d = localYmd(r.time);
    return !d || (d >= from && d <= to);
  };

  const rows: any[] = useMemo(() => {
    const bills = (data?.billwise ?? []).filter(inRange);
    const items = (data?.itemwise ?? []).filter(inRange);
    const summary = (() => {
      const m = new Map<string, { name: string; quantity: number; total: number; rate: number }>();
      items.forEach((r) => {
        const e = m.get(r.name) ?? { name: r.name, quantity: 0, total: 0, rate: r.rate };
        e.quantity += r.quantity;
        e.total += r.total;
        m.set(r.name, e);
      });
      return Array.from(m.values()).sort((a, b) => b.total - a.total);
    })();

    const src: any[] = view === 'bill' ? bills : view === 'item' ? items : summary;
    const byItem = view === 'item' && item !== 'ALL' ? src.filter((r) => r.name === item) : src;
    if (!q) return byItem;
    if (searchField === 'all') return byItem.filter((r) => JSON.stringify(r).toLowerCase().includes(q));
    return byItem.filter((r) => String(r[searchField] ?? '').toLowerCase().includes(q));
  }, [data, view, item, q, searchField, from, to]);

  const counts = useMemo(() => {
    const b = (data?.billwise ?? []).filter(inRange);
    return {
      total: b.length,
      active: b.filter((x) => x.stage === 'pending').length,
      invoiced: b.filter((x) => x.stage === 'invoiced').length,
    };
  }, [data, from, to]);

  const columns: Column[] = view === 'bill' ? (BILL_COLS as Column[]) : view === 'item' ? ITEM_COLS : SUMMARY_COLS;

  const filters = (
    <>
      <FilterBar>
        <DateField label="FROM" value={from} onChange={changeFrom} />
        <DateField label="TO" value={to} onChange={changeTo} />
        <DropdownField title="POS" value={pos} onChange={setPos} options={posList.map((p) => ({ value: p, label: p === 'ALL' ? 'All POS' : p }))} />
        <DropdownField
          title="View"
          value={view}
          onChange={(v) => {
            setView(v as View_);
            setSearchField('all');
          }}
          options={VIEW_OPTIONS}
        />
                {!isPhone && (
          <DropdownField title="Stage" value={stage} onChange={(v) => setStage(v as KotStageFilter)} options={STAGE_OPTIONS} />
        )}
        {view === 'item' && (
          <DropdownField label="ITEM" title="Item" value={item} onChange={setItem} options={itemOptions} full={!wide} />
        )}
      </FilterBar>
      {error && <ErrorBanner text={error} onRetry={() => load()} />}
    </>
  );

  return (
    <SafeAreaView style={rr.root} edges={['left', 'right', 'bottom']}>
      <StatusBar barStyle="light-content" />
        <ReportHero
        active="kot"
        onBack={() => navigation.goBack()}
        onSwitch={() => navigation.replace('SalesReport')}
        search={search}
        onSearch={setSearch}
        searchPlaceholder="Search customer, table, KOT number…"
        searchFields={SEARCH_FIELDS[view]}
        searchField={searchField}
        onSearchField={setSearchField}
        phoneChip={{ title: 'Stage', options: STAGE_OPTIONS, value: stage, onChange: (v) => setStage(v as KotStageFilter) }}
      />

        <View style={rr.body}>
        {filters}
        <ReportTable
          rows={rows}
          columns={columns}
          wide={wide}
          loading={loading}
          refreshing={refreshing}
          onRefresh={() => load(true)}
        emptyText="No records for these filters"
          rowKey={(r, i) => `${view}-${r.key ?? r.name ?? ''}-${i}`}
          renderDetail={
            view === 'bill'
              ? (b: KotBill) =>
                  b.items?.length ? (
                    <>
                      {b.items.map((it, i) => (
                        <DetailLine
                          key={`${it.name}-${i}`}
                          name={it.name}
                          qty={`×${it.quantity}`}
                          amount={Math.max(0, (it.price ?? 0) * (it.quantity ?? 1) - (it.item_discount ?? 0))}
                        />
                      ))}
                    </>
                  ) : null
              : undefined
          }
        />
      </View>

      <ReportFooter
                left={`TOTAL — ${counts.total} orders  ·  ${counts.active} pending  ·  ${counts.invoiced} invoiced`}
        right={`Invoiced Revenue: ${money(data?.summary.total_revenue)}`}
      />
    </SafeAreaView>
  );
};

export default KotReportScreen;