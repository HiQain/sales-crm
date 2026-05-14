import { useCallback, useEffect, useMemo, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import type {
  CellValueChangedEvent,
  ColDef,
  ICellRendererParams,
  RowClassParams,
  ValueFormatterParams,
  ValueParserParams,
} from 'ag-grid-community';
import {
  AllCommunityModule,
  ModuleRegistry,
  themeQuartz,
} from 'ag-grid-community';
import {
  BadgeDollarSign,
  CreditCard,
  DollarSign,
  Loader2,
  Search,
  Table,
  Trash2,
} from 'lucide-react';
import apiClient from '../api/client';
import type { Billing } from '../types';
import ConfirmDialog from './ConfirmDialog';
import LeadDateFilter from './LeadDateFilter';
import { filterItemsByDate, type LeadDateFilter as DateFilterValue } from '../utils/leadDateFilter';

ModuleRegistry.registerModules([AllCommunityModule]);

type GridBilling = Billing & { __isDraft?: boolean };

const glassTheme = themeQuartz.withParams({
  backgroundColor: 'rgba(255, 255, 255)',
  headerBackgroundColor: 'rgba(0, 0, 0, 0.05)',
  headerTextColor: 'oklch(37.2% 0.044 257.287)',
  headerFontWeight: 'bold',
  textColor: 'oklch(44.6% 0.043 257.281)',
  fontSize: '12px',
  headerHeight: 44,
  rowHeight: 40,
});

const dividerStyle = {
  borderRight: '1px solid rgba(148, 163, 184, 0.45)',
};

const toMoney = (value: unknown) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

const toDateOnly = (value: unknown) => {
  if (!value) return '';
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return '';
    const directMatch = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
    if (directMatch) return directMatch[1];
  }

  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10);
};

const withDerivedBillingValues = (billing: GridBilling): GridBilling => {
  const amount = toMoney(billing.amount);
  const feeDeduction = toMoney(billing.fee_deduction);

  return {
    ...billing,
    invoice_date: toDateOnly(billing.invoice_date),
    payment_received_date: toDateOnly(billing.payment_received_date),
    amount,
    fee_deduction: feeDeduction,
    net_currency: amount - feeDeduction,
  };
};

const createEmptyBilling = (): GridBilling => ({
  id: -1,
  invoice_date: '',
  payment_received_date: '',
  client_name: '',
  business_name: '',
  payment_method: '',
  service: '',
  amount: 0,
  fee_deduction: 0,
  net_currency: 0,
  lead: '',
  __isDraft: true,
});

interface BillingTablePageProps {
  mode: 'admin' | 'employee';
}

