import express from 'express';
import { 
  getLeads, 
  createLead, 
  updateLead, 
  deleteLead 
} from '../controllers/leadController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

router.get('/', authenticate, getLeads);
router.post('/', authenticate, createLead);
router.put('/:id', authenticate, updateLead);
router.delete('/:id', authenticate, deleteLead);

export default router;