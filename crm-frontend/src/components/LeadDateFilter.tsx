import { CalendarRange } from 'lucide-react';
import { LEAD_DATE_FILTERS, type LeadDateFilter } from '../utils/leadDateFilter';

interface LeadDateFilterProps {
  value: LeadDateFilter;
  onChange: (value: LeadDateFilter) => void;
}

export default function LeadDateFilter({ value, onChange }: LeadDateFilterProps) {
  return (
    <div className="relative">
      <CalendarRange className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as LeadDateFilter)}
        className="appearance-none bg-white border border-slate-300 pl-10 pr-9 py-2 rounded-md text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm transition-all min-w-[150px]"
      >
        {LEAD_DATE_FILTERS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
