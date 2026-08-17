export const COMPANY_STORAGE_KEY = 'crm:selected-company-id';

export const COMPANIES = [
  { id: 1, name: 'Hiqain', brandLabel: 'Hiqain' },
  { id: 2, name: 'USLAW', brandLabel: 'USLAW' },
  { id: 3, name: 'DS', brandLabel: 'DS' },
] as const;

export type CompanyId = (typeof COMPANIES)[number]['id'];

type CompanyAwareUser = {
  role?: string | { name?: string; type?: string };
  company_ids?: Array<number | string>;
};

const isCompanyId = (value: number): value is CompanyId => (
  COMPANIES.some((company) => company.id === value)
);

const getUserRole = (user: CompanyAwareUser | null | undefined) => {
  if (typeof user?.role === 'string') return user.role;
  return user?.role?.type || user?.role?.name?.toLowerCase();
};

export const getAccessibleCompanies = (
  user: CompanyAwareUser | null | undefined,
  roleOverride?: 'admin' | 'employee',
) => {
  const role = roleOverride ?? getUserRole(user);
  if (role === 'admin') return [...COMPANIES];

  const allowedIds = new Set(
    (user?.company_ids ?? [])
      .map(Number)
      .filter(isCompanyId),
  );

  const accessibleCompanies = COMPANIES.filter((company) => allowedIds.has(company.id));
  return accessibleCompanies.length > 0 ? accessibleCompanies : [COMPANIES[0]];
};

export const getSelectedCompanyId = (): CompanyId => {
  if (typeof window === 'undefined') return 1;

  const storedId = Number(window.localStorage.getItem(COMPANY_STORAGE_KEY));
  return COMPANIES.some((company) => company.id === storedId)
    ? storedId as CompanyId
    : 1;
};

export const setSelectedCompanyId = (companyId: CompanyId) => {
  window.localStorage.setItem(COMPANY_STORAGE_KEY, String(companyId));
};

export const syncSelectedCompanyForUser = (
  user: CompanyAwareUser | null | undefined,
  roleOverride?: 'admin' | 'employee',
) => {
  const accessibleCompanies = getAccessibleCompanies(user, roleOverride);
  const selectedCompanyId = getSelectedCompanyId();
  const nextCompanyId = accessibleCompanies.some((company) => company.id === selectedCompanyId)
    ? selectedCompanyId
    : accessibleCompanies[0].id;

  setSelectedCompanyId(nextCompanyId);
  return nextCompanyId;
};
