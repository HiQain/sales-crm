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
  Loader2,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import apiClient from '../api/client';
import type { ClientJourney, ClientOption } from '../types';
import ClientDetailsTable from './ClientDetailsTable';
import { MoveJourneyDialog, RenameClientDialog } from './ClientActionDialogs';
import { buildClientOptions } from '../utils/clients';
import ClientJourneyModal, {
  emptyJourneyRow,
  type ClientJourneyFormValues,
  type ClientJourneyModalInitialValues,
  type JourneySuggestions,
} from './ClientJourneyModal';
import ColumnVisibilityMenu, { getColumnVisibilityId } from './ColumnVisibilityMenu';
import ConfirmDialog from './ConfirmDialog';
import LeadDateFilter from './LeadDateFilter';
import { filterItemsByDate, type LeadDateFilter as DateFilterValue } from '../utils/leadDateFilter';
import { formatDateDisplay, formatRowTimestampTooltip } from '../utils/date';
import { handleGridCellCopy } from '../utils/gridClipboard';
import { getSelectedCompanyId } from '../utils/company';
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
  const layoutStorageKey = `crm:${mode}-client-journeys:company:${getSelectedCompanyId()}`;
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
  const [view, setView] = useState<'journeys' | 'details'>('journeys');
  const [journeyModal, setJourneyModal] = useState<{
    mode: 'create' | 'edit';
    recordId?: number;
    initialValues?: ClientJourneyModalInitialValues;
  } | null>(null);
  const [recordToMove, setRecordToMove] = useState<ClientJourney | null>(null);
  const [clientToRename, setClientToRename] = useState<ClientOption | null>(null);

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

  // Clients (grouped by client_id) for the dialog picker and the Client Details view.
  const clientOptions = useMemo(() => buildClientOptions(rowData), [rowData]);

  const journeySuggestions = useMemo<JourneySuggestions>(() => {
    const collect = (values: unknown[], defaults: string[] = []) => {
      const seen = new Map<string, string>();
      [...defaults, ...values].forEach((value) => {
        const text = String(value ?? '').trim();
        if (text && !seen.has(text.toLowerCase())) seen.set(text.toLowerCase(), text);
      });
      return [...seen.values()].sort((a, b) => a.localeCompare(b));
    };
    return {
      sales: collect(rowData.map((record) => record.sales)),
      lead: collect(rowData.map((record) => record.lead)),
      service: collect(rowData.map((record) => record.service)),
      status: collect(rowData.map((record) => record.status), ['pending', 'paid']),
    };
  }, [rowData]);

  const submitJourneys = useCallback(async (values: ClientJourneyFormValues) => {
    if (journeyModal?.mode === 'edit' && journeyModal.recordId != null) {
      const recordId = journeyModal.recordId;
      const updates = {
        client_name: values.client_name,
        client_id: values.client_id,
        ...values.records[0],
      };
      const response = await apiClient.put(`/client-journeys/${recordId}`, updates);
      // The server may have linked the row to another client; use what it decided.
      const linked = {
        client_id: response.data?.client_id ?? null,
        client_name: response.data?.client_name ?? values.client_name,
      };
      setRowData((current) => current.map((record) => (
        record.id === recordId ? withDerivedJourneyValues({ ...record, ...updates, ...linked }) : record
      )));
    } else {
      const response = await apiClient.post('/client-journeys/bulk', {
        ...values,
        assigned_user: scopedUserId,
      });
      const created = (response.data as GridClientJourney[]).map(withDerivedJourneyValues);
      setRowData((current) => [...created, ...current]);
    }
    setJourneyModal(null);
  }, [journeyModal, scopedUserId]);

  const openEditJourney = useCallback((record: ClientJourney) => {
    setJourneyModal({
      mode: 'edit',
      recordId: record.id,
      initialValues: {
        client_name: record.client_name,
        client_id: record.client_id ?? null,
        rows: [{
          record_date: toDateOnly(record.record_date),
          business_name: record.business_name || '',
          credit_card_info: record.credit_card_info || '',
          email: record.email || '',
          phone: record.phone || '',
          sales: record.sales || '',
          lead: record.lead || '',
          service: record.service || '',
          status: record.status || '',
          paid: String(toMoney(record.paid)),
          total: String(toMoney(record.total)),
        }],
      },
    });
  }, []);

  const moveJourney = useCallback(async (target: { client_id: number } | { new_client_name: string }) => {
    if (!recordToMove) return;
    const response = await apiClient.post(`/client-journeys/${recordToMove.id}/move`, target);
    const { client_id: clientId, client_name: clientName } = response.data as { client_id: number; client_name: string };
    setRowData((current) => current.map((record) => (
      record.id === recordToMove.id ? { ...record, client_id: clientId, client_name: clientName } : record
    )));
    setRecordToMove(null);
  }, [recordToMove]);

  const renameClient = useCallback(async (name: string) => {
    if (!clientToRename?.id) return;
    const clientId = clientToRename.id;
    await apiClient.put(`/clients/${clientId}`, { name });
    setRowData((current) => current.map((record) => (
      record.client_id === clientId ? { ...record, client_name: name } : record
    )));
    setClientToRename(null);
  }, [clientToRename]);

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
      },
      {
        field: 'balance',
        headerName: 'Balance',
        minWidth: 102,
        editable: true,
        valueParser: numberParser,
        valueFormatter: currencyFormatter,
      },
      {
        field: 'total',
        headerName: 'Total',
        minWidth: 102,
        editable: true,
        valueParser: numberParser,
        valueFormatter: currencyFormatter,
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
      const response = await apiClient.put(`/client-journeys/${data.id}`, {
        ...(field === 'paid' || field === 'total'
          ? { [field]: nextValue, balance: normalizedNextRecord.balance }
          : { [field]: nextValue }),
      });
      if (field === 'client_name' && response.data?.client_id) {
        const { client_id: clientId, client_name: clientName } = response.data;
        setRowData((current) => current.map((record) => (
          record.id === data.id ? { ...record, client_id: clientId, client_name: clientName } : record
        )));
      }
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

  return (
    <div className="p-2 h-full flex flex-col space-y-4 animate-in fade-in duration-500">
      <ConfirmDialog
        open={recordPendingDelete != null}
        title="Delete client journey?"
        message="This will remove the client journey permanently. You can't undo this action."
        confirmLabel="Delete Journey"
        onConfirm={deleteRecord}
        onCancel={() => !deleteLoading && setRecordPendingDelete(null)}
        loading={deleteLoading}
      />

      <ClientJourneyModal
        open={journeyModal != null}
        mode={journeyModal?.mode ?? 'create'}
        initialValues={journeyModal?.initialValues}
        clients={clientOptions}
        suggestions={journeySuggestions}
        onCancel={() => setJourneyModal(null)}
        onSubmit={submitJourneys}
      />

      {recordToMove && (
        <MoveJourneyDialog
          record={recordToMove}
          clients={clientOptions}
          onCancel={() => setRecordToMove(null)}
          onMove={moveJourney}
        />
      )}

      {clientToRename && (
        <RenameClientDialog
          client={clientToRename}
          onCancel={() => setClientToRename(null)}
          onRename={renameClient}
        />
      )}

      <div className="flex flex-col gap-4 xl:flex-row xl:items-center">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-2xl font-bold text-slate-700 tracking-tight whitespace-nowrap">
            {mode === 'admin' ? 'Client Journey' : 'My Clients'}
          </h2>
          <div role="tablist" aria-label="Client Journey view" className="inline-flex rounded-lg border border-slate-300 bg-white p-0.5 shadow-sm">
            {([
              { id: 'journeys', label: 'Journeys' },
              { id: 'details', label: 'Client Details' },
            ] as const).map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={view === tab.id}
                onClick={() => setView(tab.id)}
                className={`rounded-md px-3 py-1.5 text-sm font-semibold transition ${view === tab.id ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'}`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="hidden xl:block xl:flex-1" />

        <div className="flex flex-wrap items-center gap-3 md:justify-end">
          <div className="relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-indigo-600 transition-colors" size={18} />
            <input
              type="text"
              placeholder={view === 'details' ? 'Search clients...' : 'Search client journeys...'}
              className="bg-white border border-slate-300 pl-10 pr-4 py-2 rounded-md text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 w-56 shadow-sm transition-all"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
            />
          </div>
          {view === 'journeys' && (
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
          )}
          {view === 'journeys' && <LeadDateFilter value={dateFilter} onChange={setDateFilter} />}
          <button
            type="button"
            onClick={() => setJourneyModal({ mode: 'create' })}
            className="inline-flex h-[38px] items-center gap-2 rounded-md bg-indigo-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700"
          >
            <Plus size={16} />
            Add Client Journeys
          </button>
        </div>
      </div>

      <div className="flex-1 bg-white/40 backdrop-blur-[20px] border border-white/30 rounded-2xl shadow-xl overflow-hidden min-h-[400px] relative">
        {loading && (
          <div className="absolute inset-0 z-50 bg-white/10 backdrop-blur-[1px] flex items-center justify-center">
            <Loader2 className="animate-spin text-indigo-600" size={32} />
          </div>
        )}
        {view === 'details' ? (
          <div className="h-full bg-white">
            <ClientDetailsTable
              records={rowData}
              clients={clientOptions}
              searchText={searchText}
              onEdit={openEditJourney}
              onDelete={(record) => setRecordPendingDelete(record.id)}
              onMove={setRecordToMove}
              onRenameClient={setClientToRename}
              onAddForClient={(client) => setJourneyModal({
                mode: 'create',
                initialValues: {
                  client_name: client.name,
                  client_id: client.id,
                  rows: [emptyJourneyRow()],
                },
              })}
            />
          </div>
        ) : (
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
          enableBrowserTooltips={true}
          defaultColDef={{
            sortable: false,
            filter: false,
            resizable: true,
            suppressHeaderMenuButton: true,
            cellStyle: { textAlign: 'left', paddingLeft: '6px', paddingRight: '6px' },
            tooltipValueGetter: (params) => formatRowTimestampTooltip(params.data),
          }}
          rowHeight={28}
          headerHeight={34}
          animateRows={true}
        />
        )}
      </div>
    </div>
  );
}
