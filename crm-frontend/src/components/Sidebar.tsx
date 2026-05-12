import { 
  Users, 
  Table, 
  LayoutDashboard, 
  LogOut, 
  User as UserIcon,
  Briefcase,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useState } from 'react';

interface SidebarProps {
  role: 'admin' | 'employee';
}

export default function Sidebar({ role }: SidebarProps) {
  const navigate = useNavigate();
  const userStr = localStorage.getItem('user');
  const user = userStr ? JSON.parse(userStr) : null;

  const [isCollapsed, setIsCollapsed] = useState(false);

  const handleLogout = () => {
    localStorage.removeItem('jwt');
    localStorage.removeItem('user');
    navigate('/login');
  };

  const adminLinks = [
    { to: '/admin/leads', icon: Table, label: 'Leads' },
    { to: '/admin/users', icon: Users, label: 'Users' },
  ];

  const employeeLinks = [
    { to: '/employee/leads', icon: Briefcase, label: 'My Leads' },
  ];

  const links = role === 'admin' ? adminLinks : employeeLinks;

  return (
    <aside
      className={`bg-white/40 backdrop-blur-[20px] border-r border-white/30 flex flex-col z-30 transition-all duration-300 ${
        isCollapsed ? 'w-20' : 'w-64'
      }`}
    >
      {/* Header with Toggle Button */}
      <div className="p-6 flex items-center justify-between">
        <div className={`flex items-center gap-2 overflow-hidden ${isCollapsed ? 'opacity-0 w-0' : 'opacity-100'}`}>
          <LayoutDashboard className="text-indigo-600 flex-shrink-0" />
          <span className="font-bold bg-gradient-to-r from-indigo-700 to-blue-400 bg-clip-text text-transparent whitespace-nowrap">
            <span className="hiqain-anim text-indigo-600 mr-1">HIQAIN</span> CRM
          </span>
        </div>

        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="p-2 rounded-xl hover:bg-white/50 text-slate-500 hover:text-slate-700 transition-colors"
          aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {isCollapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 space-y-2 mt-2">
        {links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            className={({ isActive }) => 
              `flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group ${
                isActive 
                  ? 'bg-indigo-600/10 text-indigo-700 border border-indigo-500/20 shadow-sm' 
                  : 'text-slate-500 hover:text-slate-700 hover:bg-white/40'
              } ${isCollapsed ? 'justify-center' : ''}`
            }
            title={isCollapsed ? link.label : undefined} // Tooltip when collapsed
          >
            <link.icon size={20} className="flex-shrink-0" />
            <span className={`font-medium transition-all duration-200 ${isCollapsed ? 'opacity-0 w-0 overflow-hidden' : 'opacity-100'}`}>
              {link.label}
            </span>
          </NavLink>
        ))}
      </nav>

      {/* Footer / User Info */}
      <div className="mt-auto p-4 border-t border-white/20 bg-white/20">
        <div className={`flex items-center gap-3 px-2 mb-4 transition-all ${isCollapsed ? 'justify-center' : ''}`}>
          <div className="w-10 h-10 rounded-full bg-indigo-600/10 flex items-center justify-center text-indigo-600 border border-indigo-500/20 flex-shrink-0">
            <UserIcon size={20} />
          </div>
          
          {!isCollapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-700 truncate">
                {user?.username || 'User'}
              </p>
              <p className="text-xs text-slate-500 font-medium uppercase tracking-tighter">
                {role}
              </p>
            </div>
          )}
        </div>

        <button 
          onClick={handleLogout}
          className={`cursor-pointer w-full flex items-center justify-center gap-2 px-4 py-3 text-slate-500 hover:text-rose-600 hover:bg-rose-500/10 rounded-xl transition-all font-bold text-sm ${
            isCollapsed ? 'px-3' : ''
          }`}
          title={isCollapsed ? "Logout" : undefined}
        >
          <LogOut size={18} />
          {!isCollapsed && <span>Logout</span>}
        </button>
      </div>
    </aside>
  );
}