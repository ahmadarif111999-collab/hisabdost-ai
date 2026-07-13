import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { CurrentUser, RequestUser } from '../../common/auth/current-user.decorator';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { FinancialStatementsService } from './financial-statements.service';

@Controller('accounting/businesses/:businessId/financial-statements')
@UseGuards(JwtAuthGuard)
export class FinancialStatementsController {
  constructor(private readonly financialStatements: FinancialStatementsService) {}

  @Get('preview')
  preview(
    @CurrentUser() user: RequestUser,
    @Param('businessId') businessId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('includeZeroBalances') includeZeroBalances?: string,
  ) {
    return this.financialStatements.preview(user.sub, businessId, {
      startDate,
      endDate,
      includeZeroBalances: includeZeroBalances === 'true',
    });
  }
}
