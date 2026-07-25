import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  CurrentUser,
  RequestUser,
} from '../../common/auth/current-user.decorator';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { ReferenceNumbersService } from '../reference-numbers/reference-numbers.service';
import { AccountingService } from './accounting.service';
import {
  CreateAccountDto,
  CreateExpenseDto,
  CreateJournalEntryDto,
  CreatePaymentDto,
  CreatePurchaseDto,
  CreateSaleDto,
  ExportReportDto,
  RequestReportExportDto,
} from './dto/accounting.dto';

@Controller('accounting/businesses/:businessId')
@UseGuards(JwtAuthGuard)
export class AccountingController {
  constructor(
    private readonly accounting: AccountingService,
    private readonly references: ReferenceNumbersService,
  ) {}

  @Get('accounts')
  accounts(
    @CurrentUser() user: RequestUser,
    @Param('businessId') businessId: string,
  ) {
    return this.accounting.accounts(user.sub, businessId);
  }

  @Post('accounts')
  createAccount(
    @CurrentUser() user: RequestUser,
    @Param('businessId') businessId: string,
    @Body() dto: CreateAccountDto,
  ) {
    return this.accounting.createAccount(user.sub, businessId, dto);
  }

  @Post('sales')
  async createSale(
    @CurrentUser() user: RequestUser,
    @Param('businessId') businessId: string,
    @Body() dto: CreateSaleDto,
  ) {
    const result = await this.accounting.createSale(
      user.sub,
      businessId,
      dto,
    );

    return {
      ...result,
      entry: await this.withJournalReference(
        businessId,
        result.entry,
      ),
    };
  }

  @Post('purchases')
  async createPurchase(
    @CurrentUser() user: RequestUser,
    @Param('businessId') businessId: string,
    @Body() dto: CreatePurchaseDto,
  ) {
    const result = await this.accounting.createPurchase(
      user.sub,
      businessId,
      dto,
    );

    const [purchaseNo, entry] = await Promise.all([
      this.references.attachReference(
        businessId,
        'purchase',
        result.purchase.id,
        result.purchase.expenseDate,
      ),
      this.withJournalReference(
        businessId,
        result.entry,
      ),
    ]);

    return {
      ...result,
      purchase: {
        ...result.purchase,
        referenceNo: purchaseNo,
        purchaseNo,
        displayNumber: purchaseNo,
      },
      entry,
    };
  }

  @Post('expenses')
  async createExpense(
    @CurrentUser() user: RequestUser,
    @Param('businessId') businessId: string,
    @Body() dto: CreateExpenseDto,
  ) {
    const result = await this.accounting.createExpense(
      user.sub,
      businessId,
      dto,
    );

    const [expenseNo, entry] = await Promise.all([
      this.references.attachReference(
        businessId,
        'expense',
        result.expense.id,
        result.expense.expenseDate,
      ),
      this.withJournalReference(
        businessId,
        result.entry,
      ),
    ]);

    return {
      ...result,
      expense: {
        ...result.expense,
        referenceNo: expenseNo,
        expenseNo,
        displayNumber: expenseNo,
      },
      entry,
    };
  }

  @Post('payments/receive')
  async receivePayment(
    @CurrentUser() user: RequestUser,
    @Param('businessId') businessId: string,
    @Body() dto: CreatePaymentDto,
  ) {
    const result = await this.accounting.receivePayment(
      user.sub,
      businessId,
      dto,
    );

    const [paymentNo, entry] = await Promise.all([
      this.references.attachReference(
        businessId,
        'payment',
        result.payment.id,
        result.payment.paymentDate,
      ),
      this.withJournalReference(
        businessId,
        result.entry,
      ),
    ]);

    return {
      ...result,
      payment: {
        ...result.payment,
        paymentNo,
        displayNumber: paymentNo,
      },
      entry,
    };
  }

  @Post('payments/pay-supplier')
  async paySupplier(
    @CurrentUser() user: RequestUser,
    @Param('businessId') businessId: string,
    @Body() dto: CreatePaymentDto,
  ) {
    const result = await this.accounting.paySupplier(
      user.sub,
      businessId,
      dto,
    );

    const [paymentNo, entry] = await Promise.all([
      this.references.attachReference(
        businessId,
        'payment',
        result.payment.id,
        result.payment.paymentDate,
      ),
      this.withJournalReference(
        businessId,
        result.entry,
      ),
    ]);

    return {
      ...result,
      payment: {
        ...result.payment,
        paymentNo,
        displayNumber: paymentNo,
      },
      entry,
    };
  }

  @Post('journals')
  async createJournalEntry(
    @CurrentUser() user: RequestUser,
    @Param('businessId') businessId: string,
    @Body() dto: CreateJournalEntryDto,
  ) {
    const result = await this.accounting.createJournalEntry(
      user.sub,
      businessId,
      dto,
    );

    return {
      ...result,
      entry: await this.withJournalReference(
        businessId,
        result.entry,
      ),
    };
  }

