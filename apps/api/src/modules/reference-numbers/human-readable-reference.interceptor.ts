import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Observable, from } from 'rxjs';
import { mergeMap } from 'rxjs/operators';
import { AccountingReportingService } from '../accounting/accounting-reporting.service';
import { ReportApprovalService } from '../accounting/report-approval.service';
import { ReferencePresentationService } from './reference-presentation.service';

type RequestLike = {
  method?: string;
  originalUrl?: string;
  url?: string;
  params?: Record<string, string>;
  body?: Record<string, any>;
  user?: Record<string, any>;
};

@Injectable()
export class HumanReadableReferenceInterceptor
  implements NestInterceptor
{
  constructor(
    private readonly moduleRef: ModuleRef,
    private readonly presentation: ReferencePresentationService,
  ) {}

  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<any> {
    const request = context.switchToHttp().getRequest<RequestLike>();
    const url = String(request.originalUrl || request.url || '');
    const method = String(request.method || 'GET').toUpperCase();

    if (
      method === 'POST' &&
      /\/accounting\/businesses\/[^/]+\/reporting\/request-export(?:\?|$)/.test(
        url,
      )
    ) {
      return from(this.submitReportRequest(request));
    }

    if (
      method === 'POST' &&
      /\/accounting\/businesses\/[^/]+\/reporting\/export(?:\?|$)/.test(
        url,
      )
    ) {
      return from(this.exportCsv(request));
    }

    return next.handle().pipe(
      mergeMap((data) => from(this.decorateResponse(request, data))),
    );
  }

  private async submitReportRequest(request: RequestLike) {
    const businessId = this.businessId(request);
    const userId = this.userId(request);
    const service = this.moduleRef.get(ReportApprovalService, {
      strict: false,
    });
    const result = await service.requestExport(
      userId,
      businessId,
      request.body || {},
    );

    return this.presentation.decorateReportRequestPayload(result);
  }

  private async exportCsv(request: RequestLike) {
    const businessId = this.businessId(request);
    const userId = this.userId(request);
    const approval = this.moduleRef.get(ReportApprovalService, {
      strict: false,
    });
    const reporting = this.moduleRef.get(AccountingReportingService, {
      strict: false,
    });

    await approval.assertCanDirectExport(userId, businessId);
    const rawPreview = await reporting.preview(
      userId,
      businessId,
      request.body || {},
    );
    const preview = await this.presentation.decorateReportPreview(
      businessId,
      request.body || {},
      rawPreview,
    );

    return this.presentation.exportDecoratedCsv(
      userId,
      businessId,
      request.body || {},
      preview,
    );
  }

  private async decorateResponse(
    request: RequestLike,
    data: any,
  ) {
    if (data == null) return data;

    const url = String(request.originalUrl || request.url || '');
    const businessId = request.params?.businessId;

    if (
      businessId &&
      /\/accounting\/businesses\/[^/]+\/reporting\/preview(?:\?|$)/.test(
        url,
      )
    ) {
      return this.presentation.decorateReportPreview(
        businessId,
        request.body || {},
        data,
      );
    }

    if (
      url.includes('/report-export-requests') ||
      url.includes('/reporting/export-requests') ||
      url.includes('/reporting/request-export')
    ) {
      return this.presentation.decorateReportRequestPayload(data);
    }

    if (businessId && url.includes('/documents')) {
      return this.presentation.decorateDocumentPayload(businessId, data);
    }

    if (
      businessId &&
      /\/xlsx\/approved-request\/([^/?]+)/.test(url)
    ) {
      const match = url.match(/\/xlsx\/approved-request\/([^/?]+)/);
      const requestId = request.params?.requestId || match?.[1];
      if (requestId) {
        return this.presentation.markApprovedRequestExported(
          businessId,
          requestId,
          data,
        );
      }
    }

    if (
      url.includes('/export-history') ||
      url.includes('/report-exports')
    ) {
      return this.presentation.decorateExportHistoryPayload(data);
    }

    return data;
  }

  private businessId(request: RequestLike) {
    const businessId = request.params?.businessId;
    if (!businessId) {
      throw new Error('Business ID is required.');
    }
    return businessId;
  }

  private userId(request: RequestLike) {
    const userId =
      request.user?.id ||
      request.user?.userId ||
      request.user?.sub;
    if (!userId) {
      throw new Error('Authenticated user is required.');
    }
    return String(userId);
  }
}
