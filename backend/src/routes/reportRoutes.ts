import { Router } from 'express';
import { ReportController } from '../controllers/reportController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

router.use(authenticateToken);

router.get('/weekly', ReportController.getWeekly);
router.get('/monthly', ReportController.getMonthly);
router.get('/:id/pdf', ReportController.downloadPdf);
router.post('/:id/pdf', ReportController.archivePdf);
router.get('/:id/pdf-history', ReportController.getPdfHistory);
router.get('/:id/excel', ReportController.downloadExcel);

export default router;
