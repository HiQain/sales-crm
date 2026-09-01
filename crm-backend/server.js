import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import leadRoutes from './routes/leads.js';
import salesRecordRoutes from './routes/salesRecords.js';
import billingRoutes from './routes/billings.js';
import { ensureTables } from './config/initTables.js';

dotenv.config();

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendDistPath = path.resolve(__dirname, '../crm-frontend/dist');
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const fallbackOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost:3001',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3001',
  'https://crm.hiqain.com',
];
const corsOrigins = allowedOrigins.length > 0 ? allowedOrigins : fallbackOrigins;
const localDevOriginPattern = /^https?:\/\/(localhost|127\.0\.0\.1):\d+$/;

app.use(cors({
  origin(origin, callback) {
    if (!origin || corsOrigins.includes(origin) || localDevOriginPattern.test(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error(`CORS blocked for origin: ${origin}`));
  },
  credentials: true,
}));
app.use(express.json({ limit: '5mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/leads', leadRoutes);
app.use('/api/client-journeys', salesRecordRoutes);
app.use('/api/billings', billingRoutes);

app.use(express.static(frontendDistPath));

app.get('/{*splat}', (_req, res) => {
  res.sendFile(path.join(frontendDistPath, 'index.html'));
});

const PORT = process.env.PORT || 5000;

await ensureTables();

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
