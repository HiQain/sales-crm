import { useState, useEffect } from 'react';
import React from 'react';
import { useNavigate } from 'react-router-dom';
import apiClient from '../../api/client';
import { Check, Loader2, Mail, Calendar, ChevronRight, Search, User as UserIcon, Trash2, Users as UsersIcon, X } from 'lucide-react';
import { User } from '../../types';
import CreateUserModal from "../../components/CreateUser";
import ChangePasswordModal from "../../components/ChangePassword";
import { formatDateDisplay } from '../../utils/date';

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [shareUser, setShareUser] = useState<User | null>(null);
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<number[]>([]);
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [shareLoading, setShareLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    async function fetchUsers() {
      try {
        const token = localStorage.getItem('jwt');
        console.log("TOKEN:", token);

        const response = await apiClient.get('/users');

        console.log("USERS API RESPONSE:", response.data);

        setUsers(response.data);
      } catch (error: any) {
        console.error('Failed to fetch users:', error.response?.data || error.message);
      } finally {
        setLoading(false);
      }
    }

    fetchUsers();
  }, []);

  const deleteUser = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm('Are you sure you want to delete this user?')) return;
    try {
      await apiClient.delete(`/users/${id}`);
      setUsers(prev => prev.filter(u => u.id !== id));
    } catch (error) {
      console.error('Delete failed:', error);
    }
  };

  const employees = users.filter((user) => user.role_type === 'employee');
  const filteredEmployees = employees.filter((employee) => {
    const query = employeeSearch.trim().toLowerCase();
    if (!query) return true;

    return (
      String(employee.username ?? '').toLowerCase().includes(query) ||
      String(employee.email ?? '').toLowerCase().includes(query)
    );
  });

  const openShareModal = async (user: User, e: React.MouseEvent) => {
    e.stopPropagation();

    try {
      setShareLoading(true);
      setEmployeeSearch('');
      const response = await apiClient.get(`/users/${user.id}/employee-visibility`);
      setSelectedEmployeeIds(Array.isArray(response.data?.employeeIds) ? response.data.employeeIds : []);
      setShareUser(user);
    } catch (error) {
      console.error('Visibility update failed:', error);
    } finally {
      setShareLoading(false);
    }
  };

  const toggleEmployeeSelection = (employeeId: number) => {
    setSelectedEmployeeIds((current) => (
      current.includes(employeeId)
        ? current.filter((id) => id !== employeeId)
        : [...current, employeeId]
    ));
  };

  const saveEmployeeVisibility = async () => {
    if (!shareUser) return;

    try {
      setShareLoading(true);
      await apiClient.put(`/users/${shareUser.id}/employee-visibility`, {
        employeeIds: selectedEmployeeIds,
      });
      setUsers((prev) => prev.map((entry) => (
        entry.id === shareUser.id
          ? {
              ...entry,
              visible_to_employees: selectedEmployeeIds.length > 0,
              visible_employee_count: selectedEmployeeIds.length,
            }
          : entry
      )));
      setShareUser(null);
      setSelectedEmployeeIds([]);
    } catch (error) {
      console.error('Visibility update failed:', error);
    } finally {
      setShareLoading(false);
    }
  };

  return (
    <div className="p-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between mb-6">
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-slate-700 tracking-tight">Employees Dashboard</h2>
        </div>

        <button
          onClick={() => setOpen(true)}
          className="bg-indigo-600 text-white px-4 py-2 rounded-xl cursor-pointer"
        >
          + Create User
        </button>
      </div>

      <CreateUserModal
        open={open}
        onClose={() => setOpen(false)}
        onSuccess={() => {
          console.log("User created");
        }}
      />

      {shareUser && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/35 backdrop-blur-[2px] px-4">
          <div className="w-full max-w-xl rounded-3xl border border-white/35 bg-white p-6 shadow-2xl backdrop-blur-[20px]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-xl font-bold tracking-tight text-slate-700">Choose Employees</h3>
                <p className="mt-1 text-sm leading-6 text-slate-500">
                  Select which employees can see <span className="font-semibold text-slate-700">{shareUser.username}</span> in the employee Users tab.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (!shareLoading) {
                  setShareUser(null);
                  setSelectedEmployeeIds([]);
                  setEmployeeSearch('');
                }
              }}
              className="rounded-xl p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
            >
              <X size={18} />
            </button>
          </div>

            <div className="mt-6">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input
                  type="text"
                  value={employeeSearch}
                  onChange={(event) => setEmployeeSearch(event.target.value)}
                  placeholder="Search employees by name or email..."
                  className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-10 pr-4 text-sm text-slate-700 outline-none transition focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>
            </div>

            <div className="mt-4 max-h-80 space-y-2 overflow-y-auto pr-1">
              {employees.length === 0 ? (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500">
                  No employee users are available yet.
                </div>
              ) : filteredEmployees.length === 0 ? (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500">
                  No employees match your search.
                </div>
              ) : (
                filteredEmployees.map((employee) => {
                  const isSelected = selectedEmployeeIds.includes(employee.id);
                  return (
                    <button
                      key={employee.id}
                      type="button"
                      onClick={() => toggleEmployeeSelection(employee.id)}
                      className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left transition ${
                        isSelected
                          ? 'border-indigo-300 bg-indigo-50'
                          : 'border-slate-200 bg-white hover:bg-slate-50'
                      }`}
                    >
                      <div>
                        <p className="font-semibold text-slate-700">{employee.username}</p>
                        <p className="text-sm text-slate-500">{employee.email}</p>
                      </div>
                      <div className={`flex h-6 w-6 items-center justify-center rounded-full border ${
                        isSelected
                          ? 'border-indigo-600 bg-indigo-600 text-white'
                          : 'border-slate-300 text-transparent'
                      }`}>
                        <Check size={14} />
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  if (!shareLoading) {
                    setShareUser(null);
                    setSelectedEmployeeIds([]);
                    setEmployeeSearch('');
                  }
                }}
                disabled={shareLoading}
                className="rounded-xl border border-slate-200 bg-white/70 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveEmployeeVisibility}
                disabled={shareLoading}
                className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {shareLoading ? 'Saving...' : 'Save Access'}
              </button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="animate-spin text-indigo-600" size={32} />
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {users.map((user) => (
            <div
              key={user.id}
              onClick={() => navigate(`/admin/users/${user.id}/leads`)}
              className="bg-white/40 backdrop-blur-[20px] border border-white/30 p-5 rounded-2xl flex items-center gap-6 cursor-pointer hover:bg-white/50 hover:border-white/40 shadow-sm transition-all group relative overflow-hidden"
            >
              <div className="absolute inset-0 bg-slate-100/40 opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="w-16 h-16 rounded-2xl bg-indigo-600/10 text-indigo-600 flex items-center justify-center border border-indigo-500/20 shadow-inner group-hover:scale-105 transition-transform relative z-10">
                <UserIcon size={32} />
              </div>

              <div className="flex-1 min-w-0 relative z-10">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-bold text-slate-700 text-lg truncate">{user.username}</h3>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-widest border ${user.role_type === 'admin'
                    ? 'bg-rose-500/10 text-rose-600 border-rose-500/20'
                    : 'bg-indigo-500/10 text-indigo-600 border-indigo-500/20'
                    }`}>
                    {user.role_name || 'Employee'}
                  </span>
                </div>

                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2 text-slate-500 text-xs">
                    <Mail size={14} className="opacity-60" />
                    <span className="truncate">{user.email}</span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-500 text-xs">
                    <UsersIcon size={14} className="opacity-60" />
                    <span>
                      Shared with {Number(user.visible_employee_count || 0)} employee{Number(user.visible_employee_count || 0) === 1 ? '' : 's'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-500 text-xs text-nowrap">
                    <Calendar size={14} className="opacity-60" />
                    <span>Joined {formatDateDisplay(user.created_at || user.createdAt)}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 relative z-10">
                <button
                  onClick={(e) => openShareModal(user, e)}
                  className="cursor-pointer p-2 text-slate-500 hover:text-emerald-600 hover:bg-emerald-500/10 rounded-xl transition-all"
                  title="Choose which employees can see this user"
                >
                  <UsersIcon size={20} />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedUser(user);
                  }}
                  className="cursor-pointer p-2 text-slate-500 hover:text-indigo-600 hover:bg-indigo-500/10 rounded-xl transition-all"
                >
                  🔑
                </button>
                <button
                  onClick={(e) => deleteUser(user.id, e)}
                  className="cursor-pointer p-2 text-slate-500 hover:text-rose-600 hover:bg-rose-500/10 rounded-xl transition-all"
                >
                  <Trash2 size={20} />
                </button>
                <div className="p-2 text-slate-500 group-hover:text-indigo-600 group-hover:translate-x-1 transition-all">
                  <ChevronRight size={24} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      <ChangePasswordModal
        open={!!selectedUser}
        userId={selectedUser?.id || 0}
        username={selectedUser?.username || ""}
        onClose={() => setSelectedUser(null)}
      />
    </div>
  );
}
