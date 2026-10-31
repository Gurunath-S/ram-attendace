import { Request, Response, NextFunction } from 'express';
import { ReportService } from '../services/reportService.js';
import { AttendanceService } from '../services/attendanceService.js';
import { query } from '../db/index.js';
import { AppError } from '../middleware/errorHandler.js';

export class ReportController {
  static async getWeekly(req: Request, res: Response, next: NextFunction) {
    try {
      const weekStart = req.query.weekStart as string;
      if (!weekStart) {
        throw new AppError(400, 'weekStart parameter is required (YYYY-MM-DD)');
      }
      const data = await ReportService.getWeeklyAggregates(req.user!.factoryId, weekStart);
      res.json(data);
    } catch (err) {
      next(err);
    }
  }

  static async getMonthly(req: Request, res: Response, next: NextFunction) {
    try {
      const month = req.query.month as string;
      if (!month) {
        throw new AppError(400, 'month parameter is required (YYYY-MM)');
      }
      const data = await ReportService.getMonthlyAggregates(req.user!.factoryId, month);
      res.json(data);
    } catch (err) {
      next(err);
    }
  }

  static async downloadPdf(req: Request, res: Response, next: NextFunction) {
    try {
      const id = req.params.id as string;
      const report = await AttendanceService.getById(id, req.user!.factoryId);
      const pdfBuffer = await ReportService.generateDailyPdfBuffer(report);

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="attendance-${report.reportDate}-rev${report.revision}.pdf"`
      );
      res.send(pdfBuffer);
    } catch (err) {
      next(err);
    }
  }

  static async archivePdf(req: Request, res: Response, next: NextFunction) {
    try {
      const id = req.params.id as string;
      const report = await AttendanceService.getById(id, req.user!.factoryId);
      const fileName = `attendance-${report.reportDate}-rev${report.revision}.pdf`;
      const filePath = `/archived-reports/${fileName}`;

      const ins = await query(
        `INSERT INTO report_documents (report_id, revision, document_type, file_name, file_path, generated_by)
         VALUES ($1, $2, 'PDF', $3, $4, $5)
         RETURNING *`,
        [report.id, report.revision, fileName, filePath, req.user!.id]
      );

      res.status(201).json(ins.rows[0]);
    } catch (err) {
      next(err);
    }
  }

  static async getPdfHistory(req: Request, res: Response, next: NextFunction) {
    try {
      const id = req.params.id as string;
      const resDocs = await query(
        `SELECT d.*, u.display_name as generated_by_name
         FROM report_documents d
         JOIN users u ON d.generated_by = u.id
         WHERE d.report_id = $1
         ORDER BY d.created_at DESC`,
        [id]
      );
      res.json(resDocs.rows);
    } catch (err) {
      next(err);
    }
  }

  static async downloadExcel(req: Request, res: Response, next: NextFunction) {
    try {
      const id = req.params.id as string;
      const report = await AttendanceService.getById(id, req.user!.factoryId);
      const excelBuffer = await ReportService.generateExcelBuffer(report);

      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="attendance-${report.reportDate}.xlsx"`
      );
      res.send(excelBuffer);
    } catch (err) {
      next(err);
    }
  }
}
