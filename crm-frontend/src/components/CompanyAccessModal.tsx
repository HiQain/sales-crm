import { useState } from 'react';
import { Building2, Check, Loader2, X } from 'lucide-react';
import apiClient from '../api/client';
import type { User } from '../types';
import { COMPANIES, type CompanyId } from '../utils/company';

type CompanyAccessResponse = {
  company_ids: number[];
  companies: NonNullable<User['companies']>;
};

type CompanyAccessModalProps = {
  user: User;
  onClose: () => void;
  onSaved: (userId: number, access: CompanyAccessResponse) => void;
};

export default function CompanyAccessModal({ user, onClose, onSaved }: CompanyAccessModalProps) {
  const [selectedCompanyIds, setSelectedCompanyIds] = useState<CompanyId[]>(() => {
    const assignedIds = new Set((user.company_ids ?? []).map(Number));
    const selected = COMPANIES.filter((company) => assignedIds.has(company.id)).map((company) => company.id);
    return selected.length > 0 ? selected : [COMPANIES[0].id];
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const toggleCompany = (companyId: CompanyId) => {
    setError('');
    setSelectedCompanyIds((current) => (
      current.includes(companyId)
        ? current.filter((id) => id !== companyId)
        : [...current, companyId]
    ));
  };

  const saveAccess = async () => {
    if (selectedCompanyIds.length === 0) {
      setError('Select at least one company.');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const response = await apiClient.put<CompanyAccessResponse>(`/users/${user.id}/companies`, {
        companyIds: selectedCompanyIds,
      });
      onSaved(user.id, response.data);
      onClose();
    } catch (requestError: any) {
      setError(requestError.response?.data?.error?.message || 'Failed to update company access.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-[2px]">
      <div className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-full p-1.5 text-slate-500 transition hover:bg-slate-100"
          aria-label="Close company access"
        >
          <X size={20} />
        </button>

        <div className="mb-5 flex items-center gap-3 pr-8">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
            <Building2 size={21} />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-800">Company Access</h2>
            <p className="text-sm text-slate-500">Choose companies for {user.username}</p>
          </div>
        </div>

        <div className="space-y-2">
          {COMPANIES.map((company) => {
            const selected = selectedCompanyIds.includes(company.id);

            return (
              <button
                key={company.id}
                type="button"
                onClick={() => toggleCompany(company.id)}
                className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left transition ${
                  selected
                    ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                <span className="font-semibold">{company.name}</span>
                <span className={`flex h-5 w-5 items-center justify-center rounded border ${
                  selected ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 bg-white'
                }`}>
                  {selected ? <Check size={14} strokeWidth={3} /> : null}
                </span>
              </button>
            );
          })}
        </div>

        {error ? <p className="mt-3 text-sm font-medium text-rose-600">{error}</p> : null}

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void saveAccess()}
            disabled={saving || selectedCompanyIds.length === 0}
            className="inline-flex min-w-28 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : null}
            Save Access
          </button>
        </div>
      </div>
    </div>
  );
}
