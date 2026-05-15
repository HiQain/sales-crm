import { useEffect, useMemo, useRef, useState } from 'react';
import type { ColDef } from 'ag-grid-community';
import { Columns3 } from 'lucide-react';

export interface ColumnVisibilityOption {
  id: string;
  label: string;
}

export const getColumnVisibilityId = (column: Pick<ColDef, 'colId' | 'field' | 'headerName'>) =>
  String(column.colId ?? column.field ?? column.headerName ?? '');

interface ColumnVisibilityMenuProps {
  columns: ColumnVisibilityOption[];
  visibleColumnIds: string[];
  onToggle: (columnId: string) => void;
}

export default function ColumnVisibilityMenu({
  columns,
  visibleColumnIds,
  onToggle,
}: ColumnVisibilityMenuProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const visibleColumnIdSet = useMemo(() => new Set(visibleColumnIds), [visibleColumnIds]);

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
        className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/30 px-4 py-2 text-sm text-slate-700 shadow-sm transition-all hover:bg-white/40 focus:outline-none focus:ring-2 focus:ring-indigo-500"
      >
        <Columns3 size={18} className="text-slate-500" />
        <span>Columns</span>
      </button>

      {open && (
        <div className="absolute right-0 z-40 mt-2 w-64 rounded-2xl border border-white/30 bg-white/85 p-3 shadow-2xl backdrop-blur-[20px]">
          <div className="mb-2 px-1 text-xs font-bold uppercase tracking-widest text-slate-500">
            Show Columns
          </div>

          <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
            {columns.map((column) => {
              const checked = visibleColumnIdSet.has(column.id);

              return (
                <label
                  key={column.id}
                  className="flex cursor-pointer items-center justify-between gap-3 rounded-xl px-3 py-2 transition-colors hover:bg-slate-100/70"
                >
                  <span className="text-sm font-medium text-slate-700">{column.label}</span>

                  <span className="relative inline-flex h-6 w-11 items-center">
                    <input
                      type="checkbox"
                      className="peer sr-only"
                      checked={checked}
                      onChange={() => onToggle(column.id)}
                    />
                    <span className="absolute inset-0 rounded-full bg-slate-300 transition peer-checked:bg-indigo-500" />
                    <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition peer-checked:translate-x-5" />
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
