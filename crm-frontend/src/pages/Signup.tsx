import { useState } from 'react';
import React from 'react';
import { useNavigate, Link } from 'react-router-dom';
import apiClient from '../api/client';
import { Loader2, Mail, Lock, User, LayoutDashboard } from 'lucide-react';
import { motion } from 'motion/react';

export default function Signup() {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      console.log("1");
      
      const response = await apiClient.post('/auth/register', {
        username,
        email,
        password,
      });

      console.log("2");

      const { jwt, user } = response.data;
      localStorage.setItem('jwt', jwt);

      console.log("3");
      
      // Default signup is usually 'authenticated' role
      const meResponse = await apiClient.get('/users/me');
      const userWithRole = meResponse.data;
      localStorage.setItem('user', JSON.stringify(userWithRole));

      // Redirect based on role
      const role = userWithRole.role?.type || userWithRole.role?.name?.toLowerCase();
      if (role === 'admin') {
        navigate('/admin/leads');
      } else {
        navigate('/employee/leads');
      }
    } catch (err: any) {
      if (!err.response) {
        setError(`Connection Error: Cannot reach API at ${apiClient.defaults.baseURL}. Ensure the backend is reachable.`);
      } else {
        setError(err.response?.data?.error?.message || 'Registration failed. Try a different username/email.');
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
          <h1 className="text-2xl font-bold text-slate-700">Create Account</h1>
          <p className="text-slate-500 text-sm mt-1">Join the Sales CRM network.</p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 text-red-600 text-sm rounded-xl">
            {error}
          </div>
        )}

        <form onSubmit={handleSignup} className="space-y-5">
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-widest ml-1">Username</label>
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-500 group-focus-within:text-indigo-600 transition-colors">
                <User size={18} />
              </div>
              <input
                type="text"
                required
                className="w-full bg-white/30 backdrop-blur-[12px] border border-white/20 rounded-xl py-3 pl-11 pr-4 text-slate-700 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white/50 transition-all shadow-sm"
                placeholder="your_username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-widest ml-1">Email Address</label>
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-500 group-focus-within:text-indigo-600 transition-colors">
                <Mail size={18} />
              </div>
              <input
                type="email"
                required
                className="w-full bg-white/30 backdrop-blur-[12px] border border-white/20 rounded-xl py-3 pl-11 pr-4 text-slate-700 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white/50 transition-all shadow-sm"
                placeholder="user@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
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

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl shadow-lg shadow-indigo-600/30 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed group mt-4"
          >
            {loading ? <Loader2 className="animate-spin" size={20} /> : 'Create Account'}
          </button>
        </form>

        <p className="text-center mt-8 text-sm text-slate-600">
          Already have an account?{' '}
          <Link to="/login" className="text-indigo-600 font-bold hover:underline">
            Sign In here
          </Link>
        </p>
      </motion.div>
    </div>
  );
}
