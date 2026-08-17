import express from 'express';
import { authenticate } from '../middleware/auth.js';
import db from '../config/db.js';

const router = express.Router();
const ALLOWED_SHARE_STATUS_FILTERS = new Set(['all', 'paid', 'unpaid']);
const ALLOWED_SHARE_DATE_FILTERS = new Set([
  'all',
  'last7Days',
  'last15Days',
  'last30Days',
  'last3Months',
  'last6Months',
  'thisMonth',
  'lastMonth',
  'thisYear',
  'lastYear',
]);

// Get all users (Admin only)
router.get('/', authenticate, async (req, res) => {
  try {
    const isAdmin = req.user?.role === 'admin';
    const [userResult, companyAccessResult, companyResult] = await Promise.all([
      db.execute(`
        SELECT u.id, u.username, u.email, u.created_at, u.updated_at, u.visible_to_employees,
               r.name as role_name, r.type as role_type,
               COUNT(uev.employee_id) AS visible_employee_count
        FROM users u
        LEFT JOIN roles r ON u.role_id = r.id
        LEFT JOIN user_employee_visibility uev ON uev.user_id = u.id
        ${isAdmin ? '' : 'INNER JOIN user_employee_visibility employee_visibility ON employee_visibility.user_id = u.id AND employee_visibility.employee_id = ?'}
        GROUP BY u.id, u.username, u.email, u.created_at, u.updated_at, u.visible_to_employees, r.name, r.type
        ORDER BY u.created_at DESC
      `, isAdmin ? [] : [req.user.id]),
      db.execute(`
        SELECT access.user_id, c.id, c.code, c.name
        FROM user_company_access access
        INNER JOIN companies c ON c.id = access.company_id
        ORDER BY c.id ASC
      `),
      db.execute('SELECT id, code, name FROM companies ORDER BY id ASC'),
    ]);

    const users = userResult[0];
    const companyAccessRows = companyAccessResult[0];
    const allCompanies = companyResult[0];
    const companiesByUserId = new Map();

    for (const company of companyAccessRows) {
      const userCompanies = companiesByUserId.get(Number(company.user_id)) ?? [];
      userCompanies.push({ id: Number(company.id), code: company.code, name: company.name });
      companiesByUserId.set(Number(company.user_id), userCompanies);
    }
    
    res.json(users.map((user) => {
      const companies = user.role_type === 'admin'
        ? allCompanies.map((company) => ({ ...company, id: Number(company.id) }))
        : companiesByUserId.get(Number(user.id)) ?? [];

      return {
        ...user,
        company_ids: companies.map((company) => company.id),
        companies,
      };
    }));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: { message: 'Failed to fetch users' } });
  }
});

router.put('/:id/companies', authenticate, async (req, res) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: { message: 'Forbidden' } });
  }

  const companyIds = Array.isArray(req.body?.companyIds)
    ? Array.from(new Set(
        req.body.companyIds
          .map((value) => Number(value))
          .filter((value) => Number.isInteger(value) && value > 0),
      ))
    : [];

  if (companyIds.length === 0) {
    return res.status(400).json({ error: { message: 'Select at least one company' } });
  }

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();
    const [users] = await connection.execute(`
      SELECT u.id, r.type AS role_type
      FROM users u
      INNER JOIN roles r ON r.id = u.role_id
      WHERE u.id = ?
      FOR UPDATE
    `, [req.params.id]);

    if (users.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: { message: 'User not found' } });
    }

    if (users[0].role_type === 'admin') {
      await connection.rollback();
      return res.status(400).json({ error: { message: 'Admins already have access to all companies' } });
    }

    const placeholders = companyIds.map(() => '?').join(', ');
    const [companies] = await connection.execute(
      `SELECT id, code, name FROM companies WHERE id IN (${placeholders}) ORDER BY id ASC`,
      companyIds,
    );

    if (companies.length !== companyIds.length) {
      await connection.rollback();
      return res.status(400).json({ error: { message: 'One or more companies are invalid' } });
    }

    await connection.execute('DELETE FROM user_company_access WHERE user_id = ?', [req.params.id]);
    const accessPlaceholders = companies.map(() => '(?, ?)').join(', ');
    const accessValues = companies.flatMap((company) => [req.params.id, company.id]);
    await connection.execute(
      `INSERT INTO user_company_access (user_id, company_id) VALUES ${accessPlaceholders}`,
      accessValues,
    );
    await connection.commit();

    res.json({
      message: 'Company access updated successfully',
      company_ids: companies.map((company) => Number(company.id)),
      companies: companies.map((company) => ({ ...company, id: Number(company.id) })),
    });
  } catch (err) {
    await connection.rollback();
    console.error(err);
    res.status(500).json({ error: { message: 'Failed to update company access' } });
  } finally {
    connection.release();
  }
});

