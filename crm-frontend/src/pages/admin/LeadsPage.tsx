import { useState, useMemo, useCallback, useEffect } from 'react';
import { AgGridReact } from 'ag-grid-react';
import type {
  ColDef,
  CellValueChangedEvent,
  RowClassParams,
  ICellRendererParams,
  ValueParserParams,
  ValueFormatterParams
} from 'ag-grid-community';
import {
  AllCommunityModule,
  ModuleRegistry,
  themeQuartz,
} from 'ag-grid-community';
import apiClient from '../../api/client';
import { Loader2, Plus, Search, Trash2, TrendingUp, CheckCircle, Clock, Table } from 'lucide-react';
import { Lead } from '../../types';

ModuleRegistry.registerModules([AllCommunityModule]);

const glassTheme = themeQuartz.withParams({
  backgroundColor: 'rgba(255, 255, 255)',
  headerBackgroundColor: 'rgba(0, 0, 0, 0.05)',
  headerTextColor: 'oklch(37.2% 0.044 257.287)', // slate-700
  headerFontWeight: 'bold',
  textColor: 'oklch(44.6% 0.043 257.281)', // slate-600
  fontSize: '12px',
  headerHeight: 44,
  rowHeight: 40,
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

export default function LeadsPage({ userId }: { userId?: string }) {
  const [rowData, setRowData] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState('');
  const [employees, setEmployees] = useState<string[]>([]);

  const fetchUsers = useCallback(async () => {
    try {
      const response = await apiClient.get('/users');
      setEmployees(response.data.map((u: any) => u.username));
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
      const leads = Array.isArray(response.data) ? response.data : response.data.data || [];
      setRowData(leads);
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

  const deleteLead = useCallback(async (id: number | string) => {
    if (!window.confirm('Are you sure you want to delete this lead?')) return;
    try {
      await apiClient.delete(`/leads/${id}`);
      setRowData(prev => prev.filter(l => l.id !== id));
    } catch (error) {
      console.error('Delete failed:', error);
    }
  }, []);

  const columnDefs = useMemo<ColDef[]>(() => [
    { field: 'contact', headerName: 'Contact', minWidth: 150, editable: true },
    { field: 'email', headerName: 'Email', minWidth: 200, editable: true },
    { field: 'business_owner', headerName: 'Business Owner', minWidth: 150, editable: true },
    { field: 'business_name', headerName: 'Business Name', minWidth: 180, editable: true },
    { field: 'service', headerName: 'Service', minWidth: 120, editable: true },
    {
      field: 'response',
      headerName: 'Response',
      minWidth: 250,
      editable: true,
      cellEditor: 'agLargeTextCellEditor',
      cellEditorPopup: true,
      cellClass: 'italic text-slate-500'
    },
    {
      field: 'follow_up',
      headerName: 'Follow Up',
      minWidth: 200,
      editable: true,
      cellEditor: 'agLargeTextCellEditor',
      cellEditorPopup: true,
      cellClass: 'italic text-slate-500'
    },
    {
      field: 'lead_value',
      headerName: 'Lead Value',
      minWidth: 180,
      editable: true,
      valueParser: numberParser,
      valueFormatter: currencyFormatter,
      cellClass: 'text-right font-mono font-bold'
    },
    {
      field: 'lead_owner',
      headerName: 'Lead Owner',
      minWidth: 180,
      editable: true,
      cellEditor: 'agSelectCellEditor',
      cellEditorParams: { values: employees }
    },
    {
      field: 'lead_status',
      headerName: 'Status',
      minWidth: 180,
      editable: true,
      cellRenderer: StatusBadge,
      cellEditor: 'agSelectCellEditor',
      cellEditorParams: { values: ['pending', 'contacted', 'paid', 'failed'] }
    },
    {
      headerName: 'Actions',
      width: 100,
      pinned: 'right',
      cellRenderer: (params: ICellRendererParams) => (
        <button
          onClick={() => deleteLead(params.data.id)}
          className="p-1 hover:bg-rose-500/20 text-rose-500 rounded transition-colors mt-1"
        >
          <Trash2 size={16} />
        </button>
      )
    }
  ], [employees, deleteLead]);

  const onCellValueChanged = useCallback(async (event: CellValueChangedEvent) => {
    const { data, colDef, newValue } = event;
    const field = colDef.field;
    if (!field) return;

    try {
      await apiClient.put(`/leads/${data.id}`, {
        [field]: newValue,
      });
    } catch (error) {
      console.error('Update failed:', error);
      fetchData();
    }
  }, [fetchData]);

  const getRowStyle = (params: RowClassParams<Lead>) => {
    if (params.data?.lead_status === 'paid') {
      return { backgroundColor: 'oklch(72.3% 0.219 149.579 / 0.1)' }; // green-500 with opacity
    }
    return undefined;
  };

  const stats = useMemo(() => {
    const total = rowData.length;
    const paid = rowData.filter(l => l.lead_status === 'paid').length;
    const active = total - paid;
    const totalValue = rowData.reduce((acc, curr) => acc + (Number(curr.lead_value) || 0), 0);
    return { total, paid, active, totalValue };
  }, [rowData]);

  return (
    <div className="p-6 h-full flex flex-col space-y-4 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-700 tracking-tight">
            {userId ? 'User Leads' : 'Global Leads Database'}
          </h2>
          <p className="text-slate-500 text-sm">Manage and monitor sales opportunities in real-time.</p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-blue-400 transition-colors" size={18} />
            <input
              type="text"
              placeholder="Search leads..."
              className="bg-white/30 backdrop-blur-[12px] border border-white/20 pl-10 pr-4 py-2 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 w-64 shadow-sm transition-all"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Leads', val: stats.total, icon: Table, color: 'text-indigo-600' },
          { label: 'Active Leads', val: stats.active, icon: Clock, color: 'text-slate-600' },
          { label: 'Paid Leads', val: stats.paid, icon: CheckCircle, color: 'text-green-700' },
          { label: 'Total Revenue', val: `$${stats.totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, icon: TrendingUp, color: 'text-indigo-700' },
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

      <div className="flex-1 bg-white/40 backdrop-blur-[20px] border border-white/30 rounded-2xl shadow-xl overflow-hidden flex flex-col min-h-[400px]">
        <div className="flex-1 relative">
          {loading && (
            <div className="absolute inset-0 z-50 bg-white/10 backdrop-blur-[1px] flex items-center justify-center">
              <Loader2 className="animate-spin text-indigo-600" size={32} />
            </div>
          )}
          <AgGridReact
            theme={glassTheme}
            rowData={rowData}
            columnDefs={columnDefs}
            onCellValueChanged={onCellValueChanged}
            getRowStyle={getRowStyle}
            quickFilterText={searchText}
            defaultColDef={{
              sortable: true,
              filter: true,
              resizable: true,
              flex: 1,
            }}
            animateRows={true}
          />
        </div>
      </div>
    </div>
  );
}
