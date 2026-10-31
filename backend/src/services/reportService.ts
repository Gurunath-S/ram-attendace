import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';
import {
  AttendanceReportRecord,
  UNIT_1_DEPARTMENTS,
  UNIT_2_DEPARTMENTS,
  getWeekDates,
  getMonthBounds,
} from '@ad-garments/domain';
import { AttendanceRepository } from '../repositories/attendanceRepository.js';

export class ReportService {
  static generateDailyPdfBuffer(report: AttendanceReportRecord): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 40, size: 'A4' });
      const buffers: Buffer[] = [];

      doc.on('data', (chunk) => buffers.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', (err) => reject(err));

      // Header
      doc.fontSize(20).font('Helvetica-Bold').text('A.D. GARMENTS', { align: 'center' });
      doc.moveDown(0.2);
      doc.fontSize(14).font('Helvetica').text('DAILY ATTENDANCE REPORT', { align: 'center' });
      doc.moveDown(0.5);

      // Metadata Bar
      doc.fontSize(10).font('Helvetica');
      doc.text(`Report Date: ${report.reportDate}`, 40, doc.y, { continued: true });
      doc.text(`   |   Status: ${report.status}`, { continued: true });
      doc.text(`   |   Revision: ${report.revision}`, { continued: true });
      doc.text(`   |   Generated: ${new Date().toISOString().split('T')[0]}`);
      doc.moveDown(0.8);

      const tableTop = doc.y;
      const col1X = 40;
      const col2X = 300;
      const colWidth = 240;

      // Draw UNIT-1 Table on Left
      let y1 = tableTop;
      doc.fontSize(12).font('Helvetica-Bold').text('UNIT-1', col1X, y1);
      y1 += 18;

      // Table Header
      doc.fontSize(10).font('Helvetica-Bold');
      doc.text('No.', col1X, y1, { width: 30 });
      doc.text('Department', col1X + 30, y1, { width: 140 });
      doc.text('Count', col1X + 170, y1, { width: 60, align: 'right' });
      y1 += 14;
      doc.moveTo(col1X, y1).lineTo(col1X + colWidth, y1).stroke();
      y1 += 4;

      doc.font('Helvetica');
      UNIT_1_DEPARTMENTS.forEach((dept, index) => {
        const count = report.entries[dept.code] ?? '-';
        doc.text(String(index + 1), col1X, y1, { width: 30 });
        doc.text(dept.label, col1X + 30, y1, { width: 140 });
        doc.text(String(count), col1X + 170, y1, { width: 60, align: 'right' });
        y1 += 16;
      });

      doc.moveTo(col1X, y1).lineTo(col1X + colWidth, y1).stroke();
      y1 += 4;
      doc.font('Helvetica-Bold');
      doc.text('UNIT-1 TOTAL', col1X + 30, y1, { width: 140 });
      doc.text(String(report.unit1Total), col1X + 170, y1, { width: 60, align: 'right' });
      y1 += 18;
      doc.text('STAFF', col1X + 30, y1, { width: 140 });
      doc.text(String(report.staffCount), col1X + 170, y1, { width: 60, align: 'right' });
      y1 += 20;

      // Draw UNIT-2 Table on Right
      let y2 = tableTop;
      doc.fontSize(12).font('Helvetica-Bold').text('UNIT-2', col2X, y2);
      y2 += 18;

      doc.fontSize(10).font('Helvetica-Bold');
      doc.text('No.', col2X, y2, { width: 30 });
      doc.text('Department', col2X + 30, y2, { width: 140 });
      doc.text('Count', col2X + 170, y2, { width: 60, align: 'right' });
      y2 += 14;
      doc.moveTo(col2X, y2).lineTo(col2X + colWidth, y2).stroke();
      y2 += 4;

      doc.font('Helvetica');
      UNIT_2_DEPARTMENTS.forEach((dept, index) => {
        const count = report.entries[dept.code] ?? '-';
        doc.text(String(index + 1), col2X, y2, { width: 30 });
        doc.text(dept.label, col2X + 30, y2, { width: 140 });
        doc.text(String(count), col2X + 170, y2, { width: 60, align: 'right' });
        y2 += 16;
      });

      doc.moveTo(col2X, y2).lineTo(col2X + colWidth, y2).stroke();
      y2 += 4;
      doc.font('Helvetica-Bold');
      doc.text('UNIT-2 TOTAL', col2X + 30, y2, { width: 140 });
      doc.text(String(report.unit2Total), col2X + 170, y2, { width: 60, align: 'right' });
      y2 += 18;
      doc.text('SHIFT', col2X + 30, y2, { width: 140 });
      doc.text(String(report.shiftCount), col2X + 170, y2, { width: 60, align: 'right' });
      y2 += 20;

      // Grand Total Box
      const boxY = Math.max(y1, y2) + 20;
      doc.rect(40, boxY, 500, 45).fillAndStroke('#f3f4f6', '#9ca3af');
      doc.fillColor('#111827');
      doc.fontSize(14).font('Helvetica-Bold').text(
        `GRAND TOTAL: ${report.grandTotal}`,
        50,
        boxY + 14,
        { align: 'center', width: 480 }
      );

      // Footnote
      doc.fontSize(9).font('Helvetica').fillColor('#6b7280');
      doc.text(
        'Note: GRAND TOTAL = UNIT-1 TOTAL + UNIT-2 TOTAL + STAFF + SHIFT',
        40,
        boxY + 60,
        { align: 'center', width: 500 }
      );
      doc.text(
        'A.D. GARMENTS Attendance Management System - Confidential Report',
        40,
        740,
        { align: 'center', width: 500 }
      );

      doc.end();
    });
  }

  static async generateExcelBuffer(report: AttendanceReportRecord): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'A.D. GARMENTS Attendance System';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet(`Attendance-${report.reportDate}`);

    // Title rows
    sheet.mergeCells('A1:D1');
    const titleCell = sheet.getCell('A1');
    titleCell.value = 'A.D. GARMENTS - DAILY ATTENDANCE REPORT';
    titleCell.font = { name: 'Arial', size: 16, bold: true, color: { argb: 'FF1F2937' } };
    titleCell.alignment = { horizontal: 'center' };

    sheet.mergeCells('A2:D2');
    const metaCell = sheet.getCell('A2');
    metaCell.value = `Date: ${report.reportDate} | Status: ${report.status} | Revision: ${report.revision}`;
    metaCell.font = { name: 'Arial', size: 11, italic: true };
    metaCell.alignment = { horizontal: 'center' };

    sheet.addRow([]);

    // UNIT-1
    const u1Header = sheet.addRow(['UNIT-1', 'Department', 'Headcount']);
    u1Header.font = { bold: true };
    sheet.getColumn(1).width = 12;
    sheet.getColumn(2).width = 25;
    sheet.getColumn(3).width = 15;

    UNIT_1_DEPARTMENTS.forEach((dept, idx) => {
      sheet.addRow([idx + 1, dept.label, report.entries[dept.code] ?? 0]);
    });

    const u1TotalRow = sheet.addRow(['', 'UNIT-1 TOTAL', report.unit1Total]);
    u1TotalRow.font = { bold: true };
    const staffRow = sheet.addRow(['', 'STAFF', report.staffCount]);
    staffRow.font = { bold: true };

    sheet.addRow([]);

    // UNIT-2
    const u2Header = sheet.addRow(['UNIT-2', 'Department', 'Headcount']);
    u2Header.font = { bold: true };

    UNIT_2_DEPARTMENTS.forEach((dept, idx) => {
      sheet.addRow([idx + 1, dept.label, report.entries[dept.code] ?? 0]);
    });

    const u2TotalRow = sheet.addRow(['', 'UNIT-2 TOTAL', report.unit2Total]);
    u2TotalRow.font = { bold: true };
    const shiftRow = sheet.addRow(['', 'SHIFT', report.shiftCount]);
    shiftRow.font = { bold: true };

    sheet.addRow([]);

    // Grand Total
    const gtRow = sheet.addRow(['', 'GRAND TOTAL', report.grandTotal]);
    gtRow.font = { bold: true, size: 14 };

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  static async getWeeklyAggregates(factoryId: string, weekStart: string) {
    const dates = getWeekDates(weekStart);
    const reports = await AttendanceRepository.findByDateRange(
      dates[0],
      dates[6],
      factoryId
    );

    const reportMap = new Map<string, AttendanceReportRecord>();
    for (const rep of reports) {
      reportMap.set(rep.reportDate, rep);
    }

    const days = dates.map((date) => {
      const rep = reportMap.get(date);
      return {
        date,
        hasReport: !!rep,
        status: rep?.status ?? null,
        unit1Total: rep?.unit1Total ?? 0,
        unit2Total: rep?.unit2Total ?? 0,
        staffCount: rep?.staffCount ?? 0,
        shiftCount: rep?.shiftCount ?? 0,
        grandTotal: rep?.grandTotal ?? 0,
      };
    });

    const recordedDays = days.filter((d) => d.hasReport);
    const totalRecorded = recordedDays.length;
    const weeklyGrandTotal = recordedDays.reduce((acc, d) => acc + d.grandTotal, 0);
    const averageGrandTotal = totalRecorded > 0 ? Math.round((weeklyGrandTotal / totalRecorded) * 10) / 10 : 0;

    return {
      weekStart: dates[0],
      weekEnd: dates[6],
      totalDaysRecorded: totalRecorded,
      weeklyGrandTotal,
      averageGrandTotal,
      days,
    };
  }

  static async getMonthlyAggregates(factoryId: string, yearMonth: string) {
    const bounds = getMonthBounds(yearMonth);
    const reports = await AttendanceRepository.findByDateRange(
      bounds.monthStart,
      bounds.monthEnd,
      factoryId
    );

    const totalDaysRecorded = reports.length;
    const monthlyGrandTotal = reports.reduce((acc, r) => acc + r.grandTotal, 0);
    const averageGrandTotal = totalDaysRecorded > 0
      ? Math.round((monthlyGrandTotal / totalDaysRecorded) * 10) / 10
      : 0;

    return {
      month: yearMonth,
      monthStart: bounds.monthStart,
      monthEnd: bounds.monthEnd,
      totalDaysRecorded,
      monthlyGrandTotal,
      averageGrandTotal,
      reports,
    };
  }
}
