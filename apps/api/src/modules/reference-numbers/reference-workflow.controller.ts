import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import {
  CurrentUser,
  RequestUser,
} from '../../common/auth/current-user.decorator';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { ReportApprovalService } from '../accounting/report-approval.service';
import { ReferencePresentationService } from './reference-presentation.service';

type ReportDecisionBody = {
  decision?:
    | 'approved'
    | 'rejected';
  decisionNote?: string;
};

@Controller(
  'accounting/businesses/:businessId/reporting',
)
@UseGuards(JwtAuthGuard)
export class ReferenceWorkflowController {
  constructor(
    private readonly moduleRef: ModuleRef,
    private readonly presentation: ReferencePresentationService,
  ) {}

  @Get('export-requests')
  async listExportRequests(
    @CurrentUser()
    user: RequestUser,
    @Param('businessId')
    businessId: string,
  ) {
    const result =
      await this.approvals().listRequests(
        user.sub,
        businessId,
      );

    return this.presentation.decorateReportRequestPayload(
      result,
    );
  }

  @Post(
    'export-requests/:requestId/decision',
  )
  async decideExportRequest(
    @CurrentUser()
    user: RequestUser,
    @Param('businessId')
    businessId: string,
    @Param('requestId')
    requestId: string,
    @Body()
    body: ReportDecisionBody,
  ) {
    const result =
      await this.approvals().decideRequest(
        user.sub,
        businessId,
        requestId,
        body.decision as
          | 'approved'
          | 'rejected',
        body.decisionNote,
      );

    return this.presentation.decorateReportRequestPayload(
      result,
    );
  }

  private approvals() {
    return this.moduleRef.get(
      ReportApprovalService,
      {
        strict: false,
      },
    );
  }
}
