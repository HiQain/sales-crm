import { useCallback, useEffect, useState, type MouseEvent } from 'react';
import { Building2, Calendar, KeyRound, Loader2, Mail, Trash2, User as UserIcon } from 'lucide-react';
import apiClient from '../../api/client';
import type { User } from '../../types';
import CreateUserModal from '../../components/CreateUser';
import ChangePasswordModal from '../../components/ChangePassword';
import CompanyAccessModal from '../../components/CompanyAccessModal';
import { formatDateDisplay } from '../../utils/date';

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [companyAccessUser, setCompanyAccessUser] = useState<User | null>(null);

  const fetchUsers = useCallback(async () => {
    try {
      const response = await apiClient.get<User[]>('/users');
      setUsers(response.data);
    } catch (error: any) {
      console.error('Failed to fetch users:', error.response?.data || error.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchUsers();
  }, [fetchUsers]);

  const deleteUser = async (id: number, event: MouseEvent) => {
    event.stopPropagation();
    if (!window.confirm('Are you sure you want to delete this user?')) return;

    try {
      await apiClient.delete(`/users/${id}`);
      setUsers((current) => current.filter((user) => user.id !== id));
    } catch (error) {
      console.error('Delete failed:', error);
    }
  };

  return (
    <div className="p-6 animate-in fade-in duration-500">
      <div className="mb-6 flex items-center justify-between">
        <div className="mb-8">
          <h2 className="text-2xl font-bold tracking-tight text-slate-700">Employees Dashboard</h2>
        </div>

        <button
          type="button"
          onClick={() => setOpen(true)}
          className="cursor-pointer rounded-xl bg-indigo-600 px-4 py-2 text-white"
        >
          + Create User
        </button>
      </div>

      <CreateUserModal
        open={open}
        onClose={() => setOpen(false)}
        onSuccess={() => void fetchUsers()}
      />

      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="animate-spin text-indigo-600" size={32} />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {users.map((user) => (
            <div
              key={user.id}
              className="group relative flex items-center gap-6 overflow-hidden rounded-2xl border border-white/30 bg-white/40 p-5 shadow-sm backdrop-blur-[20px] transition-all hover:border-white/40 hover:bg-white/50"
            >
              <div className="absolute inset-0 bg-slate-100/40 opacity-0 transition-opacity group-hover:opacity-100" />
              <div className="relative z-10 flex h-16 w-16 items-center justify-center rounded-2xl border border-indigo-500/20 bg-indigo-600/10 text-indigo-600 shadow-inner transition-transform group-hover:scale-105">
                <UserIcon size={32} />
              </div>

              <div className="relative z-10 min-w-0 flex-1">
                <div className="mb-1 flex items-center gap-2">
                  <h3 className="truncate text-lg font-bold text-slate-700">{user.username}</h3>
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ${
                    user.role_type === 'admin'
                      ? 'border-rose-500/20 bg-rose-500/10 text-rose-600'
                      : 'border-indigo-500/20 bg-indigo-500/10 text-indigo-600'
                  }`}>
                    {user.role_name || 'Employee'}
                  </span>
                </div>

                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <Mail size={14} className="opacity-60" />
                    <span className="truncate">{user.email}</span>
                  </div>
                  <div className="flex items-center gap-2 text-nowrap text-xs text-slate-500">
                    <Calendar size={14} className="opacity-60" />
                    <span>Joined {formatDateDisplay(user.created_at || user.createdAt)}</span>
                  </div>
                  <div className="mt-1 flex items-start gap-2 text-xs text-slate-500">
                    <Building2 size={14} className="mt-0.5 shrink-0 opacity-60" />
                    <div className="flex flex-wrap gap-1">
                      {user.role_type === 'admin' ? (
                        <span className="rounded bg-slate-200/80 px-1.5 py-0.5 font-semibold text-slate-600">All companies</span>
                      ) : user.companies?.map((company) => (
                        <span key={company.id} className="rounded bg-indigo-50 px-1.5 py-0.5 font-semibold text-indigo-600">
                          {company.name}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="relative z-10 flex items-center gap-1">
                {user.role_type !== 'admin' ? (
                  <button
                    type="button"
                    onClick={() => setCompanyAccessUser(user)}
                    className="cursor-pointer rounded-xl p-2 text-slate-500 transition-all hover:bg-indigo-500/10 hover:text-indigo-600"
                    title="Manage company access"
                    aria-label={`Manage company access for ${user.username}`}
                  >
                    <Building2 size={20} />
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => setSelectedUser(user)}
                  className="cursor-pointer rounded-xl p-2 text-slate-500 transition-all hover:bg-indigo-500/10 hover:text-indigo-600"
                  title="Change password"
                  aria-label={`Change password for ${user.username}`}
                >
                  <KeyRound size={20} />
                </button>
                <button
                  type="button"
                  onClick={(event) => void deleteUser(user.id, event)}
                  className="cursor-pointer rounded-xl p-2 text-slate-500 transition-all hover:bg-rose-500/10 hover:text-rose-600"
                  title="Delete user"
                  aria-label={`Delete ${user.username}`}
                >
                  <Trash2 size={20} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ChangePasswordModal
        open={!!selectedUser}
        userId={selectedUser?.id || 0}
        username={selectedUser?.username || ''}
        onClose={() => setSelectedUser(null)}
      />

      {companyAccessUser ? (
        <CompanyAccessModal
          key={companyAccessUser.id}
          user={companyAccessUser}
          onClose={() => setCompanyAccessUser(null)}
          onSaved={(userId, access) => {
            setUsers((current) => current.map((user) => (
              user.id === userId
                ? { ...user, company_ids: access.company_ids, companies: access.companies }
                : user
            )));
          }}
        />
      ) : null}
    </div>
  );
}
