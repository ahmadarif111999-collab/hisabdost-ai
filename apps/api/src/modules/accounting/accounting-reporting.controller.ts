import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser, RequestUser } from '../../common/auth/current-user.decorator';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { AccountingReportingService } from './accounting-reporting.service';

@Controller('accounting/businesses/:businessId/reporting')
@UseGuards(JwtAuthGuard)
export class AccountingReportingController {
  constructor(private readonly reporting: AccountingReportingService) {}

  @Post('preview')
  preview(
    @CurrentUser() user: RequestUser,
    @Param('businessId') businessId: string,
    @Body() dto: any,
  ) {
    return this.reporting.preview(user.sub, businessId, dto);
  }

  @Post('export')
  export(
    @CurrentUser() user: RequestUser,
    @Param('businessId') businessId: string,
    @Body() dto: any,
  ) {
    return this.reporting.export(user.sub, businessId, dto);
  }

  @Post('request-export')
  requestExport(
    @CurrentUser() user: RequestUser,
    @Param('businessId') businessId: string,
    @Body() dto: any,
  ) {
    return this.reporting.requestExport(user.sub, businessId, dto);
  }
}
