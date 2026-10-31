import express from 'express';
import cors from 'cors';
import authRoutes from './routes/authRoutes.js';
import configRoutes from './routes/configRoutes.js';
import userRoutes from './routes/userRoutes.js';
import attendanceRoutes from './routes/attendanceRoutes.js';
import syncRoutes from './routes/syncRoutes.js';
import reportRoutes from './routes/reportRoutes.js';
import { errorHandler } from './middleware/errorHandler.js';

export const app = express();

app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    service: 'A.D. GARMENTS Attendance API',
    timestamp: new Date().toISOString(),
  });
});

// Versioned API routes under /api/v1
const apiRouter = express.Router();

apiRouter.use('/auth', authRoutes);
apiRouter.use('/config', configRoutes);
apiRouter.use('/users', userRoutes);
apiRouter.use('/attendance', attendanceRoutes);
apiRouter.use('/sync', syncRoutes);
apiRouter.use('/reports', reportRoutes);

app.use('/api/v1', apiRouter);
// Also support root routes for convenience
app.use('/auth', authRoutes);
app.use('/config', configRoutes);
app.use('/users', userRoutes);
app.use('/attendance', attendanceRoutes);
app.use('/sync', syncRoutes);
app.use('/reports', reportRoutes);

// Error Handling Middleware
app.use(errorHandler);
