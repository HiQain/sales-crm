import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Loader2, Plus, X } from 'lucide-react';
import { normalizeUsPhoneForStorage } from '../utils/phone';
import type { ClientOption } from '../types';

export interface JourneyRowDraft {
  record_date: string;
  business_name: string;
  credit_card_info: string;
  email: string;
  phone: string;
  sales: string;
  lead: string;
  service: string;
  status: string;
  paid: string;
  total: string;
}

export interface JourneyRowPayload {
  record_date: string;
  business_name: string;
  credit_card_info: string;
  email: string;
  phone: string;
  sales: string;
  lead: string;
  service: string;
  status: string;
  paid: number;
  balance: number;
  total: number;
}

export interface ClientJourneyFormValues {
  client_name: string;
  client_id: number | null;
  records: JourneyRowPayload[];
}

export interface ClientJourneyModalInitialValues {
  client_name?: string;
  client_id?: number | null;
  rows?: JourneyRowDraft[];
}

export interface JourneySuggestions {
  sales: string[];
  lead: string[];
  service: string[];
  status: string[];
}

interface ClientJourneyModalProps {
  open: boolean;
  mode: 'create' | 'edit';
  initialValues?: ClientJourneyModalInitialValues;
  clients: ClientOption[];
  suggestions: JourneySuggestions;
  onCancel: () => void;
  onSubmit: (values: ClientJourneyFormValues) => Promise<void>;
}

const todayLocal = () => {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
};

export const emptyJourneyRow = (): JourneyRowDraft => ({
  record_date: todayLocal(),
  business_name: '',
  credit_card_info: '',
  email: '',
  phone: '',
  sales: '',
  lead: '',
  service: '',
  status: 'pending',
  paid: '',
  total: '',
});

const toAmount = (value: string) => {
  const number = Number(String(value).replace(/[$,\s]/g, ''));
  return Number.isFinite(number) ? number : NaN;
};

