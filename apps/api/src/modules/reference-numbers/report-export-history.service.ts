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

        include: {
          user: { select: { name: true, email: true } },
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

    const completedRequests = await this.prisma.reportExportRequest.findMany({
      where: { businessId, status: 'exported', ...(access.firmMembership ? {} : { requestedById: userId }) },
      select: { id: true, createdAt: true, filtersJson: true, requestedBy: { select: { name: true, email: true } }, decidedBy: { select: { name: true, email: true } } },
    });
    const audits = completedRequests.length ? await this.prisma.auditLog.findMany({
      where: { businessId, action: 'REPORT_EXPORT_REQUEST_EXPORTED', entityType: 'ReportExportRequest', entityId: { in: completedRequests.map((request) => request.id) } },
      select: { entityId: true, afterJson: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    }) : [];
    const auditByRequest = new Map<string, string>();
    for (const audit of audits) {
      const ref = this.jsonObject(audit.afterJson).exportReference;
      if (audit.entityId && typeof ref === 'string' && /^EX-\d{4}-\d{6,}$/.test(ref) && !auditByRequest.has(audit.entityId)) auditByRequest.set(audit.entityId, ref);
    }
    const requestReferences = await this.references.ensureMany(businessId, 'report_request', completedRequests.map((request) => ({ id: request.id, date: request.createdAt })));
    const visibleExports = new Set(Object.values(referenceById));
    const requestByExport = new Map<string, (typeof completedRequests)[number]>();
    const ambiguous = new Set<string>();
    for (const request of completedRequests) {
      const metadata = this.jsonObject(request.filtersJson);
      const ref = auditByRequest.get(request.id) || metadata.completedExportReference;
      if (typeof ref !== 'string' || !visibleExports.has(ref)) continue;
      if (requestByExport.has(ref)) { ambiguous.add(ref); continue; }
      requestByExport.set(ref, request);
    }
    for (const ref of ambiguous) requestByExport.delete(ref);

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

          const request = requestByExport.get(exportNo);
          return {
            requestNo: request ? requestReferences[request.id] || null : null,
            requestedByName: request ? this.personLabel(request.requestedBy) : null,
            decidedByName: request ? this.personLabel(request.decidedBy) : null,
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

            exportedByName:
              record.user?.name?.trim() || record.user?.email?.trim() || 'Unknown user',
          };
        }),
    };
  }

  private jsonObject(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  }

  private personLabel(person?: { name: string | null; email: string | null } | null) {
    return person?.name?.trim() || person?.email?.trim() || 'Unknown user';
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
