import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { SyncService } from '../services/syncService.js';
import { SyncOperation } from '@ad-garments/domain';

const syncPushSchema = z.object({
  operations: z.array(
    z.object({
      operationId: z.string().uuid(),
      reportId: z.string().uuid(),
      userId: z.string().uuid(),
      operationType: z.enum(['CREATE', 'UPDATE', 'SUBMIT', 'APPROVE', 'REOPEN']),
      baseRevision: z.number().int().min(0),
      payload: z.any(),
      createdAt: z.string(),
      retryCount: z.number().int().min(0).default(0),
      status: z.enum(['PENDING', 'SYNCED', 'FAILED', 'CONFLICT']).default('PENDING'),
    })
  ),
});

export class SyncController {
  static async push(req: Request, res: Response, next: NextFunction) {
    try {
      const { operations } = syncPushSchema.parse(req.body);
      const results = [];

      for (const op of operations) {
        const resOp = await SyncService.processOperation(req.user!, op as unknown as SyncOperation);
        results.push(resOp);
      }

      res.json({ results });
    } catch (err) {
      next(err);
    }
  }

  static async getChanges(req: Request, res: Response, next: NextFunction) {
    try {
      const cursor = req.query.cursor as string | undefined;
      const changes = await SyncService.getChanges(req.user!.factoryId, cursor);
      res.json(changes);
    } catch (err) {
      next(err);
    }
  }

  static async getStatus(req: Request, res: Response) {
    res.json({
      status: 'ONLINE',
      serverTime: new Date().toISOString(),
      factoryId: req.user!.factoryId,
    });
  }
}
