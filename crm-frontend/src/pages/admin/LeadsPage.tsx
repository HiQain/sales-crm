import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { AgGridReact } from 'ag-grid-react';
import type {
  ColDef,
  CellValueChangedEvent,
  ColumnMovedEvent,
  ColumnResizedEvent,
  RowDragEndEvent,
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
import { CalendarPlus, Check, GripVertical, Loader2, Search, Trash2, Users, X } from 'lucide-react';
import { Lead, User } from '../../types';
import ColumnVisibilityMenu, { getColumnVisibilityId } from '../../components/ColumnVisibilityMenu';
import ConfirmDialog from '../../components/ConfirmDialog';
import LeadDateFilter from '../../components/LeadDateFilter';
import { filterLeadsByDate, LEAD_DATE_FILTERS, type LeadDateFilter as LeadDateFilterValue } from '../../utils/leadDateFilter';
import { formatRowTimestampTooltip } from '../../utils/date';
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
import { loadColumnLayout, mergeOrderedIds, mergeVisibleIds, type StoredColumnLayout } from '../../utils/columnLayout';

ModuleRegistry.registerModules([AllEnterpriseModule]);

type GridLead = Lead & { __isDraft?: boolean; [key: string]: unknown };
type EmployeeOption = Pick<User, 'id' | 'username'>;
type VisibilityUser = Pick<User, 'id' | 'username' | 'email' | 'role_type'>;
type ShareLeadStatusFilter = 'all' | 'paid' | 'unpaid';
type DateMarkerRow = GridLead & {
  markerDate: string;
  markerDay: string;
};

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
  if ((params.data as DateMarkerRow | undefined)?.is_date_marker) {
    return null;
  }

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

const ActionsCellRenderer = (
  params: ICellRendererParams<GridLead> & {
    canReorder: boolean;
    canDelete: boolean;
    onDelete: (id: number | string) => void;
  },
) => {
  const dragHandleRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!params.canReorder) return;
    if (!dragHandleRef.current || params.node.rowPinned === 'bottom') return;
    if (typeof params.registerRowDragger !== 'function') return;

    params.registerRowDragger(dragHandleRef.current, 4);
  }, [params]);

  if (params.node.rowPinned === 'bottom') {
    return null;
  }

  return (
    <div className="flex h-full items-center justify-center gap-1">
      {params.canReorder && (
        <button
          ref={dragHandleRef}
          type="button"
          className="cursor-move p-1 text-slate-400 hover:bg-slate-200/70 hover:text-slate-600 rounded transition-colors"
          aria-label="Drag row"
        >
          <GripVertical size={15} />
        </button>
      )}
      {params.canDelete && (
        <button
          type="button"
          onClick={() => params.onDelete(params.data.id)}
          className="p-1 hover:bg-rose-500/20 text-rose-500 rounded transition-colors"
        >
          <Trash2 size={16} />
        </button>
      )}
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
  source: '',
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
const setFilterParams = {
  suppressSelectAll: true,
};

const areStringArraysEqual = (left: string[], right: string[]) =>
  left.length === right.length && left.every((value, index) => value === right[index]);

const withNormalizedLead = (lead: GridLead): GridLead => ({
  ...lead,
  contact: normalizeUsPhoneForStorage(lead.contact) ?? lead.contact,
});

const getAssignedUserId = (lead: GridLead) => {
  if (typeof lead.assigned_user === 'number') {
    return lead.assigned_user;
  }

  if (lead.assigned_user && typeof lead.assigned_user === 'object' && 'id' in lead.assigned_user) {
    return Number(lead.assigned_user.id);
  }

  return null;
};

const getCreatedByUserId = (lead: GridLead) => {
  const createdBy = lead.created_by;
  const numericCreatedBy = Number(createdBy);

  return Number.isInteger(numericCreatedBy) && numericCreatedBy > 0
    ? numericCreatedBy
    : null;
};

const LEGACY_SHARED_LAYOUT_KEYS = ['crm:admin-leads', 'crm:employee-leads'];

const formatMarkerDate = (dateValue: string) => {
  const trimmedValue = String(dateValue ?? '').trim();
  const isoMatch = trimmedValue.match(/^(\d{4}-\d{2}-\d{2})$/);
  const parsedDate = isoMatch
    ? new Date(`${isoMatch[1]}T00:00:00`)
    : new Date(trimmedValue);

  if (Number.isNaN(parsedDate.getTime())) {
    return {
      rawDate: '',
      markerLabel: trimmedValue || 'Invalid date',
      markerDay: '',
    };
  }

  const rawDate = `${parsedDate.getFullYear()}-${String(parsedDate.getMonth() + 1).padStart(2, '0')}-${String(parsedDate.getDate()).padStart(2, '0')}`;

  return {
    rawDate,
    markerLabel: new Intl.DateTimeFormat('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    }).format(parsedDate),
    markerDay: new Intl.DateTimeFormat('en-US', {
      weekday: 'long',
    }).format(parsedDate),
  };
};

export default function LeadsPage({ userId }: { userId?: string }) {
  const user = useMemo(() => {
    const userStr = localStorage.getItem('user');
    return userStr ? JSON.parse(userStr) : null;
  }, []);
  const userRole = user?.role?.type || user?.role?.name?.toLowerCase() || user?.role;
  const isAdmin = userRole === 'admin';
  const currentUserId = Number(user?.id ?? 0);
  const currentUsername = String(user?.username ?? '').trim();
  const layoutStorageKey = userId
    ? `crm:admin-user-leads:${userId}`
    : isAdmin
      ? 'crm:admin-leads'
      : 'crm:employee-leads';
  const customValuesStorageKey = `${layoutStorageKey}:custom-values`;
  const [rowData, setRowData] = useState<GridLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState('');
  const [dateFilter, setDateFilter] = useState<LeadDateFilterValue>('all');
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [usersForVisibility, setUsersForVisibility] = useState<VisibilityUser[]>([]);
  const [draftRow, setDraftRow] = useState<GridLead>(createEmptyLead);
  const [leadPendingDelete, setLeadPendingDelete] = useState<number | string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [orderedColumnIds, setOrderedColumnIds] = useState<string[]>([]);
  const [visibleColumnIds, setVisibleColumnIds] = useState<string[]>([]);
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const [customColumns, setCustomColumns] = useState<CustomColumnDefinition[]>([]);
  const [customColumnValues, setCustomColumnValues] = useState<CustomColumnValues>(() => loadCustomColumnValues(customValuesStorageKey));
  const [layoutReady, setLayoutReady] = useState(false);
  const [layoutHydrated, setLayoutHydrated] = useState(false);
  const [visibilityModalOpen, setVisibilityModalOpen] = useState(false);
  const [visibilitySearch, setVisibilitySearch] = useState('');
  const [selectedSourceUserIds, setSelectedSourceUserIds] = useState<number[]>([]);
  const [activeVisibilityUserId, setActiveVisibilityUserId] = useState<number | null>(null);
  const [selectedTargetEmployeeIds, setSelectedTargetEmployeeIds] = useState<number[]>([]);
  const [shareLeadStatusFilter, setShareLeadStatusFilter] = useState<ShareLeadStatusFilter>('all');
  const [shareDateFilter, setShareDateFilter] = useState<LeadDateFilterValue>('all');
  const [visibilityLoading, setVisibilityLoading] = useState(false);

  const canManageEmployeeLead = useCallback((lead: GridLead) => {
    const assignedUserId = getAssignedUserId(lead);

    if (assignedUserId != null) {
      return assignedUserId === currentUserId;
    }

    return String(lead.lead ?? '').trim() === currentUsername;
  }, [currentUserId, currentUsername]);

  const canViewDateMarker = useCallback((lead: GridLead) => {
    if (!lead.is_date_marker) {
      return true;
    }

    if (userId) {
      return getAssignedUserId(lead) === Number(userId);
    }

    return getCreatedByUserId(lead) === currentUserId;
  }, [currentUserId, userId]);

  const fetchUsers = useCallback(async () => {
    if (!isAdmin) {
      setEmployees([]);
      setUsersForVisibility([]);
      return;
    }

    try {
      const response = await apiClient.get('/users');
      const users = (Array.isArray(response.data) ? response.data : []) as VisibilityUser[];
      setUsersForVisibility(users);
      setEmployees(users.map((u) => ({
        id: Number(u.id),
        username: String(u.username ?? ''),
      })));
    } catch (error) {
      console.error('Failed to fetch employees:', error);
    }
  }, [isAdmin]);

  const applyStoredLayout = useCallback((stored: StoredColumnLayout | null) => {
    setOrderedColumnIds(stored?.order ?? []);
    setVisibleColumnIds(stored?.visible ?? []);
    setColumnWidths(stored?.widths ?? {});
    setCustomColumns(stored?.customColumns ?? []);
  }, []);

  const fetchSharedLayout = useCallback(async () => {
    setLayoutReady(false);

    try {
      const response = await apiClient.get('/leads/layout');
      const remoteLayout = response.data as StoredColumnLayout | null;

      if (remoteLayout) {
        applyStoredLayout(remoteLayout);
      } else {
        const fallbackLayout = loadColumnLayout(layoutStorageKey)
          ?? LEGACY_SHARED_LAYOUT_KEYS
            .filter((key) => key !== layoutStorageKey)
            .map((key) => loadColumnLayout(key))
            .find(Boolean)
          ?? null;

        applyStoredLayout(fallbackLayout);
      }
    } catch (error) {
      console.error('Failed to fetch shared layout:', error);
      const fallbackLayout = loadColumnLayout(layoutStorageKey)
        ?? LEGACY_SHARED_LAYOUT_KEYS
          .filter((key) => key !== layoutStorageKey)
          .map((key) => loadColumnLayout(key))
          .find(Boolean)
        ?? null;
      applyStoredLayout(fallbackLayout);
    } finally {
      setLayoutReady(true);
      setLayoutHydrated(true);
    }
  }, [applyStoredLayout, layoutStorageKey]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      let url = '/leads';
      if (isAdmin && userId) {
        url += `?userId=${userId}`;
      }
      const response = await apiClient.get(url);
      const leads = (Array.isArray(response.data) ? response.data : response.data.data || []) as GridLead[];
      setRowData(leads.map((lead) => {
        const normalizedLead = withNormalizedLead(lead);
        const markerDate = normalizedLead.marker_date || normalizedLead.notes || '';
        const formatted = normalizedLead.is_date_marker ? formatMarkerDate(markerDate) : null;

        return formatted
          ? {
              ...normalizedLead,
              marker_date: formatted.rawDate,
              markerDate: formatted.rawDate,
              markerDay: formatted.markerDay,
              notes: formatted.rawDate || '',
            }
          : normalizedLead;
      }));
    } catch (error) {
      console.error('Failed to fetch leads:', error);
    } finally {
      setLoading(false);
    }
  }, [isAdmin, userId]);

  useEffect(() => {
    fetchData();
    fetchUsers();
    fetchSharedLayout();
  }, [fetchData, fetchSharedLayout, fetchUsers]);

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

  const duplicateContacts = useMemo(() => {
    const contactCounts = new Map<string, number>();

    rowData.forEach((row) => {
      const value = String(row.contact ?? '').trim();
      if (!value) return;

      contactCounts.set(value, (contactCounts.get(value) ?? 0) + 1);
    });

    return new Set(
      Array.from(contactCounts.entries())
        .filter(([, count]) => count > 1)
        .map(([contact]) => contact),
    );
  }, [rowData]);

  const sourceUsers = useMemo(
    () => usersForVisibility,
    [usersForVisibility],
  );
  const targetUsers = useMemo(
    () => usersForVisibility.filter((entry) => entry.role_type === 'employee' && Number(entry.id) !== currentUserId),
    [currentUserId, usersForVisibility],
  );
  const filteredSourceUsers = useMemo(() => {
    const query = visibilitySearch.trim().toLowerCase();
    if (!query) return sourceUsers;

    return sourceUsers.filter((entry) => (
      String(entry.username ?? '').toLowerCase().includes(query) ||
      String(entry.email ?? '').toLowerCase().includes(query)
    ));
  }, [sourceUsers, visibilitySearch]);
  const filteredTargetUsers = useMemo(() => {
    const query = visibilitySearch.trim().toLowerCase();
    const baseUsers = targetUsers.filter((entry) => !selectedSourceUserIds.includes(Number(entry.id)));
    if (!query) return baseUsers;

    return baseUsers.filter((entry) => (
      String(entry.username ?? '').toLowerCase().includes(query) ||
      String(entry.email ?? '').toLowerCase().includes(query)
    ));
  }, [selectedSourceUserIds, targetUsers, visibilitySearch]);
  const selectedSourceUsers = useMemo(
    () => sourceUsers.filter((entry) => selectedSourceUserIds.includes(Number(entry.id))),
    [selectedSourceUserIds, sourceUsers],
  );
  const activeVisibilityUser = useMemo(
    () => sourceUsers.find((entry) => Number(entry.id) === activeVisibilityUserId) ?? null,
    [activeVisibilityUserId, sourceUsers],
  );

  const columnDefs = useMemo<ColDef<GridLead>[]>(() => {
    const employeeEditable = (params: any) => {
      if (params.node?.rowPinned === 'bottom') {
        return true;
      }

      return params.data ? canManageEmployeeLead(params.data as GridLead) : false;
    };

    const columns: ColDef<GridLead>[] = [
      {
        field: 'contact',
        headerName: 'Contact',
        minWidth: 112,
        editable: isAdmin ? true : employeeEditable,
        cellStyle: (params) => {
          const value = String(params.value ?? '').trim();

          if (!value || !duplicateContacts.has(value)) {
            return undefined;
          }

          return {
            backgroundColor: '#fca5a5',
          };
        },
      },
      { field: 'email', headerName: 'Email', minWidth: 118, editable: isAdmin ? true : employeeEditable },
      { field: 'business_owner', headerName: 'Business Owner', minWidth: 118, editable: isAdmin ? true : employeeEditable },
      { field: 'business_name', headerName: 'Business Name', minWidth: 118, editable: isAdmin ? true : employeeEditable },
      { field: 'source', headerName: 'Source', minWidth: 100, editable: isAdmin ? true : employeeEditable, filter: true, filterParams: setFilterParams },
      { field: 'service', headerName: 'Service', minWidth: 92, editable: isAdmin ? true : employeeEditable, filter: true, filterParams: setFilterParams },
      {
        field: 'notes',
        headerName: 'Notes',
        minWidth: 180,
        editable: isAdmin ? true : employeeEditable,
        cellEditor: 'agLargeTextCellEditor',
        cellEditorPopup: true,
        cellEditorSelector: (params) => (
          (params.data as DateMarkerRow | undefined)?.is_date_marker
            ? { component: 'agDateStringCellEditor' }
            : undefined
        ),
        valueFormatter: (params) => {
          const markerRow = params.data as DateMarkerRow | undefined;

          if (markerRow?.is_date_marker && markerRow.markerDate) {
            const { markerLabel, markerDay } = formatMarkerDate(markerRow.markerDate);
            return markerDay ? `${markerDay}, ${markerLabel}` : markerLabel;
          }

          return params.value;
        },
        cellStyle: (params) => (
          (params.data as DateMarkerRow | undefined)?.is_date_marker
            ? {
                textAlign: 'center',
                fontWeight: 700,
                color: '#78350f',
              }
            : undefined
        ),
        cellClass: (params) => (
          (params.data as DateMarkerRow | undefined)?.is_date_marker
            ? 'text-center font-bold text-amber-900'
            : 'italic text-slate-500'
        ),
      },
      {
        field: 'lead_value',
        headerName: 'Lead Value',
        minWidth: 102,
        editable: isAdmin ? true : employeeEditable,
        valueParser: numberParser,
        valueFormatter: (params) => (
          (params.data as DateMarkerRow | undefined)?.is_date_marker
            ? ''
            : currencyFormatter(params)
        ),
        cellClass: 'font-mono font-bold',
        cellStyle: { textAlign: 'right', paddingLeft: '6px', paddingRight: '6px' },
      },
      {
        field: 'lead',
        headerName: 'Agent',
        minWidth: 92,
        editable: isAdmin,
        filter: true,
        filterParams: setFilterParams,
        ...(isAdmin
          ? {
              cellEditor: 'agSelectCellEditor',
              cellEditorParams: { values: employees.map((employee) => employee.username) },
            }
          : {}),
      },
      {
        field: 'lead_status',
        headerName: 'Status',
        minWidth: 104,
        editable: isAdmin ? true : employeeEditable,
        filter: true,
        filterParams: setFilterParams,
        cellRenderer: StatusBadge,
        cellEditor: 'agTextCellEditor',
      },
      ...customColumns.map<ColDef<GridLead>>((column) => ({
        colId: column.id,
        field: column.id,
        headerName: column.label,
        minWidth: 140,
        editable: isAdmin ? true : employeeEditable,
        filter: true,
        filterParams: setFilterParams,
      })),
      {
        colId: 'actions',
        headerName: 'Actions',
        width: 86,
        pinned: 'right',
        cellRenderer: (params: ICellRendererParams<GridLead>) => (
          <ActionsCellRenderer
            {...params}
            canReorder={isAdmin || (params.data ? canManageEmployeeLead(params.data) : false)}
            canDelete={isAdmin || (params.data ? canManageEmployeeLead(params.data) : false)}
            onDelete={(id) => setLeadPendingDelete(id)}
          />
        ),
      }
    ];

    return columns.map((column, index) => ({
      ...column,
      minWidth: 'width' in column && column.width ? column.minWidth : RESIZE_MIN_WIDTH,
      cellStyle: typeof column.cellStyle === 'function'
        ? (((params: any) => {
            const resolvedStyle = (column.cellStyle as any)?.(params) as Record<string, string | number> | undefined;

            return index === columns.length - 1
              ? resolvedStyle
              : { ...(resolvedStyle ?? {}), ...dividerStyle };
          }) as ColDef<GridLead>['cellStyle'])
        : index === columns.length - 1
          ? column.cellStyle
          : { ...(typeof column.cellStyle === 'object' ? column.cellStyle : {}), ...dividerStyle },
      headerStyle: index === columns.length - 1
        ? column.headerStyle
        : { ...(typeof column.headerStyle === 'object' ? column.headerStyle : {}), ...dividerStyle },
    }));
  }, [canManageEmployeeLead, customColumns, deleteLead, duplicateContacts, employees, isAdmin]);

  const columnVisibilityOptions = useMemo(
    () => columnDefs.map((column) => ({
      id: getColumnVisibilityId(column),
      label: String(column.headerName ?? column.field ?? column.colId ?? 'Column'),
      isCustom: customColumns.some((customColumn) => customColumn.id === getColumnVisibilityId(column)),
    })),
    [columnDefs, customColumns],
  );

  useEffect(() => {
    setCustomColumnValues(loadCustomColumnValues(customValuesStorageKey));
  }, [customValuesStorageKey]);

  useEffect(() => {
    if (!layoutReady) return;

    const allIds = columnVisibilityOptions.map((column) => column.id);
    const nextOrderedIds = mergeOrderedIds(allIds, orderedColumnIds);
    const nextVisibleIds = mergeVisibleIds(nextOrderedIds, visibleColumnIds, orderedColumnIds);

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
    if (!layoutReady || !layoutHydrated || orderedColumnIds.length === 0) return;

    const timeoutId = window.setTimeout(() => {
      void apiClient.put('/leads/layout', {
        order: orderedColumnIds,
        visible: visibleColumnIds,
        widths: columnWidths,
        customColumns,
      }).catch((error) => {
        console.error('Failed to save shared layout:', error);
      });
    }, 400);

    return () => window.clearTimeout(timeoutId);
  }, [columnWidths, customColumns, layoutHydrated, layoutReady, orderedColumnIds, visibleColumnIds]);

  useEffect(() => {
    saveCustomColumnValues(customValuesStorageKey, customColumnValues);
  }, [customColumnValues, customValuesStorageKey]);

  const customColumnIdSet = useMemo(
    () => new Set(customColumns.map((column) => column.id)),
    [customColumns],
  );

  const onCellValueChanged = useCallback(async (event: CellValueChangedEvent) => {
    if (!isAdmin && event.data && !canManageEmployeeLead(event.data as GridLead) && event.node.rowPinned !== 'bottom') {
      fetchData();
      return;
    }

    const { data, colDef, newValue, oldValue, node } = event;
    const field = colDef.field;
    if (!field) return;
    if ((data as DateMarkerRow).is_date_marker) {
      if (field !== 'notes' || typeof newValue !== 'string' || !newValue) return;

      const { rawDate, markerDay } = formatMarkerDate(newValue);
      const nextMarker = {
        ...data,
        marker_date: rawDate,
        markerDate: rawDate,
        markerDay,
        notes: rawDate,
      };
      Object.assign(data, nextMarker);
      setRowData((prev) => prev.map((row) => (
        row.id === data.id ? nextMarker : row
      )));
      event.api.refreshCells({ rowNodes: [node] });

      void apiClient.put(`/leads/${data.id}`, {
        marker_date: rawDate,
        notes: rawDate,
      }).catch((error) => {
        console.error('Date marker update failed:', error);
        fetchData();
      });
      return;
    }

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
    const assignedEmployee = isAdmin && field === 'lead'
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
          source: nextDraft.source,
          service: nextDraft.service,
          notes: nextDraft.notes,
          lead_value: nextDraft.lead_value,
          lead: nextDraft.lead,
          lead_status: nextDraft.lead_status || 'pending',
          assigned_user: isAdmin && userId ? Number(userId) : undefined,
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
        if (isAdmin && createdLeadId != null) {
          await apiClient.put('/leads/reorder', {
            leadIds: [...rowData.map((row) => Number(row.id)), Number(createdLeadId)],
          });
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
    setRowData((prev) => prev.map((row) => (
      row.id === data.id
        ? withNormalizedLead({
            ...row,
            [field]: nextValue,
            ...(assignedEmployee ? { assigned_user: assignedEmployee.id } : {}),
          })
        : row
    )));
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
  }, [canManageEmployeeLead, customColumnIdSet, customColumns, draftRow, employees, fetchData, isAdmin, rowData, userId]);

  const openVisibilityModal = useCallback(() => {
    setSelectedSourceUserIds([]);
    setActiveVisibilityUserId(null);
    setSelectedTargetEmployeeIds([]);
    setShareLeadStatusFilter('all');
    setShareDateFilter('all');
    setVisibilitySearch('');
    setVisibilityModalOpen(true);
  }, []);

  const closeVisibilityModal = useCallback(() => {
    if (visibilityLoading) return;

    setVisibilityModalOpen(false);
    setSelectedSourceUserIds([]);
    setActiveVisibilityUserId(null);
    setSelectedTargetEmployeeIds([]);
    setShareLeadStatusFilter('all');
    setShareDateFilter('all');
    setVisibilitySearch('');
  }, [visibilityLoading]);

  const loadVisibilityForUser = useCallback(async (sourceUserId: number) => {
    if (selectedSourceUserIds.includes(sourceUserId)) {
      const remainingIds = selectedSourceUserIds.filter((id) => id !== sourceUserId);
      setSelectedSourceUserIds(remainingIds);

      if (remainingIds.length === 0) {
        setActiveVisibilityUserId(null);
        setSelectedTargetEmployeeIds([]);
        setShareLeadStatusFilter('all');
        setShareDateFilter('all');
      } else {
        setActiveVisibilityUserId(remainingIds[0]);
      }
      return;
    }

    if (selectedSourceUserIds.length > 0) {
      setSelectedSourceUserIds((current) => [...current, sourceUserId]);
      return;
    }

    try {
      setVisibilityLoading(true);
      setSelectedSourceUserIds([sourceUserId]);
      setActiveVisibilityUserId(sourceUserId);
      const response = await apiClient.get(`/users/${sourceUserId}/employee-visibility`);
      setSelectedTargetEmployeeIds(Array.isArray(response.data?.employeeIds) ? response.data.employeeIds : []);
      setShareLeadStatusFilter((response.data?.leadStatusFilter as ShareLeadStatusFilter) || 'all');
      setShareDateFilter((response.data?.dateFilter as LeadDateFilterValue) || 'all');
    } catch (error) {
      console.error('Failed to load visibility settings:', error);
      setSelectedTargetEmployeeIds([]);
      setShareLeadStatusFilter('all');
      setShareDateFilter('all');
    } finally {
      setVisibilityLoading(false);
    }
  }, [selectedSourceUserIds]);

  const toggleTargetEmployeeSelection = useCallback((employeeId: number) => {
    setSelectedTargetEmployeeIds((current) => (
      current.includes(employeeId)
        ? current.filter((value) => value !== employeeId)
        : [...current, employeeId]
    ));
  }, []);

  const saveVisibilitySettings = useCallback(async () => {
    if (selectedSourceUserIds.length === 0) return;

    try {
      setVisibilityLoading(true);
      await Promise.all(
        selectedSourceUserIds.map((sourceUserId) => (
          apiClient.put(`/users/${sourceUserId}/employee-visibility`, {
            employeeIds: selectedTargetEmployeeIds,
            leadStatusFilter: shareLeadStatusFilter,
            dateFilter: shareDateFilter,
          })
        )),
      );
      setUsersForVisibility((current) => current.map((entry) => (
        selectedSourceUserIds.includes(Number(entry.id))
          ? { ...entry, visible_employee_count: selectedTargetEmployeeIds.length, visible_to_employees: selectedTargetEmployeeIds.length > 0 }
          : entry
      )));
      setVisibilityModalOpen(false);
      setSelectedSourceUserIds([]);
      setActiveVisibilityUserId(null);
      setSelectedTargetEmployeeIds([]);
      setShareLeadStatusFilter('all');
      setShareDateFilter('all');
      setVisibilitySearch('');
    } catch (error) {
      console.error('Failed to update visibility settings:', error);
    } finally {
      setVisibilityLoading(false);
    }
  }, [selectedSourceUserIds, selectedTargetEmployeeIds, shareDateFilter, shareLeadStatusFilter]);

  const clearVisibilitySettings = useCallback(async () => {
    if (selectedSourceUserIds.length === 0) return;

    try {
      setVisibilityLoading(true);
      await Promise.all(
        selectedSourceUserIds.map((sourceUserId) => (
          apiClient.put(`/users/${sourceUserId}/employee-visibility`, {
            employeeIds: [],
            leadStatusFilter: 'all',
            dateFilter: 'all',
          })
        )),
      );
      setSelectedTargetEmployeeIds([]);
      setShareLeadStatusFilter('all');
      setShareDateFilter('all');
      setUsersForVisibility((current) => current.map((entry) => (
        selectedSourceUserIds.includes(Number(entry.id))
          ? { ...entry, visible_employee_count: 0, visible_to_employees: false }
          : entry
      )));
    } catch (error) {
      console.error('Failed to clear visibility settings:', error);
    } finally {
      setVisibilityLoading(false);
    }
  }, [selectedSourceUserIds]);

  const getRowStyle = (params: RowClassParams<GridLead>) => {
    if (params.node.rowPinned === 'bottom') {
      return { backgroundColor: 'rgba(255, 255, 255, 0.35)' };
    }
    if ((params.data as DateMarkerRow | undefined)?.is_date_marker) {
      return { backgroundColor: 'rgba(255, 255, 0, 1)' };
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
    })).filter((row) => canViewDateMarker(row));
    if (dateFilter === 'all') {
      return rowsWithCustomValues;
    }

    return rowsWithCustomValues.filter((row) => (
      row.is_date_marker || filterLeadsByDate([row], dateFilter).length > 0
    ));
  }, [canViewDateMarker, customColumnValues, dateFilter, rowData]);
  const pinnedBottomRowData = useMemo(() => [draftRow], [draftRow]);

  const handleAddDateClick = useCallback(() => {
    const today = new Date();
    const value = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    void apiClient.post('/leads', {
      contact: '',
      email: '',
      business_owner: '',
      business_name: '',
      source: '',
      service: '',
      notes: value,
      marker_date: value,
      is_date_marker: true,
      lead_value: 0,
      lead: currentUsername,
      lead_status: 'pending',
      assigned_user: userId ? Number(userId) : currentUserId,
    }).then(() => {
      fetchData();
    }).catch((error) => {
      console.error('Create date marker failed:', error);
    });
  }, [currentUserId, currentUsername, fetchData, userId]);

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

  const handleRowDragEnd = useCallback((event: RowDragEndEvent<GridLead>) => {
    const orderedIds: number[] = [];

    event.api.forEachNode((node) => {
      if (!node.rowPinned && node.data && (isAdmin || canViewDateMarker(node.data))) {
        orderedIds.push(Number(node.data.id));
      }
    });

    void apiClient.put('/leads/reorder', {
      leadIds: orderedIds,
    }).catch((error) => {
      console.error('Row reorder failed:', error);
      fetchData();
    });
  }, [canManageEmployeeLead, fetchData, isAdmin]);

  return (
    <div className="p-2 h-full flex flex-col space-y-2 animate-in fade-in duration-500">
      {isAdmin && visibilityModalOpen && (
        <div className="fixed inset-0 z-[110] overflow-y-auto bg-slate-900/35 p-2 pt-16 backdrop-blur-[2px] sm:p-4 sm:pt-20">
          <div className="mx-auto flex max-h-[calc(100vh-4.5rem)] w-full max-w-5xl flex-col overflow-hidden rounded-[20px] border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] shadow-2xl sm:max-h-[calc(100vh-6rem)] sm:rounded-[24px]">
            <div className="border-b border-slate-200 bg-white/90 px-4 py-3 sm:px-5 sm:py-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-lg font-bold tracking-tight text-slate-800 sm:text-xl">Share Leads Between Users</h3>
                  <p className="mt-1 max-w-2xl text-sm leading-5 text-slate-500 sm:pr-8">
                    Select the users whose leads should be visible, then select the users who should be allowed to view them on the employee side.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeVisibilityModal}
                  className="rounded-xl p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
                  disabled={visibilityLoading}
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            <div className="px-4 py-3 sm:px-5 sm:py-4">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input
                  type="text"
                  value={visibilitySearch}
                  onChange={(event) => setVisibilitySearch(event.target.value)}
                  placeholder="Search users..."
                  className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm text-slate-700 outline-none transition focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>
            </div>

            <div className="grid flex-1 gap-0 overflow-y-auto border-t border-slate-200 xl:grid-cols-[320px_minmax(0,1fr)]">
              <div className="px-4 py-3 sm:px-5 sm:py-4">
                <div className="mb-3">
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-[0.22em] text-slate-500">1. Choose User</h4>
                    <p className="mt-1 text-sm text-slate-500">Pick one or more users whose leads you want to share.</p>
                  </div>
                </div>

                <div className="space-y-2.5 xl:max-h-[430px] xl:overflow-y-auto xl:pr-1">
                  {filteredSourceUsers.map((entry) => {
                    const isSelected = selectedSourceUserIds.includes(Number(entry.id));
                    return (
                      <button
                        key={entry.id}
                        type="button"
                        onClick={() => loadVisibilityForUser(Number(entry.id))}
                        className={`flex w-full items-center justify-between rounded-xl border px-3 py-3 text-left transition sm:px-4 ${
                          isSelected
                            ? 'border-indigo-300 bg-indigo-50 shadow-sm'
                            : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        <div className="min-w-0">
                          <p className="truncate text-[15px] font-semibold text-slate-700">{entry.username}</p>
                          <p className="truncate text-sm text-slate-500">{entry.email}</p>
                          <p className="mt-1 text-xs font-medium text-slate-400">
                            Shared with {Number((entry as any).visible_employee_count || 0)} user{Number((entry as any).visible_employee_count || 0) === 1 ? '' : 's'}
                          </p>
                        </div>
                        <div className={`ml-3 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border ${
                          isSelected
                            ? 'border-indigo-600 bg-indigo-600 text-white'
                            : 'border-slate-300 text-transparent'
                        }`}>
                          <Check size={15} />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="border-t border-slate-200 px-4 py-3 xl:border-l xl:border-t-0 xl:px-5 xl:py-4">
                <div className="mb-3">
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-[0.22em] text-slate-500">2. Manage Access</h4>
                    <p className="mt-1 text-sm text-slate-500">
                      {selectedSourceUserIds.length === 0
                        ? 'Select one or more users on the left to manage access.'
                        : selectedSourceUserIds.length === 1 && activeVisibilityUser
                          ? `Choose which users can view ${activeVisibilityUser.username}'s leads.`
                          : `These sharing rules will be applied to ${selectedSourceUserIds.length} selected users.`}
                    </p>
                  </div>
                </div>

                {selectedSourceUserIds.length > 0 ? (
                  <>
                    <div className="mb-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
                      <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">
                        {selectedSourceUserIds.length === 1 ? 'Selected User' : 'Selected Users'}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {selectedSourceUsers.map((entry) => (
                          <span
                            key={entry.id}
                            className="inline-flex items-center rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700"
                          >
                            {entry.username}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="mb-3 grid gap-3 2xl:grid-cols-[minmax(0,1fr)_220px]">
                      <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                        <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Lead Status</p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {[
                            { value: 'all', label: 'All Leads' },
                            { value: 'paid', label: 'Paid Only' },
                            { value: 'unpaid', label: 'Unpaid Only' },
                          ].map((option) => (
                            <button
                              key={option.value}
                              type="button"
                              onClick={() => setShareLeadStatusFilter(option.value as ShareLeadStatusFilter)}
                              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                                shareLeadStatusFilter === option.value
                                  ? 'border-indigo-600 bg-indigo-600 text-white'
                                  : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                              }`}
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                        <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Date Range</p>
                        <div className="mt-3">
                          <select
                            value={shareDateFilter}
                            onChange={(event) => setShareDateFilter(event.target.value as LeadDateFilterValue)}
                            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/20"
                          >
                            {LEAD_DATE_FILTERS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2.5 xl:max-h-[290px] xl:overflow-y-auto xl:pr-1">
                      {filteredTargetUsers.map((entry) => {
                        const isSelected = selectedTargetEmployeeIds.includes(Number(entry.id));
                        return (
                          <button
                            key={entry.id}
                            type="button"
                            onClick={() => toggleTargetEmployeeSelection(Number(entry.id))}
                            className={`flex w-full items-center justify-between rounded-xl border px-3 py-3 text-left transition sm:px-4 ${
                              isSelected
                                ? 'border-emerald-300 bg-emerald-50 shadow-sm'
                                : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                            }`}
                          >
                            <div className="min-w-0">
                              <p className="truncate text-[15px] font-semibold text-slate-700">{entry.username}</p>
                              <p className="truncate text-sm text-slate-500">{entry.email}</p>
                            </div>
                            <div className={`ml-3 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border ${
                              isSelected
                                ? 'border-emerald-600 bg-emerald-600 text-white'
                                : 'border-slate-300 text-transparent'
                            }`}>
                              <Check size={15} />
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </>
                ) : (
                  <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-5 py-8 text-center text-sm text-slate-500">
                    Choose one or more users on the left to set sharing rules and filters.
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-3 border-t border-slate-200 bg-white px-4 py-3 sm:px-5 sm:py-4 xl:flex-row xl:items-center xl:justify-between">
              <p className="text-sm text-slate-500 xl:max-w-xl">
                Sharing updates the selected user's visibility immediately after you save.
              </p>
              <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:justify-end">
                <button
                  type="button"
                  onClick={clearVisibilitySettings}
                  disabled={visibilityLoading || selectedSourceUserIds.length === 0}
                  className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-600 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60 sm:min-w-[160px]"
                >
                  Remove All Access
                </button>
                <button
                  type="button"
                  onClick={closeVisibilityModal}
                  disabled={visibilityLoading}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 sm:min-w-[100px]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={saveVisibilitySettings}
                  disabled={visibilityLoading || selectedSourceUserIds.length === 0}
                  className="rounded-xl bg-indigo-600 px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60 sm:min-w-[122px]"
                >
                  {visibilityLoading ? 'Saving...' : 'Save Sharing'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      <ConfirmDialog
        open={leadPendingDelete != null}
        title="Delete row?"
        message="This will permanently remove the row from the table. You can’t undo this action."
        confirmLabel="Delete Row"
        onConfirm={deleteLead}
        onCancel={() => !deleteLoading && setLeadPendingDelete(null)}
        loading={deleteLoading}
      />
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-700 tracking-tight">
            {userId ? 'User Leads' : isAdmin ? 'Global Leads Database' : 'My Leads'}
          </h2>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-indigo-600 transition-colors" size={18} />
            <input
              type="text"
              placeholder="Search leads..."
              className="bg-white border border-slate-300 pl-10 pr-4 py-2 rounded-md text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 w-72 shadow-sm transition-all"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
            />
          </div>
          {isAdmin && (
            <button
              type="button"
              onClick={openVisibilityModal}
              className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 shadow-sm transition-all hover:bg-indigo-50 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <Users size={18} className="text-slate-500" />
              <span>Share Leads</span>
            </button>
          )}
          <button
            type="button"
            onClick={handleAddDateClick}
            className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 shadow-sm transition-all hover:bg-amber-50 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <CalendarPlus size={18} className="text-slate-500" />
            <span>Add Date</span>
          </button>
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
            getRowId={(params) => String(params.data.id)}
            rowDragManaged={true}
            undoRedoCellEditing={true}
            undoRedoCellEditingLimit={20}
            suppressCellFocus={false}
            cellSelection={{
              suppressMultiRanges: true,
            }}
            onCellValueChanged={onCellValueChanged}
            onRowDragEnd={handleRowDragEnd}
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
        </div>
      </div>
    </div>
  );
}
