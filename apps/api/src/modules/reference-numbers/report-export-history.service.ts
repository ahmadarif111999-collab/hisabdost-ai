import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { BusinessesService } from '../businesses/businesses.service';
import { ReferenceNumbersService } from './reference-numbers.service';

@Injectable()
export class ReportExportHistoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly businesses: BusinessesService,
    private readonly references: ReferenceNumbersService,
  ) {}

  async list(
    userId: string,
    businessId: string,
  ) {
    const access =
      await this.businesses.getUserAccessForBusiness(
        userId,
        businessId,
      );

    const exports =
      await this.prisma.reportExportLog.findMany({
        where: {
          businessId,

          ...(access.firmMembership
            ? {}
            : {
                userId,
              }),
        },

        orderBy: {
          createdAt: 'desc',
        },
      });

    /*
     * Historical export logs may pre-date EX references.
     *
     * ensureMany() assigns missing references once and always
     * returns the same permanent EX reference on later requests.
     */
    const referenceById =
      await this.references.ensureMany(
        businessId,
        'report_export',
        exports.map((record) => ({
          id: record.id,
          date: record.createdAt,
        })),
      );

    return {
      isFirmUser: Boolean(
        access.firmMembership,
      ),

      clientName:
        access.business.name,

      exports:
        exports.map((record) => {
          const exportNo =
            referenceById[
              record.id
            ];

          return {
            exportNo,

            referenceNo:
              exportNo,

            displayNumber:
              exportNo,

            reportType:
              record.reportType,

            format:
              record.format,

            dateFrom:
              record.dateFrom,

            dateTo:
              record.dateTo,

            filename:
              this.displayFilename(
                exportNo,
                record.filename,
                record.reportType,
                record.format,
              ),

            createdAt:
              record.createdAt,
          };
        }),
    };
  }

  private displayFilename(
    exportNo: string,
    storedFilename:
      | string
      | null,
    reportType: string,
    format: string,
  ) {
    const extension =
      this.extension(
        format,
      );

    const fallback =
      `${exportNo}-${this.slug(
        reportType,
      )}.${extension}`;

    const filename =
      String(
        storedFilename ||
          '',
      ).trim();

    if (!filename) {
      return fallback;
    }

    /*
     * New exports already store filenames beginning with EX.
     */
    if (
      filename
        .toUpperCase()
        .startsWith(
          `${exportNo.toUpperCase()}-`,
        )
    ) {
      return filename;
    }

    /*
     * Historical exports may have been generated before EX was
     * introduced. Do not rewrite the old audit record solely for
     * presentation. Display the permanent EX prefix in history.
     */
    return `${exportNo}-${filename}`;
  }

  private extension(
    format: string,
  ) {
    const normalized =
      String(
        format ||
          'xlsx',
      )
        .trim()
        .toLowerCase();

    if (
      normalized ===
      'excel'
    ) {
      return 'xlsx';
    }

    return (
      normalized ||
      'xlsx'
    );
  }

  private slug(
    value: string,
  ) {
    return (
      String(
        value ||
          'report',
      )
        .trim()
        .toLowerCase()
        .replace(
          /[^a-z0-9]+/g,
          '-',
        )
        .replace(
          /^-|-$/g,
          '',
        ) ||
      'report'
    );
  }
}
