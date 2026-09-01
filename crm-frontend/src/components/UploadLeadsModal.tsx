import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Check, FileSpreadsheet, Loader2, Search, Upload, Users, X } from 'lucide-react';
import apiClient from '../api/client';
import type { User } from '../types';
import { MAX_LEAD_IMPORT_ROWS, parseLeadSheet, type ParsedLeadSheet } from '../utils/leadSheet';

type ImportUser = Pick<User, 'id' | 'username' | 'email'>;

type ImportResult = {
  importedCount: number;
  assignments: Array<{
    userId: number;
    username: string;
    count: number;
  }>;
};

type UploadLeadsModalProps = {
  open: boolean;
  users: ImportUser[];
  onClose: () => void;
  onImported: () => void | Promise<void>;
};

const ACCEPTED_FILE_TYPES = '.xlsx,.csv';
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

const getRequestErrorMessage = (error: unknown) => {
  const requestError = error as {
    response?: { data?: { error?: { message?: string } } };
  };

  return requestError.response?.data?.error?.message || 'The leads could not be imported. Please try again.';
};

export default function UploadLeadsModal({ open, users, onClose, onImported }: UploadLeadsModalProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [parsedSheet, setParsedSheet] = useState<ParsedLeadSheet | null>(null);
  const [selectedUserIds, setSelectedUserIds] = useState<number[]>([]);
  const [userSearch, setUserSearch] = useState('');
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<ImportResult | null>(null);

  useEffect(() => {
    if (!open) return;

    setParsedSheet(null);
    setSelectedUserIds([]);
    setUserSearch('');
    setParsing(false);
    setImporting(false);
    setError('');
    setResult(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [open]);

  const filteredUsers = useMemo(() => {
    const query = userSearch.trim().toLowerCase();
    if (!query) return users;

    return users.filter((entry) => (
      entry.username.toLowerCase().includes(query) || entry.email.toLowerCase().includes(query)
    ));
  }, [userSearch, users]);

  const distribution = useMemo(() => {
    const leadCount = parsedSheet?.rows.length ?? 0;
    const userCount = selectedUserIds.length;
    if (leadCount === 0 || userCount === 0) return new Map<number, number>();

    return new Map(selectedUserIds.map((userId, userIndex) => [
      userId,
      Math.floor((leadCount + userCount - 1 - userIndex) / userCount),
    ]));
  }, [parsedSheet?.rows.length, selectedUserIds]);

  if (!open) return null;

  const selectFile = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  };

  const handleFileChange = async (file: File | undefined) => {
    if (!file) return;

    setParsing(true);
    setParsedSheet(null);
    setResult(null);
    setError('');

    try {
      if (file.size > MAX_FILE_SIZE_BYTES) {
        throw new Error('The spreadsheet must be 10 MB or smaller.');
      }

      if (!/\.(xlsx|csv)$/i.test(file.name)) {
        throw new Error('Choose an XLSX or CSV spreadsheet.');
      }

      const parsed = await parseLeadSheet(file);
      setParsedSheet(parsed);
    } catch (parseError) {
      setError(parseError instanceof Error ? parseError.message : 'The spreadsheet could not be read.');
    } finally {
      setParsing(false);
    }
  };

  const toggleUser = (userId: number) => {
    setError('');
    setSelectedUserIds((current) => (
      current.includes(userId)
        ? current.filter((id) => id !== userId)
        : [...current, userId]
    ));
  };

  const importLeads = async () => {
    if (!parsedSheet) {
      setError('Choose a spreadsheet first.');
      return;
    }

    if (selectedUserIds.length === 0) {
      setError('Select at least one user for distribution.');
      return;
    }

    setImporting(true);
    setError('');

    try {
      const response = await apiClient.post<ImportResult>('/leads/import', {
        leads: parsedSheet.rows,
        userIds: selectedUserIds,
      });
      setResult(response.data);
      await onImported();
    } catch (requestError) {
      setError(getRequestErrorMessage(requestError));
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center overflow-y-auto bg-slate-950/40 p-3 backdrop-blur-[2px] sm:p-5">
      <div className="flex max-h-[calc(100vh-2rem)] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
              <FileSpreadsheet size={21} />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-slate-900">Upload & Distribute Leads</h2>
              <p className="text-sm text-slate-500">Import a sheet, then choose users in assignment order.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={importing}
            className="rounded-md p-2 text-slate-500 transition hover:bg-slate-100 disabled:opacity-50"
            aria-label="Close lead import"
          >
            <X size={21} />
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-4">
          {result ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white">
                  <Check size={17} strokeWidth={3} />
                </div>
                <div>
                  <h3 className="font-bold text-emerald-900">{result.importedCount.toLocaleString()} leads imported</h3>
                  <p className="mt-1 text-sm text-emerald-700">The spreadsheet was distributed in round-robin order.</p>
                </div>
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {result.assignments.map((assignment, index) => (
                  <div key={assignment.userId} className="flex items-center justify-between rounded-lg border border-emerald-200 bg-white/80 px-3 py-2 text-sm">
                    <span className="font-semibold text-slate-700">{index + 1}. {assignment.username}</span>
                    <span className="text-emerald-700">{assignment.count.toLocaleString()} leads</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              <section>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <h3 className="text-sm font-bold text-slate-800">1. Choose a spreadsheet</h3>
                  <span className="text-xs text-slate-400">Up to {MAX_LEAD_IMPORT_ROWS.toLocaleString()} leads</span>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ACCEPTED_FILE_TYPES}
                  className="hidden"
                  onChange={(event) => void handleFileChange(event.target.files?.[0])}
                />
                <button
                  type="button"
                  onClick={selectFile}
                  disabled={parsing || importing}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm font-semibold text-slate-600 transition hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 disabled:cursor-wait disabled:opacity-60"
                >
                  {parsing ? <Loader2 size={19} className="animate-spin" /> : <Upload size={19} />}
                  {parsing ? 'Reading spreadsheet...' : parsedSheet ? 'Choose a different sheet' : 'Choose XLSX or CSV file'}
                </button>
                <p className="mt-2 text-xs leading-5 text-slate-500">
                  Supported headings: Contact, Email, Business Owner, Business Name, Source, Service, Notes, Lead Value, and Lead Status.
                </p>

                {parsedSheet ? (
                  <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2.5 text-sm">
                    <span className="font-semibold text-indigo-800">{parsedSheet.fileName}</span>
                    <span className="text-indigo-700">Sheet: {parsedSheet.sheetName}</span>
                    <span className="text-indigo-700">{parsedSheet.rows.length.toLocaleString()} leads ready</span>
                    {parsedSheet.skippedRows > 0 ? <span className="text-slate-500">{parsedSheet.skippedRows} empty rows skipped</span> : null}
                  </div>
                ) : null}
              </section>

              <section>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-slate-800">2. Select users</h3>
                    <p className="mt-0.5 text-xs text-slate-500">Selection order controls who receives lead 1, lead 2, and so on.</p>
                  </div>
                  {selectedUserIds.length > 0 ? (
                    <button type="button" onClick={() => setSelectedUserIds([])} className="text-xs font-semibold text-indigo-600 hover:text-indigo-800">
                      Clear selection
                    </button>
                  ) : null}
                </div>

                <div className="relative mb-2">
                  <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                  <input
                    type="search"
                    value={userSearch}
                    onChange={(event) => setUserSearch(event.target.value)}
                    placeholder="Search users..."
                    className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-700 outline-none transition focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/20"
                  />
                </div>

                <div className="max-h-56 overflow-y-auto rounded-xl border border-slate-200 p-2">
                  {filteredUsers.length === 0 ? (
                    <div className="flex flex-col items-center px-4 py-7 text-center text-sm text-slate-500">
                      <Users size={23} className="mb-2 text-slate-400" />
                      No eligible users match your search.
                    </div>
                  ) : (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {filteredUsers.map((entry) => {
                        const selectedIndex = selectedUserIds.indexOf(Number(entry.id));
                        const selected = selectedIndex >= 0;
                        return (
                          <button
                            key={entry.id}
                            type="button"
                            onClick={() => toggleUser(Number(entry.id))}
                            className={`flex min-w-0 items-center gap-3 rounded-lg border px-3 py-2 text-left transition ${
                              selected
                                ? 'border-indigo-300 bg-indigo-50'
                                : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                            }`}
                          >
                            <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                              selected ? 'bg-indigo-600 text-white' : 'border border-slate-300 text-transparent'
                            }`}>
                              {selected ? selectedIndex + 1 : <Check size={12} />}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-semibold text-slate-800">{entry.username}</span>
                              <span className="block truncate text-xs text-slate-500">{entry.email}</span>
                            </span>
                            {selected && parsedSheet ? (
                              <span className="shrink-0 text-xs font-semibold text-indigo-700">{distribution.get(Number(entry.id)) ?? 0}</span>
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
                {parsedSheet && selectedUserIds.length > 0 ? (
                  <p className="mt-2 text-xs text-slate-500">
                    Preview: {parsedSheet.rows.length.toLocaleString()} leads will rotate across {selectedUserIds.length} selected {selectedUserIds.length === 1 ? 'user' : 'users'}.
                  </p>
                ) : null}
              </section>
            </div>
          )}

          {error ? (
            <div className="mt-4 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm font-medium text-rose-700">
              <AlertCircle size={17} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          ) : null}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">
          {result ? (
            <button type="button" onClick={onClose} className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700">
              Done
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={onClose}
                disabled={importing}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void importLeads()}
                disabled={!parsedSheet || selectedUserIds.length === 0 || importing}
                className="inline-flex min-w-44 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {importing ? <Loader2 size={17} className="animate-spin" /> : <Upload size={17} />}
                {importing ? 'Distributing...' : 'Import & Distribute'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
