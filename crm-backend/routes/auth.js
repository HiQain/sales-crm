import express from 'express';
import { login, register, getMe } from '../controllers/authController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

router.post('/login', login);
router.post('/register', authenticate, register);
router.get('/me', authenticate, getMe);

export default router;
