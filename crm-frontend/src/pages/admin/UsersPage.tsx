import { useState, useEffect } from 'react';
import React from 'react';
import apiClient from '../../api/client';
import { Loader2, Mail, Calendar, User as UserIcon, Trash2 } from 'lucide-react';
import { User } from '../../types';
import CreateUserModal from "../../components/CreateUser";
import ChangePasswordModal from "../../components/ChangePassword";
import { formatDateDisplay } from '../../utils/date';

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);

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

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="animate-spin text-indigo-600" size={32} />
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {users.map((user) => (
            <div
              key={user.id}
              className="bg-white/40 backdrop-blur-[20px] border border-white/30 p-5 rounded-2xl flex items-center gap-6 hover:bg-white/50 hover:border-white/40 shadow-sm transition-all group relative overflow-hidden"
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

              <div className="flex items-center gap-2 relative z-10">
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
