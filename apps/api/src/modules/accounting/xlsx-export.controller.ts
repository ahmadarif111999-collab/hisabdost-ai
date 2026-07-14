import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser, RequestUser } from '../../common/auth/current-user.decorator';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { XlsxExportService } from './xlsx-export.service';

@Controller('accounting/businesses/:businessId/xlsx')
@UseGuards(JwtAuthGuard)
export class XlsxExportController {
  constructor(private readonly xlsxExport: XlsxExportService) {}

  @Post('reports')
  exportReport(
    @CurrentUser() user: RequestUser,
    @Param('businessId') businessId: string,
    @Body() dto: any,
  ) {
    return this.xlsxExport.exportReport(user.sub, businessId, dto);
  }

  @Post('financial-statements')
  exportFinancialStatements(
    @CurrentUser() user: RequestUser,
    @Param('businessId') businessId: string,
    @Body() dto: any,
  ) {
    return this.xlsxExport.exportFinancialStatements(user.sub, businessId, dto);
  }
}
