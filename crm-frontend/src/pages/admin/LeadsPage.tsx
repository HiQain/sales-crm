import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AgGridReact } from 'ag-grid-react';
import type {
  CellClickedEvent,
  ColDef,
  CellFocusedEvent,
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
import { CalendarPlus, Check, ChevronDown, GripVertical, Loader2, Plus, Search, Trash2, Users, X } from 'lucide-react';
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
import { getSelectedCompanyId } from '../../utils/company';
import { normalizeUsPhoneForStorage } from '../../utils/phone';
import { loadColumnLayout, mergeOrderedIds, mergeVisibleIds, type StoredColumnLayout } from '../../utils/columnLayout';

ModuleRegistry.registerModules([AllEnterpriseModule]);

type GridLead = Lead & { __isDraft?: boolean; [key: string]: unknown };
type EmployeeOption = Pick<User, 'id' | 'username'>;
type VisibilityUser = Pick<User, 'id' | 'username' | 'email' | 'role_type'> & {
  visible_employee_count?: number;
  visible_to_employees?: boolean;
};
type ShareLeadStatusFilter = 'all' | 'paid' | 'unpaid';
type ShareRule = {
  leadStatusFilter: ShareLeadStatusFilter;
  dateFilter: LeadDateFilterValue;
};
type ViewerAccessMenuPosition = {
  left: number;
  width: number;
  top?: number;
  bottom?: number;
};
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

const SHARE_LEAD_STATUS_OPTIONS: Array<{ value: ShareLeadStatusFilter; label: string }> = [
  { value: 'all', label: 'All Leads' },
  { value: 'paid', label: 'Paid' },
  { value: 'unpaid', label: 'Unpaid' },
];

const formatSelectedCellPreview = (value: unknown) => {
  if (value == null) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value instanceof Date) return value.toLocaleString();

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const hasCellValue = (
  event: CellFocusedEvent | CellValueChangedEvent | CellClickedEvent,
): event is CellValueChangedEvent | CellClickedEvent => 'value' in event;

const getPreviewValueFromRow = (rowData: Record<string, unknown> | undefined, column: ColDef) => {
  if (!rowData) return '';

  const fieldKey = typeof column.field === 'string' ? column.field : undefined;
  const colIdKey = typeof column.colId === 'string' ? column.colId : undefined;
  const key = fieldKey ?? colIdKey;

  return key ? rowData[key] : '';
};

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
  const companyId = getSelectedCompanyId();
  const user = useMemo(() => {
    const userStr = localStorage.getItem('user');
    return userStr ? JSON.parse(userStr) : null;
  }, []);
  const userRole = user?.role?.type || user?.role?.name?.toLowerCase() || user?.role;
  const isAdmin = userRole === 'admin';
  const currentUserId = Number(user?.id ?? 0);
  const currentUsername = String(user?.username ?? '').trim();
  const baseLayoutStorageKey = userId
    ? `crm:admin-user-leads:${userId}`
    : isAdmin
      ? 'crm:admin-leads'
      : 'crm:employee-leads';
  const layoutStorageKey = `${baseLayoutStorageKey}:company:${companyId}`;
  const legacySharedLayoutKeys = useMemo(
    () => companyId === 1 ? LEGACY_SHARED_LAYOUT_KEYS : [],
    [companyId],
  );
  const customValuesStorageKey = `${layoutStorageKey}:custom-values`;
  const [rowData, setRowData] = useState<GridLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState('');
  const [selectedCellPreview, setSelectedCellPreview] = useState('');
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
  const [selectedSourceUserIds, setSelectedSourceUserIds] = useState<number[]>([]);
  const [removedSourceUserIds, setRemovedSourceUserIds] = useState<number[]>([]);
  const [sourceUserPickerOpen, setSourceUserPickerOpen] = useState(false);
  const [sourceUserSearch, setSourceUserSearch] = useState('');
  const [openViewerAccessUserId, setOpenViewerAccessUserId] = useState<number | null>(null);
  const [viewerAccessMenuPosition, setViewerAccessMenuPosition] = useState<ViewerAccessMenuPosition | null>(null);
  const [targetEmployeeIdsByUserId, setTargetEmployeeIdsByUserId] = useState<Record<number, number[]>>({});
  const [shareRulesByUserId, setShareRulesByUserId] = useState<Record<number, ShareRule>>({});
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
          ?? legacySharedLayoutKeys
            .filter((key) => key !== layoutStorageKey)
            .map((key) => loadColumnLayout(key))
            .find(Boolean)
          ?? null;

        applyStoredLayout(fallbackLayout);
      }
    } catch (error) {
      console.error('Failed to fetch shared layout:', error);
      const fallbackLayout = loadColumnLayout(layoutStorageKey)
        ?? legacySharedLayoutKeys
          .filter((key) => key !== layoutStorageKey)
          .map((key) => loadColumnLayout(key))
          .find(Boolean)
        ?? null;
      applyStoredLayout(fallbackLayout);
    } finally {
      setLayoutReady(true);
      setLayoutHydrated(true);
    }
  }, [applyStoredLayout, layoutStorageKey, legacySharedLayoutKeys]);

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
  const selectedSourceUsers = useMemo(
    () => sourceUsers.filter((entry) => selectedSourceUserIds.includes(Number(entry.id))),
    [selectedSourceUserIds, sourceUsers],
  );
  const availableSourceUsers = useMemo(() => {
    const query = sourceUserSearch.trim().toLowerCase();

    return sourceUsers.filter((entry) => {
      if (selectedSourceUserIds.includes(Number(entry.id))) return false;
      if (!query) return true;

      return (
        String(entry.username ?? '').toLowerCase().includes(query) ||
        String(entry.email ?? '').toLowerCase().includes(query)
      );
    });
  }, [selectedSourceUserIds, sourceUserSearch, sourceUsers]);
  const getViewerAccessOptions = useCallback(
    (sourceUserId: number) => targetUsers.filter((entry) => Number(entry.id) !== sourceUserId),
    [targetUsers],
  );

  useEffect(() => {
    if (openViewerAccessUserId == null) return undefined;

    const closeViewerAccessMenu = () => {
      setOpenViewerAccessUserId(null);
      setViewerAccessMenuPosition(null);
    };

    window.addEventListener('resize', closeViewerAccessMenu);
    return () => window.removeEventListener('resize', closeViewerAccessMenu);
  }, [openViewerAccessUserId]);

  const getSelectedTargetEmployeeIds = useCallback((sourceUserId: number) => (
    targetEmployeeIdsByUserId[sourceUserId] ?? []
  ), [targetEmployeeIdsByUserId]);

  const getSelectedTargetEmployeeSummary = useCallback((sourceUserId: number) => {
    const selectedIds = getSelectedTargetEmployeeIds(sourceUserId);
    if (selectedIds.length === 0) {
      return 'No viewers selected';
    }

    const selectedUsers = selectedIds
      .map((employeeId) => targetUsers.find((entry) => Number(entry.id) === employeeId))
      .filter((entry): entry is VisibilityUser => Boolean(entry));
    const [firstUser, secondUser, ...restUsers] = selectedUsers;

    if (!firstUser) return `${selectedIds.length} selected`;
    if (!secondUser) return String(firstUser.username ?? '1 selected');
    if (restUsers.length === 0) return `${firstUser.username}, ${secondUser.username}`;

    return `${firstUser.username}, ${secondUser.username} +${restUsers.length}`;
  }, [getSelectedTargetEmployeeIds, targetUsers]);
  const getShareRule = useCallback((userId: number): ShareRule => (
    shareRulesByUserId[userId] ?? { leadStatusFilter: 'all', dateFilter: 'all' }
  ), [shareRulesByUserId]);

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
        valueParser: (params) => String(params.newValue ?? ''),
        valueSetter: (params) => {
          if (!params.data) return false;

          const nextValue = String(params.newValue ?? '');
          const previousValue = String((params.data as GridLead).notes ?? '');
          if (previousValue === nextValue) return false;

          (params.data as GridLead).notes = nextValue;
          return true;
        },
        cellEditorSelector: (params) => (
          (params.data as DateMarkerRow | undefined)?.is_date_marker
            ? { component: 'agDateStringCellEditor' }
            : {
                component: 'agLargeTextCellEditor',
                popup: true,
              }
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
        cellStyle: { textAlign: 'right', paddingLeft: '6px', paddingRight: '6px' },
      },
      {
        field: 'lead',
        headerName: 'Agent',
        minWidth: 92,
        editable: (params) => isAdmin && !(params.data as DateMarkerRow | undefined)?.is_date_marker,
        filter: true,
        filterParams: setFilterParams,
        valueFormatter: (params) => (
          (params.data as DateMarkerRow | undefined)?.is_date_marker ? '' : params.value
        ),
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

  const openVisibilityModal = useCallback(async () => {
    const persistedSourceUserIds = usersForVisibility
      .filter((entry) => Number(entry.visible_to_employees) === 1 || Number(entry.visible_employee_count ?? 0) > 0)
      .map((entry) => Number(entry.id));

    setSelectedSourceUserIds(persistedSourceUserIds);
    setRemovedSourceUserIds([]);
    setSourceUserPickerOpen(false);
    setSourceUserSearch('');
    setOpenViewerAccessUserId(null);
    setViewerAccessMenuPosition(null);
    setTargetEmployeeIdsByUserId({});
    setShareRulesByUserId({});
    setVisibilityModalOpen(true);

    if (persistedSourceUserIds.length === 0) return;

    try {
      setVisibilityLoading(true);
      const persistedSettings = await Promise.all(
        persistedSourceUserIds.map(async (sourceUserId) => {
          const response = await apiClient.get(`/users/${sourceUserId}/employee-visibility`);
          return { sourceUserId, data: response.data };
        }),
      );

      setShareRulesByUserId(Object.fromEntries(
        persistedSettings.map(({ sourceUserId, data }) => [
          sourceUserId,
          {
            leadStatusFilter: (data?.leadStatusFilter as ShareLeadStatusFilter) || 'all',
            dateFilter: (data?.dateFilter as LeadDateFilterValue) || 'all',
          },
        ]),
      ));
      setTargetEmployeeIdsByUserId(Object.fromEntries(
        persistedSettings.map(({ sourceUserId, data }) => [
          sourceUserId,
          Array.isArray(data?.employeeIds) ? data.employeeIds.map(Number) : [],
        ]),
      ));
    } catch (error) {
      console.error('Failed to load saved sharing settings:', error);
    } finally {
      setVisibilityLoading(false);
    }
  }, [usersForVisibility]);

  const closeVisibilityModal = useCallback(() => {
    if (visibilityLoading) return;

    setVisibilityModalOpen(false);
    setSelectedSourceUserIds([]);
    setRemovedSourceUserIds([]);
    setSourceUserPickerOpen(false);
    setSourceUserSearch('');
    setOpenViewerAccessUserId(null);
    setViewerAccessMenuPosition(null);
    setTargetEmployeeIdsByUserId({});
    setShareRulesByUserId({});
  }, [visibilityLoading]);

  const loadVisibilityForUser = useCallback(async (sourceUserId: number) => {
    if (selectedSourceUserIds.includes(sourceUserId)) {
      const remainingIds = selectedSourceUserIds.filter((id) => id !== sourceUserId);
      setSelectedSourceUserIds(remainingIds);
      const persistedUser = usersForVisibility.find((entry) => Number(entry.id) === sourceUserId);
      if (persistedUser && (Number(persistedUser.visible_to_employees) === 1 || Number(persistedUser.visible_employee_count ?? 0) > 0)) {
        setRemovedSourceUserIds((current) => current.includes(sourceUserId) ? current : [...current, sourceUserId]);
      }
      setShareRulesByUserId((current) => {
        const next = { ...current };
        delete next[sourceUserId];
        return next;
      });
      setTargetEmployeeIdsByUserId((current) => {
        const next = { ...current };
        delete next[sourceUserId];
        return next;
      });

      if (remainingIds.length === 0) {
        setOpenViewerAccessUserId(null);
        setViewerAccessMenuPosition(null);
      } else if (openViewerAccessUserId === sourceUserId) {
        setOpenViewerAccessUserId(null);
        setViewerAccessMenuPosition(null);
      }
      return;
    }

    try {
      setVisibilityLoading(true);
      const response = await apiClient.get(`/users/${sourceUserId}/employee-visibility`);
      setSelectedSourceUserIds((current) => [...current, sourceUserId]);
      setShareRulesByUserId((current) => ({
        ...current,
        [sourceUserId]: {
          leadStatusFilter: (response.data?.leadStatusFilter as ShareLeadStatusFilter) || 'all',
          dateFilter: (response.data?.dateFilter as LeadDateFilterValue) || 'all',
        },
      }));
      setTargetEmployeeIdsByUserId((current) => ({
        ...current,
        [sourceUserId]: Array.isArray(response.data?.employeeIds) ? response.data.employeeIds : [],
      }));
      setRemovedSourceUserIds((current) => current.filter((id) => id !== sourceUserId));
    } catch (error) {
      console.error('Failed to load visibility settings:', error);
    } finally {
      setVisibilityLoading(false);
    }
  }, [openViewerAccessUserId, selectedSourceUserIds, usersForVisibility]);

  const toggleTargetEmployeeSelection = useCallback((sourceUserId: number, employeeId: number) => {
    setTargetEmployeeIdsByUserId((current) => {
      const selectedIds = current[sourceUserId] ?? [];
      return {
        ...current,
        [sourceUserId]: selectedIds.includes(employeeId)
          ? selectedIds.filter((value) => value !== employeeId)
          : [...selectedIds, employeeId],
      };
    });
  }, []);

  const toggleViewerAccessMenu = useCallback((
    sourceUserId: number,
    viewerOptionCount: number,
    anchor: HTMLButtonElement,
  ) => {
    if (openViewerAccessUserId === sourceUserId) {
      setOpenViewerAccessUserId(null);
      setViewerAccessMenuPosition(null);
      return;
    }

    const viewportPadding = 8;
    const menuWidth = Math.min(220, window.innerWidth - viewportPadding * 2);
    const estimatedMenuHeight = Math.min(220, Math.max(64, viewerOptionCount * 55 + 12));
    const anchorRect = anchor.getBoundingClientRect();
    const spaceBelow = window.innerHeight - anchorRect.bottom - viewportPadding;
    const spaceAbove = anchorRect.top - viewportPadding;
    const opensUpward = spaceBelow < estimatedMenuHeight && spaceAbove > spaceBelow;
    const left = Math.min(
      Math.max(viewportPadding, anchorRect.right - menuWidth),
      window.innerWidth - menuWidth - viewportPadding,
    );

    setViewerAccessMenuPosition({
      left,
      width: menuWidth,
      ...(opensUpward
        ? { bottom: window.innerHeight - anchorRect.top + viewportPadding }
        : { top: anchorRect.bottom + viewportPadding }),
    });
    setOpenViewerAccessUserId(sourceUserId);
  }, [openViewerAccessUserId]);

  const saveVisibilitySettings = useCallback(async () => {
    if (selectedSourceUserIds.length === 0 && removedSourceUserIds.length === 0) return;

    try {
      setVisibilityLoading(true);
      await Promise.all([
        ...selectedSourceUserIds.map((sourceUserId) => (
          apiClient.put(`/users/${sourceUserId}/employee-visibility`, {
            employeeIds: targetEmployeeIdsByUserId[sourceUserId] ?? [],
            leadStatusFilter: getShareRule(sourceUserId).leadStatusFilter,
            dateFilter: getShareRule(sourceUserId).dateFilter,
          })
        )),
        ...removedSourceUserIds.map((sourceUserId) => (
          apiClient.put(`/users/${sourceUserId}/employee-visibility`, {
            employeeIds: [],
            leadStatusFilter: 'all',
            dateFilter: 'all',
          })
        )),
      ]);
      setUsersForVisibility((current) => current.map((entry) => {
        const sourceUserId = Number(entry.id);

        if (removedSourceUserIds.includes(sourceUserId)) {
          return { ...entry, visible_employee_count: 0, visible_to_employees: false };
        }

        if (selectedSourceUserIds.includes(sourceUserId)) {
          return {
              ...entry,
              visible_employee_count: (targetEmployeeIdsByUserId[sourceUserId] ?? []).length,
              visible_to_employees: (targetEmployeeIdsByUserId[sourceUserId] ?? []).length > 0,
            };
        }

        return entry;
      }));
      setVisibilityModalOpen(false);
      setSelectedSourceUserIds([]);
      setRemovedSourceUserIds([]);
      setSourceUserPickerOpen(false);
      setSourceUserSearch('');
      setOpenViewerAccessUserId(null);
      setViewerAccessMenuPosition(null);
      setTargetEmployeeIdsByUserId({});
      setShareRulesByUserId({});
    } catch (error) {
      console.error('Failed to update visibility settings:', error);
    } finally {
      setVisibilityLoading(false);
    }
  }, [getShareRule, removedSourceUserIds, selectedSourceUserIds, targetEmployeeIdsByUserId]);

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
      setTargetEmployeeIdsByUserId((current) => ({
        ...current,
        ...Object.fromEntries(selectedSourceUserIds.map((sourceUserId) => [sourceUserId, []])),
      }));
      setShareRulesByUserId((current) => (
        Object.fromEntries(
          Object.entries(current).map(([userId]) => [
            Number(userId),
            { leadStatusFilter: 'all', dateFilter: 'all' },
          ]),
        )
      ));
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

  const updateShareRule = useCallback((sourceUserId: number, nextRule: Partial<ShareRule>) => {
    setShareRulesByUserId((current) => ({
      ...current,
      [sourceUserId]: {
        ...(current[sourceUserId] ?? { leadStatusFilter: 'all', dateFilter: 'all' }),
        ...nextRule,
      },
    }));
  }, []);

  const applyFirstRuleToAllSelected = useCallback(() => {
    if (selectedSourceUserIds.length < 2) return;

    const referenceUserId = openViewerAccessUserId ?? selectedSourceUserIds[0];
    const referenceRule = getShareRule(referenceUserId);
    const referenceEmployeeIds = getSelectedTargetEmployeeIds(referenceUserId);

    setShareRulesByUserId((current) => ({
      ...current,
      ...Object.fromEntries(
        selectedSourceUserIds.map((userId) => [
          userId,
          { ...referenceRule },
        ]),
      ),
    }));
    setTargetEmployeeIdsByUserId((current) => ({
      ...current,
      ...Object.fromEntries(
        selectedSourceUserIds.map((userId) => [userId, [...referenceEmployeeIds]]),
      ),
    }));
  }, [getSelectedTargetEmployeeIds, getShareRule, openViewerAccessUserId, selectedSourceUserIds]);

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

  const updateSelectedCellPreview = useCallback((event: CellFocusedEvent | CellValueChangedEvent | CellClickedEvent) => {
    if (hasCellValue(event)) {
      setSelectedCellPreview(formatSelectedCellPreview(event.value));
      return;
    }

    const focusedCell = event.api.getFocusedCell();
    const column = focusedCell?.column ?? event.column;
    const rowIndex = focusedCell?.rowIndex ?? event.rowIndex;
    const rowPinned = focusedCell?.rowPinned ?? event.rowPinned;

    if (!column || rowIndex == null) {
      setSelectedCellPreview('');
      return;
    }

    if (rowPinned) {
      setSelectedCellPreview('');
      return;
    }

    const rowNode = event.api.getDisplayedRowAtIndex(rowIndex);
    if (!rowNode) {
      setSelectedCellPreview('');
      return;
    }

    const columnDefinition = typeof column === 'string' ? { field: column } : column.getColDef();
    setSelectedCellPreview(
      formatSelectedCellPreview(getPreviewValueFromRow(rowNode.data as Record<string, unknown> | undefined, columnDefinition)),
    );
  }, []);

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
      lead: '',
      lead_status: 'pending',
      assigned_user: userId ? Number(userId) : currentUserId,
    }).then(() => {
      fetchData();
    }).catch((error) => {
      console.error('Create date marker failed:', error);
    });
  }, [currentUserId, fetchData, userId]);

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
  }, [canViewDateMarker, fetchData, isAdmin]);

  return (
    <div className="p-2 h-full flex flex-col space-y-2 animate-in fade-in duration-500">
      {isAdmin && visibilityModalOpen && (
        <div className="fixed inset-0 z-[110] overflow-y-auto bg-slate-900/35 p-2 pt-16 backdrop-blur-[2px] sm:p-4 sm:pt-20">
          <div className="mx-auto flex max-h-[calc(100vh-4.5rem)] w-full max-w-[700px] flex-col overflow-hidden rounded-lg border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] shadow-2xl sm:max-h-[calc(100vh-6rem)]">
            <div className="border-b border-slate-200 bg-white/95 px-4 py-4 sm:px-5 sm:py-5">
              <div className="flex items-center justify-between gap-4">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="min-w-0">
                    <h3 className="text-lg font-bold leading-tight tracking-tight text-slate-900">Share Leads Between Users</h3>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={closeVisibilityModal}
                  className="shrink-0 rounded-md p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
                  disabled={visibilityLoading}
                >
                  <X size={22} />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              <div className="border-b border-slate-200 px-3 py-3 sm:px-4 sm:py-3">
                <div className="mb-2 flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
                  <div className="flex items-center gap-3">
                    {selectedSourceUserIds.length > 0 && (
                      <span className="rounded-md bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-600">
                        {selectedSourceUserIds.length} selected
                      </span>
                    )}
                    {selectedSourceUserIds.length > 1 && (
                      <button
                        type="button"
                        onClick={applyFirstRuleToAllSelected}
                        disabled={selectedSourceUserIds.length < 2}
                        className="inline-flex items-center justify-center rounded-md border border-indigo-300 bg-white px-3 py-1.5 text-sm font-semibold text-indigo-600 transition hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Apply to all selected
                      </button>
                    )}
                  </div>
                </div>

                <div className="space-y-2.5">
                  <div className="w-full overflow-visible rounded-lg border border-slate-200 bg-white shadow-sm">
                    <div className="hidden rounded-t-lg border-b border-slate-200 bg-slate-50 px-2 text-sm font-semibold text-slate-700 lg:grid lg:grid-cols-[220px_96px_110px_124px] lg:justify-between">
                      <div className="py-2.5">User</div>
                      <div className="py-2.5">Status</div>
                      <div className="py-2.5">Date Range</div>
                      <div className="py-2.5">Viewer Access</div>
                    </div>

                    {selectedSourceUsers.length === 0 ? (
                      <div className="px-5 py-8 text-center text-sm text-slate-500">
                        No users added yet.
                      </div>
                    ) : (
                      selectedSourceUsers.map((entry, index) => {
                        const rule = getShareRule(Number(entry.id));
                        const isSelected = selectedSourceUserIds.includes(Number(entry.id));
                        const sourceUserId = Number(entry.id);
                        const viewerOptions = getViewerAccessOptions(sourceUserId);
                        const selectedViewerIds = getSelectedTargetEmployeeIds(sourceUserId);
                        const viewerDropdownOpen = openViewerAccessUserId === sourceUserId;
                        return (
                          <div
                            key={entry.id}
                            className={`grid gap-y-1.5 px-2 py-2.5 lg:grid-cols-[220px_96px_110px_124px] lg:justify-between ${
                              index === 0 ? '' : 'border-t border-slate-200'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <button
                                type="button"
                                onClick={() => loadVisibilityForUser(sourceUserId)}
                                className={`flex h-6 w-6 items-center justify-center rounded-sm border transition ${
                                  isSelected
                                    ? 'border-indigo-600 bg-indigo-600 text-white'
                                    : 'border-slate-300 bg-white text-transparent hover:border-slate-400'
                                }`}
                                aria-label={`${isSelected ? 'Unshare' : 'Share'} ${entry.username}`}
                              >
                                <Check size={12} />
                              </button>
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-slate-800">{entry.username}</p>
                                <p className="truncate text-[11px] text-slate-500">{entry.email}</p>
                              </div>
                            </div>

                            <div>
                              <p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-slate-400 lg:hidden">Lead Status</p>
                              <select
                                value={rule.leadStatusFilter}
                                onChange={(event) => updateShareRule(sourceUserId, { leadStatusFilter: event.target.value as ShareLeadStatusFilter })}
                                disabled={!isSelected}
                                className="w-[100px] rounded-md border border-slate-200 bg-white px-1 py-2 text-sm text-slate-700 outline-none transition focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/20"
                              >
                                {SHARE_LEAD_STATUS_OPTIONS.map((option) => (
                                  <option key={option.value} value={option.value}>
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div>
                              <p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-slate-400 lg:hidden">Date Range</p>
                              <select
                                value={rule.dateFilter}
                                onChange={(event) => updateShareRule(sourceUserId, { dateFilter: event.target.value as LeadDateFilterValue })}
                                disabled={!isSelected}
                                className="w-[90px] rounded-md border border-slate-200 bg-white px-1 py-2 text-sm text-slate-700 outline-none transition focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/20"
                              >
                                {LEAD_DATE_FILTERS.map((option) => (
                                  <option key={option.value} value={option.value}>
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div className="relative">
                              <p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-slate-400 lg:hidden">Viewer Access</p>
                              <div className="ml-auto w-[124px] rounded-md border border-slate-200 bg-white">
                                <button
                                  type="button"
                                  onClick={(event) => toggleViewerAccessMenu(sourceUserId, viewerOptions.length, event.currentTarget)}
                                  disabled={!isSelected}
                                  className="flex w-full items-center gap-1.5 px-2 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
                                >
                                  <span className="min-w-0 flex-1 truncate">{getSelectedTargetEmployeeSummary(sourceUserId)}</span>
                                  <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-slate-400">
                                    {selectedViewerIds.length}
                                    <ChevronDown size={14} className={`transition-transform ${viewerDropdownOpen ? 'rotate-180' : ''}`} />
                                  </span>
                                </button>

                                {viewerDropdownOpen && isSelected && viewerAccessMenuPosition && createPortal(
                                  <div
                                    className="fixed z-[200] rounded-md border border-slate-200 bg-white p-1.5 shadow-2xl"
                                    style={viewerAccessMenuPosition}
                                  >
                                    {viewerOptions.length === 0 ? (
                                      <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-center text-xs text-slate-500">
                                        No additional users are available for sharing.
                                      </div>
                                    ) : (
                                      <div className="max-h-52 space-y-1 overflow-y-auto pr-1">
                                        {viewerOptions.map((viewer) => {
                                          const viewerId = Number(viewer.id);
                                          const isViewerSelected = selectedViewerIds.includes(viewerId);
                                          return (
                                            <button
                                              key={viewer.id}
                                              type="button"
                                              onClick={() => toggleTargetEmployeeSelection(sourceUserId, viewerId)}
                                              className={`flex w-full items-center rounded-md border px-2 py-1.5 text-left transition ${
                                                isViewerSelected
                                                  ? 'border-emerald-300 bg-emerald-50/70'
                                                  : 'border-slate-200 bg-white hover:border-slate-300'
                                              }`}
                                            >
                                              <div className="min-w-0 flex-1">
                                                <p className="truncate text-sm font-semibold text-slate-800">{viewer.username}</p>
                                                <p className="truncate text-[11px] text-slate-500">{viewer.email}</p>
                                              </div>
                                              <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-sm border transition ${
                                                isViewerSelected
                                                  ? 'border-emerald-600 bg-emerald-600 text-white'
                                                  : 'border-slate-300 bg-white text-transparent'
                                              }`}>
                                                <Check size={11} />
                                              </div>
                                            </button>
                                          );
                                        })}
                                      </div>
                                    )}
                                  </div>,
                                  document.body,
                                )}
                              </div>
                            </div>

                          </div>
                        );
                      })
                    )}

                    <div className="border-t border-slate-200 p-2">
                      <button
                        type="button"
                        onClick={() => {
                          setSourceUserPickerOpen((current) => !current);
                          setSourceUserSearch('');
                        }}
                        className="flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-600 transition hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-600"
                      >
                        <Plus size={16} />
                        Add existing user
                      </button>

                      {sourceUserPickerOpen && (
                        <div className="mt-2 rounded-md border border-slate-200 bg-white p-2 shadow-sm">
                          <div className="relative">
                            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                            <input
                              type="search"
                              value={sourceUserSearch}
                              onChange={(event) => setSourceUserSearch(event.target.value)}
                              placeholder="Search existing users..."
                              className="w-full rounded-md border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-700 outline-none transition focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/20"
                              autoFocus
                            />
                          </div>

                          <div className="mt-2 max-h-48 space-y-1 overflow-y-auto pr-1">
                            {availableSourceUsers.length === 0 ? (
                              <div className="px-3 py-5 text-center text-sm text-slate-500">
                                {sourceUsers.length === selectedSourceUsers.length
                                  ? 'All users have been added.'
                                  : 'No users match your search.'}
                              </div>
                            ) : (
                              availableSourceUsers.map((entry) => (
                                <button
                                  key={entry.id}
                                  type="button"
                                  onClick={() => loadVisibilityForUser(Number(entry.id))}
                                  disabled={visibilityLoading}
                                  className="flex w-full items-center gap-3 rounded-md border border-slate-200 px-3 py-2 text-left transition hover:border-indigo-300 hover:bg-indigo-50/60 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  <span className="min-w-0 flex-1">
                                    <span className="block truncate text-sm font-semibold text-slate-800">{entry.username}</span>
                                    <span className="block truncate text-[11px] text-slate-500">{entry.email}</span>
                                  </span>
                                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-sm border border-slate-300 bg-white text-transparent">
                                    <Check size={11} />
                                  </span>
                                </button>
                              ))
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2.5 border-t border-slate-200 bg-white px-4 py-3 sm:px-5 sm:py-4 lg:flex-row lg:items-center lg:justify-end">
              <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:justify-end lg:ml-auto">
                <button
                  type="button"
                  onClick={clearVisibilitySettings}
                  disabled={visibilityLoading || selectedSourceUserIds.length === 0}
                  className="rounded-md border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-600 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60 sm:min-w-[170px]"
                >
                  Remove All Access
                </button>
                <button
                  type="button"
                  onClick={closeVisibilityModal}
                  disabled={visibilityLoading}
                  className="rounded-md border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 sm:min-w-[120px]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={saveVisibilitySettings}
                  disabled={visibilityLoading || (selectedSourceUserIds.length === 0 && removedSourceUserIds.length === 0)}
                  className="rounded-md bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60 sm:min-w-[150px]"
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
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-700 tracking-tight">
            {userId ? 'User Leads' : isAdmin ? 'Global Leads Database' : 'My Leads'}
          </h2>
        </div>

        <div className="min-w-0 flex-1 px-2 text-right text-sm text-slate-700">
          <span className="block truncate">
            {selectedCellPreview}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-3 xl:justify-end">
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
            className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 shadow-sm transition-all hover:bg-indigo-50 focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
            onCellClicked={updateSelectedCellPreview}
            onCellFocused={updateSelectedCellPreview}
            onCellValueChanged={(event) => {
              updateSelectedCellPreview(event);
              void onCellValueChanged(event);
            }}
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
