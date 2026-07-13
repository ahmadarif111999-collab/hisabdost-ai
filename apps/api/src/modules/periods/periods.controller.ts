import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { CurrentUser, RequestUser } from '../../common/auth/current-user.decorator';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PeriodsService } from './periods.service';

@Controller('periods/businesses/:businessId')
@UseGuards(JwtAuthGuard)
export class PeriodsController {
  constructor(private readonly periods: PeriodsService) {}

  @Get('dashboard')
  dashboard(@CurrentUser() user: RequestUser, @Param('businessId') businessId: string) {
    return this.periods.dashboard(user.sub, businessId);
  }

  @Patch('fiscal-calendar')
  updateFiscalCalendar(
    @CurrentUser() user: RequestUser,
    @Param('businessId') businessId: string,
    @Body() dto: { fiscalYearStartMonth: number; fiscalYearStartDay: number; reason?: string },
  ) {
    return this.periods.updateFiscalCalendar(user.sub, businessId, dto);
  }

  @Post('ensure-current')
  ensureCurrent(@CurrentUser() user: RequestUser, @Param('businessId') businessId: string) {
    return this.periods.ensureCurrentPeriod(user.sub, businessId);
  }

  @Get('opening-balances')
  openingBalances(@CurrentUser() user: RequestUser, @Param('businessId') businessId: string) {
    return this.periods.openingBalanceWizard(user.sub, businessId);
  }

  @Get('periods/:periodId/opening-balances')
  openingBalancesForPeriod(
    @CurrentUser() user: RequestUser,
    @Param('businessId') businessId: string,
    @Param('periodId') periodId: string,
  ) {
    return this.periods.openingBalanceWizard(user.sub, businessId, periodId);
  }

  @Post('periods/:periodId/opening-balances')
  saveOpeningBalances(
    @CurrentUser() user: RequestUser,
    @Param('businessId') businessId: string,
    @Param('periodId') periodId: string,
    @Body()
    dto: {
      rows: Array<{ accountId: string; debit?: number; credit?: number }>;
      narration?: string;
      reason?: string;
    },
  ) {
    return this.periods.saveManualOpeningBalances(user.sub, businessId, periodId, dto);
  }

  @Post('periods/:periodId/repair-opening-balances')
  repairOpeningBalances(
    @CurrentUser() user: RequestUser,
    @Param('businessId') businessId: string,
    @Param('periodId') periodId: string,
  ) {
    return this.periods.repairOpeningBalances(user.sub, businessId, periodId);
  }

  @Post('periods/:periodId/year-end-close')
  yearEndClosePeriod(
    @CurrentUser() user: RequestUser,
    @Param('businessId') businessId: string,
    @Param('periodId') periodId: string,
    @Body() dto: { reason?: string },
  ) {
    return this.periods.yearEndClosePeriod(user.sub, businessId, periodId, dto.reason);
  }

  @Post('periods/:periodId/reopen')
  reopenPeriod(
    @CurrentUser() user: RequestUser,
    @Param('businessId') businessId: string,
    @Param('periodId') periodId: string,
    @Body() dto: { reason?: string },
  ) {
    return this.periods.reopenPeriod(user.sub, businessId, periodId, dto.reason);
  }

  @Post('periods/:periodId/final-close')
  finalClosePeriod(
    @CurrentUser() user: RequestUser,
    @Param('businessId') businessId: string,
    @Param('periodId') periodId: string,
    @Body() dto: { reason?: string },
  ) {
    return this.periods.finalClosePeriod(user.sub, businessId, periodId, dto.reason);
  }
}
