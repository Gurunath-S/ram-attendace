import { Router, Request, Response, NextFunction } from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { AttendanceRepository } from '../repositories/attendanceRepository.js';
import { query } from '../db/index.js';

const router = Router();

router.get('/', authenticateToken, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const factoryRes = await query(`SELECT * FROM factories WHERE id = $1`, [req.user!.factoryId]);
    const factory = factoryRes.rows[0];

    const unitsRes = await query(
      `SELECT * FROM production_units WHERE factory_id = $1 ORDER BY sort_order`,
      [req.user!.factoryId]
    );

    const { departments } = await AttendanceRepository.getDepartmentMap(req.user!.factoryId);

    res.json({
      factory: {
        id: factory.id,
        name: factory.name,
        timezone: factory.timezone,
      },
      units: unitsRes.rows.map((u) => ({
        id: u.id,
        code: u.stable_code,
        name: u.display_name,
        sortOrder: u.sort_order,
      })),
      departments,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
