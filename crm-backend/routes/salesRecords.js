import express from 'express';
import { authenticate, authorizeCompanyAccess } from '../middleware/auth.js';
import {
  createSalesRecord,
  deleteSalesRecord,
  getSalesRecords,
  updateSalesRecord,
} from '../controllers/salesRecordController.js';

const router = express.Router();

router.use(authenticate, authorizeCompanyAccess);

router.get('/', getSalesRecords);
router.post('/', createSalesRecord);
router.put('/:id', updateSalesRecord);
router.delete('/:id', deleteSalesRecord);

export default router;
