import { useState } from 'react';
import { KeyRound, Loader2, X } from 'lucide-react';
import apiClient from '../api/client';

interface Props {
  userId: number;
  username: string;
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function ChangePasswordModal({
  userId,
  username,
  open,
  onClose,
  onSuccess
}: Props) {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  if (!open) return null;

  const handleSubmit = async () => {
    if (!password) return;

    setLoading(true);
    try {
      await apiClient.put(`/users/${userId}/password`, {
        password,
      });

      setPassword('');
      onClose();
      onSuccess?.();
    } catch (err) {
      console.error("Password update failed", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-[2px]">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="change-password-title"
        className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-full p-1.5 text-slate-500 transition hover:bg-slate-100"
          aria-label="Close change password"
        >
          <X size={20} />
        </button>

        <div className="mb-5 flex items-center gap-3 pr-8">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
            <KeyRound size={21} />
          </div>
          <div>
            <h2 id="change-password-title" className="text-lg font-bold text-slate-800">
              Change Password
            </h2>
            <p className="text-sm text-slate-500">Set a new password for {username}</p>
          </div>
        </div>

        <label htmlFor="new-password" className="mb-2 block text-sm font-semibold text-slate-700">
          New password
        </label>
        <input
          id="new-password"
          type="password"
          placeholder="Enter new password"
          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-indigo-300 focus:ring-4 focus:ring-indigo-50"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoFocus
        />

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-60"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={loading || !password}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : null}
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
