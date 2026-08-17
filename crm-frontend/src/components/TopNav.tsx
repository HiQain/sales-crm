import { Check, ChevronDown, CreditCard, LogOut, Route, Target, Users } from 'lucide-react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useEffect, useMemo, useRef, useState } from 'react';
import apiClient from '../api/client';
import {
  getAccessibleCompanies,
  getSelectedCompanyId,
  setSelectedCompanyId,
  syncSelectedCompanyForUser,
  type CompanyId,
} from '../utils/company';

interface TopNavProps {
  role: 'admin' | 'employee';
}

export default function TopNav({ role }: TopNavProps) {
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(() => {
    const userStr = localStorage.getItem('user');
    return userStr ? JSON.parse(userStr) : null;
  });
  const [menuOpen, setMenuOpen] = useState(false);
  const [companyMenuOpen, setCompanyMenuOpen] = useState(false);
  const [selectedCompanyId, setSelectedCompany] = useState<CompanyId>(() => getSelectedCompanyId());
  const menuRef = useRef<HTMLDivElement | null>(null);
  const companyMenuRef = useRef<HTMLDivElement | null>(null);

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
  const accessibleCompanies = useMemo(
    () => getAccessibleCompanies(user, role),
    [role, user],
  );
  const selectedCompany = accessibleCompanies.find((company) => company.id === selectedCompanyId)
    ?? accessibleCompanies[0];
  const canSwitchCompanies = role === 'admin' || accessibleCompanies.length > 1;

  useEffect(() => {
    let cancelled = false;

    apiClient.get('/auth/me').then((response) => {
      if (cancelled) return;

      const refreshedUser = response.data;
      localStorage.setItem('user', JSON.stringify(refreshedUser));
      const nextCompanyId = syncSelectedCompanyForUser(refreshedUser, role);
      setUser(refreshedUser);

      if (nextCompanyId !== selectedCompanyId) {
        setSelectedCompany(nextCompanyId);
        window.location.reload();
      }
    }).catch((error) => {
      console.error('Failed to refresh company access:', error);
    });

    return () => {
      cancelled = true;
    };
  }, [role, selectedCompanyId]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
      if (!companyMenuRef.current?.contains(event.target as Node)) {
        setCompanyMenuOpen(false);
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

  const handleCompanyChange = (companyId: CompanyId) => {
    if (!accessibleCompanies.some((company) => company.id === companyId)) return;

    setCompanyMenuOpen(false);
    if (companyId === selectedCompanyId) return;

    setSelectedCompanyId(companyId);
    setSelectedCompany(companyId);
    window.location.reload();
  };

  return (
    <header className="sticky top-0 z-50 flex h-14 items-center gap-6 border-b border-white/10 bg-[#141a2b] px-4 text-white shadow-sm">
      <div ref={companyMenuRef} className="relative mr-2 shrink-0">
        <button
          type="button"
          onClick={canSwitchCompanies ? () => setCompanyMenuOpen((current) => !current) : undefined}
          aria-haspopup={canSwitchCompanies ? 'listbox' : undefined}
          aria-expanded={companyMenuOpen}
          className={`flex items-center gap-2 rounded-md px-1.5 py-1 transition-colors ${
            canSwitchCompanies ? 'hover:bg-white/8 focus:outline-none focus:ring-2 focus:ring-indigo-400' : 'cursor-default'
          }`}
        >
          <div className="flex h-7 w-7 items-center justify-center rounded bg-indigo-600">
            <Target className="h-4 w-4 text-white" />
          </div>
          <span className="text-base font-bold tracking-tight text-white">{selectedCompany.brandLabel}</span>
          {canSwitchCompanies ? (
            <ChevronDown className={`h-4 w-4 text-white/60 transition-transform ${companyMenuOpen ? 'rotate-180' : ''}`} />
          ) : null}
        </button>

        {companyMenuOpen && canSwitchCompanies ? (
          <div
            role="listbox"
            aria-label="Select company"
            className="absolute left-0 top-full z-50 mt-2 w-56 rounded-xl border border-slate-200 bg-white p-2 text-slate-700 shadow-xl"
          >
            <div className="px-3 pb-2 pt-1 text-[11px] font-bold uppercase tracking-widest text-slate-500">
              Select Company
            </div>
            {accessibleCompanies.map((company) => {
              const selected = company.id === selectedCompanyId;

              return (
                <button
                  key={company.id}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => handleCompanyChange(company.id)}
                  className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm font-semibold transition-colors ${
                    selected ? 'bg-indigo-50 text-indigo-700' : 'hover:bg-slate-100'
                  }`}
                >
                  <span>{company.name}</span>
                  {selected ? <Check className="h-4 w-4 text-indigo-600" strokeWidth={2.5} /> : null}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

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
