import express from 'express';
import { authenticate, authorizeCompanyAccess } from '../middleware/auth.js';
import {
  createSalesRecord,
  createSalesRecordsBulk,
  deleteSalesRecord,
  moveSalesRecordClient,
  getSalesRecords,
  updateSalesRecord,
} from '../controllers/salesRecordController.js';

const router = express.Router();

router.use(authenticate, authorizeCompanyAccess);

router.get('/', getSalesRecords);
router.post('/', createSalesRecord);
router.post('/bulk', createSalesRecordsBulk);
router.put('/:id', updateSalesRecord);
router.post('/:id/move', moveSalesRecordClient);
router.delete('/:id', deleteSalesRecord);

export default router;
