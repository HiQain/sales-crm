import express from 'express';
import { authenticate, authorizeCompanyAccess } from '../middleware/auth.js';
import {
  createBilling,
  deleteBilling,
  getBillings,
  updateBilling,
} from '../controllers/billingController.js';

const router = express.Router();

router.use(authenticate, authorizeCompanyAccess);

router.get('/', getBillings);
router.post('/', createBilling);
router.put('/:id', updateBilling);
router.delete('/:id', deleteBilling);

export default router;
