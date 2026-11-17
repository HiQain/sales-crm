import express from 'express';
import db from '../config/db.js';
import { authenticate, authorizeCompanyAccess } from '../middleware/auth.js';
import { getCompanyId } from '../utils/company.js';

const router = express.Router();

router.use(authenticate, authorizeCompanyAccess);

// Rename a client. Journeys and billings linked to it show the new name everywhere.
router.put('/:id', async (req, res) => {
  const companyId = getCompanyId(req);
  const name = String(req.body.name ?? '').trim().slice(0, 255);

  if (!name) {
    return res.status(400).json({ error: { message: 'Client name is required' } });
  }

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const [result] = await connection.execute(
      'UPDATE clients SET name = ? WHERE id = ? AND company_id = ?',
      [name, req.params.id, companyId],
    );
    if (result.affectedRows === 0) {
      await connection.rollback();
      return res.status(404).json({ error: { message: 'Client not found' } });
    }

    await connection.execute(
      'UPDATE client_journeys SET client_name = ? WHERE client_id = ? AND company_id = ?',
      [name, req.params.id, companyId],
    );
    await connection.execute(
      'UPDATE billings SET client_name = ? WHERE client_id = ? AND company_id = ?',
      [name, req.params.id, companyId],
    );

    await connection.commit();
    res.json({ id: Number(req.params.id), name });
  } catch (err) {
    await connection.rollback();
    console.error(err);
    res.status(500).json({ error: { message: 'Failed to rename client' } });
  } finally {
    connection.release();
  }
});

export default router;
