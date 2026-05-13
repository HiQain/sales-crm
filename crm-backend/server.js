import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import leadRoutes from './routes/leads.js';
import salesRecordRoutes from './routes/salesRecords.js';
import billingRoutes from './routes/billings.js';
import { ensureTables } from './config/initTables.js';

dotenv.config();

const app = express();

app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:3000'],
  credentials: true,
}));
app.use(express.json());

app.use('/auth', authRoutes);
app.use('/users', userRoutes);
app.use('/leads', leadRoutes);
app.use('/client-journeys', salesRecordRoutes);
app.use('/billings', billingRoutes);

const PORT = process.env.PORT || 5000;

await ensureTables();

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
