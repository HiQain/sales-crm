import express from 'express';
import { authenticate } from '../middleware/auth.js';
import db from '../config/db.js';

const router = express.Router();

// Get all users (Admin only)
router.get('/', authenticate, async (req, res) => {
  try {
    const [users] = await db.execute(`
      SELECT u.id, u.username, u.email, u.created_at, 
             r.name as role_name, r.type as role_type
      FROM users u
      LEFT JOIN roles r ON u.role_id = r.id
      ORDER BY u.created_at DESC
    `);
    
    res.json(users);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: { message: 'Failed to fetch users' } });
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