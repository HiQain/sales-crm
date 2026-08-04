import { useState, useMemo, useCallback, useEffect } from 'react';
import { AgGridReact } from 'ag-grid-react';
import type {
  ColDef,
  CellValueChangedEvent,
  ColumnMovedEvent,
  ColumnResizedEvent,
  RowClassParams,
  ICellRendererParams,
  ValueParserParams,
  ValueFormatterParams
} from 'ag-grid-community';
import {
  ModuleRegistry,
  themeQuartz,
} from 'ag-grid-community';
import { AllEnterpriseModule } from 'ag-grid-enterprise';
import apiClient from '../../api/client';
import { Loader2, Search, Trash2 } from 'lucide-react';
import { Lead, User } from '../../types';
import ColumnVisibilityMenu, { getColumnVisibilityId } from '../../components/ColumnVisibilityMenu';
import ConfirmDialog from '../../components/ConfirmDialog';
import LeadDateFilter from '../../components/LeadDateFilter';
import { filterLeadsByDate, type LeadDateFilter as LeadDateFilterValue } from '../../utils/leadDateFilter';
import {
  createCustomColumnId,
  loadCustomColumnValues,
  pickCustomColumnValues,
  saveCustomColumnValues,
  type CustomColumnDefinition,
  type CustomColumnValues,
} from '../../utils/customColumns';
import { handleGridCellCopy } from '../../utils/gridClipboard';
import { normalizeUsPhoneForStorage } from '../../utils/phone';
import { loadColumnLayout, mergeOrderedIds, mergeVisibleIds, saveColumnLayout } from '../../utils/columnLayout';

ModuleRegistry.registerModules([AllEnterpriseModule]);

type GridLead = Lead & { __isDraft?: boolean; [key: string]: unknown };
type EmployeeOption = Pick<User, 'id' | 'username'>;

const glassTheme = themeQuartz.withParams({
  backgroundColor: 'rgba(255, 255, 255)',
  headerBackgroundColor: 'rgba(0, 0, 0, 0.05)',
  headerTextColor: 'oklch(37.2% 0.044 257.287)', // slate-700
  headerFontWeight: 'bold',
  textColor: 'oklch(44.6% 0.043 257.281)', // slate-600
  fontSize: '12px',
  headerHeight: 34,
  rowHeight: 28,
  cellHorizontalPaddingScale: 0.45,
  headerColumnBorder: true,
});

