import db from '../config/db.js';
import jwt from 'jsonwebtoken';
import { attachCompaniesToUser } from '../utils/userCompanies.js';

const ALLOWED_REGISTRATION_ROLES = new Set(['admin', 'employee']);

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
    const userWithCompanies = await attachCompaniesToUser(db, userWithoutPass);

    res.json({
      jwt: token,
      user: {
        ...userWithCompanies,
        role: { name: user.role_name, type: user.role_type }
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: { message: 'Server error' } });
  }
};

export const register = async (req, res) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: { message: 'Only administrators can create users' } });
  }

  const username = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const requestedRole = typeof req.body?.role === 'string'
    ? req.body.role.trim().toLowerCase()
    : 'employee';

  if (!username || !email || !password) {
    return res.status(400).json({ error: { message: 'Name, email, and password are required' } });
  }

  if (!ALLOWED_REGISTRATION_ROLES.has(requestedRole)) {
    return res.status(400).json({ error: { message: 'Role must be admin or employee' } });
  }

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const [roles] = await connection.execute(
      'SELECT id, name, type FROM roles WHERE type = ? LIMIT 1',
      [requestedRole],
    );

    if (roles.length === 0) {
      await connection.rollback();
      return res.status(400).json({ error: { message: 'Selected role is not available' } });
    }

    const selectedRole = roles[0];

    const [existing] = await connection.execute(
      'SELECT id FROM users WHERE email = ? OR username = ?',
      [email, username]
    );

    if (existing.length > 0) {
      await connection.rollback();
      return res.status(400).json({ error: { message: 'User already exists' } });
    }

    const [result] = await connection.execute(
      'INSERT INTO users (username, email, password, role_id) VALUES (?, ?, ?, ?)',
      [username, email, password, selectedRole.id],
    );

    const [companies] = await connection.execute(
      requestedRole === 'admin'
        ? 'SELECT id, code, name FROM companies ORDER BY id ASC'
        : 'SELECT id, code, name FROM companies WHERE id = ? LIMIT 1',
      requestedRole === 'admin' ? [] : [1],
    );

    if (requestedRole === 'employee') {
      await connection.execute(
        'INSERT INTO user_company_access (user_id, company_id) VALUES (?, ?)',
        [result.insertId, 1],
      );
    }

    await connection.commit();

    res.status(201).json({
      user: {
        id: result.insertId,
        username,
        email,
        role_id: Number(selectedRole.id),
        role_name: selectedRole.name,
        role_type: selectedRole.type,
        company_ids: companies.map((company) => Number(company.id)),
        companies: companies.map((company) => ({ ...company, id: Number(company.id) })),
        role: { name: selectedRole.name, type: selectedRole.type },
      }
    });
  } catch (err) {
    await connection.rollback();
    console.error(err);
    res.status(500).json({ error: { message: 'Registration failed' } });
  } finally {
    connection.release();
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
    const userWithCompanies = await attachCompaniesToUser(db, userData);

    res.json({
      ...userWithCompanies,
      role: { name: user.role_name, type: user.role_type }
    });
  } catch (err) {
    res.status(500).json({ error: { message: 'Server error' } });
  }
};
