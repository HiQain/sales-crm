import express from 'express';
import { authenticate } from '../middleware/auth.js';
import {
  createSalesRecord,
  deleteSalesRecord,
  getSalesRecords,
  updateSalesRecord,
} from '../controllers/salesRecordController.js';

const router = express.Router();

router.get('/', authenticate, getSalesRecords);
router.post('/', authenticate, createSalesRecord);
router.put('/:id', authenticate, updateSalesRecord);
router.delete('/:id', authenticate, deleteSalesRecord);

export default router;
