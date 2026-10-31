import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AttendanceService } from '../services/attendanceService.js';
import { AppError } from '../middleware/errorHandler.js';

const submitSchema = z.object({
  revision: z.number().int().min(1),
});

export class AttendanceController {
  static async listOrGet(req: Request, res: Response, next: NextFunction) {
    try {
      const { date, from, to } = req.query;

      if (date && typeof date === 'string') {
        const report = await AttendanceService.getByDate(date, req.user!.factoryId);
        if (!report) {
          res.status(404).json({ error: `No report found for date ${date}` });
          return;
        }
        res.json(report);
        return;
      }

      if (from && to && typeof from === 'string' && typeof to === 'string') {
        const reports = await AttendanceService.getByDateRange(from, to, req.user!.factoryId);
        res.json(reports);
        return;
      }

      // Default: fetch reports for past 30 days
      const toDate = new Date().toISOString().split('T')[0];
      const past = new Date();
      past.setDate(past.getDate() - 30);
      const fromDate = past.toISOString().split('T')[0];

      const reports = await AttendanceService.getByDateRange(fromDate, toDate, req.user!.factoryId);
      res.json(reports);
    } catch (err) {
      next(err);
    }
  }

  static async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const id = req.params.id as string;
      const report = await AttendanceService.getById(id, req.user!.factoryId);
      res.json(report);
    } catch (err) {
      next(err);
    }
  }

  static async saveDraft(req: Request, res: Response, next: NextFunction) {
    try {
      const saved = await AttendanceService.saveDraft(req.user!, req.body);
      res.status(200).json(saved);
    } catch (err) {
      next(err);
    }
  }

  static async update(req: Request, res: Response, next: NextFunction) {
    try {
      const id = req.params.id as string;
      const payload = { ...req.body, id };
      const saved = await AttendanceService.saveDraft(req.user!, payload);
      res.json(saved);
    } catch (err) {
      next(err);
    }
  }

  static async submit(req: Request, res: Response, next: NextFunction) {
    try {
      const id = req.params.id as string;
      const { revision } = submitSchema.parse(req.body);
      const submitted = await AttendanceService.submitReport(
        req.user!,
        id,
        revision
      );
      res.json(submitted);
    } catch (err) {
      next(err);
    }
  }

  static async approve(req: Request, res: Response, next: NextFunction) {
    try {
      const id = req.params.id as string;
      const approved = await AttendanceService.approveReport(req.user!, id);
      res.json(approved);
    } catch (err) {
      next(err);
    }
  }

  static async reopen(req: Request, res: Response, next: NextFunction) {
    try {
      const id = req.params.id as string;
      const reopened = await AttendanceService.reopenReport(req.user!, id);
      res.json(reopened);
    } catch (err) {
      next(err);
    }
  }

  static async audit(req: Request, res: Response, next: NextFunction) {
    try {
      const id = req.params.id as string;
      const history = await AttendanceService.getAuditHistory(req.user!, id);
      res.json(history);
    } catch (err) {
      next(err);
    }
  }
}
