import { useState, useMemo, useCallback, useEffect } from 'react';
import { AgGridReact } from 'ag-grid-react';
import type { 
  ColDef, 
  CellValueChangedEvent, 
  RowClassParams, 
  ICellRendererParams,
} from 'ag-grid-community';
import { 
  ModuleRegistry,
  themeQuartz,
} from 'ag-grid-community';
import { AllEnterpriseModule } from 'ag-grid-enterprise';
import apiClient from '../api/client';
import { handleGridCellCopy } from '../utils/gridClipboard';
import { Loader2 } from 'lucide-react';

// Register all modules
ModuleRegistry.registerModules([AllEnterpriseModule]);

interface Lead {
  id: number;
  contact: string;
  ns: string;
  businessOwner: string;
  businessName: string;
  service: string;
  response: string;
  followUp: string;
  leadValue: number;
  leadOwner: string;
  status: string;
}

const myTheme = themeQuartz.withParams({
  backgroundColor: 'rgba(255, 255, 255, 0.4)',
  headerBackgroundColor: 'rgba(0, 0, 0, 0.05)',
  headerTextColor: '#1a1a1a',
  textColor: '#2a2a2a',
  fontSize: '13px',
});
const RESIZE_MIN_WIDTH = 56;

// Custom Badge Renderer for Status
const StatusBadge = (params: ICellRendererParams) => {
  const value = params.value || '';
  const bgColor = value.toLowerCase() === 'paid' ? 'bg-green-500/20 text-green-700 border-green-500/30' : 'bg-gray-500/20 text-gray-700 border-gray-500/30';
  
  return (
    <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${bgColor}`}>
      {value}
    </span>
  );
};

export default function SalesGrid() {
  const [rowData, setRowData] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState('');

  // Fetch data
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiClient.get('/leads');
      // If the backend returns { data: [...] } or just [...]
      const leads = Array.isArray(response.data) ? response.data : response.data.data || [];
      setRowData(leads);
    } catch (error) {
      console.error('Failed to fetch leads:', error);
      // Fallback mock data for demonstration
      setRowData([
        { id: 1, contact: '923001234567', ns: 'L1', businessOwner: 'John Doe', businessName: 'Tech Solutions', service: 'SEO', response: 'Interested, call back next week.', followUp: '2024-06-15', leadValue: 1200, leadOwner: 'Sameer', status: 'pending' },
        { id: 2, contact: '923456789012', ns: 'L2', businessOwner: 'Jane Smith', businessName: 'Cloud Systems', service: 'Design', response: 'Sent proposal.', followUp: '2024-06-12', leadValue: 3500, leadOwner: 'Sameer', status: 'paid' },
      ]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const columnDefs = useMemo<ColDef[]>(() => [
    { field: 'contact', headerName: 'Contact', pinned: 'left' as const, minWidth: 150, editable: true },
    { field: 'ns', headerName: 'NS', width: 80, editable: true },
    { field: 'businessOwner', headerName: 'Business Owner', minWidth: 150, editable: true },
    { field: 'businessName', headerName: 'Business Name', minWidth: 180, editable: true },
    { field: 'service', headerName: 'Service', minWidth: 120, editable: true, filter: true },
    { 
      field: 'response', 
      headerName: 'Response', 
      minWidth: 250, 
      editable: true,
      cellEditor: 'agLargeTextCellEditor',
      cellEditorPopup: true
    },
    { 
      field: 'followUp', 
      headerName: 'Follow Up', 
      width: 150, 
      editable: true,
      cellEditor: 'agDateCellEditor'
    },
    { 
      field: 'leadValue', 
      headerName: 'Lead Value', 
      width: 120, 
      editable: true,
      valueFormatter: (params) => params.value ? `$${params.value.toLocaleString()}` : '$0'
    },
    { 
      field: 'leadOwner', 
      headerName: 'Representative', 
      width: 140, 
      editable: true,
      filter: true,
      cellEditor: 'agSelectCellEditor',
      cellEditorParams: {
        values: ['Sameer', 'Rehan', 'Admin']
      }
    },
    { 
      field: 'status', 
      headerName: 'Status', 
      width: 120, 
      editable: true,
      cellRenderer: StatusBadge,
      cellEditor: 'agSelectCellEditor',
      cellEditorParams: {
        values: ['pending', 'paid', 'contacted', 'failed']
      }
    }
  ].map((column) => ({
    ...column,
    minWidth: 'width' in column && column.width ? column.minWidth : RESIZE_MIN_WIDTH,
  })), []);

  const onAddLead = useCallback(async () => {
    setLoading(true);
    const newLeadData = {
      contact: 'New Contact',
      ns: 'NEW',
      businessOwner: 'Unknown',
      businessName: 'Unassigned',
      service: 'General',
      response: '',
      followUp: new Date().toISOString().split('T')[0],
      leadValue: 0,
      leadOwner: 'Admin',
      status: 'pending',
    };

    try {
      await apiClient.post('/leads', newLeadData);
      await fetchData();
    } catch (error) {
      console.error('Failed to create lead:', error);
      // Even if server fails, add a local one for UI feedback if it's a demo flow
      const localNewLead: Lead = {
        id: Date.now(),
        ...newLeadData
      };
      setRowData(prev => [localNewLead, ...prev]);
    } finally {
      setLoading(false);
    }
  }, [fetchData]);

  const onCellValueChanged = useCallback(async (event: CellValueChangedEvent) => {
    const { data } = event;
    try {
      await apiClient.put(`/leads/${data.id}`, data);
      console.log('Update successful');
    } catch (error) {
      console.error('Update failed:', error);
    }
  }, []);

  const getRowStyle = (params: RowClassParams<Lead>) => {
    if (params.data && params.data.status === 'paid') {
      return { backgroundColor: '#c6efce' };
    }
    return undefined;
  };

  return (
    <div className="w-full h-full p-6 flex flex-col space-y-4 animate-in fade-in duration-700">
      {/* Toolbar */}
      <div className="flex justify-between items-center bg-white/30 backdrop-blur-md border border-white/20 p-3 rounded-xl shadow-sm">
        <div className="flex space-x-3">
          <div className="px-4 py-1.5 bg-white/50 border border-white/40 rounded-lg text-sm text-slate-600 font-medium shadow-inner flex items-center group focus-within:ring-2 focus-within:ring-indigo-500/50 transition-all">
            <span className="mr-2 opacity-50 group-hover:scale-110 transition-transform">🔍</span>
            <input 
              type="text" 
              placeholder="Search leads..." 
              className="bg-transparent border-none outline-none w-48 md:w-64"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
            />
          </div>
          <button 
            id="new-lead-btn" 
            onClick={onAddLead}
            className="px-4 py-1.5 bg-indigo-600 text-white rounded-lg text-sm font-semibold shadow-md hover:bg-indigo-700 active:scale-95 transition-all"
          >
            + New Lead
          </button>
        </div>
        <div className="flex items-center space-x-4 text-[10px] md:text-xs font-bold text-slate-500 uppercase tracking-tight">
          <span>Total Leads: {rowData.length}</span>
          <span className="text-indigo-600">Active: {rowData.filter(r => r.status !== 'paid').length}</span>
          <span className="text-emerald-600">Paid: {rowData.filter(r => r.status === 'paid').length}</span>
          {loading && <Loader2 className="animate-spin text-blue-500 h-4 w-4 ml-2" />}
        </div>
      </div>
      
      {/* Grid Container */}
      <div 
        className="flex-1 bg-white/40 backdrop-blur-xl border border-white/30 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        id="sales-grid-container"
      >
        <div className="flex-1">
          <AgGridReact
            theme={myTheme}
            rowData={rowData}
            columnDefs={columnDefs}
            suppressCellFocus={false}
            cellSelection={{
              suppressMultiRanges: true,
            }}
            onCellValueChanged={onCellValueChanged}
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
              flex: 1,
              minWidth: 100,
            }}
            animateRows={true}
          />
        </div>

        {/* Aggregate Footer */}
        <div className="bg-slate-900/5 border-t border-slate-900/10 flex text-[10px] md:text-xs font-bold text-slate-700 items-center px-4 py-2">
          <div className="flex-1">Rows: {rowData.length} displayed</div>
          <div className="flex space-x-8">
            <div>Avg Value: <span className="text-indigo-600">
              ${rowData.length ? (rowData.reduce((acc, curr) => acc + (curr.leadValue || 0), 0) / rowData.length).toLocaleString(undefined, {minimumFractionDigits: 2}) : '0.00'}
            </span></div>
            <div>Sum Total: <span className="text-emerald-700">
              ${rowData.reduce((acc, curr) => acc + (curr.leadValue || 0), 0).toLocaleString()}
            </span></div>
          </div>
        </div>
      </div>
    </div>
  );
}
