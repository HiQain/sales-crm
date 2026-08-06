import express from 'express';
import { 
  getLeads, 
  createLead, 
  updateLead, 
  deleteLead,
  reorderLeads,
  getLeadLayout,
  updateLeadLayout,
} from '../controllers/leadController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

router.get('/', authenticate, getLeads);
router.get('/layout', authenticate, getLeadLayout);
router.post('/', authenticate, createLead);
router.put('/layout', authenticate, updateLeadLayout);
router.put('/reorder', authenticate, reorderLeads);
router.put('/:id', authenticate, updateLead);
router.delete('/:id', authenticate, deleteLead);

export default router;
