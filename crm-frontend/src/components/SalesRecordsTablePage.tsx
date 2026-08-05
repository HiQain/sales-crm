import { useCallback, useEffect, useMemo, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import type {
  CellValueChangedEvent,
  ColDef,
  ColumnMovedEvent,
  ColumnResizedEvent,
  ICellRendererParams,
  RowClassParams,
  ValueFormatterParams,
  ValueParserParams,
} from 'ag-grid-community';
import {
  ModuleRegistry,
  themeQuartz,
} from 'ag-grid-community';
import { AllEnterpriseModule } from 'ag-grid-enterprise';
import {
  CheckCircle,
  Loader2,
  Search,
  Table,
  Trash2,
  TrendingUp,
} from 'lucide-react';
import apiClient from '../api/client';
import type { ClientJourney } from '../types';
import ColumnVisibilityMenu, { getColumnVisibilityId } from './ColumnVisibilityMenu';
import ConfirmDialog from './ConfirmDialog';
import LeadDateFilter from './LeadDateFilter';
import { filterItemsByDate, type LeadDateFilter as DateFilterValue } from '../utils/leadDateFilter';
import { formatDateDisplay } from '../utils/date';
import { handleGridCellCopy } from '../utils/gridClipboard';
import { normalizeUsPhoneForStorage } from '../utils/phone';
import { loadColumnLayout, mergeOrderedIds, mergeVisibleIds, saveColumnLayout } from '../utils/columnLayout';

ModuleRegistry.registerModules([AllEnterpriseModule]);

type GridClientJourney = ClientJourney & { __isDraft?: boolean };

const glassTheme = themeQuartz.withParams({
  backgroundColor: 'rgba(255, 255, 255)',
  headerBackgroundColor: 'rgba(0, 0, 0, 0.05)',
  headerTextColor: 'oklch(37.2% 0.044 257.287)',
  headerFontWeight: 'bold',
  textColor: 'oklch(44.6% 0.043 257.281)',
  fontSize: '12px',
  headerHeight: 34,
  rowHeight: 28,
  cellHorizontalPaddingScale: 0.45,
  headerColumnBorder: true,
});

const dividerStyle = {
  borderRight: '1px solid rgba(148, 163, 184, 0.45)',
};
const RESIZE_MIN_WIDTH = 56;

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

const withDerivedJourneyValues = (record: GridClientJourney): GridClientJourney => {
  const total = toMoney(record.total);
  const paid = toMoney(record.paid);
  const normalizedPhone = normalizeUsPhoneForStorage(record.phone);

  return {
    ...record,
    record_date: toDateOnly(record.record_date),
    phone: normalizedPhone ?? record.phone,
    total,
    paid,
    balance: Math.max(total - paid, 0),
  };
};

const createEmptyClientJourney = (): GridClientJourney => ({
  id: -1,
  lead_id: null,
  billing_id: null,
  record_date: '',
  client_name: '',
  business_name: '',
  credit_card_info: '',
  email: '',
  phone: '',
  sales: '',
  lead: '',
  service: '',
  status: 'pending',
  paid: 0,
  balance: 0,
  total: 0,
  __isDraft: true,
});

interface SalesRecordsTablePageProps {
  mode: 'admin' | 'employee';
}

export default function SalesRecordsTablePage({ mode }: SalesRecordsTablePageProps) {
  const layoutStorageKey = `crm:${mode}-client-journeys`;
  const [rowData, setRowData] = useState<GridClientJourney[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [dateFilter, setDateFilter] = useState<DateFilterValue>('all');
  const [draftRow, setDraftRow] = useState<GridClientJourney>(createEmptyClientJourney);
  const [recordPendingDelete, setRecordPendingDelete] = useState<number | string | null>(null);
  const [orderedColumnIds, setOrderedColumnIds] = useState<string[]>([]);
  const [visibleColumnIds, setVisibleColumnIds] = useState<string[]>([]);
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const [layoutReady, setLayoutReady] = useState(false);

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
      const url = scopedUserId ? `/client-journeys?userId=${scopedUserId}` : '/client-journeys';
      const response = await apiClient.get(url);
      const records = (Array.isArray(response.data) ? response.data : response.data.data || []) as GridClientJourney[];
      setRowData(records.map(withDerivedJourneyValues));
    } catch (error) {
      console.error('Failed to fetch client journeys:', error);
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

  const deleteRecord = useCallback(async () => {
    if (recordPendingDelete == null) return;
    setDeleteLoading(true);
    try {
      await apiClient.delete(`/client-journeys/${recordPendingDelete}`);
      setRowData(prev => prev.filter(record => record.id !== recordPendingDelete));
      setRecordPendingDelete(null);
    } catch (error) {
      console.error('Delete failed:', error);
    } finally {
      setDeleteLoading(false);
    }
  }, [recordPendingDelete]);

  const columnDefs = useMemo<ColDef<GridClientJourney>[]>(() => {
      const columns: ColDef<GridClientJourney>[] = [
      { field: 'record_date', headerName: 'Date', minWidth: 105, editable: true, valueFormatter: (params) => formatDateDisplay(params.value) },
      { field: 'client_name', headerName: 'Client Name', minWidth: 118, editable: true },
      { field: 'business_name', headerName: 'Business Name', minWidth: 118, editable: true },
      { field: 'credit_card_info', headerName: 'Credit Card Info.', minWidth: 118, editable: true },
      { field: 'email', headerName: 'Email', minWidth: 118, editable: true },
      { field: 'phone', headerName: 'Phone', minWidth: 105, editable: true },
      { field: 'sales', headerName: 'Sales', minWidth: 92, editable: true },
      { field: 'lead', headerName: 'Agent', minWidth: 92, editable: true, filter: true },
      { field: 'service', headerName: 'Service', minWidth: 92, editable: true, filter: true },
      {
        field: 'status',
        headerName: 'Status',
        minWidth: 104,
        editable: true,
        cellEditor: 'agTextCellEditor',
      },
      {
        field: 'paid',
        headerName: 'Paid',
        minWidth: 102,
        editable: true,
        valueParser: numberParser,
        valueFormatter: currencyFormatter,
        cellClass: 'text-left font-mono font-bold',
      },
      {
        field: 'balance',
        headerName: 'Balance',
        minWidth: 102,
        editable: true,
        valueParser: numberParser,
        valueFormatter: currencyFormatter,
        cellClass: 'text-left font-mono font-bold',
      },
      {
        field: 'total',
        headerName: 'Total',
        minWidth: 102,
        editable: true,
        valueParser: numberParser,
        valueFormatter: currencyFormatter,
        cellClass: 'text-left font-mono font-bold',
      },
      {
        colId: 'actions',
        headerName: 'Actions',
        width: 64,
        pinned: 'right',
        cellRenderer: (params: ICellRendererParams) => (
          params.node.rowPinned === 'bottom' ? null : (
            <button
              onClick={() => setRecordPendingDelete(params.data.id)}
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
      minWidth: 'width' in column && column.width ? column.minWidth : RESIZE_MIN_WIDTH,
      cellStyle: index === columns.length - 1 ? undefined : dividerStyle,
      headerStyle: index === columns.length - 1 ? undefined : dividerStyle,
    }));
  }, []);

  const columnVisibilityOptions = useMemo(
    () => columnDefs.map((column) => ({
      id: getColumnVisibilityId(column),
      label: String(column.headerName ?? column.field ?? column.colId ?? 'Column'),
    })),
    [columnDefs],
  );

  useEffect(() => {
    setLayoutReady(false);
    const allIds = columnVisibilityOptions.map((column) => column.id);
    const stored = loadColumnLayout(layoutStorageKey);
    const nextOrderedIds = mergeOrderedIds(allIds, stored?.order);
    const nextVisibleIds = mergeVisibleIds(nextOrderedIds, stored?.visible, stored?.order);

    setOrderedColumnIds(nextOrderedIds);
    setVisibleColumnIds(nextVisibleIds);
    setColumnWidths(stored?.widths ?? {});
    setLayoutReady(true);
  }, [columnVisibilityOptions, layoutStorageKey]);

  const visibleColumnDefs = useMemo(() => {
    const visibleIdSet = new Set(visibleColumnIds);
    const orderedIdSet = orderedColumnIds.length > 0 ? orderedColumnIds : columnDefs.map((column) => getColumnVisibilityId(column));

    return orderedIdSet
      .map((id) => {
        const column = columnDefs.find((candidate) => getColumnVisibilityId(candidate) === id);
        if (!column) return null;

        const savedWidth = columnWidths[id];
        if (!savedWidth) return column;

        return {
          ...column,
          width: savedWidth,
          flex: undefined,
        };
      })
      .filter((column): column is ColDef<GridClientJourney> => Boolean(column) && visibleIdSet.has(getColumnVisibilityId(column)));
  }, [columnDefs, columnWidths, orderedColumnIds, visibleColumnIds]);

  useEffect(() => {
    if (!layoutReady || orderedColumnIds.length === 0) return;
    saveColumnLayout(layoutStorageKey, {
      order: orderedColumnIds,
      visible: visibleColumnIds,
      widths: columnWidths,
    });
  }, [columnWidths, layoutReady, layoutStorageKey, orderedColumnIds, visibleColumnIds]);

  const onCellValueChanged = useCallback(async (event: CellValueChangedEvent) => {
    const { data, colDef, newValue, oldValue, node } = event;
    const field = colDef.field;
    if (!field) return;

    const normalizedValue = field === 'phone'
      ? normalizeUsPhoneForStorage(newValue)
      : newValue;

    if (field === 'phone' && normalizedValue === null) {
      fetchData();
      return;
    }

    const nextValue = field === 'phone' ? (normalizedValue ?? oldValue ?? '') : newValue;

    const hasValue = !(nextValue == null || (typeof nextValue === 'string' && nextValue.trim() === ''));
    if (node.rowPinned === 'bottom') {
      if (!hasValue) {
        setDraftRow(prev => ({ ...prev, [field]: nextValue }));
        return;
      }

      const nextDraft = { ...draftRow, [field]: nextValue };
      const normalizedDraft = withDerivedJourneyValues(nextDraft);
      setDraftRow(createEmptyClientJourney());

      try {
        const response = await apiClient.post('/client-journeys', {
          ...normalizedDraft,
          assigned_user: scopedUserId,
        });
        setRowData((prev) => [withDerivedJourneyValues(response.data as GridClientJourney), ...prev]);
      } catch (error) {
        console.error('Create failed:', error);
        setDraftRow(normalizedDraft);
      }
      return;
    }

    const normalizedNextRecord = withDerivedJourneyValues({ ...data, [field]: nextValue });
    Object.assign(data, normalizedNextRecord);
    event.api.refreshCells({ rowNodes: [node] });

    try {
      await apiClient.put(`/client-journeys/${data.id}`, {
        ...(field === 'paid' || field === 'total'
          ? { [field]: nextValue, balance: normalizedNextRecord.balance }
          : { [field]: nextValue }),
      });
    } catch (error) {
      console.error('Update failed:', error);
      fetchData();
    }
  }, [draftRow, fetchData, scopedUserId]);

  const filteredRowData = useMemo(
    () => filterItemsByDate(rowData, dateFilter, (record) => record.record_date || record.created_at),
    [rowData, dateFilter],
  );
  const pinnedBottomRowData = useMemo(() => [draftRow], [draftRow]);

  const getRowStyle = useCallback((params: RowClassParams<GridClientJourney>) => {
    if (params.node.rowPinned === 'bottom') {
      return { backgroundColor: 'rgba(255, 255, 255, 0.35)' };
    }
    if (params.data?.status === 'paid') {
      return { backgroundColor: 'oklch(72.3% 0.219 149.579 / 0.1)' };
    }
    return undefined;
  }, []);

  const stats = useMemo(() => {
    const totalRecords = filteredRowData.length;
    const paidRecords = filteredRowData.filter(record => record.status === 'paid').length;
    const paidRevenue = filteredRowData.reduce((acc, record) => acc + (Number(record.paid) || 0), 0);
    const totalRevenue = filteredRowData.reduce((acc, record) => acc + (Number(record.total) || 0), 0);
    return { totalRecords, paidRecords, paidRevenue, totalRevenue };
  }, [filteredRowData]);

  return (
    <div className="p-6 h-full flex flex-col space-y-4 animate-in fade-in duration-500">
      <ConfirmDialog
        open={recordPendingDelete != null}
        title="Delete client journey?"
        message="This will remove the client journey permanently. You can't undo this action."
        confirmLabel="Delete Journey"
        onConfirm={deleteRecord}
        onCancel={() => !deleteLoading && setRecordPendingDelete(null)}
        loading={deleteLoading}
      />

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-700 tracking-tight">
            {mode === 'admin' ? 'Client Journey' : 'My Clients'}
          </h2>
        </div>

        <div className="flex items-center gap-3">
          <ColumnVisibilityMenu
            columns={columnVisibilityOptions}
            visibleColumnIds={visibleColumnIds}
            onToggle={(columnId) => {
              setVisibleColumnIds((current) =>
                current.includes(columnId)
                  ? current.filter((id) => id !== columnId)
                  : [...current, columnId]
              );
            }}
          />
          <LeadDateFilter value={dateFilter} onChange={setDateFilter} />
          <div className="relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-indigo-600 transition-colors" size={18} />
            <input
              type="text"
              placeholder="Search client journeys..."
              className="bg-white border border-slate-300 pl-10 pr-4 py-2 rounded-md text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 w-64 shadow-sm transition-all"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Journeys', val: stats.totalRecords, icon: Table, color: 'text-indigo-600' },
          { label: 'Paid Journeys', val: stats.paidRecords, icon: CheckCircle, color: 'text-green-700' },
          { label: 'Paid Revenue', val: `$${stats.paidRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, icon: CheckCircle, color: 'text-emerald-700' },
          { label: 'Total Revenue', val: `$${stats.totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, icon: TrendingUp, color: 'text-indigo-700' },
        ].map((stat) => (
          <div key={stat.label} className="bg-white/40 backdrop-blur-[20px] border border-white/30 p-4 rounded-2xl flex items-center gap-4 shadow-sm relative overflow-hidden group">
            <div className="absolute inset-0 bg-slate-100/40 opacity-0 group-hover:opacity-100 transition-opacity" />
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
          columnDefs={visibleColumnDefs}
          undoRedoCellEditing={true}
          undoRedoCellEditingLimit={20}
          suppressCellFocus={false}
          cellSelection={{
            suppressMultiRanges: true,
          }}
          onCellValueChanged={onCellValueChanged}
          onColumnMoved={(event: ColumnMovedEvent) => {
            if (!event.finished) return;

            const displayedIds = event.api.getAllDisplayedColumns().map((column) => column.getColId());
            setOrderedColumnIds((current) => {
              const fallback = columnDefs.map((column) => getColumnVisibilityId(column));
              const base = current.length > 0 ? current : fallback;
              const hiddenIds = base.filter((id) => !displayedIds.includes(id));
              return [...displayedIds, ...hiddenIds];
            });
          }}
          onColumnResized={(event: ColumnResizedEvent) => {
            if (!event.finished) return;

            const nextWidths = event.api.getColumns()?.reduce<Record<string, number>>((acc, column) => {
              acc[column.getColId()] = column.getActualWidth();
              return acc;
            }, {});

            if (nextWidths) {
              setColumnWidths(nextWidths);
            }
          }}
          onCellKeyDown={(event) => {
            void handleGridCellCopy(event);
          }}
          getRowStyle={getRowStyle}
          quickFilterText={searchText}
          defaultColDef={{
            sortable: false,
            filter: false,
            resizable: true,
            suppressHeaderMenuButton: true,
            cellStyle: { textAlign: 'left', paddingLeft: '6px', paddingRight: '6px' },
          }}
          rowHeight={28}
          headerHeight={34}
          animateRows={true}
        />
      </div>
    </div>
  );
}
