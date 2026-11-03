// src/screens/SalesReportScreen.tsx
// Sales report — dropdown filters like the website, table on tablets, cards on phones.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, StatusBar, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getKotReport, getSalesReport, SalesReportResponse } from '../services/Reportapi';
import { exportSalesReport } from '../utils/reportExports';
import { getSession } from '../services/storage';
import { SalesReportScreenProps } from '../navigation/AppNavigator';
import {
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

type View_ = 'bill' | 'item' | 'summary' | 'category';

const VIEW_OPTIONS = [
  { value: 'bill', label: 'Bill Wise' },
  { value: 'item', label: 'Item Wise' },
  { value: 'summary', label: 'Item Summary' },
  { value: 'category', label: 'Category Wise' },
];
const SEARCH_FIELDS: Record<View_, Option[]> = {
  bill: [
    { value: 'all', label: 'All' },
    { value: '_customer', label: 'Customer' },
    { value: '_table', label: 'Table' },
    { value: '_invoice', label: 'Invoice' },
    { value: '_pos', label: 'POS' },
    { value: '_payment', label: 'Payment' },
  ],
  item: [
    { value: 'all', label: 'All' },
    { value: 'name', label: 'Item' },
    { value: 'bill_number', label: 'Invoice' },
  ],
  summary: [
    { value: 'all', label: 'All' },
    { value: 'name', label: 'Item' },
  ],
  category: [
    { value: 'all', label: 'All' },
    { value: 'category_name', label: 'Category' },
  ],
};

// Bill rows may use slightly different field names — normalise them once.

const pick = (o: any, ...keys: string[]) => {
  for (const k of keys) if (o?.[k] !== undefined && o?.[k] !== null && o?.[k] !== '') return o[k];
  return undefined;
};
const normBill = (b: any) => ({
  ...b,
   _invoice: clean(pick(b, 'invoice_number', 'bill_number')),
  _customer: clean(pick(b, 'customer', 'customer_name')) || 'Guest',
  _table: clean(pick(b, 'table', 'table_number')),
  _pos: clean(pick(b, 'pos_identifier')),
  _payment: clean(pick(b, 'payment_method', 'payment_mode')),
   _total: pick(b, 'total', 'total_amount', 'grand_total') ?? 0,
  _time: pick(b, 'time', 'created_at', 'date'),
    _type: clean(pick(b, 'order_type')).replace(/_/g, ' '),
  _kot: clean(pick(b, 'kot_number')),
  _floor: clean(pick(b, 'floor')),
  _waiter: clean(pick(b, 'waiter_name')),
  _taxable: money(pick(b, 'subtotal', 'taxable', 'taxable_amount')),
  _tax: money(pick(b, 'tax_amount', 'tax')),
});

const idx: Column = { key: '#', label: '#', flex: 0.4, align: 'center', card: 'hide', render: (_r, i) => <StrongText text={String(i + 1)} /> };
const dateCol: Column = { key: '_time', label: 'Date & Time', flex: 1.3, card: 'hide', render: (r) => <DateTimeCell iso={r._time ?? r.time ?? r.created_at} /> };

const BILL_COLS: Column[] = [
  idx,
  dateCol,
  { key: '_type', label: 'Type', flex: 0.9, align: 'center', card: 'hide', render: (r) => <PillCell text={r._type} /> },
  { key: '_kot', label: 'KOT Number', flex: 1.1, card: 'hide' },
  { key: '_invoice', label: 'Invoice No.', flex: 1.4, card: 'hide', render: (r) => <StrongText text={r._invoice} /> },
  { key: '_pos', label: 'POS', flex: 0.8, align: 'center', card: 'hide' },
  { key: '_customer', label: 'Customer', flex: 1.3, card: 'hide' },
  { key: '_table', label: 'Table No.', flex: 0.8, align: 'center', card: 'hide' },
  { key: '_floor', label: 'Floor', flex: 0.7, align: 'center', card: 'hide' },
  { key: '_waiter', label: 'Waiter Name', flex: 1.2, card: 'hide' },
  { key: '_payment', label: 'Payment', flex: 1, align: 'center', card: 'hide', render: (r) => <PillCell text={r._payment} /> },
  { key: '_taxable', label: 'Taxable', flex: 1, align: 'right', card: 'hide' },
  { key: '_tax', label: 'Tax', flex: 0.8, align: 'right', card: 'hide' },
  { key: '_total', label: 'Total', flex: 1, align: 'right', card: 'hide', render: (r) => <TotalCell value={r._total} /> },
];

const ITEM_COLS: Column[] = [
  idx,
  dateCol,
    { key: 'bill_number', label: 'Invoice', flex: 1.3, card: 'meta' },
  { key: 'name', label: 'Item', flex: 2, card: 'title', render: (r) => <StrongText text={r.name} /> },
  { key: 'quantity', label: 'Qty', flex: 0.6, align: 'center', card: 'meta', metaLabel: 'Qty' },
  { key: 'rate', label: 'Rate', flex: 0.9, align: 'right', card: 'meta', metaLabel: 'Rate', render: (r) => <TotalCell value={r.rate} /> },
  { key: 'total', label: 'Total', flex: 1, align: 'right', card: 'right', render: (r) => <TotalCell value={r.total} /> },
];

const SUMMARY_COLS: Column[] = [
  idx,
  { key: 'name', label: 'Item', flex: 3, card: 'title', render: (r) => <StrongText text={r.name} /> },
  { key: 'quantity', label: 'Qty', flex: 0.8, align: 'center', card: 'meta', metaLabel: 'Qty' },
  { key: 'rate', label: 'Rate', flex: 1, align: 'right', card: 'meta', metaLabel: 'Rate', render: (r) => <TotalCell value={r.rate} /> },
  { key: 'total', label: 'Total', flex: 1.2, align: 'right', card: 'right', render: (r) => <TotalCell value={r.total} /> },
];

const CATEGORY_COLS: Column[] = [
  { ...idx, flex: 0.5 },
  { key: 'category_name', label: 'Category', flex: 1.5, card: 'title', render: (r) => <StrongText text={r.category_name} /> },
  { key: '_count', label: 'Menu Items', flex: 1, align: 'center', card: 'meta', metaLabel: 'Menu items', render: (r) => <PillCell text={String(r.items?.length ?? 0)} /> },
  { key: 'total_sales', label: 'Total Sales', flex: 1, align: 'center', card: 'right', render: (r) => <TotalCell value={r.total_sales} /> },
];
const SalesReportScreen: React.FC<SalesReportScreenProps> = ({ navigation }) => {
    const { wide, isPhone } = useReportLayout();
  const isMounted = useRef(true);

  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  const [pos, setPos] = useState('ALL');
  const [posList, setPosList] = useState<string[]>(['ALL']);
  const [table, setTable] = useState('ALL');
  const [tableList, setTableList] = useState<string[]>(['ALL']);
    const [view, setView] = useState<View_>('bill');
  const [item, setItem] = useState('ALL');
    const [search, setSearch] = useState('');
  const [searchField, setSearchField] = useState('all');
  const [data, setData] = useState<SalesReportResponse | null>(null);
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
      pull ? setRefreshing(true) : setLoading(true);
      setError(null);
      try {
        const [res, kotResult] = await Promise.all([
          getSalesReport({
            date_from: from,
            date_to: to,
            session_id: '',
            pos_identifier: pos,
            table_number: table === 'ALL' ? '' : table,
            report_type: 'all',
          }),
          getKotReport({
            date_from: from,
            date_to: to,
            session_id: '',
            pos_identifier: pos,
            stage_filter: 'all',
            report_type: 'all',
          }).catch(() => null),
        ]);
        if (!isMounted.current) return;
        const kotByInvoice = new Map<string, string>();
        for (const kot of kotResult?.billwise ?? []) {
          const invoice = clean(pick(kot, 'invoice_number', 'bill_number')).trim().toUpperCase();
          const kotNumber = clean(pick(kot, 'kot_number', 'kot_no'));
          if (invoice && kotNumber) kotByInvoice.set(invoice, kotNumber);
        }
        const billwise = (res.billwise || []).map((bill: any) => {
          if (clean(pick(bill, 'kot_number', 'kot_no'))) return bill;
          const invoice = clean(pick(bill, 'invoice_number', 'bill_number')).trim().toUpperCase();
          const kotNumber = invoice ? kotByInvoice.get(invoice) : undefined;
          return kotNumber ? { ...bill, kot_number: kotNumber } : bill;
        });
        setData({ ...res, billwise });
        const bills = billwise.map(normBill);
        const posSeen = bills.map((b) => b._pos).filter(Boolean);
        const tableSeen = bills.map((b) => b._table).filter(Boolean);
        setPosList((p) => Array.from(new Set([...p, ...posSeen])));
        setTableList((p) => Array.from(new Set([...p, ...tableSeen])));
      } catch (e) {
        if (isMounted.current) setError(e instanceof Error ? e.message : 'Could not load report.');
      } finally {
        if (isMounted.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [from, to, pos, table]
  );

  useEffect(() => {
    load();
  }, [load]);

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
    const names = Array.from(new Set((data?.itemwise ?? []).map((r: any) => String(r.name)))).sort((a, b) => a.localeCompare(b));
    return [{ value: 'ALL', label: 'All Items' }, ...names.map((n) => ({ value: n, label: n }))];
  }, [data]);

  const rows: any[] = useMemo(() => {
    const src: any[] =
      view === 'bill'
        ? (data?.billwise ?? []).map(normBill)
        : view === 'item'
        ? data?.itemwise ?? []
                : view === 'summary'
        ? data?.itemsummary ?? []
        : data?.categorywise ?? [];
    const byItem = view === 'item' && item !== 'ALL' ? src.filter((r) => r.name === item) : src;
    if (!q) return byItem;
    if (searchField === 'all') return byItem.filter((r) => JSON.stringify(r).toLowerCase().includes(q));
    return byItem.filter((r) => String(r[searchField] ?? '').toLowerCase().includes(q));
  }, [data, view, item, q, searchField]);

  const columns = view === 'bill' ? BILL_COLS : view === 'item' ? ITEM_COLS : view === 'summary' ? SUMMARY_COLS : CATEGORY_COLS;
    const sum = data?.summary;

  const handleDownload = async (type: 'excel' | 'pdf') => {
    if (!rows.length) {
      Alert.alert('Nothing to download', 'There is no data for the current filters.');
      return;
    }
    try {
      await exportSalesReport({ type, view, rows, from, to, summary: sum });
    } catch (e) {
      Alert.alert('Download failed', e instanceof Error ? e.message : 'Could not create the file.');
    }
  };

  const filters = (
    <>
      <FilterBar>
        <DateField label="FROM" value={from} onChange={changeFrom} />
        <DateField label="TO" value={to} onChange={changeTo} />
        <DropdownField title="POS" value={pos} onChange={setPos} options={posList.map((p) => ({ value: p, label: p === 'ALL' ? 'All POS' : p }))} />
        <DropdownField title="Table" value={table} onChange={setTable} options={tableList.map((t) => ({ value: t, label: t === 'ALL' ? 'All Tables' : `Table ${t}` }))} />
                {!isPhone && (
          <DropdownField
            title="View"
            value={view}
            onChange={(v) => {
              setView(v as View_);
              setSearchField('all');
            }}
            options={VIEW_OPTIONS}
          />
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
        active="sales"
        onBack={() => navigation.goBack()}
        onSwitch={() => navigation.replace('KotReport')}
        search={search}
        onSearch={setSearch}
        onDownload={handleDownload}
        searchPlaceholder="Search bill, customer, item…"
        searchFields={SEARCH_FIELDS[view]}
               searchField={searchField}
        onSearchField={setSearchField}
        phoneChip={{
          title: 'View',
          options: VIEW_OPTIONS,
          value: view,
          onChange: (v) => {
            setView(v as View_);
            setSearchField('all');
          },
        }}
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
          emptyText="No sales for these filters"
                    rowKey={(r, i) => `${view}-${r.key ?? r._invoice ?? r.name ?? r.category_id ?? ''}-${i}`}
          renderDetail={(r: any) => {
            const lines: any[] = view === 'category' ? r.items ?? [] : view === 'bill' && Array.isArray(r.items) ? r.items : [];
            if (!lines.length) return null;
            return (
              <>
                {lines.map((it, i) =>
                  view === 'category' ? (
                    <DetailLine key={it.id ?? i} name={it.name} qty={it.session_code ? `#${it.session_code}` : ''} amount={it.price1} />
                  ) : (
                    <DetailLine key={`${it.name}-${i}`} name={it.name} qty={`×${it.quantity}`} amount={it.total ?? (it.price ?? it.rate ?? 0) * (it.quantity ?? 1)} />
                  )
                )}
              </>
            );
          }}
        />
      </View>

        <ReportFooter
        inline
        left={`TOTAL — ${sum?.total_bills ?? 0} bills`}
        right={`Revenue: ${money(sum?.total_revenue)}`}
      />
    </SafeAreaView>
  );
};

export default SalesReportScreen;
