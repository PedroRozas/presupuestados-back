import { Inject, Injectable } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { and, desc, eq, gte, isNull, lte, or } from 'drizzle-orm';
import { DRIZZLE } from '../database/database.module.js';
import * as schema from '../database/schema/index.js';
import {
  budgets,
  expenseCategories,
  expenses,
  familyMembers,
} from '../database/schema/index.js';
import { filterExpensesForMonth } from '../common/utils/recurrence.js';
import { DashboardService } from '../dashboard/dashboard.service.js';

type ExportFormat = 'pdf' | 'xls';
type MonthlySummary = Awaited<ReturnType<DashboardService['getSummary']>>;

interface ExportFile {
  buffer: Buffer;
  contentType: string;
  filename: string;
}

interface ExportExpense {
  date: string;
  description: string;
  amount: number;
  kind: 'Gasto' | 'Abono';
  splitMethod: string;
  paidByName: string;
  assignedToName: string;
  categoryName: string;
  budgetName: string;
}

interface PdfLine {
  text: string;
  x: number;
  y: number;
  size: number;
  bold: boolean;
}

@Injectable()
export class ExportsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
    private readonly dashboardService: DashboardService,
  ) {}

  async buildMonthlySummaryExport(
    coupleId: string,
    month: number,
    year: number,
    format: ExportFormat,
  ): Promise<ExportFile> {
    const [summary, expenseRows] = await Promise.all([
      this.dashboardService.getSummary(coupleId, month, year),
      this.getExpenseRows(coupleId, month, year),
    ]);

    const period = `${year}-${String(month).padStart(2, '0')}`;
    const basename = `resumen-${period}`;

    if (format === 'pdf') {
      return {
        buffer: this.buildPdf(summary, expenseRows, period),
        contentType: 'application/pdf',
        filename: `${basename}.pdf`,
      };
    }

    return {
      buffer: this.buildExcelXml(summary, expenseRows, period),
      contentType: 'application/vnd.ms-excel; charset=utf-8',
      filename: `${basename}.xls`,
    };
  }

  private async getExpenseRows(
    coupleId: string,
    month: number,
    year: number,
  ): Promise<ExportExpense[]> {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59, 999);

    const [expenseCandidates, categories, members, budgetRows] =
      await Promise.all([
        this.db
          .select({
            amount: expenses.amount,
            date: expenses.date,
            description: expenses.description,
            isRecurring: expenses.isRecurring,
            recurrenceInterval: expenses.recurrenceInterval,
            recurrenceEndDate: expenses.recurrenceEndDate,
            splitMethod: expenses.splitMethod,
            paidBy: expenses.paidBy,
            assignedUserId: expenses.assignedUserId,
            budgetId: expenses.budgetId,
            isCredit: expenses.isCredit,
            categoryId: expenses.categoryId,
          })
          .from(expenses)
          .where(
            and(
              eq(expenses.coupleId, coupleId),
              or(
                and(
                  or(
                    eq(expenses.isRecurring, false),
                    isNull(expenses.isRecurring),
                  ),
                  gte(expenses.date, startDate),
                  lte(expenses.date, endDate),
                ),
                and(
                  eq(expenses.isRecurring, true),
                  lte(expenses.date, endDate),
                  or(
                    isNull(expenses.recurrenceEndDate),
                    gte(expenses.recurrenceEndDate, startDate),
                  ),
                ),
              ),
            ),
          )
          .orderBy(desc(expenses.date)),
        this.db.select().from(expenseCategories),
        this.db
          .select({ id: familyMembers.id, name: familyMembers.name })
          .from(familyMembers)
          .where(eq(familyMembers.coupleId, coupleId)),
        this.db
          .select({ id: budgets.id, name: budgets.name })
          .from(budgets)
          .where(eq(budgets.coupleId, coupleId)),
      ]);

    const categoryNames = new Map(
      categories.map((category) => [category.id, category.name]),
    );
    const memberNames = new Map(
      members.map((member) => [member.id, member.name]),
    );
    const budgetNames = new Map(
      budgetRows.map((budget) => [budget.id, budget.name]),
    );

    return filterExpensesForMonth(expenseCandidates, month, year).map(
      (expense) => ({
        date: this.formatDate(expense.date),
        description: expense.description.replace(/\s+/g, ' ').trim(),
        amount: Math.round(Number(expense.amount)),
        kind: expense.isCredit ? 'Abono' : 'Gasto',
        splitMethod: expense.splitMethod,
        paidByName: memberNames.get(expense.paidBy) ?? 'Sin nombre',
        assignedToName: expense.assignedUserId
          ? (memberNames.get(expense.assignedUserId) ?? 'Sin nombre')
          : '',
        categoryName:
          categoryNames.get(expense.categoryId ?? 0) ?? 'Sin categoria',
        budgetName: expense.budgetId
          ? (budgetNames.get(expense.budgetId) ?? 'Sin presupuesto')
          : '',
      }),
    );
  }

  private buildExcelXml(
    summary: MonthlySummary,
    expensesForExport: ExportExpense[],
    period: string,
  ): Buffer {
    const rows: string[] = [
      this.excelRow(['Resumen mensual', period]),
      this.excelRow([]),
      this.excelRow([
        'Total gastos conjuntos',
        summary.totals.totalJointExpenses,
      ]),
      this.excelRow(['Total gastos', summary.totals.totalExpenses]),
      this.excelRow(['Total ingresos netos', summary.totals.totalNetIncome]),
      this.excelRow([]),
      this.excelRow([
        'Usuario',
        'Ingreso bruto',
        'Descuentos',
        'Ingreso neto',
        'Gastos conjuntos',
        'Gastos individuales',
        'Saldo restante',
      ]),
      ...summary.users.map((user) =>
        this.excelRow([
          user.name,
          user.grossIncome,
          user.deductions,
          user.netIncome,
          user.shareOfJointExpenses,
          user.individualExpenses,
          user.remainingIncome,
        ]),
      ),
      this.excelRow([]),
      this.excelRow([
        'Fecha',
        'Descripcion',
        'Tipo',
        'Monto',
        'Division',
        'Pagado por',
        'Asignado a',
        'Categoria',
        'Presupuesto',
      ]),
      ...expensesForExport.map((expense) =>
        this.excelRow([
          expense.date,
          expense.description,
          expense.kind,
          expense.amount,
          expense.splitMethod,
          expense.paidByName,
          expense.assignedToName,
          expense.categoryName,
          expense.budgetName,
        ]),
      ),
    ];

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Worksheet ss:Name="Resumen">
  <Table>
${rows.join('\n')}
  </Table>
 </Worksheet>
</Workbook>`;

    return Buffer.from(xml, 'utf8');
  }

  private excelRow(values: Array<string | number>): string {
    if (values.length === 0) return '   <Row />';

    return `   <Row>${values
      .map((value) => {
        const type = typeof value === 'number' ? 'Number' : 'String';
        return `<Cell><Data ss:Type="${type}">${this.escapeXml(
          String(value),
        )}</Data></Cell>`;
      })
      .join('')}</Row>`;
  }

  private buildPdf(
    summary: MonthlySummary,
    expensesForExport: ExportExpense[],
    period: string,
  ): Buffer {
    const textRows = [
      'Resumen mensual',
      `Periodo: ${period}`,
      '',
      `Total gastos conjuntos: ${this.formatCurrency(
        summary.totals.totalJointExpenses,
      )}`,
      `Total gastos: ${this.formatCurrency(summary.totals.totalExpenses)}`,
      `Total ingresos netos: ${this.formatCurrency(
        summary.totals.totalNetIncome,
      )}`,
      '',
      'Usuarios',
      ...summary.users.map(
        (user) =>
          `${user.name}: neto ${this.formatCurrency(
            user.netIncome,
          )}, conjuntos ${this.formatCurrency(
            user.shareOfJointExpenses,
          )}, individuales ${this.formatCurrency(
            user.individualExpenses,
          )}, saldo ${this.formatCurrency(user.remainingIncome)}`,
      ),
      '',
      'Gastos',
      ...expensesForExport.map(
        (expense) =>
          `${expense.date} | ${expense.description} | ${expense.kind} | ${this.formatCurrency(
            expense.amount,
          )} | ${expense.splitMethod} | ${expense.paidByName}`,
      ),
    ];

    const pages = this.paginatePdf(textRows);
    return this.renderPdf(pages);
  }

  private paginatePdf(rows: string[]): PdfLine[][] {
    const pages: PdfLine[][] = [];
    let page: PdfLine[] = [];
    let y = 780;

    const addPage = () => {
      if (page.length > 0) pages.push(page);
      page = [];
      y = 780;
    };

    for (const row of rows) {
      const bold =
        row === 'Resumen mensual' || row === 'Usuarios' || row === 'Gastos';
      const size = row === 'Resumen mensual' ? 18 : bold ? 13 : 10;
      const wrapped = this.wrapPdfText(row, size);

      for (const line of wrapped) {
        if (y < 58) addPage();
        page.push({
          text: line,
          x: 54,
          y,
          size,
          bold,
        });
        y -= size + 5;
      }

      if (row === '') y -= 4;
    }

    addPage();
    return pages;
  }

  private wrapPdfText(text: string, size: number): string[] {
    const sanitized = this.sanitizePdfText(text);
    if (!sanitized) return [''];

    const maxChars = size >= 13 ? 74 : 95;
    const words = sanitized.split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let current = words[0] ?? '';

    for (const word of words.slice(1)) {
      const candidate = `${current} ${word}`;
      if (candidate.length <= maxChars) {
        current = candidate;
      } else {
        lines.push(current);
        current = word;
      }
    }

    if (current) lines.push(current);
    return lines;
  }

  private renderPdf(pages: PdfLine[][]): Buffer {
    const objects: string[] = [];
    const fontObjectId = 3;
    const kids = pages.map((_, index) => `${4 + index * 2} 0 R`).join(' ');

    objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
    objects[2] = `<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`;
    objects[3] =
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';

    pages.forEach((page, index) => {
      const pageObjectId = 4 + index * 2;
      const contentObjectId = pageObjectId + 1;
      const stream = this.buildPdfContentStream(page, index + 1, pages.length);
      objects[pageObjectId] =
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /Font << /F1 ${fontObjectId} 0 R >> >> /Contents ${contentObjectId} 0 R >>`;
      objects[contentObjectId] =
        `<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`;
    });

    let pdf = '%PDF-1.4\n';
    const offsets: number[] = [0];

    for (let id = 1; id < objects.length; id += 1) {
      offsets[id] = Buffer.byteLength(pdf, 'latin1');
      pdf += `${id} 0 obj\n${objects[id]}\nendobj\n`;
    }

    const xrefOffset = Buffer.byteLength(pdf, 'latin1');
    pdf += `xref\n0 ${objects.length}\n`;
    pdf += '0000000000 65535 f \n';

    for (let id = 1; id < objects.length; id += 1) {
      pdf += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
    }

    pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
    return Buffer.from(pdf, 'latin1');
  }

  private buildPdfContentStream(
    lines: PdfLine[],
    pageNumber: number,
    totalPages: number,
  ): string {
    const commands: string[] = [];

    for (const line of lines) {
      commands.push(
        'BT',
        `/F1 ${line.size} Tf`,
        `1 0 0 1 ${line.x.toFixed(2)} ${line.y.toFixed(2)} Tm`,
        `(${this.escapePdfText(line.text)}) Tj`,
        'ET',
      );
    }

    commands.push(
      'BT',
      '/F1 9 Tf',
      '1 0 0 1 470.00 36.00 Tm',
      `(Pagina ${pageNumber} de ${totalPages}) Tj`,
      'ET',
    );

    return commands.join('\n');
  }

  private formatCurrency(value: number): string {
    return `$${Math.round(value).toLocaleString('es-CL')}`;
  }

  private formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  private escapeXml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  private sanitizePdfText(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\x20-\x7E]/g, '');
  }

  private escapePdfText(value: string): string {
    return this.sanitizePdfText(value)
      .replace(/\\/g, '\\\\')
      .replace(/\(/g, '\\(')
      .replace(/\)/g, '\\)');
  }
}
