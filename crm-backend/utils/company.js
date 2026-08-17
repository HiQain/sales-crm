export const DEFAULT_COMPANY_ID = 1;

const COMPANY_IDS = new Set([1, 2, 3]);

export const getRequestedCompanyId = (req) => {
  const rawCompanyId = req.headers['x-company-id'];
  if (rawCompanyId == null || rawCompanyId === '') return DEFAULT_COMPANY_ID;

  const requestedCompanyId = Number(rawCompanyId);
  return COMPANY_IDS.has(requestedCompanyId) ? requestedCompanyId : null;
};

export const getCompanyId = (req) => {
  return req.companyId ?? getRequestedCompanyId(req) ?? DEFAULT_COMPANY_ID;
};
