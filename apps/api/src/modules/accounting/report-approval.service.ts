import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { BusinessesService } from '../businesses/businesses.service';
import { ReferenceNumbersService } from '../reference-numbers/reference-numbers.service';
import { XlsxExportService } from './xlsx-export.service';

type ReportRequestDto = {
  reportType?: string;
  startDate?: string;
  endDate?: string;
  accountId?: string;
  accountCode?: string;
  accountCodes?: string[];
  includeZeroBalances?: boolean;
  showMovementColumns?: boolean;
  missingDocumentsOnly?: boolean;
  reason?: string;
};

type ReportDecision = 'approved' | 'rejected';

const ALLOWED_REPORT_TYPES = new Set([
  'profit-loss',
  'balance-sheet',
  'trial-balance',
  'general-ledger',
  'sales',
  'purchases',
  'expenses',
  'cash-bank',
  'tax-summary',
  'missing-documents',
]);

@Injectable()
export class ReportApprovalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly businesses: BusinessesService,
    private readonly xlsxExport: XlsxExportService,
    private readonly references: ReferenceNumbersService,
  ) {}

  async listRequests(
    userId: string,
    businessId: string,
  ) {
    const access =
      await this.businesses.getUserAccessForBusiness(
        userId,
        businessId,
      );

    const permission =
      await this.prisma.reportPermission.findUnique({
        where: {
          businessId,
        },
      });

    const isFirmUser =
      Boolean(
        access.firmMembership,
      );

    const canExportDirectly =
      this.canDirectExport(
        access,
        permission,
      );

    const requests =
      await this.prisma.reportExportRequest.findMany({
        where: {
          businessId,

          ...(isFirmUser
            ? {}
            : {
                requestedById:
                  userId,
              }),
        },

        include: {
          business: {
            select: {
              id: true,
              name: true,
            },
          },

          requestedBy: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },

          decidedBy: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },

        orderBy: {
          createdAt:
            'desc',
        },
      });

    /*
     * Backfill historical report requests that pre-date
     * human-readable references.
     *
     * ensureMany() is idempotent, so an existing RPT reference
     * is always retained.
     */
    const referenceById =
      await this.references.ensureMany(
        businessId,
        'report_request',

        requests.map(
          (request) => ({
            id: request.id,
            date:
              request.createdAt,
          }),
        ),
      );

    return {
      isFirmUser,

      clientRole:
        access.clientMembership
          ?.role || null,

      canExportDirectly,

      canRequestExport:
        Boolean(
          access.clientMembership,
        ) &&
        !canExportDirectly,

      requests:
        requests.map(
          (request) =>
            this.withRequestReference(
              request,

              referenceById[
                request.id
              ],
            ),
        ),
    };
  }

  async requestExport(
    userId: string,
    businessId: string,
    dto: ReportRequestDto,
  ) {
    const reportType =
      String(
        dto.reportType ||
          '',
      ).trim();

    if (
      !ALLOWED_REPORT_TYPES.has(
        reportType,
      )
    ) {
      throw new BadRequestException(
        'Select a valid report type',
      );
    }

    const access =
      await this.businesses.getUserAccessForBusiness(
        userId,
        businessId,
      );

    const permission =
      await this.prisma.reportPermission.findUnique({
        where: {
          businessId,
        },
      });

    if (
      this.canDirectExport(
        access,
        permission,
      )
    ) {
      throw new BadRequestException(
        'Direct report export is already enabled for your role. Use Export XLSX instead.',
      );
    }

    if (
      !access.clientMembership
    ) {
      throw new ForbiddenException(
        'Only a client user can request report export approval',
      );
    }

    const dateFrom =
      this.optionalDate(
        dto.startDate,
        'start date',
      );

    const dateTo =
      this.optionalDate(
        dto.endDate,
        'end date',
      );

    if (
      dateFrom &&
      dateTo &&
      dateFrom.getTime() >
        dateTo.getTime()
    ) {
      throw new BadRequestException(
        'Start date cannot be after end date',
      );
    }

    /*
     * Do not create repeated pending requests for the same
     * user/report/period.
     *
     * If an older pending request exists without an RPT reference,
     * assign one now and return the same permanent request.
     */
    const existing =
      await this.prisma.reportExportRequest.findFirst({
        where: {
          businessId,
          requestedById:
            userId,
          reportType,
          dateFrom,
          dateTo,
          status: 'pending',
        },

        orderBy: {
          createdAt:
            'desc',
        },
      });

    if (existing) {
      const requestNo =
        await this.references.attachReference(
          businessId,
          'report_request',
          existing.id,
          existing.createdAt,
        );

      return {
        requestNo,

        referenceNo:
          requestNo,

        reportRequestNo:
          requestNo,

        message:
          'A pending export request already exists for this report and period.',

        request:
          this.withRequestReference(
            existing,
            requestNo,
          ),
      };
    }

    const filters =
      this.jsonSafe({
        ...dto,

        reportType,

        format: 'xlsx',
      });

    const request =
      await this.prisma.reportExportRequest.create({
        data: {
          organizationId:
            access.business
              .organizationId,

          businessId,

          requestedById:
            userId,

          reportType,

          format: 'xlsx',

          dateFrom,

          dateTo,

          selectedHeadsJson:
            dto.accountCodes ||
            [],

          filtersJson:
            filters as any,

          reason:
            dto.reason?.trim() ||
            'Report export requested from Report Builder.',

          status: 'pending',
        },

        include: {
          business: {
            select: {
              id: true,
              name: true,
            },
          },

          requestedBy: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      });

    /*
     * Allocate RPT immediately after database creation.
     *
     * From this point onward, this request always has the same
     * permanent human-readable reference.
     */
    const requestNo =
      await this.references.attachReference(
        businessId,
        'report_request',
        request.id,
        request.createdAt,
      );

    await this.prisma.auditLog.create({
      data: {
        organizationId:
          access.business
            .organizationId,

        businessId,

        userId,

        action:
          'REPORT_EXPORT_REQUEST_CREATED',

        entityType:
          'ReportExportRequest',

        entityId:
          request.id,

        afterJson: {
          requestReference:
            requestNo,

          reportType:
            request.reportType,

          format:
            request.format,

          status:
            request.status,

          dateFrom:
            request.dateFrom?.toISOString() ||
            null,

          dateTo:
            request.dateTo?.toISOString() ||
            null,
        },
      },
    });

    return {
      requestNo,

      referenceNo:
        requestNo,

      reportRequestNo:
        requestNo,

      message:
        'Report export request sent to firm for approval.',

      request:
        this.withRequestReference(
          request,
          requestNo,
        ),
    };
  }

  async decideRequest(
    userId: string,
    businessId: string,
    requestId: string,
    decision: ReportDecision,
    decisionNote?: string,
  ) {
    if (
      decision !==
        'approved' &&
      decision !==
        'rejected'
    ) {
      throw new BadRequestException(
        'Decision must be approved or rejected',
      );
    }

    const access =
      await this.businesses.getUserAccessForBusiness(
        userId,
        businessId,
      );

    if (
      !access.firmMembership
    ) {
      throw new ForbiddenException(
        'Only a firm user can approve or reject report exports',
      );
    }

    const request =
      await this.prisma.reportExportRequest.findFirst({
        where: {
          id: requestId,

          businessId,
        },
      });

    if (!request) {
      throw new NotFoundException(
        'Report export request not found',
      );
    }

    /*
     * Old requests can reach the approval queue without having
     * previously been opened by the client. Guarantee RPT here too.
     */
    const requestNo =
      await this.references.attachReference(
        businessId,
        'report_request',
        request.id,
        request.createdAt,
      );

    if (
      request.status !==
      'pending'
    ) {
      throw new BadRequestException(
        `${requestNo} is not pending and cannot be decided again.`,
      );
    }

    /*
     * updateMany + status condition makes approval/rejection
     * concurrency-safe. Only one firm action can claim a pending
     * request.
     */
    const claimed =
      await this.prisma.reportExportRequest.updateMany({
        where: {
          id: requestId,

          businessId,

          status: 'pending',
        },

        data: {
          status:
            decision,

          decidedById:
            userId,

          decisionNote:
            decisionNote?.trim() ||
            null,
        },
      });

    if (
      claimed.count !== 1
    ) {
      throw new BadRequestException(
        `${requestNo} has already been decided.`,
      );
    }

    const updated =
      await this.prisma.reportExportRequest.findUnique({
        where: {
          id: requestId,
        },

        include: {
          business: {
            select: {
              id: true,
              name: true,
            },
          },

          requestedBy: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },

          decidedBy: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      });

    await this.prisma.auditLog.create({
      data: {
        organizationId:
          access.business
            .organizationId,

        businessId,

        userId,

        action:
          decision ===
          'approved'
            ? 'REPORT_EXPORT_REQUEST_APPROVED'
            : 'REPORT_EXPORT_REQUEST_REJECTED',

        entityType:
          'ReportExportRequest',

        entityId:
          requestId,

        beforeJson: {
          requestReference:
            requestNo,

          status:
            request.status,
        },

        afterJson: {
          requestReference:
            requestNo,

          status:
            decision,

          decisionNote:
            decisionNote?.trim() ||
            null,
        },
      },
    });

    return {
      requestNo,

      referenceNo:
        requestNo,

      reportRequestNo:
        requestNo,

      /*
       * Keep this message generic here because the global
       * human-readable interceptor appends the RPT reference.
       */
      message:
        decision ===
        'approved'
          ? 'Report export request approved.'
          : 'Report export request rejected.',

      request:
        updated
          ? this.withRequestReference(
              updated,
              requestNo,
            )
          : null,
    };
  }

  async assertCanDirectExport(
    userId: string,
    businessId: string,
  ) {
    const access =
      await this.businesses.getUserAccessForBusiness(
        userId,
        businessId,
      );

    const permission =
      await this.prisma.reportPermission.findUnique({
        where: {
          businessId,
        },
      });

    if (
      !this.canDirectExport(
        access,
        permission,
      )
    ) {
      throw new ForbiddenException(
        'Direct report export is not enabled for your role. Use Request Export Approval.',
      );
    }

    return access;
  }

  async exportApprovedRequest(
    userId: string,
    businessId: string,
    requestId: string,
  ) {
    const access =
      await this.businesses.getUserAccessForBusiness(
        userId,
        businessId,
      );

    const request =
      await this.prisma.reportExportRequest.findFirst({
        where: {
          id: requestId,

          businessId,
        },
      });

    if (!request) {
      throw new NotFoundException(
        'Report export request not found',
      );
    }

    const requestNo =
      await this.references.attachReference(
        businessId,
        'report_request',
        request.id,
        request.createdAt,
      );

    const isFirmUser =
      Boolean(
        access.firmMembership,
      );

    if (
      !isFirmUser &&
      request.requestedById !==
        userId
    ) {
      throw new ForbiddenException(
        `You can only export your own approved report request (${requestNo}).`,
      );
    }

    if (
      request.status !==
      'approved'
    ) {
      throw new BadRequestException(
        `${requestNo} is not an approved, unused report request.`,
      );
    }

    const claimed =
      await this.prisma.reportExportRequest.updateMany({
        where: {
          id: request.id,

          businessId,

          status:
            'approved',
        },

        data: {
          status:
            'exporting',
        },
      });

    if (
      claimed.count !== 1
    ) {
      throw new BadRequestException(
        `${requestNo} is already being exported or has already been used.`,
      );
    }

    const filters =
      this.jsonObject(
        request.filtersJson,
      );

    const selectedHeads =
      this.stringArray(
        request.selectedHeadsJson,
      );

    let result: any;

    try {
      result =
        await this.xlsxExport.exportReport(
          userId,
          businessId,
          {
            ...filters,

            reportType:
              request.reportType,

            format:
              'xlsx',

            startDate:
              filters.startDate ||
              request.dateFrom
                ?.toISOString()
                .slice(
                  0,
                  10,
                ) ||
              undefined,

            endDate:
              filters.endDate ||
              request.dateTo
                ?.toISOString()
                .slice(
                  0,
                  10,
                ) ||
              undefined,

            accountCodes:
              Array.isArray(
                filters.accountCodes,
              ) &&
              filters
                .accountCodes
                .length
                ? filters.accountCodes
                : selectedHeads,
          },
        );
    } catch (error) {
      /*
       * If XLSX generation fails, restore the approval so the
       * request is not permanently consumed.
       */
      await this.prisma.reportExportRequest.updateMany({
        where: {
          id: request.id,

          businessId,

          status:
            'exporting',
        },

        data: {
          status:
            'approved',
        },
      });

      throw error;
    }

    const completed =
      await this.prisma.reportExportRequest.updateMany({
        where: {
          id: request.id,

          businessId,

          status:
            'exporting',
        },

        data: {
          status:
            'exported',
        },
      });

    if (
      completed.count !== 1
    ) {
      throw new BadRequestException(
        `Could not finalize the export for ${requestNo}.`,
      );
    }

    const exportNo =
      result?.exportNo ||
      result?.referenceNo ||
      result?.displayNumber ||
      null;

    await this.prisma.auditLog
      .create({
        data: {
          organizationId:
            access.business
              .organizationId,

          businessId,

          userId,

          action:
            'REPORT_EXPORT_REQUEST_EXPORTED',

          entityType:
            'ReportExportRequest',

          entityId:
            request.id,

          beforeJson: {
            requestReference:
              requestNo,

            status:
              'approved',
          },

          afterJson: {
            requestReference:
              requestNo,

            exportReference:
              exportNo,

            status:
              'exported',

            reportType:
              request.reportType,

            filename:
              result.filename,
          },
        },
      })
      .catch(
        () => undefined,
      );

    return {
      ...result,

      requestNo,

      reportRequestNo:
        requestNo,

      requestStatus:
        'exported',

      message:
        exportNo
          ? `${requestNo} completed successfully as ${exportNo}.`
          : `${requestNo} exported successfully.`,
    };
  }

  private withRequestReference<
    T extends
      Record<
        string,
        any
      >,
  >(
    request: T,
    requestNo?: string,
  ) {
    return {
      ...request,

      requestNo:
        requestNo ||
        null,

      referenceNo:
        requestNo ||
        null,

      displayNumber:
        requestNo ||
        null,

      reportRequestNo:
        requestNo ||
        null,
    };
  }

  private canDirectExport(
    access: any,
    permission: any,
  ) {
    if (
      access.firmMembership
    ) {
      return true;
    }

    switch (
      access.clientMembership
        ?.role
    ) {
      case 'CLIENT_OWNER':
        return Boolean(
          permission?.allowClientOwnerExportReports,
        );

      case 'CLIENT_MANAGER':
        return Boolean(
          permission?.allowClientManagerExportReports,
        );

      case 'CLIENT_STAFF':
        return Boolean(
          permission?.allowClientStaffExportReports,
        );

      default:
        return false;
    }
  }

  private optionalDate(
    value:
      | string
      | undefined,

    label: string,
  ) {
    if (!value) {
      return null;
    }

    const date =
      new Date(
        value,
      );

    if (
      Number.isNaN(
        date.getTime(),
      )
    ) {
      throw new BadRequestException(
        `Invalid ${label}`,
      );
    }

    return date;
  }

  private jsonSafe(
    value: unknown,
  ) {
    return JSON.parse(
      JSON.stringify(
        value,
      ),
    ) as Record<
      string,
      any
    >;
  }

  private jsonObject(
    value: unknown,
  ): Record<
    string,
    any
  > {
    if (
      !value ||
      typeof value !==
        'object' ||
      Array.isArray(
        value,
      )
    ) {
      return {};
    }

    return value as Record<
      string,
      any
    >;
  }

  private stringArray(
    value: unknown,
  ) {
    if (
      !Array.isArray(
        value,
      )
    ) {
      return [];
    }

    return value.filter(
      (
        item,
      ): item is string =>
        typeof item ===
        'string',
    );
  }
}