const formatMoney = (value: number) =>
  `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const TEXT_FIELDS: Array<keyof JourneyRowDraft> = ['business_name', 'credit_card_info', 'email', 'phone', 'sales', 'lead', 'service'];

const isRowEmpty = (row: JourneyRowDraft) =>
  TEXT_FIELDS.every((field) => !row[field].trim()) && !row.paid.trim() && !row.total.trim();

interface ComboboxOption {
  key: string;
  label: string;
  hint?: string;
}

interface ComboboxProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  onSelect: (option: ComboboxOption) => void;
  options: ComboboxOption[];
  placeholder: string;
  autoFocus?: boolean;
}

function Combobox({ id, value, onChange, onSelect, options, placeholder, autoFocus }: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [filterText, setFilterText] = useState<string | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [listPosition, setListPosition] = useState<React.CSSProperties>({});

  // The list is position: fixed so the dialog's scroll area and footer can't cut it off.
  // Opens below the input, or above it when there isn't room below.
  useLayoutEffect(() => {
    if (!open) return;
    const LIST_MAX_HEIGHT = 224;
    const GAP = 4;
    const place = () => {
      const rect = inputRef.current?.getBoundingClientRect();
      if (!rect) return;
      const spaceBelow = window.innerHeight - rect.bottom - GAP - 8;
      const spaceAbove = rect.top - GAP - 8;
      const openUp = spaceBelow < Math.min(LIST_MAX_HEIGHT, 160) && spaceAbove > spaceBelow;
      setListPosition({
        position: 'fixed',
        left: rect.left,
        width: rect.width,
        maxHeight: Math.min(LIST_MAX_HEIGHT, openUp ? spaceAbove : spaceBelow),
        ...(openUp ? { bottom: window.innerHeight - rect.top + GAP } : { top: rect.bottom + GAP }),
      });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open]);

  // Show every option on focus; narrow down once the user types.
  const filtered = useMemo(() => {
    const query = (filterText ?? '').trim().toLowerCase();
    if (!query) return options;
    return options.filter((option) => `${option.label} ${option.hint ?? ''}`.toLowerCase().includes(query));
  }, [options, filterText]);

  useEffect(() => {
    setHighlight(0);
  }, [filterText, open]);

  useEffect(() => {
    if (!open || !listRef.current) return;
    const item = listRef.current.children[highlight] as HTMLElement | undefined;
    item?.scrollIntoView({ block: 'nearest' });
  }, [highlight, open]);

  const select = (option: ComboboxOption) => {
    onSelect(option);
    setFilterText(null);
    setOpen(false);
  };

  return (
    <div className="relative">
      <input
        ref={inputRef}
        id={id}
        type="text"
        autoComplete="off"
        autoFocus={autoFocus}
        role="combobox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        value={value}
        placeholder={placeholder}
        onFocus={() => { setFilterText(null); setOpen(true); }}
        onBlur={() => setOpen(false)}
        onChange={(event) => {
          onChange(event.target.value);
          setFilterText(event.target.value);
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setOpen(true);
            setHighlight((current) => Math.min(current + 1, Math.max(filtered.length - 1, 0)));
          } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            setHighlight((current) => Math.max(current - 1, 0));
          } else if (event.key === 'Enter' && open && filtered[highlight]) {
            event.preventDefault();
            select(filtered[highlight]);
          } else if (event.key === 'Escape' && open) {
            event.stopPropagation();
            setOpen(false);
          }
        }}
        className="h-10 w-full rounded-lg border border-slate-300 bg-white pl-3 pr-9 text-sm text-slate-800 placeholder:text-slate-400 transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
      />
      <ChevronDown
        size={16}
        className={`pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
      />
      {open && filtered.length > 0 && (
        <ul
          id={`${id}-list`}
          ref={listRef}
          role="listbox"
          style={listPosition}
          className="z-[110] overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
        >
          {filtered.map((option, index) => (
            <li
              key={option.key}
              role="option"
              aria-selected={index === highlight}
              onMouseDown={(event) => { event.preventDefault(); select(option); }}
              onMouseEnter={() => setHighlight(index)}
              className={`flex cursor-pointer items-baseline gap-2 px-3 py-2 text-sm ${index === highlight ? 'bg-indigo-50 text-indigo-700' : 'text-slate-700'}`}
            >
              <span className="truncate">{option.label}</span>
              {option.hint && <span className="truncate text-xs text-slate-400">{option.hint}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Same order as the Client Journey grid. The client is picked once at the top.
const COLUMNS: Array<{
  field: keyof JourneyRowDraft | 'balance';
  label: string;
  width: string;
  type?: 'date' | 'money' | 'computed';
  placeholder?: string;
  suggestions?: keyof JourneySuggestions | 'business';
}> = [
  { field: 'record_date', label: 'Date', width: 'w-[140px]', type: 'date' },
  { field: 'business_name', label: 'Business Name', width: 'w-[170px]', suggestions: 'business' },
  { field: 'credit_card_info', label: 'Credit Card Info.', width: 'w-[190px]', placeholder: 'Card number, exp, CVV' },
  { field: 'email', label: 'Email', width: 'w-[190px]', placeholder: 'name@example.com' },
  { field: 'phone', label: 'Phone', width: 'w-[150px]', placeholder: '(240) 319-4630' },
  { field: 'sales', label: 'Sales', width: 'w-[120px]', suggestions: 'sales' },
  { field: 'lead', label: 'Agent', width: 'w-[120px]', suggestions: 'lead' },
  { field: 'service', label: 'Service', width: 'w-[130px]', suggestions: 'service' },
  { field: 'status', label: 'Status', width: 'w-[115px]', suggestions: 'status' },
  { field: 'paid', label: 'Paid', width: 'w-[105px]', type: 'money', placeholder: '0.00' },
  { field: 'balance', label: 'Balance', width: 'w-[100px]', type: 'computed' },
  { field: 'total', label: 'Total', width: 'w-[105px]', type: 'money', placeholder: '0.00' },
];

export default function ClientJourneyModal({
  open,
  mode,
  initialValues,
  clients,
  suggestions,
  onCancel,
  onSubmit,
}: ClientJourneyModalProps) {
  const [clientName, setClientName] = useState('');
  const [clientId, setClientId] = useState<number | null>(null);
  const [rows, setRows] = useState<JourneyRowDraft[]>([emptyJourneyRow()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setClientName(initialValues?.client_name ?? '');
    setClientId(initialValues?.client_id ?? null);
    setRows(initialValues?.rows?.length ? initialValues.rows.map((row) => ({ ...row })) : [emptyJourneyRow()]);
    setError('');
    setSaving(false);
  }, [open, initialValues]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving) onCancel();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, saving, onCancel]);

  const clientPickerOptions = useMemo<ComboboxOption[]>(
    () => clients.filter((client) => client.id != null).map((client) => ({
      key: String(client.id),
      label: client.name,
      hint: client.hint || undefined,
    })),
    [clients],
  );

  // Clients with the typed name (used when nothing was picked from the list).
  const sameNameClients = useMemo(() => {
    const key = clientName.trim().toLowerCase();
    return key ? clients.filter((client) => client.id != null && client.name.trim().toLowerCase() === key) : [];
  }, [clients, clientName]);

  const selectedClient = clientId != null ? clients.find((client) => client.id === clientId) ?? null : null;

  const businessOptions = useMemo(() => {
    const source = selectedClient ? [selectedClient] : sameNameClients.length ? sameNameClients : clients;
    return [...new Set(source.flatMap((client) => client.businesses))].sort((a, b) => a.localeCompare(b));
  }, [clients, sameNameClients, selectedClient]);

  if (!open) return null;

  const isEdit = mode === 'edit';

  const updateRow = (index: number, field: keyof JourneyRowDraft, value: string) => {
    setRows((current) => current.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!clientName.trim()) {
      setError('Pick or type a client name.');
      return;
    }

    const filledRows = rows
      .map((row, index) => ({ row, number: index + 1 }))
      .filter(({ row }) => isEdit || !isRowEmpty(row));

    if (filledRows.length === 0) {
      setError('Fill in at least one row.');
      return;
    }

    const records: JourneyRowPayload[] = [];
    for (const { row, number } of filledRows) {
      const phone = normalizeUsPhoneForStorage(row.phone);
      if (phone === null) {
        setError(`Row ${number}: phone must be a valid US number, e.g. (240) 319-4630.`);
        return;
      }
      const paid = row.paid.trim() ? toAmount(row.paid) : 0;
      const total = row.total.trim() ? toAmount(row.total) : 0;
      if (Number.isNaN(paid) || Number.isNaN(total)) {
        setError(`Row ${number}: Paid and Total must be numbers.`);
        return;
      }
      records.push({
        record_date: row.record_date,
        business_name: row.business_name.trim(),
        credit_card_info: row.credit_card_info.trim(),
        email: row.email.trim(),
        phone,
        sales: row.sales.trim(),
        lead: row.lead.trim(),
        service: row.service.trim(),
        status: row.status.trim() || 'pending',
        paid,
        total,
        balance: Math.max(total - paid, 0),
      });
    }

    setSaving(true);
    setError('');
    try {
      await onSubmit({ client_name: clientName.trim(), client_id: selectedClient ? clientId : null, records });
    } catch (submitError: unknown) {
      const message = (submitError as { response?: { data?: { error?: { message?: string } } } })
        ?.response?.data?.error?.message;
      setError(message || 'Could not save. Please try again.');
      setSaving(false);
    }
  };

  const inputClass = 'h-9 w-full rounded-md border border-slate-300 bg-white px-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20';

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/45 px-4 py-6 backdrop-blur-[2px]">
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="client-journey-modal-title"
        onSubmit={handleSubmit}
        className="flex max-h-full w-full max-w-[1200px] flex-col rounded-xl border border-slate-200 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.22)]"
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
          <div>
            <h3 id="client-journey-modal-title" className="text-lg font-semibold text-slate-950">
              {isEdit ? 'Edit Client Journey' : 'Add Client Journeys'}
            </h3>
            <p className="mt-0.5 text-sm text-slate-500">
              {isEdit
                ? 'Update this row of the Client Journey.'
                : 'Pick an existing client or type a new one. Each row is added to the Client Journey for that client, and each can have its own business.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            aria-label="Close"
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
          <div className="max-w-md">
            <div>
              <label htmlFor="client-journey-client" className="mb-1.5 block text-sm font-medium text-slate-700">
                Client Name <span className="text-rose-500">*</span>
              </label>
              <Combobox
                id="client-journey-client"
                value={clientName}
                onChange={(text) => { setClientName(text); setClientId(null); }}
                onSelect={(option) => { setClientName(option.label); setClientId(Number(option.key)); }}
                options={clientPickerOptions}
                placeholder="Type or select a client"
                autoFocus={!isEdit && !initialValues?.client_name}
              />
              {clientName.trim() && (
                <p className="mt-1 text-xs text-slate-500">
                  {selectedClient
                    ? <>Adding to <span className="font-medium text-slate-700">{selectedClient.name}</span>{selectedClient.hint ? ` (${selectedClient.hint})` : ''}.</>
                    : sameNameClients.length > 1
                      ? `${sameNameClients.length} clients are called "${clientName.trim()}". Pick one from the list, or it goes to the most recently used one.`
                      : sameNameClients.length === 1
                        ? 'Adding to the existing client with this name.'
                        : 'A new client will be created.'}
                </p>
              )}
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <h4 className="text-sm font-semibold text-slate-700">
                Rows {rows.length > 1 && <span className="font-normal text-slate-400">({rows.length})</span>}
              </h4>
              {!isEdit && (
                <button
                  type="button"
                  onClick={() => setRows((current) => [...current, emptyJourneyRow()])}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                >
                  <Plus size={15} /> Add another row
                </button>
              )}
            </div>

            {Object.entries({ ...suggestions, business: businessOptions }).map(([key, values]) => (
              <datalist key={key} id={`client-journey-suggest-${key}`}>
                {values.map((value) => <option key={value} value={value} />)}
              </datalist>
            ))}

            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-max min-w-full border-separate border-spacing-0 text-sm">
                <thead>
                  <tr>
                    {COLUMNS.map((column) => (
                      <th
                        key={column.field}
                        className={`${column.width} border-b border-slate-200 bg-slate-50 px-2 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500`}
                      >
                        {column.label}
                      </th>
                    ))}
                    {!isEdit && <th className="w-10 border-b border-slate-200 bg-slate-50" />}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => {
                    const paid = toAmount(row.paid || '0');
                    const total = toAmount(row.total || '0');
                    const balance = Number.isNaN(paid) || Number.isNaN(total) ? null : Math.max(total - paid, 0);

                    return (
                      <tr key={index} className="align-middle">
                        {COLUMNS.map((column) => (
                          <td key={column.field} className="border-b border-slate-100 px-1.5 py-2 first:pl-2">
                            {column.type === 'computed' ? (
                              <span className="block px-1 text-sm font-medium text-slate-600">
                                {balance == null ? '—' : formatMoney(balance)}
                              </span>
                            ) : (
                              <input
                                type={column.type === 'date' ? 'date' : 'text'}
                                inputMode={column.type === 'money' ? 'decimal' : undefined}
                                value={row[column.field as keyof JourneyRowDraft]}
                                onChange={(event) => updateRow(index, column.field as keyof JourneyRowDraft, event.target.value)}
                                placeholder={column.placeholder}
                                list={column.suggestions ? `client-journey-suggest-${column.suggestions}` : undefined}
                                aria-label={`${column.label}, row ${index + 1}`}
                                className={inputClass}
                              />
                            )}
                          </td>
                        ))}
                        {!isEdit && (
                          <td className="border-b border-slate-100 px-1 py-2">
                            <button
                              type="button"
                              onClick={() => setRows((current) => (current.length > 1 ? current.filter((_, i) => i !== index) : [emptyJourneyRow()]))}
                              aria-label={`Remove row ${index + 1}`}
                              className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition hover:bg-rose-50 hover:text-rose-500"
                            >
                              <X size={16} />
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-100 px-6 py-4">
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="h-9 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex h-9 min-w-28 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  );
}
