import { useEffect, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import type { ClientJourney, ClientOption } from '../types';
import { formatDateDisplay } from '../utils/date';
import { getClientKey } from '../utils/clients';

const errorMessage = (error: unknown) =>
  (error as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message
  || 'Could not save. Please try again.';

interface DialogShellProps {
  title: string;
  description: React.ReactNode;
  saving: boolean;
  error: string;
  submitLabel: string;
  onCancel: () => void;
  onSubmit: () => void;
  children: React.ReactNode;
}

function DialogShell({ title, description, saving, error, submitLabel, onCancel, onSubmit, children }: DialogShellProps) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving) onCancel();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [saving, onCancel]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/45 px-4 backdrop-blur-[2px]">
      <form
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onSubmit={(event) => { event.preventDefault(); onSubmit(); }}
        className="w-full max-w-md rounded-xl border border-slate-200 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.22)]"
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
          <div>
            <h3 className="text-lg font-semibold text-slate-950">{title}</h3>
            <p className="mt-0.5 text-sm text-slate-500">{description}</p>
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
        <div className="space-y-4 px-6 py-5">
          {children}
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
            className="inline-flex h-9 min-w-24 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {saving ? 'Saving...' : submitLabel}
          </button>
        </div>
      </form>
    </div>
  );
}

const inputClass = 'h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20';

interface MoveJourneyDialogProps {
  record: ClientJourney;
  clients: ClientOption[];
  onCancel: () => void;
  onMove: (target: { client_id: number } | { new_client_name: string }) => Promise<void>;
}

export function MoveJourneyDialog({ record, clients, onCancel, onMove }: MoveJourneyDialogProps) {
  const currentKey = getClientKey(record);
  const otherClients = clients.filter((client) => client.id != null && client.key !== currentKey);
  const [mode, setMode] = useState<'new' | 'existing'>('new');
  const [newName, setNewName] = useState(record.client_name || '');
  const [targetId, setTargetId] = useState<number | ''>('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (mode === 'new' && !newName.trim()) {
      setError('Enter a name for the new client.');
      return;
    }
    if (mode === 'existing' && targetId === '') {
      setError('Pick a client to move this row to.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onMove(mode === 'new' ? { new_client_name: newName.trim() } : { client_id: Number(targetId) });
    } catch (moveError) {
      setError(errorMessage(moveError));
      setSaving(false);
    }
  };

  const rowSummary = [
    record.record_date ? formatDateDisplay(record.record_date) : '',
    record.business_name,
    record.service,
  ].filter(Boolean).join(' · ');

  return (
    <DialogShell
      title="Move row to another client"
      description={<>Only this row moves{rowSummary ? <> ({rowSummary})</> : null}. Its billing and lead move with it.</>}
      saving={saving}
      error={error}
      submitLabel="Move"
      onCancel={onCancel}
      onSubmit={submit}
    >
      <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 p-3 has-[:checked]:border-indigo-400 has-[:checked]:bg-indigo-50/50">
        <input type="radio" name="move-mode" checked={mode === 'new'} onChange={() => setMode('new')} className="mt-1 accent-indigo-600" />
        <span className="flex-1">
          <span className="block text-sm font-semibold text-slate-800">New client</span>
          <span className="block text-xs text-slate-500">Separate this row into its own client. The same name is fine.</span>
          {mode === 'new' && (
            <input
              autoFocus
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              placeholder="Client name"
              aria-label="New client name"
              className={`${inputClass} mt-2`}
            />
          )}
        </span>
      </label>

      <label className={`flex items-start gap-3 rounded-lg border border-slate-200 p-3 has-[:checked]:border-indigo-400 has-[:checked]:bg-indigo-50/50 ${otherClients.length ? 'cursor-pointer' : 'opacity-50'}`}>
        <input
          type="radio"
          name="move-mode"
          checked={mode === 'existing'}
          disabled={!otherClients.length}
          onChange={() => setMode('existing')}
          className="mt-1 accent-indigo-600"
        />
        <span className="flex-1">
          <span className="block text-sm font-semibold text-slate-800">Existing client</span>
          <span className="block text-xs text-slate-500">
            {otherClients.length ? 'Move this row under a client that already exists.' : 'There are no other clients yet.'}
          </span>
          {mode === 'existing' && (
            <select
              autoFocus
              value={targetId}
              onChange={(event) => setTargetId(event.target.value ? Number(event.target.value) : '')}
              aria-label="Client to move to"
              className={`${inputClass} mt-2`}
            >
              <option value="">Select a client…</option>
              {otherClients.map((client) => (
                <option key={client.key} value={client.id!}>
                  {client.name}{client.hint ? ` — ${client.hint}` : ''} ({client.rowCount} {client.rowCount === 1 ? 'row' : 'rows'})
                </option>
              ))}
            </select>
          )}
        </span>
      </label>
    </DialogShell>
  );
}

interface RenameClientDialogProps {
  client: ClientOption;
  onCancel: () => void;
  onRename: (name: string) => Promise<void>;
}

export function RenameClientDialog({ client, onCancel, onRename }: RenameClientDialogProps) {
  const [name, setName] = useState(client.name);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!name.trim()) {
      setError('Enter a client name.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onRename(name.trim());
    } catch (renameError) {
      setError(errorMessage(renameError));
      setSaving(false);
    }
  };

  return (
    <DialogShell
      title="Rename client"
      description={`Updates the name on all ${client.rowCount} ${client.rowCount === 1 ? 'row' : 'rows'} of this client, in Client Journey and Billings.`}
      saving={saving}
      error={error}
      submitLabel="Rename"
      onCancel={onCancel}
      onSubmit={submit}
    >
      <input
        autoFocus
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="Client name"
        aria-label="Client name"
        className={inputClass}
      />
      <p className="text-xs text-slate-500">Tip: add a detail to tell same-name clients apart, e.g. “John (Dallas)”.</p>
    </DialogShell>
  );
}