  @Get('dashboard')
  dashboard(
    @CurrentUser() user: RequestUser,
    @Param('businessId') businessId: string,
  ) {
    return this.accounting.dashboard(
      user.sub,
      businessId,
    );
  }

  @Get('reports/profit-loss')
  profitLoss(
    @CurrentUser() user: RequestUser,
    @Param('businessId') businessId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.accounting.profitLoss(
      user.sub,
      businessId,
      from,
      to,
    );
  }

  @Get('reports/balance-sheet')
  balanceSheet(
    @CurrentUser() user: RequestUser,
    @Param('businessId') businessId: string,
  ) {
    return this.accounting.balanceSheet(
      user.sub,
      businessId,
    );
  }

  @Get('reports/trial-balance')
  trialBalance(
    @CurrentUser() user: RequestUser,
    @Param('businessId') businessId: string,
  ) {
    return this.accounting.trialBalance(
      user.sub,
      businessId,
    );
  }

  @Get('reports/sales')
  salesReport(
    @CurrentUser() user: RequestUser,
    @Param('businessId') businessId: string,
  ) {
    return this.accounting.salesReport(
      user.sub,
      businessId,
    );
  }

  @Get('reports/purchases')
  purchasesReport(
    @CurrentUser() user: RequestUser,
    @Param('businessId') businessId: string,
  ) {
    return this.accounting.purchaseSummary(
      user.sub,
      businessId,
    );
  }

  @Get('reports/expenses')
  expensesReport(
    @CurrentUser() user: RequestUser,
    @Param('businessId') businessId: string,
  ) {
    return this.accounting.expensesReport(
      user.sub,
      businessId,
    );
  }

  @Get('reports/receivables')
  receivables(
    @CurrentUser() user: RequestUser,
    @Param('businessId') businessId: string,
  ) {
    return this.accounting.receivables(
      user.sub,
      businessId,
    );
  }

  @Get('reports/payables')
  payables(
    @CurrentUser() user: RequestUser,
    @Param('businessId') businessId: string,
  ) {
    return this.accounting.payables(
      user.sub,
      businessId,
    );
  }

  @Get('reports/missing-documents')
  missingDocuments(
    @CurrentUser() user: RequestUser,
    @Param('businessId') businessId: string,
  ) {
    return this.accounting.missingDocuments(
      user.sub,
      businessId,
    );
  }

  @Get('ledgers/:accountIdOrCode')
  ledger(
    @CurrentUser() user: RequestUser,
    @Param('businessId') businessId: string,
    @Param('accountIdOrCode') accountIdOrCode: string,
  ) {
    return this.accounting.ledger(
      user.sub,
      businessId,
      accountIdOrCode,
    );
  }

  @Post('reports/preview')
  previewReport(
    @CurrentUser() user: RequestUser,
    @Param('businessId') businessId: string,
    @Body() dto: ExportReportDto,
  ) {
    return this.accounting.previewReport(
      user.sub,
      businessId,
      dto,
    );
  }

  @Post('reports/export')
  exportReport(
    @CurrentUser() user: RequestUser,
    @Param('businessId') businessId: string,
    @Body() dto: ExportReportDto,
  ) {
    return this.accounting.exportReport(
      user.sub,
      businessId,
      dto,
    );
  }

  @Post('reports/request-export')
  requestReportExport(
    @CurrentUser() user: RequestUser,
    @Param('businessId') businessId: string,
    @Body() dto: RequestReportExportDto,
  ) {
    return this.accounting.requestReportExport(
      user.sub,
      businessId,
      dto,
    );
  }

  @Get('reports/cash-bank')
  cashBank(
    @CurrentUser() user: RequestUser,
    @Param('businessId') businessId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.accounting.cashBankReport(
      user.sub,
      businessId,
      from,
      to,
    );
  }

  @Get('reports/tax-summary')
  taxSummary(
    @CurrentUser() user: RequestUser,
    @Param('businessId') businessId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.accounting.taxSummary(
      user.sub,
      businessId,
      from,
      to,
    );
  }

  @Get('reports/account-usage')
  accountUsage(
    @CurrentUser() user: RequestUser,
    @Param('businessId') businessId: string,
  ) {
    return this.accounting.accountUsageReport(
      user.sub,
      businessId,
    );
  }

  @Get('reports/monthly-closing')
  monthlyClosing(
    @CurrentUser() user: RequestUser,
    @Param('businessId') businessId: string,
  ) {
    return this.accounting.monthlyClosingReport(
      user.sub,
      businessId,
    );
  }

  private async withJournalReference<
    T extends {
      id: string;
      entryDate: Date | string;
    },
  >(businessId: string, entry: T) {
    const entryNo = await this.references.attachReference(
      businessId,
      'journal',
      entry.id,
      entry.entryDate,
    );

    return {
      ...entry,
      entryNo,
      displayNumber: entryNo,
    };
  }
}
