import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { ReportApprovalService } from '../accounting/report-approval.service';
import { ReferencePresentationService } from './reference-presentation.service';

type AuthenticatedRequest = {
  user?: {
    id?: string;
    userId?: string;
    sub?: string;
  };
};

@Controller('accounting/businesses/:businessId/reporting')
@UseGuards(AuthGuard('jwt'))
export class ReferenceWorkflowController {
  constructor(
    private readonly moduleRef: ModuleRef,
    private readonly presentation: ReferencePresentationService,
  ) {}

  @Get('export-requests')
  async listExportRequests(
    @Req() request: AuthenticatedRequest,
    @Param('businessId') businessId: string,
  ) {
    const result = await this.approvals().listRequests(
      this.userId(request),
      businessId,
    );
    return this.presentation.decorateReportRequestPayload(result);
  }

  @Post('export-requests/:requestId/decision')
  async decideExportRequest(
    @Req() request: AuthenticatedRequest,
    @Param('businessId') businessId: string,
    @Param('requestId') requestId: string,
    @Body() body: Record<string, any>,
  ) {
    const result = await this.approvals().decideRequest(
      this.userId(request),
      businessId,
      requestId,
      body,
    );
    return this.presentation.decorateReportRequestPayload(result);
  }

  private approvals() {
    return this.moduleRef.get(ReportApprovalService, { strict: false });
  }

  private userId(request: AuthenticatedRequest) {
    const userId =
      request.user?.id || request.user?.userId || request.user?.sub;
    if (!userId) {
      throw new UnauthorizedException('Authenticated user is required.');
    }
    return String(userId);
  }
}
