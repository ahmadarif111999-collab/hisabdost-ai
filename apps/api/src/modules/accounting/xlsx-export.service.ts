import { Injectable } from '@nestjs/common';
import { AccountingReportingService } from './accounting-reporting.service';
import { FinancialStatementsService } from './financial-statements.service';
import { BusinessesService } from '../businesses/businesses.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  buildWorkbookXlsxBase64,
  WorkbookSheet,
  XlsxRow,
  XlsxValue,
} from '../../common/xlsx-export.util';

@Injectable()
export class XlsxExportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly businesses: BusinessesService,
    private readonly reporting: AccountingReportingService,
    private readonly financialStatements: FinancialStatementsService,
  ) {}

  async exportReport(userId: string, businessId: string, dto: any) {
    const preview = await this.reporting.preview(userId, businessId, {
      ...dto,
      format: 'xlsx',
    });

    const business = await this.businesses.getAccessibleBusiness(userId, businessId);

    const workbook = buildWorkbookXlsxBase64(this.reportPreviewToWorkbook(preview));
    const filename = this.safeFilename(
      `${preview.reportType || 'report'}-${preview.filters?.startDate || 'from'}-to-${
        preview.filters?.endDate || 'to'
      }.xlsx`,
    );

    await this.prisma.reportExportLog.create({
      data: {
        organizationId: business.organizationId,
        businessId,
        userId,
        reportType: preview.reportType || dto.reportType || 'report',
        format: 'xlsx',
        dateFrom: preview.filters?.startDate ? new Date(preview.filters.startDate) : null,
        dateTo: preview.filters?.endDate ? new Date(preview.filters.endDate) : null,
        selectedHeadsJson: dto.accountCodes || [],
        filtersJson: dto,
        filename,
      },
    });

    return {
      filename,
      mimeType: workbook.mimeType,
      contentBase64: workbook.contentBase64,
      message: 'XLSX report exported.',
    };
  }

  async exportFinancialStatements(userId: string, businessId: string, dto: any) {
    const preview = await this.financialStatements.preview(userId, businessId, {
      startDate: dto.startDate,
      endDate: dto.endDate,
      includeZeroBalances: dto.includeZeroBalances,
    });

    const business = await this.businesses.getAccessibleBusiness(userId, businessId);

    const workbook = buildWorkbookXlsxBase64(this.financialStatementsToWorkbook(preview));
    const filename = this.safeFilename(
      `financial-statements-${preview.filters?.startDate || 'from'}-to-${
        preview.filters?.endDate || 'to'
      }.xlsx`,
    );

    await this.prisma.reportExportLog.create({
      data: {
        organizationId: business.organizationId,
        businessId,
        userId,
        reportType: 'financial-statements',
        format: 'xlsx',
        dateFrom: preview.filters?.startDate ? new Date(preview.filters.startDate) : null,
        dateTo: preview.filters?.endDate ? new Date(preview.filters.endDate) : null,
        selectedHeadsJson: [],
        filtersJson: dto,
        filename,
      },
    });

    return {
      filename,
      mimeType: workbook.mimeType,
      contentBase64: workbook.contentBase64,
      message: 'Financial statements XLSX exported.',
    };
  }

  private reportPreviewToWorkbook(preview: any): WorkbookSheet[] {
    const rows: XlsxRow[] = [];

    rows.push({ values: [preview.title || 'Report'], style: 2 });
    rows.push({ values: ['Client', preview.clientName || '-'] });
    rows.push({ values: ['Subtitle', preview.subtitle || '-'] });
    rows.push({ values: ['Generated At', preview.generatedAt || '-'] });
    rows.push({ values: ['Timezone', preview.timezone || 'Asia/Karachi'] });
    rows.push({
      values: [
        'Period',
        `${preview.filters?.startDateDisplay || preview.filters?.startDate || '-'} to ${
          preview.filters?.endDateDisplay || preview.filters?.endDate || '-'
        }`,
      ],
    });
    rows.push({ values: [] });

    for (const section of preview.sections || []) {
      this.appendSection(rows, section);
    }

    return [
      {
        name: preview.title || preview.reportType || 'Report',
        rows,
      },
    ];
  }

  private financialStatementsToWorkbook(preview: any): WorkbookSheet[] {
    const coverRows: XlsxRow[] = [
      { values: ['Financial Statements'], style: 2 },
      { values: ['Client', preview.clientName || '-'] },
      {
        values: [
          'Period',
          `${preview.filters?.startDateDisplay || preview.filters?.startDate || '-'} to ${
            preview.filters?.endDateDisplay || preview.filters?.endDate || '-'
          }`,
        ],
      },
      { values: ['Generated At', preview.generatedAt || '-'] },
      { values: ['Timezone', preview.timezone || 'Asia/Karachi'] },
      { values: [] },
      { values: ['Statements included'], style: 3 },
      ...(preview.statements || []).map((statement: any) => ({
        values: [statement.title],
      })),
      { values: [] },
      {
        values: [
          'Note',
          'These beta financial statements are for internal accountant review before client, tax, bank, or regulatory use.',
        ],
      },
    ];

    const statementSheets = (preview.statements || []).map((statement: any) => {
      const rows: XlsxRow[] = [];

      rows.push({ values: [statement.title || 'Statement'], style: 2 });
      rows.push({ values: ['Subtitle', statement.subtitle || '-'] });
      rows.push({ values: ['Client', preview.clientName || '-'] });
      rows.push({ values: ['Generated At', preview.generatedAt || '-'] });
      rows.push({ values: [] });

      for (const section of statement.sections || []) {
        this.appendSection(rows, section);
      }

      return {
        name: statement.title || statement.key || 'Statement',
        rows,
      };
    });

    return [
      {
        name: 'Cover',
        rows: coverRows,
      },
      ...statementSheets,
    ];
  }

  private appendSection(rows: XlsxRow[], section: any) {
    rows.push({ values: [section.title || 'Section'], style: 3 });

    if (section.note) {
      rows.push({ values: ['Note', section.note] });
    }

    const columns = section.columns || [];

    if (columns.length) {
      rows.push({
        values: columns.map((column: any) => column.label || column.key),
        style: 1,
      });
    }

    for (const row of section.rows || []) {
      rows.push({
        values: columns.map((column: any) => this.value(row[column.key])),
        style: 4,
      });
    }

    if (section.totals) {
      rows.push({ values: [] });
      rows.push({ values: ['Totals'], style: 3 });

      for (const [key, value] of Object.entries(section.totals)) {
        rows.push({
          values: [this.labelize(key), this.value(value)],
          style: 4,
        });
      }
    }

    rows.push({ values: [] });
  }

  private value(value: any): XlsxValue {
    if (value === null || value === undefined) return '';

    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : 0;
    }

    if (typeof value === 'boolean') {
      return value;
    }

    if (value instanceof Date) {
      return value;
    }

    return String(value);
  }

  private labelize(value: string) {
    return String(value || '')
      .replace(/([A-Z])/g, ' $1')
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^./, (char) => char.toUpperCase());
  }

  private safeFilename(value: string) {
    return value
      .replace(/[^a-zA-Z0-9._-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase();
  }
}
