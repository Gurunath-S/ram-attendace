import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { query } from '../db/index.js';
import { AppError } from '../middleware/errorHandler.js';

const createUserSchema = z.object({
  displayName: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(['SUPERVISOR', 'MANAGER', 'ADMIN']),
});

const updateUserSchema = z.object({
  displayName: z.string().min(2).optional(),
  role: z.enum(['SUPERVISOR', 'MANAGER', 'ADMIN']).optional(),
  isActive: z.boolean().optional(),
  password: z.string().min(6).optional(),
});

export class UserController {
  static async list(req: Request, res: Response, next: NextFunction) {
    try {
      const usersRes = await query(
        `SELECT id, display_name, email, role, is_active, created_at
         FROM users
         WHERE factory_id = $1
         ORDER BY created_at ASC`,
        [req.user!.factoryId]
      );
      res.json(usersRes.rows);
    } catch (err) {
      next(err);
    }
  }

  static async create(req: Request, res: Response, next: NextFunction) {
    try {
      const data = createUserSchema.parse(req.body);
      const hash = await bcrypt.hash(data.password, 10);

      const ins = await query(
        `INSERT INTO users (factory_id, display_name, email, password_hash, role)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, display_name, email, role, is_active, created_at`,
        [req.user!.factoryId, data.displayName, data.email, hash, data.role]
      );

      res.status(201).json(ins.rows[0]);
    } catch (err) {
      next(err);
    }
  }

  static async update(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const data = updateUserSchema.parse(req.body);

      const updates: string[] = [];
      const values: any[] = [];
      let idx = 1;

      if (data.displayName !== undefined) {
        updates.push(`display_name = $${idx++}`);
        values.push(data.displayName);
      }
      if (data.role !== undefined) {
        updates.push(`role = $${idx++}`);
        values.push(data.role);
      }
      if (data.isActive !== undefined) {
        updates.push(`is_active = $${idx++}`);
        values.push(data.isActive);
      }
      if (data.password !== undefined) {
        const hash = await bcrypt.hash(data.password, 10);
        updates.push(`password_hash = $${idx++}`);
        values.push(hash);
      }

      if (updates.length === 0) {
        res.status(400).json({ error: 'No fields provided for update' });
        return;
      }

      values.push(id, req.user!.factoryId);
      const resUpdate = await query(
        `UPDATE users
         SET ${updates.join(', ')}
         WHERE id = $${idx++} AND factory_id = $${idx++}
         RETURNING id, display_name, email, role, is_active, created_at`,
        values
      );

      if (resUpdate.rows.length === 0) {
        throw new AppError(404, 'User not found');
      }

      res.json(resUpdate.rows[0]);
    } catch (err) {
      next(err);
    }
  }
}
