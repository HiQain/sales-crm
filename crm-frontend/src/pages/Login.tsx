import { useState } from 'react';
import React from 'react';
import { useNavigate, Link } from 'react-router-dom';
import apiClient from '../api/client';
import { Loader2, Mail, Lock, LayoutDashboard } from 'lucide-react';
import { motion } from 'motion/react';

export default function Login() {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await apiClient.post('/auth/login', {
        identifier,
        password,
      });

      const { jwt, user } = response.data;
      localStorage.setItem('jwt', jwt);
      
      // Fetch role details
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
        className="w-full max-w-md bg-white/40 backdrop-blur-[20px] border border-white/30 rounded-3xl p-8 shadow-2xl relative z-10"
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
            <label className="text-xs font-bold text-slate-500 uppercase tracking-widest ml-1">Email or Username</label>
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-500 group-focus-within:text-indigo-600 transition-colors">
                <Mail size={18} />
              </div>
              <input
                type="text"
                required
                className="w-full bg-white/30 backdrop-blur-[12px] border border-white/20 rounded-xl py-3 pl-11 pr-4 text-slate-700 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white/50 transition-all shadow-sm"
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
                type="password"
                required
                className="w-full bg-white/30 backdrop-blur-[12px] border border-white/20 rounded-xl py-3 pl-11 pr-4 text-slate-700 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white/50 transition-all shadow-sm"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl shadow-lg shadow-indigo-600/30 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed group active:scale-[0.98]"
            >
              {loading ? <Loader2 className="animate-spin" size={20} /> : 'Sign In'}
            </button>

            <button
              type="button"
              onClick={() => {
                localStorage.setItem('jwt', 'demo-bypass-token');
                localStorage.setItem('user', JSON.stringify({
                  id: 999,
                  username: 'DemoAdmin',
                  email: 'demo@example.com',
                  role: { type: 'admin', name: 'Admin' }
                }));
                navigate('/admin/leads');
              }}
              className="w-full bg-white/10 hover:bg-white/20 text-slate-700 font-bold py-3 rounded-xl border border-white/30 transition-all flex items-center justify-center gap-2 group active:scale-[0.98]"
            >
              🚀 Explore as Admin (Demo Mode)
            </button>
            <button
              type="button"
              onClick={() => {
                localStorage.setItem('jwt', 'demo-bypass-token');
                localStorage.setItem('user', JSON.stringify({
                  id: 888,
                  username: 'DemoEmployee',
                  email: 'employee@example.com',
                  role: { type: 'employee', name: 'Employee' }
                }));
                navigate('/employee/leads');
              }}
              className="w-full bg-slate-700/10 hover:bg-slate-700/20 text-slate-600 font-bold py-2 rounded-xl border border-slate-700/20 transition-all text-xs"
            >
              Explore as Employee
            </button>
          </div>
        </form>

        <p className="text-center mt-8 text-sm text-slate-600">
          Don't have an account?{' '}
          <Link to="/signup" className="text-indigo-600 font-bold hover:underline">
            Register for free
          </Link>
        </p>
      </motion.div>
    </div>
  );
}
