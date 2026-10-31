import { Router } from 'express';
import { SyncController } from '../controllers/syncController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

router.use(authenticateToken);

router.post('/push', SyncController.push);
router.get('/changes', SyncController.getChanges);
router.get('/status', SyncController.getStatus);

export default router;
