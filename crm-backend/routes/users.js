import express from 'express';
import { authenticate } from '../middleware/auth.js';
import db from '../config/db.js';

const router = express.Router();
const ALLOWED_SHARE_STATUS_FILTERS = new Set(['all', 'paid', 'unpaid']);
const ALLOWED_SHARE_DATE_FILTERS = new Set([
  'all',
  'last7Days',
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
    const [users] = await db.execute(`
      SELECT u.id, u.username, u.email, u.created_at, u.updated_at, u.visible_to_employees,
             r.name as role_name, r.type as role_type,
             COUNT(uev.employee_id) AS visible_employee_count
      FROM users u
      LEFT JOIN roles r ON u.role_id = r.id
      LEFT JOIN user_employee_visibility uev ON uev.user_id = u.id
      ${isAdmin ? '' : 'INNER JOIN user_employee_visibility employee_visibility ON employee_visibility.user_id = u.id AND employee_visibility.employee_id = ?'}
      GROUP BY u.id, u.username, u.email, u.created_at, u.updated_at, u.visible_to_employees, r.name, r.type
      ORDER BY u.created_at DESC
    `, isAdmin ? [] : [req.user.id]);
    
    res.json(users);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: { message: 'Failed to fetch users' } });
  }
});

router.get('/:id/employee-visibility', authenticate, async (req, res) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: { message: 'Forbidden' } });
  }

  try {
    const [rows] = await db.execute(
      'SELECT employee_id FROM user_employee_visibility WHERE user_id = ? ORDER BY employee_id ASC',
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
      const placeholders = employeeIds.map(() => '(?, ?)').join(', ');
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
