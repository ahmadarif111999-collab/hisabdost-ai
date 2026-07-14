import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  CurrentUser,
  RequestUser,
} from '../../common/auth/current-user.decorator';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { AccountingReportingService } from './accounting-reporting.service';
import { ReportApprovalService } from './report-approval.service';

@Controller(
  'accounting/businesses/:businessId/reporting',
)
@UseGuards(JwtAuthGuard)
export class AccountingReportingController {
  constructor(
    private readonly reporting:
      AccountingReportingService,
    private readonly reportApproval:
      ReportApprovalService,
  ) {}

  @Post('preview')
  preview(
    @CurrentUser() user: RequestUser,
    @Param('businessId') businessId: string,
    @Body() dto: any,
  ) {
    return this.reporting.preview(
      user.sub,
      businessId,
      dto,
    );
  }

  @Post('export')
  async export(
    @CurrentUser() user: RequestUser,
    @Param('businessId') businessId: string,
    @Body() dto: any,
  ) {
    await this.reportApproval.assertCanDirectExport(
      user.sub,
      businessId,
    );

    return this.reporting.export(
      user.sub,
      businessId,
      dto,
    );
  }

  @Get('export-requests')
  exportRequests(
    @CurrentUser() user: RequestUser,
    @Param('businessId') businessId: string,
  ) {
    return this.reportApproval.listRequests(
      user.sub,
      businessId,
    );
  }

  @Post('request-export')
  requestExport(
    @CurrentUser() user: RequestUser,
    @Param('businessId') businessId: string,
    @Body() dto: any,
  ) {
    return this.reportApproval.requestExport(
      user.sub,
      businessId,
      dto,
    );
  }

  @Post('export-requests/:requestId/decision')
  decideExportRequest(
    @CurrentUser() user: RequestUser,
    @Param('businessId') businessId: string,
    @Param('requestId') requestId: string,
    @Body()
    dto: {
      status?: 'approved' | 'rejected';
      decisionNote?: string;
    },
  ) {
    return this.reportApproval.decideRequest(
      user.sub,
      businessId,
      requestId,
      dto.status as 'approved' | 'rejected',
      dto.decisionNote,
    );
  }
}
