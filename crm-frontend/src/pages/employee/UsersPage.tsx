import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, ChevronRight, Loader2, Mail, User as UserIcon } from 'lucide-react';
import apiClient from '../../api/client';
import type { User } from '../../types';
import { formatDateDisplay } from '../../utils/date';

export default function EmployeeUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const response = await apiClient.get('/users');
        setUsers(response.data);
      } catch (error) {
        console.error('Failed to fetch employee-visible users:', error);
      } finally {
        setLoading(false);
      }
    };

    void fetchUsers();
  }, []);

  return (
    <div className="p-6 animate-in fade-in duration-500">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-slate-700 tracking-tight">Users</h2>
        <p className="mt-1 text-sm text-slate-500">Only users the admin has allowed are shown here.</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="animate-spin text-indigo-600" size={32} />
        </div>
      ) : users.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-500 shadow-sm">
          No users are available for you yet.
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {users.map((user) => (
            <div
              key={user.id}
              onClick={() => navigate(`/employee/users/${user.id}/leads`)}
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
                  <div className="flex items-center gap-2 text-slate-500 text-xs text-nowrap">
                    <Calendar size={14} className="opacity-60" />
                    <span>Joined {formatDateDisplay(user.created_at || user.createdAt)}</span>
                  </div>
                </div>
              </div>

              <div className="p-2 text-slate-500 group-hover:text-indigo-600 group-hover:translate-x-1 transition-all relative z-10">
                <ChevronRight size={24} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
