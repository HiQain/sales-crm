import db from '../config/db.js';
import jwt from 'jsonwebtoken';

export const login = async (req, res) => {
  const { identifier, password } = req.body;

  try {
    const [rows] = await db.execute(
      `SELECT u.*, r.name as role_name, r.type as role_type 
       FROM users u 
       LEFT JOIN roles r ON u.role_id = r.id 
       WHERE u.email = ? OR u.username = ?`,
      [identifier, identifier]
    );

    if (rows.length === 0) {
      return res.status(401).json({ error: { message: 'Invalid credentials' } });
    }

    const user = rows[0];

    // Plain text password comparison (as requested)
    if (user.password !== password) {
      return res.status(401).json({ error: { message: 'Invalid credentials' } });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role_type },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );

    const { password: _, ...userWithoutPass } = user;

    res.json({
      jwt: token,
      user: {
        ...userWithoutPass,
        role: { name: user.role_name, type: user.role_type }
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: { message: 'Server error' } });
  }
};

export const register = async (req, res) => {
  const { username, email, password } = req.body;

  try {
    const [existing] = await db.execute(
      'SELECT id FROM users WHERE email = ? OR username = ?',
      [email, username]
    );

    if (existing.length > 0) {
      return res.status(400).json({ error: { message: 'User already exists' } });
    }

    const [result] = await db.execute(
      'INSERT INTO users (username, email, password, role_id) VALUES (?, ?, ?, ?)',
      [username, email, password, 2] // 2 = Employee by default
    );

    const token = jwt.sign(
      { id: result.insertId, username, role: 'employee' },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      jwt: token,
      user: {
        id: result.insertId,
        username,
        email,
        role: { name: 'Employee', type: 'employee' }
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: { message: 'Registration failed' } });
  }
};

export const getMe = async (req, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT u.*, r.name as role_name, r.type as role_type 
       FROM users u 
       LEFT JOIN roles r ON u.role_id = r.id 
       WHERE u.id = ?`,
      [req.user.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: { message: 'User not found' } });
    }

    const user = rows[0];
    const { password: _, ...userData } = user;

    res.json({
      ...userData,
      role: { name: user.role_name, type: user.role_type }
    });
  } catch (err) {
    res.status(500).json({ error: { message: 'Server error' } });
  }
};