import { Platform } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import {
  AttendanceReportRecord,
  UNIT_1_DEPARTMENTS,
  UNIT_2_DEPARTMENTS,
} from '@ad-garments/domain';

export class PdfService {
  static generateReportHtml(report: AttendanceReportRecord): string {
    const u1Rows = UNIT_1_DEPARTMENTS.map((dept) => {
      const val = report.entries[dept.code] ?? '-';
      return `
        <tr>
          <td style="padding: 8px 12px; border: 1px solid #cbd5e1; font-weight: 500;">${dept.label}</td>
          <td style="padding: 8px 12px; border: 1px solid #cbd5e1; text-align: center; font-weight: 600;">${val}</td>
        </tr>
      `;
    }).join('');

    const u2Rows = UNIT_2_DEPARTMENTS.map((dept) => {
      const val = report.entries[dept.code] ?? '-';
      return `
        <tr>
          <td style="padding: 8px 12px; border: 1px solid #cbd5e1; font-weight: 500;">${dept.label}</td>
          <td style="padding: 8px 12px; border: 1px solid #cbd5e1; text-align: center; font-weight: 600;">${val}</td>
        </tr>
      `;
    }).join('');

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no" />
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            color: #0f172a;
            padding: 24px;
            margin: 0;
            background: #ffffff;
          }
          .header {
            text-align: center;
            border-bottom: 2px solid #0f172a;
            padding-bottom: 14px;
            margin-bottom: 20px;
          }
          .title {
            font-size: 24px;
            font-weight: 800;
            letter-spacing: 1px;
            margin: 0 0 4px 0;
          }
          .subtitle {
            font-size: 14px;
            color: #475569;
            margin: 0;
            text-transform: uppercase;
            font-weight: 600;
          }
          .meta-box {
            display: flex;
            justify-content: space-between;
            margin-bottom: 20px;
            background: #f8fafc;
            padding: 12px 16px;
            border: 1px solid #e2e8f0;
            border-radius: 6px;
          }
          .meta-item {
            font-size: 13px;
          }
          .meta-label {
            color: #64748B;
            font-weight: 500;
          }
          .meta-val {
            font-weight: 700;
            color: #0f172a;
          }
          .units-container {
            display: flex;
            gap: 20px;
            margin-bottom: 24px;
          }
          .unit-col {
            flex: 1;
          }
          .unit-header {
            background: #0f172a;
            color: #ffffff;
            font-weight: 700;
            font-size: 14px;
            padding: 8px 12px;
            text-align: center;
            border-radius: 4px 4px 0 0;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            font-size: 13px;
          }
          .unit-total-row {
            background: #f1f5f9;
            font-weight: 700;
          }
          .summary-card {
            background: #0f172a;
            color: #ffffff;
            padding: 16px 20px;
            border-radius: 8px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-top: 10px;
          }
          .summary-grand {
            font-size: 28px;
            font-weight: 900;
            color: #38bdf8;
          }
          .footer {
            margin-top: 30px;
            text-align: center;
            font-size: 11px;
            color: #94a3b8;
            border-top: 1px solid #e2e8f0;
            padding-top: 12px;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="title">A.D. GARMENTS</div>
          <div class="subtitle">Daily Factory Attendance Report</div>
        </div>

        <div class="meta-box">
          <div class="meta-item"><span class="meta-label">Report Date: </span><span class="meta-val">${report.reportDate}</span></div>
          <div class="meta-item"><span class="meta-label">Status: </span><span class="meta-val">${report.status}</span></div>
          <div class="meta-item"><span class="meta-label">Revision: </span><span class="meta-val">Rev ${report.revision}</span></div>
        </div>

        <div class="units-container">
          <!-- UNIT 1 -->
          <div class="unit-col">
            <div class="unit-header">UNIT-1 (HEADCOUNT)</div>
            <table>
              <tbody>
                ${u1Rows}
                <tr class="unit-total-row">
                  <td style="padding: 10px 12px; border: 1px solid #cbd5e1;">UNIT-1 TOTAL</td>
                  <td style="padding: 10px 12px; border: 1px solid #cbd5e1; text-align: center; font-size: 15px; color: #0284c7;">${report.unit1Total}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 12px; border: 1px solid #cbd5e1; font-weight: 700; color: #475569;">STAFF (U1)</td>
                  <td style="padding: 8px 12px; border: 1px solid #cbd5e1; text-align: center; font-weight: 700;">${report.staffCount}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- UNIT 2 -->
          <div class="unit-col">
            <div class="unit-header">UNIT-2 (HEADCOUNT)</div>
            <table>
              <tbody>
                ${u2Rows}
                <tr class="unit-total-row">
                  <td style="padding: 10px 12px; border: 1px solid #cbd5e1;">UNIT-2 TOTAL</td>
                  <td style="padding: 10px 12px; border: 1px solid #cbd5e1; text-align: center; font-size: 15px; color: #4f46e5;">${report.unit2Total}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 12px; border: 1px solid #cbd5e1; font-weight: 700; color: #475569;">SHIFT (U2)</td>
                  <td style="padding: 8px 12px; border: 1px solid #cbd5e1; text-align: center; font-weight: 700;">${report.shiftCount}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div class="summary-card">
          <div>
            <div style="font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px; opacity: 0.85;">Attendance Summary Formula</div>
            <div style="font-size: 13px; margin-top: 4px;">Unit 1 (${report.unit1Total}) + Unit 2 (${report.unit2Total}) + Staff (${report.staffCount}) + Shift (${report.shiftCount})</div>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 12px; text-transform: uppercase; letter-spacing: 1px; opacity: 0.85;">Grand Total</div>
            <div class="summary-grand">${report.grandTotal}</div>
          </div>
        </div>

        <div class="footer">
          Generated automatically by A.D. GARMENTS Attendance Mobile System &bull; Timestamp: ${new Date().toISOString()}
        </div>
      </body>
      </html>
    `;
  }

  // Generate on-device PDF and share via native share sheet
  static async printAndShare(report: AttendanceReportRecord): Promise<{ success: boolean; uri?: string; error?: string }> {
    try {
      const html = this.generateReportHtml(report);

      if (Platform.OS === 'web') {
        const printWindow = window.open('', '_blank');
        if (printWindow) {
          printWindow.document.write(html);
          printWindow.document.close();
          printWindow.focus();
          printWindow.print();
        }
        return { success: true };
      }

      // Native iOS & Android
      const { uri } = await Print.printToFileAsync({
        html,
        base64: false,
      });

      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: `Share A.D. GARMENTS Report - ${report.reportDate}`,
          UTI: 'com.adobe.pdf',
        });
      }

      return { success: true, uri };
    } catch (err: any) {
      console.error('[PdfService] Error printing/sharing PDF:', err);
      return { success: false, error: err.message };
    }
  }
}
