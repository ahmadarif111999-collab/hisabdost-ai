import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { CurrentUser, RequestUser } from '../../common/auth/current-user.decorator';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { AccountingViewsService } from './accounting-views.service';

@Controller('accounting/businesses/:businessId/views')
@UseGuards(JwtAuthGuard)
export class AccountingViewsController {
  constructor(private readonly views: AccountingViewsService) {}

  @Get('journal-entries')
  journalEntries(
    @CurrentUser() user: RequestUser,
    @Param('businessId') businessId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.views.journalEntries(user.sub, businessId, { from, to });
  }

  @Get('journal-entries/:entryId')
  journalEntryDetail(
    @CurrentUser() user: RequestUser,
    @Param('businessId') businessId: string,
    @Param('entryId') entryId: string,
  ) {
    return this.views.journalEntryDetail(user.sub, businessId, entryId);
  }

  @Get('ledger/:accountIdOrCode')
  ledger(
    @CurrentUser() user: RequestUser,
    @Param('businessId') businessId: string,
    @Param('accountIdOrCode') accountIdOrCode: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.views.ledger(user.sub, businessId, accountIdOrCode, { from, to });
  }
}
