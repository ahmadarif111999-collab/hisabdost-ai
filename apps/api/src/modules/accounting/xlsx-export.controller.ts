import {
  Body,
  Controller,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  CurrentUser,
  RequestUser,
} from '../../common/auth/current-user.decorator';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { ReportApprovalService } from './report-approval.service';
import { XlsxExportService } from './xlsx-export.service';

@Controller(
  'accounting/businesses/:businessId/xlsx',
)
@UseGuards(JwtAuthGuard)
export class XlsxExportController {
  constructor(
    private readonly xlsxExport:
      XlsxExportService,
    private readonly reportApproval:
      ReportApprovalService,
  ) {}

  @Post('reports')
  async exportReport(
    @CurrentUser() user: RequestUser,
    @Param('businessId') businessId: string,
    @Body() dto: any,
  ) {
    await this.reportApproval.assertCanDirectExport(
      user.sub,
      businessId,
    );

    return this.xlsxExport.exportReport(
      user.sub,
      businessId,
      dto,
    );
  }

  @Post('financial-statements')
  async exportFinancialStatements(
    @CurrentUser() user: RequestUser,
    @Param('businessId') businessId: string,
    @Body() dto: any,
  ) {
    await this.reportApproval.assertCanDirectExport(
      user.sub,
      businessId,
    );

    return this.xlsxExport.exportFinancialStatements(
      user.sub,
      businessId,
      dto,
    );
  }

  @Post('approved-request/:requestId')
  exportApprovedRequest(
    @CurrentUser() user: RequestUser,
    @Param('businessId') businessId: string,
    @Param('requestId') requestId: string,
  ) {
    return this.reportApproval.exportApprovedRequest(
      user.sub,
      businessId,
      requestId,
    );
  }
}
