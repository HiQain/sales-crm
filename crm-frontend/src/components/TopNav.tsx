import { CreditCard, LogOut, Route, Target, Users } from 'lucide-react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useEffect, useMemo, useRef, useState } from 'react';

interface TopNavProps {
  role: 'admin' | 'employee';
}

export default function TopNav({ role }: TopNavProps) {
  const navigate = useNavigate();
  const userStr = localStorage.getItem('user');
  const user = userStr ? JSON.parse(userStr) : null;
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const basePath = role === 'admin' ? '/admin' : '/employee';

  const navItems = useMemo(
    () => [
      { name: 'Leads', path: `${basePath}/leads`, icon: Target },
      { name: role === 'admin' ? 'Client Journey' : 'My Clients', path: `${basePath}/client-journeys`, icon: Route },
      { name: role === 'admin' ? 'Billings' : 'My Billings', path: `${basePath}/billings`, icon: CreditCard },
      ...(role === 'admin' ? [{ name: 'Users', path: `${basePath}/users`, icon: Users }] : []),
    ],
    [basePath, role],
  );

  const displayName = user?.username || user?.name || 'User';
  const displayRole = role === 'admin' ? 'Admin' : 'Employee';
  const displayEmail = user?.email || `${String(displayName).toLowerCase()}@hiqain.com`;
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('jwt');
    localStorage.removeItem('user');
    navigate('/login');
  };

  return (
    <header className="sticky top-0 z-50 flex h-14 items-center gap-6 border-b border-white/10 bg-[#141a2b] px-4 text-white shadow-sm">
      <NavLink to={`${basePath}/leads`} className="mr-2 flex shrink-0 items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded bg-indigo-600">
          <Target className="h-4 w-4 text-white" />
        </div>
        <span className="text-base font-bold tracking-tight text-white">HiqainCRM</span>
      </NavLink>

      <nav className="scrollbar-none flex flex-1 items-center gap-1 overflow-x-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-white/8 text-white'
                    : 'text-white/70 hover:bg-white/8 hover:text-white'
                }`
              }
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              {item.name}
            </NavLink>
          );
        })}
      </nav>

      <div className="ml-auto flex shrink-0 items-center gap-3">
        <div ref={menuRef} className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((current) => !current)}
            className="flex items-center gap-2 rounded-md px-2 py-1 transition-opacity hover:opacity-80"
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white">
              {String(displayName).charAt(0).toUpperCase()}
            </div>
            <div className="hidden text-left sm:block">
              <p className="text-xs font-semibold leading-none text-white">{displayName}</p>
              <p className="mt-0.5 text-[11px] capitalize text-white/60">{displayRole}</p>
            </div>
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-full z-50 mt-3 w-[214px] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl">
              <div className="px-4 py-3">
                <p className="text-[18px] font-medium leading-none text-slate-800">{displayRole}</p>
                <p className="mt-1 text-sm text-slate-500">{displayEmail}</p>
              </div>
              <div className="border-t border-slate-200">
                <button
                  type="button"
                  onClick={handleLogout}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left text-[15px] text-rose-500 transition-colors hover:bg-rose-50"
                >
                  <LogOut className="h-4 w-4" />
                  <span>Sign Out</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

    </header>
  );
}
