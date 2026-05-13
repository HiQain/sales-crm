import express from 'express';
import { authenticate } from '../middleware/auth.js';
import {
  createBilling,
  deleteBilling,
  getBillings,
  updateBilling,
} from '../controllers/billingController.js';

const router = express.Router();

router.get('/', authenticate, getBillings);
router.post('/', authenticate, createBilling);
router.put('/:id', authenticate, updateBilling);
router.delete('/:id', authenticate, deleteBilling);

export default router;
