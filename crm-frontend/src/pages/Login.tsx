import { useEffect, useState } from 'react';
import React from 'react';
import { useNavigate } from 'react-router-dom';
import apiClient from '../api/client';
import { Loader2, Mail, Lock, LayoutDashboard, Eye, EyeOff } from 'lucide-react';
import { motion } from 'motion/react';

const REMEMBERED_IDENTIFIER_KEY = 'crm:remembered-identifier';

export default function Login() {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    const savedIdentifier = localStorage.getItem(REMEMBERED_IDENTIFIER_KEY);

    if (!savedIdentifier) return;

    setIdentifier(savedIdentifier);
    setRememberMe(true);
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await apiClient.post('/auth/login', {
        identifier,
        password,
      });

      if (rememberMe) {
        localStorage.setItem(REMEMBERED_IDENTIFIER_KEY, identifier.trim());
      } else {
        localStorage.removeItem(REMEMBERED_IDENTIFIER_KEY);
      }

      const { jwt } = response.data;
      localStorage.setItem('jwt', jwt);

      const meResponse = await apiClient.get('/auth/me');
      const userWithRole = meResponse.data;
      localStorage.setItem('user', JSON.stringify(userWithRole));

      const role = userWithRole.role?.type || userWithRole.role?.name?.toLowerCase();

      if (role === 'admin') {
        navigate('/admin/leads');
      } else {
        navigate('/employee/leads');
      }
    } catch (err: any) {
      if (!err.response) {
        setError(`Connection Error: Cannot reach API at ${apiClient.defaults.baseURL}. Ensure the backend is reachable and CORS is allowed.`);
      } else {
        setError(err.response?.data?.error?.message || 'Login failed. Please check your credentials.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 relative">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-white/40 backdrop-blur-[20px] border border-white/30 rounded-xl px-8 py-6 shadow-lg relative z-10"
      >
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-indigo-600/10 text-indigo-600 mb-4 border border-indigo-500/20 shadow-sm">
            <LayoutDashboard size={32} />
          </div>
          <h1 className="text-2xl font-bold text-slate-700">Welcome Back</h1>
          <p className="text-slate-500 text-sm mt-1">Please enter your details to sign in.</p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 text-red-600 text-sm rounded-xl">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-6">
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-widest ml-1">Email</label>
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-500 group-focus-within:text-indigo-600 transition-colors">
                <Mail size={18} />
              </div>
              <input
                type="text"
                required
                className="w-full bg-white/30 backdrop-blur-[12px] border border-white/20 rounded-md py-3 pl-11 pr-4 text-slate-700 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white/50 transition-all shadow-sm"
                placeholder="user@example.com"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-widest ml-1">Password</label>
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-500 group-focus-within:text-indigo-600 transition-colors">
                <Lock size={18} />
              </div>
              <input
                type={showPassword ? 'text' : 'password'}
                required
                className="w-full bg-white/30 backdrop-blur-[12px] border border-white/20 rounded-md py-3 pl-11 pr-11 text-slate-700 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white/50 transition-all shadow-sm"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                onClick={() => setShowPassword((current) => !current)}
                className="absolute inset-y-0 right-0 pr-4 flex items-center text-slate-500 hover:text-indigo-600 transition-colors"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <label className="inline-flex items-center gap-2 text-sm text-slate-600 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="h-4 w-4 rounded border border-slate-300 text-indigo-600 focus:ring-2 focus:ring-indigo-500"
              />
              <span>Remember me</span>
            </label>
          </div>

          <div className="flex flex-col gap-3">
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-md shadow-lg shadow-indigo-600/30 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed group active:scale-[0.98]"
            >
              {loading ? <Loader2 className="animate-spin" size={20} /> : 'Sign In'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
