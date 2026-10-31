import { Router } from 'express';
import { UserController } from '../controllers/userController.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

const router = Router();

// Only ADMIN can access user management
router.use(authenticateToken);
router.use(requireRole(['ADMIN']));

router.get('/', UserController.list);
router.post('/', UserController.create);
router.patch('/:id', UserController.update);

export default router;
