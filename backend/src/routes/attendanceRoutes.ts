import { Router } from 'express';
import { AttendanceController } from '../controllers/attendanceController.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

const router = Router();

router.use(authenticateToken);

router.get('/', AttendanceController.listOrGet);
router.get('/:id', AttendanceController.getById);
router.post('/', AttendanceController.saveDraft);
router.patch('/:id', AttendanceController.update);
router.post('/:id/submit', AttendanceController.submit);
router.post('/:id/approve', requireRole(['MANAGER', 'ADMIN']), AttendanceController.approve);
router.post('/:id/reopen', requireRole(['MANAGER', 'ADMIN']), AttendanceController.reopen);
router.get('/:id/audit', AttendanceController.audit);

export default router;
