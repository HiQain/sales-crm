import jwt from 'jsonwebtoken';
import db from '../config/db.js';
import { getRequestedCompanyId } from '../utils/company.js';

export const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: { message: 'No token provided' } });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: { message: 'Invalid or expired token' } });
  }
};

export const authorizeCompanyAccess = async (req, res, next) => {
  const companyId = getRequestedCompanyId(req);

  if (companyId == null) {
    return res.status(400).json({ error: { message: 'Invalid company' } });
  }

  if (req.user?.role === 'admin') {
    req.companyId = companyId;
    return next();
  }

  try {
    const [rows] = await db.execute(
      'SELECT 1 FROM user_company_access WHERE user_id = ? AND company_id = ? LIMIT 1',
      [req.user?.id, companyId],
    );

    if (rows.length === 0) {
      return res.status(403).json({ error: { message: 'You do not have access to this company' } });
    }

    req.companyId = companyId;
    return next();
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: { message: 'Failed to verify company access' } });
  }
};
