import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { query } from '../db/index.js';
import { env } from '../config/env.js';
import { AppError } from '../middleware/errorHandler.js';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export class AuthController {
  static async login(req: Request, res: Response, next: NextFunction) {
    try {
      const { email, password } = loginSchema.parse(req.body);

      const userRes = await query(
        `SELECT u.*, f.name as factory_name
         FROM users u
         JOIN factories f ON u.factory_id = f.id
         WHERE u.email = $1`,
        [email]
      );

      if (userRes.rows.length === 0) {
        throw new AppError(401, 'Invalid email or password');
      }

      const user = userRes.rows[0];

      if (!user.is_active) {
        throw new AppError(403, 'Your account has been deactivated. Contact an administrator.');
      }

      const passwordMatch = await bcrypt.compare(password, user.password_hash);
      if (!passwordMatch) {
        throw new AppError(401, 'Invalid email or password');
      }

      const tokenPayload = {
        id: user.id,
        factoryId: user.factory_id,
        email: user.email,
        role: user.role,
        displayName: user.display_name,
      };

      const token = jwt.sign(tokenPayload, env.JWT_SECRET, {
        expiresIn: env.JWT_EXPIRES_IN as any,
      });

      res.json({
        token,
        user: {
          id: user.id,
          factoryId: user.factory_id,
          factoryName: user.factory_name,
          email: user.email,
          role: user.role,
          displayName: user.display_name,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  static async me(req: Request, res: Response, next: NextFunction) {
    try {
      const userRes = await query(
        `SELECT u.id, u.factory_id, u.display_name, u.email, u.role, u.is_active, f.name as factory_name
         FROM users u
         JOIN factories f ON u.factory_id = f.id
         WHERE u.id = $1`,
        [req.user!.id]
      );

      if (userRes.rows.length === 0) {
        throw new AppError(404, 'User not found');
      }

      const u = userRes.rows[0];
      res.json({
        id: u.id,
        factoryId: u.factory_id,
        factoryName: u.factory_name,
        email: u.email,
        role: u.role,
        displayName: u.display_name,
        isActive: u.is_active,
      });
    } catch (err) {
      next(err);
    }
  }

  static async refresh(req: Request, res: Response, next: NextFunction) {
    try {
      const tokenPayload = {
        id: req.user!.id,
        factoryId: req.user!.factoryId,
        email: req.user!.email,
        role: req.user!.role,
        displayName: req.user!.displayName,
      };

      const token = jwt.sign(tokenPayload, env.JWT_SECRET, {
        expiresIn: env.JWT_EXPIRES_IN as any,
      });

      res.json({ token });
    } catch (err) {
      next(err);
    }
  }

  static async logout(req: Request, res: Response) {
    // In a stateless JWT setup, client deletes the token. Endpoint confirms logout.
    res.json({ message: 'Successfully logged out' });
  }
}
