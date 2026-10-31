import { Router, Request, Response, NextFunction } from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { AttendanceRepository } from '../repositories/attendanceRepository.js';
import { query } from '../db/index.js';
import { AppError } from '../middleware/errorHandler.js';

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

// Create new department field in a unit
router.post('/departments', authenticateToken, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { unitCode, label } = req.body;
    if (!unitCode || typeof unitCode !== 'string') {
      throw new AppError(400, 'Unit code is required (e.g. UNIT_1 or UNIT_2)');
    }
    const cleanLabel = (label || '').trim();
    if (!cleanLabel) {
      throw new AppError(400, 'Department field label cannot be empty');
    }

    // Lookup unit
    const unitRes = await query(
      `SELECT * FROM production_units WHERE factory_id = $1 AND stable_code = $2`,
      [req.user!.factoryId, unitCode]
    );
    if (unitRes.rows.length === 0) {
      throw new AppError(404, `Unit with code ${unitCode} not found`);
    }
    const unit = unitRes.rows[0];

    // Check for duplicate field in the same unit (case-insensitive)
    const duplicateRes = await query(
      `SELECT id, visible_label FROM departments 
       WHERE unit_id = $1 AND LOWER(TRIM(visible_label)) = LOWER($2) AND is_active = true`,
      [unit.id, cleanLabel]
    );
    if (duplicateRes.rows.length > 0) {
      throw new AppError(
        409,
        `Duplicate Field: A department named "${cleanLabel}" already exists in ${unit.display_name || unitCode}. Duplicate fields are not allowed in the same unit.`
      );
    }

    // Generate unique stable code
    const prefix = unitCode === 'UNIT_1' ? 'U1_' : 'U2_';
    const slug = cleanLabel.toUpperCase().replace(/[^A-Z0-9]/g, '_').replace(/_+/g, '_').slice(0, 30);
    let candidateCode = `${prefix}${slug}`;
    
    // Check if code exists
    const codeCheck = await query(
      `SELECT id FROM departments WHERE stable_code = $1`,
      [candidateCode]
    );
    if (codeCheck.rows.length > 0) {
      candidateCode = `${candidateCode}_${Date.now().toString().slice(-4)}`;
    }

    // Get max sort order
    const maxOrderRes = await query(
      `SELECT COALESCE(MAX(sort_order), 0) as max_order FROM departments WHERE unit_id = $1`,
      [unit.id]
    );
    const nextOrder = (maxOrderRes.rows[0]?.max_order || 0) + 1;

    // Insert new department
    const insertRes = await query(
      `INSERT INTO departments (unit_id, stable_code, visible_label, sort_order, is_active)
       VALUES ($1, $2, $3, $4, true)
       RETURNING id, stable_code, visible_label, sort_order`,
      [unit.id, candidateCode, cleanLabel, nextOrder]
    );

    const created = insertRes.rows[0];
    res.status(201).json({
      success: true,
      department: {
        id: created.id,
        code: created.stable_code,
        label: created.visible_label,
        unitCode: unit.stable_code,
        sortOrder: created.sort_order,
      },
    });
  } catch (err) {
    next(err);
  }
});

// Update / edit department field
router.put('/departments/:id', authenticateToken, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { label } = req.body;
    const cleanLabel = (label || '').trim();
    if (!cleanLabel) {
      throw new AppError(400, 'Department field label cannot be empty');
    }

    // Check department exists
    const deptRes = await query(
      `SELECT d.*, u.display_name as unit_name, u.stable_code as unit_code
       FROM departments d
       JOIN production_units u ON d.unit_id = u.id
       WHERE d.id = $1 AND u.factory_id = $2 AND d.is_active = true`,
      [id, req.user!.factoryId]
    );
    if (deptRes.rows.length === 0) {
      throw new AppError(404, 'Department not found');
    }
    const dept = deptRes.rows[0];

    // Check for duplicate field in the same unit (excluding itself)
    const duplicateRes = await query(
      `SELECT id FROM departments 
       WHERE unit_id = $1 AND LOWER(TRIM(visible_label)) = LOWER($2) AND id != $3 AND is_active = true`,
      [dept.unit_id, cleanLabel, id]
    );
    if (duplicateRes.rows.length > 0) {
      throw new AppError(
        409,
        `Duplicate Field: A department named "${cleanLabel}" already exists in ${dept.unit_name || dept.unit_code}. Duplicate fields are not allowed in the same unit.`
      );
    }

    // Update department label
    const updateRes = await query(
      `UPDATE departments
       SET visible_label = $1
       WHERE id = $2
       RETURNING id, stable_code, visible_label, sort_order`,
      [cleanLabel, id]
    );

    const updated = updateRes.rows[0];
    res.json({
      success: true,
      department: {
        id: updated.id,
        code: updated.stable_code,
        label: updated.visible_label,
        unitCode: dept.unit_code,
        sortOrder: updated.sort_order,
      },
    });
  } catch (err) {
    next(err);
  }
});

// Delete / deactivate department field
router.delete('/departments/:id', authenticateToken, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const deptRes = await query(
      `SELECT d.* FROM departments d
       JOIN production_units u ON d.unit_id = u.id
       WHERE d.id = $1 AND u.factory_id = $2`,
      [id, req.user!.factoryId]
    );
    if (deptRes.rows.length === 0) {
      throw new AppError(404, 'Department not found');
    }

    await query(`UPDATE departments SET is_active = false WHERE id = $1`, [id]);
    res.json({ success: true, message: 'Department field removed successfully' });
  } catch (err) {
    next(err);
  }
});

export default router;
