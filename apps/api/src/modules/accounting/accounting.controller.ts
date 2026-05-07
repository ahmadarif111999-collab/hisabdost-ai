import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser, RequestUser } from '../../common/auth/current-user.decorator';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { AccountingService } from './accounting.service';
import { CreateAccountDto, CreateExpenseDto, CreateJournalEntryDto, CreatePaymentDto, CreatePurchaseDto, CreateSaleDto, ExportReportDto, RequestReportExportDto } from './dto/accounting.dto';

@Controller('accounting/businesses/:businessId')
@UseGuards(JwtAuthGuard)
export class AccountingController {
  constructor(private readonly accounting: AccountingService) {}

  @Get('accounts')
  accounts(@CurrentUser() user: RequestUser, @Param('businessId') businessId: string) {
    return this.accounting.accounts(user.sub, businessId);
  }

  @Post('accounts')
  createAccount(@CurrentUser() user: RequestUser, @Param('businessId') businessId: string, @Body() dto: CreateAccountDto) {
    return this.accounting.createAccount(user.sub, businessId, dto);
  }

  @Post('sales')
  createSale(@CurrentUser() user: RequestUser, @Param('businessId') businessId: string, @Body() dto: CreateSaleDto) {
    return this.accounting.createSale(user.sub, businessId, dto);
  }

  @Post('purchases')
  createPurchase(@CurrentUser() user: RequestUser, @Param('businessId') businessId: string, @Body() dto: CreatePurchaseDto) {
    return this.accounting.createPurchase(user.sub, businessId, dto);
  }

  @Post('expenses')
  createExpense(@CurrentUser() user: RequestUser, @Param('businessId') businessId: string, @Body() dto: CreateExpenseDto) {
    return this.accounting.createExpense(user.sub, businessId, dto);
  }

  @Post('payments/receive')
  receivePayment(@CurrentUser() user: RequestUser, @Param('businessId') businessId: string, @Body() dto: CreatePaymentDto) {
    return this.accounting.receivePayment(user.sub, businessId, dto);
  }

  @Post('payments/pay-supplier')
  paySupplier(@CurrentUser() user: RequestUser, @Param('businessId') businessId: string, @Body() dto: CreatePaymentDto) {
    return this.accounting.paySupplier(user.sub, businessId, dto);
  }

  @Post('journals')
  createJournalEntry(@CurrentUser() user: RequestUser, @Param('businessId') businessId: string, @Body() dto: CreateJournalEntryDto) {
    return this.accounting.createJournalEntry(user.sub, businessId, dto);
  }

  @Get('dashboard')
  dashboard(@CurrentUser() user: RequestUser, @Param('businessId') businessId: string) {
    return this.accounting.dashboard(user.sub, businessId);
  }

  @Get('reports/profit-loss')
  profitLoss(@CurrentUser() user: RequestUser, @Param('businessId') businessId: string, @Query('from') from?: string, @Query('to') to?: string) {
    return this.accounting.profitLoss(user.sub, businessId, from, to);
  }

  @Get('reports/balance-sheet')
  balanceSheet(@CurrentUser() user: RequestUser, @Param('businessId') businessId: string) {
    return this.accounting.balanceSheet(user.sub, businessId);
  }

  @Get('reports/trial-balance')
  trialBalance(@CurrentUser() user: RequestUser, @Param('businessId') businessId: string) {
    return this.accounting.trialBalance(user.sub, businessId);
  }

  @Get('reports/sales')
  salesReport(@CurrentUser() user: RequestUser, @Param('businessId') businessId: string) {
    return this.accounting.salesReport(user.sub, businessId);
  }

  @Get('reports/purchases')
  purchasesReport(@CurrentUser() user: RequestUser, @Param('businessId') businessId: string) {
    return this.accounting.purchaseSummary(user.sub, businessId);
  }

  @Get('reports/expenses')
  expensesReport(@CurrentUser() user: RequestUser, @Param('businessId') businessId: string) {
    return this.accounting.expensesReport(user.sub, businessId);
  }

  @Get('reports/receivables')
  receivables(@CurrentUser() user: RequestUser, @Param('businessId') businessId: string) {
    return this.accounting.receivables(user.sub, businessId);
  }

  @Get('reports/payables')
  payables(@CurrentUser() user: RequestUser, @Param('businessId') businessId: string) {
    return this.accounting.payables(user.sub, businessId);
  }

  @Get('reports/missing-documents')
  missingDocuments(@CurrentUser() user: RequestUser, @Param('businessId') businessId: string) {
    return this.accounting.missingDocuments(user.sub, businessId);
  }

  @Get('ledgers/:accountIdOrCode')
  ledger(@CurrentUser() user: RequestUser, @Param('businessId') businessId: string, @Param('accountIdOrCode') accountIdOrCode: string) {
    return this.accounting.ledger(user.sub, businessId, accountIdOrCode);
  }

  @Post('reports/preview')
  previewReport(@CurrentUser() user: RequestUser, @Param('businessId') businessId: string, @Body() dto: ExportReportDto) {
    return this.accounting.previewReport(user.sub, businessId, dto);
  }

  @Post('reports/export')
  exportReport(@CurrentUser() user: RequestUser, @Param('businessId') businessId: string, @Body() dto: ExportReportDto) {
    return this.accounting.exportReport(user.sub, businessId, dto);
  }

  @Post('reports/request-export')
  requestReportExport(@CurrentUser() user: RequestUser, @Param('businessId') businessId: string, @Body() dto: RequestReportExportDto) {
    return this.accounting.requestReportExport(user.sub, businessId, dto);
  }

  @Get('reports/cash-bank')
  cashBank(@CurrentUser() user: RequestUser, @Param('businessId') businessId: string, @Query('from') from?: string, @Query('to') to?: string) {
    return this.accounting.cashBankReport(user.sub, businessId, from, to);
  }

  @Get('reports/tax-summary')
  taxSummary(@CurrentUser() user: RequestUser, @Param('businessId') businessId: string, @Query('from') from?: string, @Query('to') to?: string) {
    return this.accounting.taxSummary(user.sub, businessId, from, to);
  }

  @Get('reports/account-usage')
  accountUsage(@CurrentUser() user: RequestUser, @Param('businessId') businessId: string) {
    return this.accounting.accountUsageReport(user.sub, businessId);
  }

  @Get('reports/monthly-closing')
  monthlyClosing(@CurrentUser() user: RequestUser, @Param('businessId') businessId: string) {
    return this.accounting.monthlyClosingReport(user.sub, businessId);
  }

}
