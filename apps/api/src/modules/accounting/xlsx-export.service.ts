import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  buildWorkbookXlsxBase64,
  WorkbookSheet,
  XlsxRow,
  XlsxValue,
} from '../../common/xlsx-export.util';
import { BusinessesService } from '../businesses/businesses.service';
import { ReferenceNumbersService } from '../reference-numbers/reference-numbers.service';
import { ReferencePresentationService } from '../reference-numbers/reference-presentation.service';
import { AccountingReportingService } from './accounting-reporting.service';
import { FinancialStatementsService } from './financial-statements.service';

type AnyRecord = Record<string, any>;

type PreviewColumn =
  | string
  | {
      key: string;
      label?: string;
      align?: 'left' | 'right' | 'center';
    };

type PreviewSection = {
  title?: string;
  note?: string;
  columns?: PreviewColumn[];
  rows?: AnyRecord[];
  totals?: AnyRecord;
};

@Injectable()
export class XlsxExportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly businesses: BusinessesService,
    private readonly reporting: AccountingReportingService,
    private readonly financialStatements: FinancialStatementsService,
    private readonly references: ReferenceNumbersService,
    private readonly presentation: ReferencePresentationService,
  ) {}

  async exportReport(
    userId: string,
    businessId: string,
    dto: AnyRecord,
  ) {
    const requestDto = {
      ...dto,
      format: 'xlsx',
    };

    const rawPreview = await this.reporting.preview(
      userId,
      businessId,
      requestDto as any,
    );

    const preview =
      await this.presentation.decorateReportPreview(
        businessId,
        requestDto,
        rawPreview,
      );

    const business =
      await this.businesses.getAccessibleBusiness(
        userId,
        businessId,
      );

    const reportType = String(
      preview?.reportType ||
        dto?.reportType ||
        'report',
    );

    const provisionalFilename =
      `pending-${this.fileSlug(reportType)}.xlsx`;

    const exportLog =
      await this.prisma.reportExportLog.create({
        data: {
          organizationId: business.organizationId,
          businessId,
          userId,
          reportType,
          format: 'xlsx',
          dateFrom: this.optionalDate(
            preview?.filters?.startDate,
          ),
          dateTo: this.optionalDate(
            preview?.filters?.endDate,
          ),
          selectedHeadsJson:
            dto?.accountCodes || [],
          filtersJson: requestDto as any,
          filename: provisionalFilename,
        },
      });

    const exportNo =
      await this.references.attachReference(
        businessId,
        'report_export',
        exportLog.id,
        exportLog.createdAt,
      );

    const filename = this.safeFilename(
      `${exportNo}-${reportType}-${
        preview?.filters?.startDate || 'from'
      }-to-${
        preview?.filters?.endDate || 'to'
      }.xlsx`,
    );

    const workbook =
      buildWorkbookXlsxBase64([
        this.exportDetailsSheet({
          exportNo,
          reportType,
          businessName: business.name,
          startDate:
            preview?.filters?.startDate,
          endDate:
            preview?.filters?.endDate,
          generatedAt: preview?.generatedAt,
        }),
        ...this.reportPreviewToWorkbook(
          preview,
        ),
      ]);

    await this.prisma.reportExportLog.update({
      where: {
        id: exportLog.id,
      },
      data: {
        filename,
        filtersJson: {
          ...requestDto,
          exportReference: exportNo,
        } as any,
      },
    });

    return {
      exportNo,
      referenceNo: exportNo,
      displayNumber: exportNo,
      filename,
      mimeType: workbook.mimeType,
      contentBase64:
        workbook.contentBase64,
      base64: workbook.contentBase64,
      fileBase64:
        workbook.contentBase64,
      message:
        `${exportNo} XLSX report exported.`,
    };
  }

  async exportFinancialStatements(
    userId: string,
    businessId: string,
    dto: AnyRecord,
  ) {
    const preview =
      await this.financialStatements.preview(
        userId,
        businessId,
        {
          startDate: dto.startDate,
          endDate: dto.endDate,
          includeZeroBalances:
            dto.includeZeroBalances,
        },
      );

    const business =
      await this.businesses.getAccessibleBusiness(
        userId,
        businessId,
      );

    const reportType =
      'financial-statements';

    const provisionalFilename =
      'pending-financial-statements.xlsx';

    const exportLog =
      await this.prisma.reportExportLog.create({
        data: {
          organizationId:
            business.organizationId,
          businessId,
          userId,
          reportType,
          format: 'xlsx',
          dateFrom: this.optionalDate(
            preview?.filters?.startDate,
          ),
          dateTo: this.optionalDate(
            preview?.filters?.endDate,
          ),
          selectedHeadsJson: [],
          filtersJson: dto as any,
          filename: provisionalFilename,
        },
      });

    const exportNo =
      await this.references.attachReference(
        businessId,
        'report_export',
        exportLog.id,
        exportLog.createdAt,
      );

    const filename = this.safeFilename(
      `${exportNo}-financial-statements-${
        preview?.filters?.startDate ||
        'from'
      }-to-${
        preview?.filters?.endDate ||
        'to'
      }.xlsx`,
    );

    const workbook =
      buildWorkbookXlsxBase64([
        this.exportDetailsSheet({
          exportNo,
          reportType,
          businessName: business.name,
          startDate:
            preview?.filters?.startDate,
          endDate:
            preview?.filters?.endDate,
          generatedAt:
            preview?.generatedAt,
        }),
        ...this.financialStatementsToWorkbook(
          preview,
        ),
      ]);

    await this.prisma.reportExportLog.update({
      where: {
        id: exportLog.id,
      },
      data: {
        filename,
        filtersJson: {
          ...dto,
          exportReference: exportNo,
        } as any,
      },
    });

    return {
      exportNo,
      referenceNo: exportNo,
      displayNumber: exportNo,
      filename,
      mimeType: workbook.mimeType,
      contentBase64:
        workbook.contentBase64,
      base64: workbook.contentBase64,
      fileBase64:
        workbook.contentBase64,
      message:
        `${exportNo} financial statements XLSX exported.`,
    };
  }

  private exportDetailsSheet(
    input: {
      exportNo: string;
      reportType: string;
      businessName: string;
      startDate?: string;
      endDate?: string;
      generatedAt?: string;
    },
  ): WorkbookSheet {
    return {
      name: 'Export Details',
      rows: [
        {
          values: [
            this.labelize(
              input.reportType,
            ),
            input.exportNo,
          ],
          style: 2,
        },
        {
          values: [
            'Export Reference',
            input.exportNo,
          ],
          style: 3,
        },
        {
          values: [
            'Business',
            input.businessName || '-',
          ],
        },
        {
          values: [
            'Report Type',
            this.labelize(
              input.reportType,
            ),
          ],
        },
        {
          values: [
            'Start Date',
            input.startDate ||
              'Not specified',
          ],
        },
        {
          values: [
            'End Date',
            input.endDate ||
              'Not specified',
          ],
        },
        {
          values: [
            'Generated At',
            input.generatedAt ||
              this.pakistanDateTime(
                new Date(),
              ),
          ],
        },
        {
          values: [
            'Timezone',
            'Asia/Karachi',
          ],
        },
        {
          values: [],
        },
        {
          values: [
            'Note',
            'Internal database IDs are intentionally excluded from user-facing workbook sheets.',
          ],
        },
      ],
    };
  }

  private reportPreviewToWorkbook(
    preview: AnyRecord,
  ): WorkbookSheet[] {
    const rows: XlsxRow[] = [];

    rows.push({
      values: [
        preview.title || 'Report',
      ],
      style: 2,
    });

    rows.push({
      values: [
        'Client',
        preview.clientName || '-',
      ],
    });

    rows.push({
      values: [
        'Subtitle',
        preview.subtitle || '-',
      ],
    });

    rows.push({
      values: [
        'Generated At',
        preview.generatedAt || '-',
      ],
    });

    rows.push({
      values: [
        'Timezone',
        preview.timezone ||
          'Asia/Karachi',
      ],
    });

    rows.push({
      values: [
        'Period',
        `${
          preview.filters
            ?.startDateDisplay ||
          preview.filters
            ?.startDate ||
          '-'
        } to ${
          preview.filters
            ?.endDateDisplay ||
          preview.filters
            ?.endDate ||
          '-'
        }`,
      ],
    });

    rows.push({
      values: [],
    });

    for (
      const section of
      preview.sections || []
    ) {
      this.appendSection(
        rows,
        section,
      );
    }

    return [
      {
        name:
          preview.title ||
          preview.reportType ||
          'Report',
        rows,
      },
    ];
  }

  private financialStatementsToWorkbook(
    preview: AnyRecord,
  ): WorkbookSheet[] {
    const coverRows: XlsxRow[] = [
      {
        values: [
          'Financial Statements',
        ],
        style: 2,
      },
      {
        values: [
          'Client',
          preview.clientName || '-',
        ],
      },
      {
        values: [
          'Period',
          `${
            preview.filters
              ?.startDateDisplay ||
            preview.filters
              ?.startDate ||
            '-'
          } to ${
            preview.filters
              ?.endDateDisplay ||
            preview.filters
              ?.endDate ||
            '-'
          }`,
        ],
      },
      {
        values: [
          'Generated At',
          preview.generatedAt || '-',
        ],
      },
      {
        values: [
          'Timezone',
          preview.timezone ||
            'Asia/Karachi',
        ],
      },
      {
        values: [],
      },
      {
        values: [
          'Statements included',
        ],
        style: 3,
      },
      ...(
        preview.statements || []
      ).map(
        (
          statement: AnyRecord,
        ) => ({
          values: [
            statement.title,
          ],
        }),
      ),
      {
        values: [],
      },
      {
        values: [
          'Note',
          'These beta financial statements are for internal accountant review before client, tax, bank, or regulatory use.',
        ],
      },
    ];

    const statementSheets = (
      preview.statements || []
    ).map(
      (
        statement: AnyRecord,
      ) => {
        const rows: XlsxRow[] = [];

        rows.push({
          values: [
            statement.title ||
              'Statement',
          ],
          style: 2,
        });

        rows.push({
          values: [
            'Subtitle',
            statement.subtitle ||
              '-',
          ],
        });

        rows.push({
          values: [
            'Client',
            preview.clientName ||
              '-',
          ],
        });

        rows.push({
          values: [
            'Generated At',
            preview.generatedAt ||
              '-',
          ],
        });

        rows.push({
          values: [],
        });

        for (
          const section of
          statement.sections || []
        ) {
          this.appendSection(
            rows,
            section,
          );
        }

        return {
          name:
            statement.title ||
            statement.key ||
            'Statement',
          rows,
        };
      },
    );

    return [
      {
        name: 'Cover',
        rows: coverRows,
      },
      ...statementSheets,
    ];
  }

  private appendSection(
    rows: XlsxRow[],
    section: PreviewSection,
  ) {
    rows.push({
      values: [
        section.title ||
          'Section',
      ],
      style: 3,
    });

    if (section.note) {
      rows.push({
        values: [
          'Note',
          section.note,
        ],
      });
    }

    const columns =
      this.normalizeColumns(
        section.columns || [],
      );

    if (columns.length) {
      rows.push({
        values: columns.map(
          (column) =>
            column.label,
        ),
        style: 1,
      });
    }

    for (
      const row of
      section.rows || []
    ) {
      rows.push({
        values: columns.map(
          (column) =>
            this.value(
              row[column.key],
            ),
        ),
        style: 4,
      });
    }

    if (section.totals) {
      rows.push({
        values: [],
      });

      rows.push({
        values: ['Totals'],
        style: 3,
      });

      for (
        const [
          key,
          value,
        ] of Object.entries(
          section.totals,
        )
      ) {
        rows.push({
          values: [
            this.labelize(key),
            this.value(value),
          ],
          style: 4,
        });
      }
    }

    rows.push({
      values: [],
    });
  }

  private normalizeColumns(
    columns: PreviewColumn[],
  ) {
    return columns
      .map((column) => {
        if (
          typeof column ===
          'string'
        ) {
          return {
            key: column,
            label:
              this.labelize(
                column,
              ),
          };
        }

        if (!column?.key) {
          return null;
        }

        return {
          key: column.key,
          label:
            column.label ||
            this.labelize(
              column.key,
            ),
        };
      })
      .filter(
        (
          column,
        ): column is {
          key: string;
          label: string;
        } => Boolean(column),
      );
  }

  private value(
    value: any,
  ): XlsxValue {
    if (
      value === null ||
      value === undefined
    ) {
      return '';
    }

    if (
      typeof value ===
      'number'
    ) {
      return Number.isFinite(
        value,
      )
        ? value
        : 0;
    }

    if (
      typeof value ===
      'boolean'
    ) {
      return value;
    }

    if (
      value instanceof Date
    ) {
      return value;
    }

    if (
      typeof value ===
      'object'
    ) {
      return JSON.stringify(
        value,
      );
    }

    return String(value);
  }

  private optionalDate(
    value: unknown,
  ) {
    if (!value) {
      return null;
    }

    const date = new Date(
      String(value),
    );

    return Number.isNaN(
      date.getTime(),
    )
      ? null
      : date;
  }

  private labelize(
    value: unknown,
  ) {
    return String(value || '')
      .replace(
        /([A-Z])/g,
        ' $1',
      )
      .replace(
        /[_-]+/g,
        ' ',
      )
      .replace(
        /\s+/g,
        ' ',
      )
      .trim()
      .replace(
        /^./,
        (char) =>
          char.toUpperCase(),
      );
  }

  private fileSlug(
    value: string,
  ) {
    return (
      String(value || 'report')
        .trim()
        .toLowerCase()
        .replace(
          /[^a-z0-9]+/g,
          '-',
        )
        .replace(
          /^-+|-+$/g,
          '',
        ) || 'report'
    );
  }

  private safeFilename(
    value: string,
  ) {
    return value
      .replace(
        /[^a-zA-Z0-9._-]+/g,
        '-',
      )
      .replace(
        /-+/g,
        '-',
      )
      .replace(
        /^-|-$/g,
        '',
      );
  }

  private pakistanDateTime(
    value: Date,
  ) {
    return new Intl.DateTimeFormat(
      'en-US',
      {
        timeZone:
          'Asia/Karachi',
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
      },
    ).format(value);
  }
}
