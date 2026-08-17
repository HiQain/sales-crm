import { useEffect, useRef, useState } from 'react';
import { CalendarRange, Check } from 'lucide-react';
import { LEAD_DATE_FILTERS, type LeadDateFilter } from '../utils/leadDateFilter';

interface LeadDateFilterProps {
  value: LeadDateFilter;
  onChange: (value: LeadDateFilter) => void;
}

export default function LeadDateFilter({ value, onChange }: LeadDateFilterProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const activeOption = LEAD_DATE_FILTERS.find((option) => option.value === value) ?? LEAD_DATE_FILTERS[0];

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
        aria-haspopup="listbox"
        aria-expanded={open}
        className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 shadow-sm transition-all hover:bg-indigo-50 focus:outline-none focus:ring-2 focus:ring-indigo-500"
      >
        <CalendarRange size={18} className="text-slate-500" />
        <span>{activeOption.label}</span>
      </button>

      {open ? (
        <div
          role="listbox"
          aria-label="Filter leads by date"
          className="absolute right-0 z-40 mt-2 w-64 rounded-2xl border border-white/30 bg-white/85 p-3 shadow-2xl backdrop-blur-[20px]"
        >
          <div className="mb-2 px-1 text-xs font-bold uppercase tracking-widest text-slate-500">
            Date Range
          </div>

          <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
            {LEAD_DATE_FILTERS.map((option) => {
              const selected = option.value === value;

              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                  className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-xl px-3 py-2 text-left transition-colors hover:bg-slate-100/70"
                >
                  <span className="text-sm font-medium text-slate-700">{option.label}</span>
                  <span className="inline-flex h-5 w-5 items-center justify-center" aria-hidden="true">
                    {selected ? <Check size={18} strokeWidth={2.5} className="text-indigo-600" /> : null}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
