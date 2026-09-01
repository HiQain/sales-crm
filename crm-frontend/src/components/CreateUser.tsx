import { useState } from 'react';
import { Loader2, UserPlus, X } from 'lucide-react';
import apiClient from '../api/client';

type CreateUserModalProps = {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
};

type UserRole = 'employee' | 'admin';

const inputClassName =
  'h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-slate-500 focus:ring-2 focus:ring-slate-200';

export default function CreateUserModal({ open, onClose, onSuccess }: CreateUserModalProps) {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('employee');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (!open) return null;

  const handleCreate = async () => {
    setLoading(true);
    setError('');

    try {
      await apiClient.post('/auth/register', {
        username: username.trim(),
        email: email.trim(),
        password,
        role,
      });

      setUsername('');
      setEmail('');
      setPassword('');
      setRole('employee');
      onSuccess?.();
      onClose();
    } catch (requestError: any) {
      console.error(requestError);
      setError(requestError.response?.data?.error?.message || 'The user could not be created. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-[2px]">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-user-title"
        className="relative w-full max-w-md overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.22)]"
      >
        <div className="flex items-start gap-3 border-b border-slate-200 px-6 py-5 pr-14">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
            <UserPlus className="h-[18px] w-[18px]" />
          </div>
          <div>
            <h2 id="create-user-title" className="text-lg font-semibold text-slate-950">Add user</h2>
            <p className="mt-1 text-sm leading-5 text-slate-500">
              Create an account for a new team member.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-md p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          aria-label="Close add user dialog"
        >
          <X className="h-4 w-4" />
        </button>

        <form
          className="px-6 py-5"
          onSubmit={(event) => {
            event.preventDefault();
            void handleCreate();
          }}
        >
          <div className="space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">Full name</span>
              <input
                className={inputClassName}
                placeholder="e.g. Sana Ahmed"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="name"
                required
                autoFocus
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">Work email</span>
              <input
                className={inputClassName}
                placeholder="name@company.com"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                required
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">Role</span>
              <select
                className={`${inputClassName} cursor-pointer`}
                value={role}
                onChange={(event) => setRole(event.target.value as UserRole)}
              >
                <option value="employee">Employee</option>
                <option value="admin">Administrator</option>
              </select>
              <span className="mt-1.5 block text-xs text-slate-400">
                Administrators can manage all users and companies.
              </span>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">Temporary password</span>
              <input
                className={inputClassName}
                placeholder="At least 8 characters"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
              />
              <span className="mt-1.5 block text-xs text-slate-400">
                Share this securely with the new user.
              </span>
            </label>
          </div>

          {error ? (
            <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          ) : null}

          <div className="mt-6 flex items-center justify-end gap-2 border-t border-slate-100 pt-5">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="h-9 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex h-9 min-w-24 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-300 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {loading ? 'Adding…' : 'Add user'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
