import { CalendarRange } from 'lucide-react';
import { LEAD_DATE_FILTERS, type LeadDateFilter } from '../utils/leadDateFilter';

interface LeadDateFilterProps {
  value: LeadDateFilter;
  onChange: (value: LeadDateFilter) => void;
}

export default function LeadDateFilter({ value, onChange }: LeadDateFilterProps) {
  const activeOption = LEAD_DATE_FILTERS.find((option) => option.value === value) ?? LEAD_DATE_FILTERS[0];

  return (
    <div className="relative">
      <CalendarRange className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as LeadDateFilter)}
        className="appearance-none bg-white border border-slate-300 pl-3 pr-3 py-2 rounded-md text-center text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm transition-all hover:bg-indigo-50"
        style={{ width: `calc(${activeOption.label.length + 4}ch + 1.5rem)` }}
      >
        {LEAD_DATE_FILTERS.map((option) => (
          <option key={option.value} value={option.value} className="text-center">
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
