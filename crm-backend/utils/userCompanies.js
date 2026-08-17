export const getUserCompanies = async (executor, userId, roleType) => {
  if (roleType === 'admin') {
    const [companies] = await executor.execute(
      'SELECT id, code, name FROM companies ORDER BY id ASC',
    );
    return companies;
  }

  const [companies] = await executor.execute(`
    SELECT c.id, c.code, c.name
    FROM user_company_access access
    INNER JOIN companies c ON c.id = access.company_id
    WHERE access.user_id = ?
    ORDER BY c.id ASC
  `, [userId]);

  return companies;
};

export const attachCompaniesToUser = async (executor, user) => {
  const companies = await getUserCompanies(executor, user.id, user.role_type);

  return {
    ...user,
    company_ids: companies.map((company) => Number(company.id)),
    companies,
  };
};
