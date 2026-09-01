import express from 'express';
import { 
  getLeads, 
  createLead, 
  updateLead, 
  deleteLead,
  reorderLeads,
  getLeadLayout,
  updateLeadLayout,
  importLeads,
} from '../controllers/leadController.js';
import { authenticate, authorizeCompanyAccess } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticate, authorizeCompanyAccess);

router.get('/', getLeads);
router.get('/layout', getLeadLayout);
router.post('/import', importLeads);
router.post('/', createLead);
router.put('/layout', updateLeadLayout);
router.put('/reorder', reorderLeads);
router.put('/:id', updateLead);
router.delete('/:id', deleteLead);

export default router;
