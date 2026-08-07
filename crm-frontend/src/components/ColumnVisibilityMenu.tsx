import { useEffect, useMemo, useRef, useState } from 'react';
import type { ColDef } from 'ag-grid-community';
import { Columns3, Trash2 } from 'lucide-react';

export interface ColumnVisibilityOption {
  id: string;
  label: string;
  isCustom?: boolean;
}

export const getColumnVisibilityId = (column: Pick<ColDef, 'colId' | 'field' | 'headerName'>) =>
  String(column.colId ?? column.field ?? column.headerName ?? '');

interface ColumnVisibilityMenuProps {
  columns: ColumnVisibilityOption[];
  visibleColumnIds: string[];
  onToggle: (columnId: string) => void;
  onAddColumn?: (label: string) => void;
  onDeleteColumn?: (columnId: string) => void;
}

export default function ColumnVisibilityMenu({
  columns,
  visibleColumnIds,
  onToggle,
  onAddColumn,
  onDeleteColumn,
}: ColumnVisibilityMenuProps) {
  const [open, setOpen] = useState(false);
  const [newColumnLabel, setNewColumnLabel] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const visibleColumnIdSet = useMemo(() => new Set(visibleColumnIds), [visibleColumnIds]);

  const handleAddColumn = () => {
    const trimmedLabel = newColumnLabel.trim();
    if (!trimmedLabel || !onAddColumn) return;

    onAddColumn(trimmedLabel);
    setNewColumnLabel('');
  };

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 shadow-sm transition-all hover:bg-indigo-50 focus:outline-none focus:ring-2 focus:ring-indigo-500"
      >
        <Columns3 size={18} className="text-slate-500" />
        <span>Columns</span>
      </button>

      {open && (
        <div className="absolute right-0 z-40 mt-2 w-64 rounded-2xl border border-white/30 bg-white/85 p-3 shadow-2xl backdrop-blur-[20px]">
          <div className="mb-2 px-1 text-xs font-bold uppercase tracking-widest text-slate-500">
            Show Columns
          </div>

          {onAddColumn && (
            <div className="mb-3 rounded-xl border border-slate-200/80 bg-white/80 p-2">
              <div className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Add Custom Column
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newColumnLabel}
                  onChange={(event) => setNewColumnLabel(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      handleAddColumn();
                    }
                  }}
                  placeholder="Column name"
                  className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200"
                />
                <button
                  type="button"
                  onClick={handleAddColumn}
                  className="rounded-lg bg-indigo-500 px-3 py-2 text-sm font-semibold text-white transition hover:bg-indigo-600 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={!newColumnLabel.trim()}
                >
                  Add
                </button>
              </div>
            </div>
          )}

          <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
            {columns.map((column) => {
              const checked = visibleColumnIdSet.has(column.id);

              return (
                <label
                  key={column.id}
                  className="flex cursor-pointer items-center justify-between gap-3 rounded-xl px-3 py-2 transition-colors hover:bg-slate-100/70"
                >
                  <span className="text-sm font-medium text-slate-700">{column.label}</span>

                  <span className="flex items-center gap-2">
                    {column.isCustom && onDeleteColumn && (
                      <button
                        type="button"
                        aria-label={`Delete ${column.label}`}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          onDeleteColumn(column.id);
                        }}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-rose-200 bg-rose-50 text-rose-500 shadow-sm transition hover:border-rose-300 hover:bg-rose-100 hover:text-rose-600"
                      >
                        <Trash2 size={16} strokeWidth={2.2} />
                      </button>
                    )}

                    <span className="relative inline-flex h-5 w-9 items-center">
                      <input
                        type="checkbox"
                        className="peer sr-only"
                        checked={checked}
                        onChange={() => onToggle(column.id)}
                      />
                      <span className="absolute inset-0 rounded-full bg-slate-300 transition peer-checked:bg-indigo-500" />
                      <span className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition peer-checked:translate-x-4" />
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