export default function BillingTablePage({ mode }: BillingTablePageProps) {
  const [rowData, setRowData] = useState<GridBilling[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [dateFilter, setDateFilter] = useState<DateFilterValue>('all');
  const [draftRow, setDraftRow] = useState<GridBilling>(createEmptyBilling);
  const [billingPendingDelete, setBillingPendingDelete] = useState<number | string | null>(null);

  const user = useMemo(() => {
    const userStr = localStorage.getItem('user');
    return userStr ? JSON.parse(userStr) : null;
  }, []);

  const scopedUserId = mode === 'employee' ? Number(user?.id) : undefined;

  const fetchData = useCallback(async () => {
    if (mode === 'employee' && !scopedUserId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const url = scopedUserId ? `/billings?userId=${scopedUserId}` : '/billings';
      const response = await apiClient.get(url);
      const records = (Array.isArray(response.data) ? response.data : response.data.data || []) as GridBilling[];
      setRowData(records.map(withDerivedBillingValues));
    } catch (error) {
      console.error('Failed to fetch billings:', error);
    } finally {
      setLoading(false);
    }
  }, [mode, scopedUserId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const currencyFormatter = (params: ValueFormatterParams) => {
    if (params.value == null) return '$0.00';
    return `$${Number(params.value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const numberParser = (params: ValueParserParams) => {
    const value = Number(params.newValue);
    return Number.isNaN(value) ? params.oldValue : value;
  };

  const deleteBilling = useCallback(async () => {
    if (billingPendingDelete == null) return;
    setDeleteLoading(true);
    try {
      await apiClient.delete(`/billings/${billingPendingDelete}`);
      setRowData((prev) => prev.filter((billing) => billing.id !== billingPendingDelete));
      setBillingPendingDelete(null);
    } catch (error) {
      console.error('Delete failed:', error);
    } finally {
      setDeleteLoading(false);
    }
  }, [billingPendingDelete]);

  const columnDefs = useMemo<ColDef<GridBilling>[]>(() => {
    const columns: ColDef<GridBilling>[] = [
      { field: 'invoice_date', headerName: 'Invoice Date', minWidth: 145, editable: true },
      { field: 'payment_received_date', headerName: 'Payment Received Date', minWidth: 190, editable: true },
      { field: 'client_name', headerName: 'Client Name', minWidth: 170, editable: true },
      { field: 'business_name', headerName: 'Business Name', minWidth: 190, editable: true },
      { field: 'payment_method', headerName: 'Payment Method', minWidth: 170, editable: true },
      { field: 'service', headerName: 'Service', minWidth: 150, editable: true, filter: true },
      {
        field: 'amount',
        headerName: 'Amount',
        minWidth: 130,
        editable: true,
        valueParser: numberParser,
        valueFormatter: currencyFormatter,
        cellClass: 'text-right font-mono font-bold',
      },
      {
        field: 'fee_deduction',
        headerName: 'Fee Deduction',
        minWidth: 150,
        editable: true,
        valueParser: numberParser,
        valueFormatter: currencyFormatter,
        cellClass: 'text-right font-mono font-bold',
      },
      {
        field: 'net_currency',
        headerName: 'Net Currency',
        minWidth: 145,
        editable: true,
        valueParser: numberParser,
        valueFormatter: currencyFormatter,
        cellClass: 'text-right font-mono font-bold',
      },
      { field: 'lead', headerName: 'Lead', minWidth: 150, editable: true, filter: true },
      {
        headerName: 'Actions',
        width: 100,
        pinned: 'right',
        cellRenderer: (params: ICellRendererParams) => (
          params.node.rowPinned === 'bottom' ? null : (
            <button
              onClick={() => setBillingPendingDelete(params.data.id)}
              className="p-1 hover:bg-rose-500/20 text-rose-500 rounded transition-colors mt-1"
            >
              <Trash2 size={16} />
            </button>
          )
        ),
      },
    ];

    return columns.map((column, index) => ({
      ...column,
      cellStyle: index === columns.length - 1 ? undefined : dividerStyle,
      headerStyle: index === columns.length - 1 ? undefined : dividerStyle,
    }));
  }, []);

  const onCellValueChanged = useCallback(async (event: CellValueChangedEvent) => {
    const { data, colDef, newValue, node } = event;
    const field = colDef.field;
    if (!field) return;

    const hasValue = !(newValue == null || (typeof newValue === 'string' && newValue.trim() === ''));
    if (node.rowPinned === 'bottom') {
      if (!hasValue) {
        setDraftRow((prev) => ({ ...prev, [field]: newValue }));
        return;
      }

      const nextDraft = { ...draftRow, [field]: newValue };
      const normalizedDraft = withDerivedBillingValues(nextDraft);
      setDraftRow(createEmptyBilling());

      try {
        const response = await apiClient.post('/billings', {
          ...normalizedDraft,
          assigned_user: scopedUserId,
        });
        setRowData((prev) => [withDerivedBillingValues(response.data as GridBilling), ...prev]);
      } catch (error) {
        console.error('Create failed:', error);
        setDraftRow(normalizedDraft);
      }
      return;
    }

    const nextBilling = withDerivedBillingValues({ ...data, [field]: newValue });
    setRowData((prev) => prev.map((row) => (
      row.id === data.id ? nextBilling : row
    )));

    try {
      await apiClient.put(`/billings/${data.id}`, {
        ...(field === 'amount' || field === 'fee_deduction'
          ? { [field]: newValue, net_currency: nextBilling.net_currency }
          : { [field]: newValue }),
      });
    } catch (error) {
      console.error('Update failed:', error);
      fetchData();
    }
  }, [draftRow, fetchData, scopedUserId]);

  const filteredRowData = useMemo(
    () => filterItemsByDate(rowData, dateFilter, (billing) => billing.invoice_date || billing.created_at),
    [rowData, dateFilter],
  );
  const pinnedBottomRowData = useMemo(() => [draftRow], [draftRow]);

  const getRowStyle = useCallback((params: RowClassParams<GridBilling>) => {
    if (params.node.rowPinned === 'bottom') {
      return { backgroundColor: 'rgba(255, 255, 255, 0.35)' };
    }
    if (Number(params.data?.payment_received_date ? 1 : 0)) {
      return { backgroundColor: 'oklch(72.3% 0.219 149.579 / 0.08)' };
    }
    return undefined;
  }, []);

  const stats = useMemo(() => {
    const totalBillings = filteredRowData.length;
    const receivedPayments = filteredRowData.filter((billing) => Boolean(billing.payment_received_date)).length;
    const grossAmount = filteredRowData.reduce((acc, billing) => acc + (Number(billing.amount) || 0), 0);
    const netAmount = filteredRowData.reduce((acc, billing) => acc + (Number(billing.net_currency) || 0), 0);
    return { totalBillings, receivedPayments, grossAmount, netAmount };
  }, [filteredRowData]);

  return (
    <div className="p-6 h-full flex flex-col space-y-4 animate-in fade-in duration-500">
      <ConfirmDialog
        open={billingPendingDelete != null}
        title="Delete billing?"
        message="This will remove the billing entry permanently. You can't undo this action."
        confirmLabel="Delete Billing"
        onConfirm={deleteBilling}
        onCancel={() => !deleteLoading && setBillingPendingDelete(null)}
        loading={deleteLoading}
      />

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-700 tracking-tight">
            {mode === 'admin' ? 'Billings' : 'My Billings'}
          </h2>
          <p className="text-slate-500 text-sm">
            {mode === 'admin' ? 'Track invoices, deductions, and net billing amounts.' : 'Your billing entries and payment tracking.'}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <LeadDateFilter value={dateFilter} onChange={setDateFilter} />
          <div className="relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-indigo-500 transition-colors" size={18} />
            <input
              type="text"
              placeholder="Search billings..."
              className="bg-white/30 backdrop-blur-[12px] border border-white/20 pl-10 pr-4 py-2 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 w-64 shadow-sm transition-all"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Billings', val: stats.totalBillings, icon: Table, color: 'text-indigo-600' },
          { label: 'Payments Received', val: stats.receivedPayments, icon: CreditCard, color: 'text-green-700' },
          { label: 'Gross Amount', val: `$${stats.grossAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, icon: DollarSign, color: 'text-sky-700' },
          { label: 'Net Currency', val: `$${stats.netAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, icon: BadgeDollarSign, color: 'text-emerald-700' },
        ].map((stat) => (
          <div key={stat.label} className="bg-white/40 backdrop-blur-[20px] border border-white/30 p-4 rounded-2xl flex items-center gap-4 shadow-sm relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className={`p-2 rounded-xl bg-white/40 border border-white/50 ${stat.color} relative z-10`}>
              <stat.icon size={24} />
            </div>
            <div className="relative z-10">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{stat.label}</p>
              <p className={`text-xl font-bold ${stat.color}`}>{stat.val}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="flex-1 bg-white/40 backdrop-blur-[20px] border border-white/30 rounded-2xl shadow-xl overflow-hidden min-h-[400px] relative">
        {loading && (
          <div className="absolute inset-0 z-50 bg-white/10 backdrop-blur-[1px] flex items-center justify-center">
            <Loader2 className="animate-spin text-indigo-600" size={32} />
          </div>
        )}
        <AgGridReact
          theme={glassTheme}
          rowData={filteredRowData}
          pinnedBottomRowData={pinnedBottomRowData}
          columnDefs={columnDefs}
          onCellValueChanged={onCellValueChanged}
          getRowStyle={getRowStyle}
          quickFilterText={searchText}
          defaultColDef={{
            sortable: true,
            filter: false,
            resizable: true,
            flex: 1,
          }}
          animateRows={true}
        />
      </div>
    </div>
  );
}