const StatusBadge = (params: ICellRendererParams) => {
  const value = String(params.value || '').toLowerCase();
  let baseColor = 'bg-gray-50 text-slate-700 border-gray-500/20';

  if (value === 'paid') baseColor = 'bg-emerald-500 text-white border-emerald-600 shadow-sm';
  else if (value === 'pending') baseColor = 'bg-gray-50 text-slate-500 border-gray-500/20';
  else if (value === 'contacted') baseColor = 'bg-indigo-100 text-indigo-700 border-indigo-500/20';
  else if (value === 'failed') baseColor = 'bg-red-100 text-red-700 border-red-500/20';

  return (
    <div className="h-full flex items-center justify-center">
      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-widest border ${baseColor} leading-none`}>
        {params.value || 'N/A'}
      </span>
    </div>
  );
};

const createEmptyLead = (): GridLead => ({
  id: -1,
  contact: '',
  email: '',
  ns: '',
  business_owner: '',
  business_name: '',
  service: '',
  notes: '',
  lead_value: 0,
  lead: '',
  lead_status: 'pending',
  payment_date: '',
  payment_amount: 0,
  __isDraft: true,
});

const dividerStyle = {
  borderRight: '1px solid rgba(148, 163, 184, 0.45)',
};
const RESIZE_MIN_WIDTH = 56;

const areStringArraysEqual = (left: string[], right: string[]) =>
  left.length === right.length && left.every((value, index) => value === right[index]);

const withNormalizedLead = (lead: GridLead): GridLead => ({
  ...lead,
  contact: normalizeUsPhoneForStorage(lead.contact) ?? lead.contact,
});

export default function LeadsPage({ userId }: { userId?: string }) {
  const layoutStorageKey = userId ? `crm:admin-user-leads:${userId}` : 'crm:admin-leads';
  const customValuesStorageKey = `${layoutStorageKey}:custom-values`;
  const [rowData, setRowData] = useState<GridLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState('');
  const [dateFilter, setDateFilter] = useState<LeadDateFilterValue>('all');
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [draftRow, setDraftRow] = useState<GridLead>(createEmptyLead);
  const [leadPendingDelete, setLeadPendingDelete] = useState<number | string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [orderedColumnIds, setOrderedColumnIds] = useState<string[]>([]);
  const [visibleColumnIds, setVisibleColumnIds] = useState<string[]>([]);
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const [customColumns, setCustomColumns] = useState<CustomColumnDefinition[]>([]);
  const [customColumnValues, setCustomColumnValues] = useState<CustomColumnValues>(() => loadCustomColumnValues(customValuesStorageKey));
  const [layoutReady, setLayoutReady] = useState(false);

  const fetchUsers = useCallback(async () => {
    try {
      const response = await apiClient.get('/users');
      setEmployees(response.data.map((u: any) => ({
        id: Number(u.id),
        username: String(u.username ?? ''),
      })));
    } catch (error) {
      console.error('Failed to fetch employees:', error);
    }
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      let url = '/leads';
      if (userId) {
        url += `?userId=${userId}`;
      }
      const response = await apiClient.get(url);
      const leads = (Array.isArray(response.data) ? response.data : response.data.data || []) as GridLead[];
      setRowData(leads.map(withNormalizedLead));
    } catch (error) {
      console.error('Failed to fetch leads:', error);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchData();
    fetchUsers();
  }, [fetchData, fetchUsers]);

  const currencyFormatter = (params: ValueFormatterParams) => {
    if (params.value == null) return '$0';
    return `$${Number(params.value).toLocaleString()}`;
  };

  const numberParser = (params: ValueParserParams) => {
    const val = Number(params.newValue);
    return isNaN(val) ? params.oldValue : val;
  };

  const deleteLead = useCallback(async () => {
    if (leadPendingDelete == null) return;
    setDeleteLoading(true);
    try {
      await apiClient.delete(`/leads/${leadPendingDelete}`);
      setRowData(prev => prev.filter(l => l.id !== leadPendingDelete));
      setLeadPendingDelete(null);
    } catch (error) {
      console.error('Delete failed:', error);
    } finally {
      setDeleteLoading(false);
    }
  }, [leadPendingDelete]);

  const columnDefs = useMemo<ColDef<GridLead>[]>(() => {
    const columns: ColDef<GridLead>[] = [
      {
        field: 'contact',
        headerName: 'Contact',
        minWidth: 112,
        editable: true,
      },
      { field: 'email', headerName: 'Email', minWidth: 118, editable: true },
      { field: 'business_owner', headerName: 'Business Owner', minWidth: 118, editable: true },
      { field: 'business_name', headerName: 'Business Name', minWidth: 118, editable: true },
      { field: 'service', headerName: 'Service', minWidth: 92, editable: true, filter: true },
      {
        field: 'notes',
        headerName: 'Notes',
        minWidth: 180,
        editable: true,
        cellEditor: 'agLargeTextCellEditor',
        cellEditorPopup: true,
        cellClass: 'italic text-slate-500',
      },
      {
        field: 'lead_value',
        headerName: 'Lead Value',
        minWidth: 102,
        editable: true,
        valueParser: numberParser,
        valueFormatter: currencyFormatter,
        cellClass: 'font-mono font-bold',
        cellStyle: { textAlign: 'right', paddingLeft: '6px', paddingRight: '6px' },
      },
      {
        field: 'lead',
        headerName: 'Representative',
        minWidth: 92,
        editable: true,
        filter: true,
        cellEditor: 'agSelectCellEditor',
        cellEditorParams: { values: employees.map((employee) => employee.username) }
      },
      {
        field: 'lead_status',
        headerName: 'Status',
        minWidth: 104,
        editable: true,
        cellRenderer: StatusBadge,
        cellEditor: 'agTextCellEditor',
      },
      ...customColumns.map<ColDef<GridLead>>((column) => ({
        colId: column.id,
        field: column.id,
        headerName: column.label,
        minWidth: 140,
        editable: true,
        filter: true,
      })),
      {
        colId: 'actions',
        headerName: 'Actions',
        width: 64,
        pinned: 'right',
        cellRenderer: (params: ICellRendererParams) => (
          params.node.rowPinned === 'bottom' ? null : (
          <button
            onClick={() => setLeadPendingDelete(params.data.id)}
            className="p-1 hover:bg-rose-500/20 text-rose-500 rounded transition-colors mt-1"
          >
            <Trash2 size={16} />
          </button>
          )
        )
      }
    ];

    return columns.map((column, index) => ({
      ...column,
      minWidth: 'width' in column && column.width ? column.minWidth : RESIZE_MIN_WIDTH,
      cellStyle: index === columns.length - 1
        ? column.cellStyle
        : { ...(typeof column.cellStyle === 'object' ? column.cellStyle : {}), ...dividerStyle },
      headerStyle: index === columns.length - 1
        ? column.headerStyle
        : { ...(typeof column.headerStyle === 'object' ? column.headerStyle : {}), ...dividerStyle },
    }));
  }, [customColumns, employees, deleteLead]);

  const columnVisibilityOptions = useMemo(
    () => columnDefs.map((column) => ({
      id: getColumnVisibilityId(column),
      label: String(column.headerName ?? column.field ?? column.colId ?? 'Column'),
      isCustom: customColumns.some((customColumn) => customColumn.id === getColumnVisibilityId(column)),
    })),
    [columnDefs, customColumns],
  );

  useEffect(() => {
    setLayoutReady(false);
    const stored = loadColumnLayout(layoutStorageKey);

    setOrderedColumnIds(stored?.order ?? []);
    setVisibleColumnIds(stored?.visible ?? []);
    setColumnWidths(stored?.widths ?? {});
    setCustomColumns(stored?.customColumns ?? []);
    setCustomColumnValues(loadCustomColumnValues(customValuesStorageKey));
    setLayoutReady(true);
  }, [customValuesStorageKey, layoutStorageKey]);

  useEffect(() => {
    if (!layoutReady) return;

    const allIds = columnVisibilityOptions.map((column) => column.id);
    const nextOrderedIds = mergeOrderedIds(allIds, orderedColumnIds);
    const nextVisibleIds = mergeVisibleIds(nextOrderedIds, visibleColumnIds);

    if (!areStringArraysEqual(nextOrderedIds, orderedColumnIds)) {
      setOrderedColumnIds(nextOrderedIds);
    }

    if (!areStringArraysEqual(nextVisibleIds, visibleColumnIds)) {
      setVisibleColumnIds(nextVisibleIds);
    }
  }, [columnVisibilityOptions, layoutReady, orderedColumnIds, visibleColumnIds]);

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
      .filter((column): column is ColDef<GridLead> => Boolean(column) && visibleIdSet.has(getColumnVisibilityId(column)));
  }, [columnDefs, columnWidths, orderedColumnIds, visibleColumnIds]);

  useEffect(() => {
    if (!layoutReady || orderedColumnIds.length === 0) return;
    saveColumnLayout(layoutStorageKey, {
      order: orderedColumnIds,
      visible: visibleColumnIds,
      widths: columnWidths,
      customColumns,
    });
  }, [columnWidths, customColumns, layoutReady, layoutStorageKey, orderedColumnIds, visibleColumnIds]);

  useEffect(() => {
    saveCustomColumnValues(customValuesStorageKey, customColumnValues);
  }, [customColumnValues, customValuesStorageKey]);

  const customColumnIdSet = useMemo(
    () => new Set(customColumns.map((column) => column.id)),
    [customColumns],
  );

  const onCellValueChanged = useCallback(async (event: CellValueChangedEvent) => {
    const { data, colDef, newValue, oldValue, node } = event;
    const field = colDef.field;
    if (!field) return;

    if (customColumnIdSet.has(field)) {
      const customValue = String(newValue ?? '');

      if (node.rowPinned === 'bottom') {
        setDraftRow((prev) => ({ ...prev, [field]: customValue }));
        return;
      }

      setCustomColumnValues((prev) => ({
        ...prev,
        [String(data.id)]: {
          ...(prev[String(data.id)] ?? {}),
          [field]: customValue,
        },
      }));
      return;
    }

    const normalizedValue = field === 'contact'
      ? normalizeUsPhoneForStorage(newValue)
      : newValue;

    if (field === 'contact' && normalizedValue === null) {
      fetchData();
      return;
    }

    const nextValue = field === 'contact' ? (normalizedValue ?? oldValue ?? '') : newValue;
    const assignedEmployee = field === 'lead'
      ? employees.find((employee) => employee.username === String(nextValue ?? '').trim())
      : undefined;

    const hasValue = !(nextValue == null || (typeof nextValue === 'string' && nextValue.trim() === ''));
    if (node.rowPinned === 'bottom') {
      if (!hasValue) {
        setDraftRow(prev => ({ ...prev, [field]: nextValue }));
        return;
      }

      const nextDraft = withNormalizedLead({ ...draftRow, [field]: nextValue });
      const draftCustomValues = pickCustomColumnValues(nextDraft, customColumns);
      setDraftRow(createEmptyLead());

      try {
        const response = await apiClient.post('/leads', {
          contact: nextDraft.contact || '',
          email: nextDraft.email,
          business_owner: nextDraft.business_owner,
          business_name: nextDraft.business_name,
          service: nextDraft.service,
          notes: nextDraft.notes,
          lead_value: nextDraft.lead_value,
          lead: nextDraft.lead,
          lead_status: nextDraft.lead_status || 'pending',
          assigned_user: userId ? Number(userId) : undefined,
        });

        const createdLeadId = response.data?.id;
        if (createdLeadId != null && Object.keys(draftCustomValues).length > 0) {
          setCustomColumnValues((prev) => ({
            ...prev,
            [String(createdLeadId)]: {
              ...(prev[String(createdLeadId)] ?? {}),
              ...draftCustomValues,
            },
          }));
        }
        fetchData();
      } catch (error) {
        console.error('Create failed:', error);
        setDraftRow(nextDraft);
      }
      return;
    }

    Object.assign(data, withNormalizedLead({
      ...data,
      [field]: nextValue,
      ...(assignedEmployee ? { assigned_user: assignedEmployee.id } : {}),
    }));
    event.api.refreshCells({ rowNodes: [node] });

    try {
      const payload = field === 'lead'
        ? {
            lead: nextValue,
            assigned_user: assignedEmployee?.id ?? null,
          }
        : {
            [field]: nextValue,
          };

      await apiClient.put(`/leads/${data.id}`, payload);
      if (field === 'lead') {
        fetchData();
      }
    } catch (error) {
      console.error('Update failed:', error);
      fetchData();
    }
  }, [customColumnIdSet, customColumns, draftRow, employees, fetchData, userId]);

  const getRowStyle = (params: RowClassParams<GridLead>) => {
    if (params.node.rowPinned === 'bottom') {
      return { backgroundColor: 'rgba(255, 255, 255, 0.35)' };
    }
    if (params.data?.lead_status === 'paid') {
      return { backgroundColor: 'oklch(72.3% 0.219 149.579 / 0.1)' }; // green-500 with opacity
    }
    return undefined;
  };

  const filteredRowData = useMemo(() => {
    const rowsWithCustomValues = rowData.map((row) => ({
      ...row,
      ...(customColumnValues[String(row.id)] ?? {}),
    }));

    return filterLeadsByDate(rowsWithCustomValues, dateFilter);
  }, [customColumnValues, dateFilter, rowData]);
  const pinnedBottomRowData = useMemo(() => [draftRow], [draftRow]);

  const handleAddCustomColumn = useCallback((label: string) => {
    const trimmedLabel = label.trim();
    if (!trimmedLabel) return;

    const normalizedLabel = trimmedLabel.toLowerCase();
    const labelExists = columnVisibilityOptions.some((column) => column.label.toLowerCase() === normalizedLabel);
    if (labelExists) return;

    const customColumn = {
      id: createCustomColumnId(trimmedLabel),
      label: trimmedLabel,
    };

    setCustomColumns((current) => [...current, customColumn]);
    setOrderedColumnIds((current) => {
      const nextIds = current.filter((id) => id !== 'actions');
      return [...nextIds, customColumn.id, 'actions'];
    });
    setVisibleColumnIds((current) => [...current, customColumn.id]);
  }, [columnVisibilityOptions]);

  const handleDeleteCustomColumn = useCallback((columnId: string) => {
    setCustomColumns((current) => current.filter((column) => column.id !== columnId));
    setOrderedColumnIds((current) => current.filter((id) => id !== columnId));
    setVisibleColumnIds((current) => current.filter((id) => id !== columnId));
    setColumnWidths((current) => {
      const next = { ...current };
      delete next[columnId];
      return next;
    });
    setCustomColumnValues((current) => (
      Object.fromEntries(
        Object.entries(current).map(([rowId, values]) => {
          const nextValues = { ...values };
          delete nextValues[columnId];
          return [rowId, nextValues];
        }),
      )
    ));
    setDraftRow((current) => {
      const next = { ...current };
      delete next[columnId];
      return next;
    });
  }, []);

  return (
    <div className="p-2 h-full flex flex-col space-y-2 animate-in fade-in duration-500">
      <ConfirmDialog
        open={leadPendingDelete != null}
        title="Delete lead?"
        message="This will permanently remove the lead from the table. You can’t undo this action."
        confirmLabel="Delete Lead"
        onConfirm={deleteLead}
        onCancel={() => !deleteLoading && setLeadPendingDelete(null)}
        loading={deleteLoading}
      />
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-700 tracking-tight">
            {userId ? 'User Leads' : 'Global Leads Database'}
          </h2>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-indigo-600 transition-colors" size={18} />
            <input
              type="text"
              placeholder="Search leads..."
              className="bg-white border border-slate-300 pl-10 pr-4 py-2 rounded-xl text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 w-72 shadow-sm transition-all"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
            />
          </div>
          <ColumnVisibilityMenu
            columns={columnVisibilityOptions}
            visibleColumnIds={visibleColumnIds}
            onAddColumn={handleAddCustomColumn}
            onDeleteColumn={handleDeleteCustomColumn}
            onToggle={(columnId) => {
              setVisibleColumnIds((current) =>
                current.includes(columnId)
                  ? current.filter((id) => id !== columnId)
                  : [...current, columnId]
              );
            }}
          />
          <LeadDateFilter value={dateFilter} onChange={setDateFilter} />
        </div>
      </div>

      <div className="flex-1 bg-white/40 backdrop-blur-[20px] border border-white/30 rounded-2xl shadow-xl overflow-hidden flex flex-col min-h-[400px]">
        <div className="flex-1 relative">
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
    </div>
  );
}
