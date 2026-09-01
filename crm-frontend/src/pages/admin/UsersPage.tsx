import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Building2,
  Calendar,
  KeyRound,
  Loader2,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  UserRound,
  Users,
} from 'lucide-react';
import apiClient from '../../api/client';
import type { User } from '../../types';
import CreateUserModal from '../../components/CreateUser';
import ChangePasswordModal from '../../components/ChangePassword';
import CompanyAccessModal from '../../components/CompanyAccessModal';
import ConfirmDialog from '../../components/ConfirmDialog';
import { formatDateDisplay } from '../../utils/date';

type RoleFilter = 'all' | 'admin' | 'employee';

const isAdmin = (user: User) => user.role_type === 'admin';

function CompanyList({ user }: { user: User }) {
  if (isAdmin(user)) {
    return <span className="text-sm text-slate-600">All companies</span>;
  }

  const companies = user.companies ?? [];

  if (companies.length === 0) {
    return <span className="text-sm text-slate-400">No access assigned</span>;
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {companies.slice(0, 2).map((company) => (
        <span
          key={company.id}
          className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-600"
        >
          {company.name}
        </span>
      ))}
      {companies.length > 2 ? (
        <span className="text-xs font-medium text-slate-500">+{companies.length - 2}</span>
      ) : null}
    </div>
  );
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [createUserOpen, setCreateUserOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [companyAccessUser, setCompanyAccessUser] = useState<User | null>(null);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  const [deletingUserId, setDeletingUserId] = useState<number | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setLoadError('');

    try {
      const response = await apiClient.get<User[]>('/users');
      setUsers(response.data);
    } catch (error: any) {
      console.error('Failed to fetch users:', error.response?.data || error.message);
      setLoadError('We could not load the user directory. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchUsers();
  }, [fetchUsers]);

  const filteredUsers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return users.filter((user) => {
      const matchesRole = roleFilter === 'all'
        || (roleFilter === 'admin' ? isAdmin(user) : !isAdmin(user));
      const matchesQuery = !normalizedQuery
        || user.username.toLowerCase().includes(normalizedQuery)
        || user.email.toLowerCase().includes(normalizedQuery)
        || user.companies?.some((company) => company.name.toLowerCase().includes(normalizedQuery));

      return matchesRole && Boolean(matchesQuery);
    });
  }, [query, roleFilter, users]);

  const adminCount = users.filter(isAdmin).length;
  const employeeCount = users.length - adminCount;

  const deleteUser = async (id: number) => {
    setDeletingUserId(id);
    setActionError('');

    try {
      await apiClient.delete(`/users/${id}`);
      setUsers((current) => current.filter((user) => user.id !== id));
      setUserToDelete(null);
    } catch (error) {
      console.error('Delete failed:', error);
      setActionError('The user could not be deleted. Please try again.');
      setUserToDelete(null);
    } finally {
      setDeletingUserId(null);
    }
  };

  return (
    <div className="min-h-full bg-[#f6f7f9] px-4 py-6 text-slate-900 sm:px-6 lg:px-8 lg:py-8">
      <div className="mx-auto w-full max-w-[1480px]">
        <header className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Administration</p>
            <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-slate-950 sm:text-[28px]">
              User management
            </h1>
            <p className="mt-1.5 max-w-2xl text-sm leading-6 text-slate-500">
              Manage team members, company access, and account security.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setCreateUserOpen(true)}
            className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 self-start rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-300 focus:ring-offset-2"
          >
            <Plus className="h-4 w-4" strokeWidth={2.25} />
            Add user
          </button>
        </header>

        <section
          aria-label="User summary"
          className="mt-7 grid overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.03)] sm:grid-cols-3"
        >
          <div className="flex items-center gap-3 px-5 py-4 sm:border-r sm:border-slate-200">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
              <Users className="h-[18px] w-[18px]" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500">Total users</p>
              <p className="mt-0.5 text-xl font-semibold tabular-nums text-slate-900">{users.length}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 border-t border-slate-200 px-5 py-4 sm:border-r sm:border-t-0">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
              <UserRound className="h-[18px] w-[18px]" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500">Employees</p>
              <p className="mt-0.5 text-xl font-semibold tabular-nums text-slate-900">{employeeCount}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 border-t border-slate-200 px-5 py-4 sm:border-t-0">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-50 text-amber-700">
              <ShieldCheck className="h-[18px] w-[18px]" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500">Administrators</p>
              <p className="mt-0.5 text-xl font-semibold tabular-nums text-slate-900">{adminCount}</p>
            </div>
          </div>
        </section>

        <section className="mt-5 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
          <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Team directory</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                {filteredUsers.length} of {users.length} users
              </p>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <label className="relative block">
                <span className="sr-only">Search users</span>
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search users or companies"
                  className="h-9 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-slate-500 focus:ring-2 focus:ring-slate-200 sm:w-64"
                />
              </label>
              <label>
                <span className="sr-only">Filter by role</span>
                <select
                  value={roleFilter}
                  onChange={(event) => setRoleFilter(event.target.value as RoleFilter)}
                  className="h-9 w-full cursor-pointer rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200 sm:w-36"
                >
                  <option value="all">All roles</option>
                  <option value="employee">Employees</option>
                  <option value="admin">Administrators</option>
                </select>
              </label>
            </div>
          </div>

          {actionError ? (
            <div role="alert" className="border-b border-red-200 bg-red-50 px-5 py-3 text-sm text-red-700">
              {actionError}
            </div>
          ) : null}

          {loading ? (
            <div className="flex min-h-72 items-center justify-center">
              <div className="flex items-center gap-2.5 text-sm font-medium text-slate-500">
                <Loader2 className="h-5 w-5 animate-spin" />
                Loading users
              </div>
            </div>
          ) : loadError ? (
            <div className="flex min-h-72 flex-col items-center justify-center px-6 text-center">
              <p className="text-sm font-medium text-slate-800">{loadError}</p>
              <button
                type="button"
                onClick={() => void fetchUsers()}
                className="mt-3 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Try again
              </button>
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="flex min-h-72 flex-col items-center justify-center px-6 text-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                <Search className="h-5 w-5" />
              </div>
              <p className="mt-3 text-sm font-semibold text-slate-800">No users found</p>
              <p className="mt-1 text-sm text-slate-500">Try a different search term or role filter.</p>
            </div>
          ) : (
            <>
              <div className="hidden overflow-x-auto lg:block">
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/80">
                      <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">User</th>
                      <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Role</th>
                      <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Company access</th>
                      <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Date joined</th>
                      <th className="px-5 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-500">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredUsers.map((user) => (
                      <tr key={user.id} className="transition-colors hover:bg-slate-50/70">
                        <td className="px-5 py-4">
                          <div className="min-w-56">
                            <p className="truncate text-sm font-semibold text-slate-900">{user.username}</p>
                            <p className="mt-0.5 truncate text-xs text-slate-500">{user.email}</p>
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <span className={`inline-flex rounded-md border px-2 py-1 text-xs font-medium ${
                            isAdmin(user)
                              ? 'border-amber-200 bg-amber-50 text-amber-800'
                              : 'border-slate-200 bg-white text-slate-600'
                          }`}>
                            {isAdmin(user) ? 'Administrator' : (user.role_name || 'Employee')}
                          </span>
                        </td>
                        <td className="px-5 py-4"><CompanyList user={user} /></td>
                        <td className="whitespace-nowrap px-5 py-4 text-sm text-slate-600">
                          {formatDateDisplay(user.created_at || user.createdAt) || '—'}
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex items-center justify-end gap-1">
                            {!isAdmin(user) ? (
                              <button
                                type="button"
                                onClick={() => setCompanyAccessUser(user)}
                                className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-2 text-xs font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
                                title="Manage company access"
                                aria-label={`Manage company access for ${user.username}`}
                              >
                                <Building2 className="h-4 w-4" />
                                Access
                              </button>
                            ) : null}
                            <button
                              type="button"
                              onClick={() => setSelectedUser(user)}
                              className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-2 text-xs font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
                              title="Change password"
                              aria-label={`Change password for ${user.username}`}
                            >
                              <KeyRound className="h-4 w-4" />
                              Password
                            </button>
                            {!isAdmin(user) ? (
                              <button
                                type="button"
                                onClick={() => setUserToDelete(user)}
                                className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-2 text-xs font-medium text-slate-500 transition hover:bg-red-50 hover:text-red-700"
                                title="Delete user"
                                aria-label={`Delete ${user.username}`}
                              >
                                <Trash2 className="h-4 w-4" />
                                Delete
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="divide-y divide-slate-200 lg:hidden">
                {filteredUsers.map((user) => (
                  <article key={user.id} className="p-4 sm:p-5">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate text-sm font-semibold text-slate-900">{user.username}</h3>
                        <span className={`rounded-md border px-2 py-0.5 text-[11px] font-medium ${
                          isAdmin(user)
                            ? 'border-amber-200 bg-amber-50 text-amber-800'
                            : 'border-slate-200 bg-white text-slate-600'
                        }`}>
                          {isAdmin(user) ? 'Administrator' : (user.role_name || 'Employee')}
                        </span>
                      </div>
                      <p className="mt-1 truncate text-xs text-slate-500">{user.email}</p>
                    </div>

                    <dl className="mt-4 grid gap-3 border-y border-slate-100 py-3 text-sm sm:grid-cols-2">
                      <div>
                        <dt className="mb-1 flex items-center gap-1.5 text-xs font-medium text-slate-400">
                          <Building2 className="h-3.5 w-3.5" /> Company access
                        </dt>
                        <dd><CompanyList user={user} /></dd>
                      </div>
                      <div>
                        <dt className="mb-1 flex items-center gap-1.5 text-xs font-medium text-slate-400">
                          <Calendar className="h-3.5 w-3.5" /> Date joined
                        </dt>
                        <dd className="text-sm text-slate-600">
                          {formatDateDisplay(user.created_at || user.createdAt) || '—'}
                        </dd>
                      </div>
                    </dl>

                    <div className="mt-3 flex flex-wrap items-center gap-1">
                      {!isAdmin(user) ? (
                        <button
                          type="button"
                          onClick={() => setCompanyAccessUser(user)}
                          className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100"
                        >
                          <Building2 className="h-4 w-4" /> Access
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => setSelectedUser(user)}
                        className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100"
                      >
                        <KeyRound className="h-4 w-4" /> Password
                      </button>
                      {!isAdmin(user) ? (
                        <button
                          type="button"
                          onClick={() => setUserToDelete(user)}
                          className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-2 text-xs font-medium text-red-600 hover:bg-red-50"
                        >
                          <Trash2 className="h-4 w-4" /> Delete
                        </button>
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>
            </>
          )}
        </section>
      </div>

      <CreateUserModal
        open={createUserOpen}
        onClose={() => setCreateUserOpen(false)}
        onSuccess={() => void fetchUsers()}
      />

      <ChangePasswordModal
        open={Boolean(selectedUser)}
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

      <ConfirmDialog
        open={Boolean(userToDelete)}
        title="Delete user"
        message={`Delete ${userToDelete?.username || 'this user'}? This action cannot be undone.`}
        confirmLabel="Delete user"
        onConfirm={() => {
          if (userToDelete) void deleteUser(userToDelete.id);
        }}
        onCancel={() => setUserToDelete(null)}
        loading={deletingUserId !== null}
      />
    </div>
  );
}