router.get('/:id/employee-visibility', authenticate, async (req, res) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: { message: 'Forbidden' } });
  }

  try {
    const [rows] = await db.execute(
      'SELECT employee_id, lead_status_filter, date_filter FROM user_employee_visibility WHERE user_id = ? ORDER BY employee_id ASC',
      [req.params.id],
    );

    res.json({
      employeeIds: rows.map((row) => Number(row.employee_id)),
      leadStatusFilter: rows[0]?.lead_status_filter || 'all',
      dateFilter: rows[0]?.date_filter || 'all',
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: { message: 'Failed to fetch user visibility' } });
  }
});

router.put('/:id/employee-visibility', authenticate, async (req, res) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: { message: 'Forbidden' } });
  }

  const employeeIds = Array.isArray(req.body?.employeeIds)
    ? Array.from(new Set(req.body.employeeIds.map((value) => Number(value)).filter((value) => Number.isInteger(value) && value > 0)))
    : [];
  const leadStatusFilter = ALLOWED_SHARE_STATUS_FILTERS.has(String(req.body?.leadStatusFilter))
    ? String(req.body.leadStatusFilter)
    : 'all';
  const dateFilter = ALLOWED_SHARE_DATE_FILTERS.has(String(req.body?.dateFilter))
    ? String(req.body.dateFilter)
    : 'all';

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();
    await connection.execute(
      'DELETE FROM user_employee_visibility WHERE user_id = ?',
      [req.params.id],
    );

    if (employeeIds.length > 0) {
      const placeholdersWithFilters = employeeIds.map(() => '(?, ?, ?, ?)').join(', ');
      const values = employeeIds.flatMap((employeeId) => [req.params.id, employeeId, leadStatusFilter, dateFilter]);
      await connection.execute(
        `INSERT INTO user_employee_visibility (user_id, employee_id, lead_status_filter, date_filter) VALUES ${placeholdersWithFilters}`,
        values,
      );
    }

    await connection.execute(
      'UPDATE users SET visible_to_employees = ? WHERE id = ?',
      [employeeIds.length > 0 ? 1 : 0, req.params.id],
    );

    await connection.commit();

    res.json({ message: 'User visibility updated successfully' });
  } catch (err) {
    await connection.rollback();
    console.error(err);
    res.status(500).json({ error: { message: 'Failed to update user visibility' } });
  } finally {
    connection.release();
  }
});

// Delete user
router.delete('/:id', authenticate, async (req, res) => {
  try {
    await db.execute('DELETE FROM users WHERE id = ?', [req.params.id]);
    res.json({ message: 'User deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: { message: 'Failed to delete user' } });
  }
});

// change password
router.put('/:id/password', authenticate, async (req, res) => {
  const { password } = req.body;

  try {
    await db.execute(
      'UPDATE users SET password = ? WHERE id = ?',
      [password, req.params.id]
    );

    res.json({ message: 'Password updated successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to update password' });
  }
});

export default router;
