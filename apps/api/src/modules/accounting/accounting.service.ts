import { BadRequestException, Injectable } from '@nestjs/common';
import { Account, AccountType } from '@prisma/client';
import { endOfMonth, formatISO, startOfMonth } from 'date-fns';
import { BusinessesService } from '../businesses/businesses.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateAccountDto, CreateExpenseDto, CreateJournalEntryDto, CreatePaymentDto, CreatePurchaseDto, CreateSaleDto, ExportReportDto, RequestReportExportDto } from './dto/accounting.dto';

@Injectable()
export class AccountingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly businesses: BusinessesService,
  ) {}

  async accounts(userId: string, businessId: string) {
    await this.businesses.getAccessibleBusiness(userId, businessId);
    return this.prisma.account.findMany({ where: { businessId, isActive: true }, orderBy: { code: 'asc' } });
  }

  async createAccount(userId: string, businessId: string, dto: CreateAccountDto) {
    await this.businesses.getAccessibleBusiness(userId, businessId);
    const similar = await this.findSimilarAccount(businessId, dto.name);
    const isFirmUser = await this.businesses.isFirmUserForBusiness(userId, businessId);

    if (!isFirmUser) {
      const request = await this.prisma.accountHeadRequest.create({
        data: {
          businessId,
          requestedById: userId,
          requestedName: dto.name,
          suggestedName: dto.name,
          suggestedCode: dto.code,
          suggestedType: dto.type,
          suggestedCategory: this.suggestCategory(dto.name),
          reason: dto.description || 'Client requested this account head from the app/AI assistant.',
          duplicateAccountId: similar?.id,
          status: 'pending',
        },
      });
      await this.log(userId, businessId, 'ACCOUNT_HEAD_REQUEST_CREATED', 'AccountHeadRequest', request.id, request);
      return {
        message: similar
          ? `Similar account exists (${similar.name}). Request sent to firm for review.`
          : 'Account head request sent to firm for approval.',
        requiresFirmApproval: true,
        request,
        similarAccount: similar,
      };
    }

    if (similar) throw new BadRequestException(`Similar account already exists: ${similar.name}`);
    const code = dto.code || (await this.nextAccountCode(businessId, dto.type));
    const account = await this.prisma.account.create({
      data: {
        businessId,
        code,
        name: dto.name,
        type: dto.type,
        description: dto.description,
        requiresReview: dto.requiresReview || this.isTaxSensitive(dto.name),
        isSystem: false,
      },
    });
    await this.log(userId, businessId, 'ACCOUNT_HEAD_CREATED', 'Account', account.id, account);
    return { message: 'Account head created', account };
  }

  async createSale(userId: string, businessId: string, dto: CreateSaleDto) {
    await this.businesses.getAccessibleBusiness(userId, businessId);
    const accounts = await this.getAccountsMap(businessId);
    const paymentMethod = dto.paymentMethod || 'cash';
    const debitAccount = paymentMethod === 'credit' ? accounts['1100'] : this.paymentAccount(accounts, paymentMethod);
    const salesAccount = dto.accountCode ? accounts[dto.accountCode] : accounts['4000'];
    if (!debitAccount || !salesAccount) throw new BadRequestException('Default accounts missing');
    if (salesAccount.type !== 'INCOME') throw new BadRequestException('Sale account must be an income account');

    const customer = dto.customerName
      ? await this.findOrCreateCustomer(businessId, dto.customerName)
      : null;

    const entry = await this.prisma.journalEntry.create({
      data: {
        businessId,
        entryDate: dto.date ? new Date(dto.date) : new Date(),
        sourceType: 'sale',
        narration: dto.description || `Sale recorded via ${paymentMethod}`,
        createdById: userId,
        lines: {
          create: [
            {
              accountId: debitAccount.id,
              debit: dto.amount,
              credit: 0,
              partyType: customer ? 'customer' : undefined,
              partyId: customer?.id,
              description: dto.description,
            },
            {
              accountId: salesAccount.id,
              debit: 0,
              credit: dto.amount,
              description: dto.description,
            },
          ],
        },
      },
      include: { lines: { include: { account: true } } },
    });

    return { message: 'Sale recorded', entry };
  }

  async createPurchase(userId: string, businessId: string, dto: CreatePurchaseDto) {
    await this.businesses.getAccessibleBusiness(userId, businessId);
    const accounts = await this.getAccountsMap(businessId);
    const paymentMethod = dto.paymentMethod || 'cash';
    const creditAccount = paymentMethod === 'payable' ? accounts['2000'] : this.paymentAccount(accounts, paymentMethod);
    const purchaseAccount = dto.accountCode ? accounts[dto.accountCode] : accounts['5000'];
    if (!creditAccount || !purchaseAccount) throw new BadRequestException('Default accounts missing');
    if (purchaseAccount.type !== 'EXPENSE' && purchaseAccount.type !== 'ASSET') throw new BadRequestException('Purchase account must be expense or asset');

    const vendor = dto.vendorName ? await this.findOrCreateVendor(businessId, dto.vendorName) : null;
    const purchase = await this.prisma.expense.create({
      data: {
        businessId,
        vendorId: vendor?.id,
        kind: 'purchase',
        expenseDate: dto.date ? new Date(dto.date) : new Date(),
        categoryAccountId: purchaseAccount.id,
        paymentAccountId: creditAccount.id,
        amount: dto.amount,
        description: dto.description || 'Purchase',
        documentId: dto.documentId,
      },
    });

    const entry = await this.prisma.journalEntry.create({
      data: {
        businessId,
        entryDate: dto.date ? new Date(dto.date) : new Date(),
        sourceType: 'purchase',
        sourceId: purchase.id,
        narration: dto.description || `Purchase recorded via ${paymentMethod}`,
        createdById: userId,
        lines: { create: [
          { accountId: purchaseAccount.id, debit: dto.amount, credit: 0, partyType: vendor ? 'vendor' : undefined, partyId: vendor?.id, description: dto.description },
          { accountId: creditAccount.id, debit: 0, credit: dto.amount, partyType: vendor ? 'vendor' : undefined, partyId: vendor?.id, description: dto.description },
        ] },
      },
      include: { lines: { include: { account: true } } },
    });

    return { message: 'Purchase recorded', purchase, entry };
  }

  async createExpense(userId: string, businessId: string, dto: CreateExpenseDto) {
    await this.businesses.getAccessibleBusiness(userId, businessId);
    const accounts = await this.getAccountsMap(businessId);
    const paymentMethod = dto.paymentMethod || 'cash';
    const creditAccount = paymentMethod === 'payable' ? accounts['2000'] : this.paymentAccount(accounts, paymentMethod);
    const expenseAccount = dto.accountCode ? accounts[dto.accountCode] : this.findExpenseAccount(accounts, dto.category || dto.description || 'office');
    if (!creditAccount || !expenseAccount) throw new BadRequestException('Default accounts missing');
    if (expenseAccount.type !== 'EXPENSE') throw new BadRequestException('Expense account must be an expense account');

    const vendor = dto.vendorName ? await this.findOrCreateVendor(businessId, dto.vendorName) : null;
    const expense = await this.prisma.expense.create({
      data: {
        businessId,
        vendorId: vendor?.id,
        kind: 'expense',
        expenseDate: dto.date ? new Date(dto.date) : new Date(),
        categoryAccountId: expenseAccount.id,
        paymentAccountId: creditAccount.id,
        amount: dto.amount,
        description: dto.description || dto.category,
        documentId: dto.documentId,
      },
    });

    const entry = await this.prisma.journalEntry.create({
      data: {
        businessId,
        entryDate: dto.date ? new Date(dto.date) : new Date(),
        sourceType: 'expense',
        sourceId: expense.id,
        narration: dto.description || `${expenseAccount.name} recorded via ${paymentMethod}`,
        createdById: userId,
        lines: { create: [
          { accountId: expenseAccount.id, debit: dto.amount, credit: 0, partyType: vendor ? 'vendor' : undefined, partyId: vendor?.id, description: dto.description },
          { accountId: creditAccount.id, debit: 0, credit: dto.amount, partyType: vendor ? 'vendor' : undefined, partyId: vendor?.id, description: dto.description },
        ] },
      },
      include: { lines: { include: { account: true } } },
    });

    return { message: 'Expense recorded', expense, entry };
  }

  async receivePayment(userId: string, businessId: string, dto: CreatePaymentDto) {
    await this.businesses.getAccessibleBusiness(userId, businessId);
    const accounts = await this.getAccountsMap(businessId);
    const debitAccount = this.paymentAccount(accounts, dto.paymentMethod);
    const receivableAccount = accounts['1100'];
    if (!debitAccount || !receivableAccount) throw new BadRequestException('Default accounts missing');
    const customer = dto.partyId ? null : dto.partyName ? await this.findOrCreateCustomer(businessId, dto.partyName) : null;

    const payment = await this.prisma.payment.create({
      data: {
        businessId,
        direction: 'received',
        partyType: 'customer',
        partyId: dto.partyId || customer?.id,
        amount: dto.amount,
        paymentMethod: dto.paymentMethod,
        paymentAccountId: debitAccount.id,
        paymentDate: dto.date ? new Date(dto.date) : new Date(),
        notes: dto.notes,
      },
    });

    const entry = await this.prisma.journalEntry.create({
      data: {
        businessId,
        entryDate: dto.date ? new Date(dto.date) : new Date(),
        sourceType: 'customer_payment',
        sourceId: payment.id,
        narration: dto.notes || 'Customer payment received',
        createdById: userId,
        lines: { create: [
          { accountId: debitAccount.id, debit: dto.amount, credit: 0, partyType: 'customer', partyId: dto.partyId || customer?.id },
          { accountId: receivableAccount.id, debit: 0, credit: dto.amount, partyType: 'customer', partyId: dto.partyId || customer?.id },
        ] },
      },
      include: { lines: { include: { account: true } } },
    });

    return { message: 'Customer payment recorded', payment, entry };
  }

  async paySupplier(userId: string, businessId: string, dto: CreatePaymentDto) {
    await this.businesses.getAccessibleBusiness(userId, businessId);
    const accounts = await this.getAccountsMap(businessId);
    const creditAccount = this.paymentAccount(accounts, dto.paymentMethod);
    const payableAccount = accounts['2000'];
    if (!creditAccount || !payableAccount) throw new BadRequestException('Default accounts missing');
    const vendor = dto.partyId ? null : dto.partyName ? await this.findOrCreateVendor(businessId, dto.partyName) : null;

    const payment = await this.prisma.payment.create({
      data: {
        businessId,
        direction: 'paid',
        partyType: 'vendor',
        partyId: dto.partyId || vendor?.id,
        amount: dto.amount,
        paymentMethod: dto.paymentMethod,
        paymentAccountId: creditAccount.id,
        paymentDate: dto.date ? new Date(dto.date) : new Date(),
        notes: dto.notes,
      },
    });

    const entry = await this.prisma.journalEntry.create({
      data: {
        businessId,
        entryDate: dto.date ? new Date(dto.date) : new Date(),
        sourceType: 'supplier_payment',
        sourceId: payment.id,
        narration: dto.notes || 'Supplier payment made',
        createdById: userId,
        lines: { create: [
          { accountId: payableAccount.id, debit: dto.amount, credit: 0, partyType: 'vendor', partyId: dto.partyId || vendor?.id },
          { accountId: creditAccount.id, debit: 0, credit: dto.amount, partyType: 'vendor', partyId: dto.partyId || vendor?.id },
        ] },
      },
      include: { lines: { include: { account: true } } },
    });

    return { message: 'Supplier payment recorded', payment, entry };
  }

  async createJournalEntry(userId: string, businessId: string, dto: CreateJournalEntryDto) {
    await this.businesses.getAccessibleBusiness(userId, businessId);
    if (!dto.lines?.length || dto.lines.length < 2) throw new BadRequestException('Journal entry needs at least two lines');
    const debitTotal = dto.lines.reduce((sum, line) => sum + Number(line.debit || 0), 0);
    const creditTotal = dto.lines.reduce((sum, line) => sum + Number(line.credit || 0), 0);
    if (Math.abs(debitTotal - creditTotal) > 0.001) throw new BadRequestException('Debits and credits must be equal');

    const entry = await this.prisma.journalEntry.create({
      data: {
        businessId,
        entryDate: dto.date ? new Date(dto.date) : new Date(),
        sourceType: 'manual_journal',
        narration: dto.narration,
        createdById: userId,
        lines: {
          create: dto.lines.map((line) => ({
            accountId: line.accountId,
            debit: line.debit || 0,
            credit: line.credit || 0,
            description: line.description,
          })),
        },
      },
      include: { lines: { include: { account: true } } },
    });
    await this.log(userId, businessId, 'MANUAL_JOURNAL_CREATED', 'JournalEntry', entry.id, { narration: dto.narration, debitTotal, creditTotal });
    return { message: 'Manual journal posted', entry };
  }

  async dashboard(userId: string, businessId: string) {
    await this.businesses.getAccessibleBusiness(userId, businessId);
    const from = startOfMonth(new Date());
    const to = endOfMonth(new Date());
    const profitLoss = await this.profitLoss(userId, businessId, from.toISOString(), to.toISOString());
    const purchaseReport = await this.purchaseSummary(userId, businessId, from.toISOString(), to.toISOString());
    const receivables = await this.balanceByAccountCode(businessId, '1100');
    const payables = await this.balanceByAccountCode(businessId, '2000');
    const cash = await this.balanceByAccountCode(businessId, '1000');
    const bank = await this.balanceByAccountCode(businessId, '1010');
    const wallet = await this.balanceByAccountCode(businessId, '1020');
    const missingDocs = await this.prisma.expense.count({ where: { businessId, documentId: null } });

    return {
      period: { from: formatISO(from), to: formatISO(to) },
      sales: profitLoss.totalIncome,
      purchases: purchaseReport.totalPurchases,
      expenses: profitLoss.totalExpenses,
      profit: profitLoss.netProfit,
      cash,
      bank,
      wallet,
      receivables,
      payables,
      missingDocs,
    };
  }

  async profitLoss(userId: string, businessId: string, from?: string, to?: string) {
    await this.businesses.getAccessibleBusiness(userId, businessId);
    const lines = await this.financialLines(businessId, ['INCOME', 'EXPENSE'], from, to);
    const byAccount: Record<string, { code: string; account: string; type: AccountType; amount: number }> = {};
    for (const line of lines) {
      const debit = Number(line.debit);
      const credit = Number(line.credit);
      const key = line.account.code;
      const signedAmount = line.account.type === 'INCOME' ? credit - debit : debit - credit;
      byAccount[key] ||= { code: line.account.code, account: line.account.name, type: line.account.type, amount: 0 };
      byAccount[key].amount += signedAmount;
    }
    const rows = Object.values(byAccount).filter((row) => Math.abs(row.amount) > 0.0001).sort((a, b) => a.code.localeCompare(b.code));
    const totalIncome = rows.filter((r) => r.type === 'INCOME').reduce((sum, r) => sum + r.amount, 0);
    const totalExpenses = rows.filter((r) => r.type === 'EXPENSE').reduce((sum, r) => sum + r.amount, 0);
    return { rows, totalIncome, totalExpenses, netProfit: totalIncome - totalExpenses };
  }

  async balanceSheet(userId: string, businessId: string) {
    await this.businesses.getAccessibleBusiness(userId, businessId);
    const trial = await this.trialBalance(userId, businessId);
    const rows = trial.rows.filter((row) => ['ASSET', 'LIABILITY', 'EQUITY'].includes(row.type));
    return {
      assets: rows.filter((r) => r.type === 'ASSET'),
      liabilities: rows.filter((r) => r.type === 'LIABILITY'),
      equity: rows.filter((r) => r.type === 'EQUITY'),
      totalAssets: rows.filter((r) => r.type === 'ASSET').reduce((s, r) => s + r.balance, 0),
      totalLiabilities: rows.filter((r) => r.type === 'LIABILITY').reduce((s, r) => s + r.balance, 0),
      totalEquity: rows.filter((r) => r.type === 'EQUITY').reduce((s, r) => s + r.balance, 0),
    };
  }

  async trialBalance(userId: string, businessId: string) {
    await this.businesses.getAccessibleBusiness(userId, businessId);
    const accounts = await this.prisma.account.findMany({ where: { businessId, isActive: true }, orderBy: { code: 'asc' } });
    const rows = [];
    for (const account of accounts) {
      const lines = await this.prisma.journalLine.findMany({ where: { accountId: account.id, journalEntry: { status: 'POSTED' } } });
      const debit = lines.reduce((sum, line) => sum + Number(line.debit), 0);
      const credit = lines.reduce((sum, line) => sum + Number(line.credit), 0);
      const balance = this.naturalBalance(account.type, debit, credit);
      if (Math.abs(debit) > 0.001 || Math.abs(credit) > 0.001) rows.push({ id: account.id, code: account.code, account: account.name, type: account.type, debit, credit, balance });
    }
    return {
      rows,
      totalDebit: rows.reduce((sum, row) => sum + row.debit, 0),
      totalCredit: rows.reduce((sum, row) => sum + row.credit, 0),
    };
  }

  async ledger(userId: string, businessId: string, accountIdOrCode: string) {
    await this.businesses.getAccessibleBusiness(userId, businessId);
    const account = await this.prisma.account.findFirst({ where: { businessId, OR: [{ id: accountIdOrCode }, { code: accountIdOrCode }] } });
    if (!account) throw new BadRequestException('Account not found');
    const lines = await this.prisma.journalLine.findMany({
      where: { accountId: account.id, journalEntry: { status: 'POSTED' } },
      include: { journalEntry: true },
      orderBy: [{ journalEntry: { entryDate: 'asc' } }, { id: 'asc' }],
    });
    let running = 0;
    const rows = lines.map((line) => {
      const debit = Number(line.debit);
      const credit = Number(line.credit);
      running += account.type === 'ASSET' || account.type === 'EXPENSE' ? debit - credit : credit - debit;
      return {
        date: line.journalEntry.entryDate,
        narration: line.journalEntry.narration,
        description: line.description,
        debit,
        credit,
        balance: running,
        sourceType: line.journalEntry.sourceType,
      };
    });
    return { account, rows, closingBalance: running };
  }

  async salesReport(userId: string, businessId: string) {
    await this.businesses.getAccessibleBusiness(userId, businessId);
    return this.prisma.journalEntry.findMany({
      where: { businessId, sourceType: { in: ['sale', 'invoice'] } },
      include: { lines: { include: { account: true } } },
      orderBy: { entryDate: 'desc' },
      take: 100,
    });
  }

  async purchaseSummary(userId: string, businessId: string, from?: string, to?: string) {
    await this.businesses.getAccessibleBusiness(userId, businessId);
    const purchases = await this.prisma.expense.findMany({
      where: { businessId, kind: 'purchase', ...(from || to ? { expenseDate: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } } : {}) },
      orderBy: { expenseDate: 'desc' },
      take: 100,
    });
    return { purchases, totalPurchases: purchases.reduce((sum, p) => sum + Number(p.amount), 0) };
  }

  async expensesReport(userId: string, businessId: string) {
    await this.businesses.getAccessibleBusiness(userId, businessId);
    return this.prisma.expense.findMany({ where: { businessId, kind: 'expense' }, orderBy: { expenseDate: 'desc' }, take: 100 });
  }

  async receivables(userId: string, businessId: string) {
    await this.businesses.getAccessibleBusiness(userId, businessId);
    const ledger = await this.ledger(userId, businessId, '1100');
    return { total: ledger.closingBalance, rows: ledger.rows.slice(-100).reverse() };
  }

  async payables(userId: string, businessId: string) {
    await this.businesses.getAccessibleBusiness(userId, businessId);
    const ledger = await this.ledger(userId, businessId, '2000');
    return { total: ledger.closingBalance, rows: ledger.rows.slice(-100).reverse() };
  }

  async missingDocuments(userId: string, businessId: string) {
    await this.businesses.getAccessibleBusiness(userId, businessId);
    const items = await this.prisma.expense.findMany({ where: { businessId, documentId: null }, orderBy: { expenseDate: 'desc' }, take: 100 });
    return { count: items.length, items };
  }


  async previewReport(userId: string, businessId: string, dto: ExportReportDto) {
    await this.ensureCanViewReports(userId, businessId);
    const report = await this.buildReport(userId, businessId, dto);
    return {
      ...report,
      filters: this.cleanReportFilters(dto),
      note: 'Preview only. Export/download depends on role and firm-approved permissions.',
    };
  }

  async exportReport(userId: string, businessId: string, dto: ExportReportDto) {
    const access = await this.ensureCanExportReports(userId, businessId);
    const report = await this.buildReport(userId, businessId, dto);
    const filename = `${report.reportType}-${new Date().toISOString().slice(0, 10)}.${this.extensionForFormat(dto.format)}`;
    const content = this.renderExport(report, dto.format);
    const mimeType = this.mimeForFormat(dto.format);

    await this.prisma.reportExportLog.create({
      data: {
        organizationId: access.business.organizationId,
        businessId,
        userId,
        reportType: dto.reportType,
        format: dto.format,
        dateFrom: dto.from ? new Date(dto.from) : null,
        dateTo: dto.to ? new Date(dto.to) : null,
        selectedHeadsJson: dto.accountCodes || dto.accountIds ? { accountCodes: dto.accountCodes || [], accountIds: dto.accountIds || [] } : undefined,
        filtersJson: this.cleanReportFilters(dto),
        filename,
      },
    });

    await this.log(userId, businessId, 'REPORT_EXPORTED', 'ReportExportLog', filename, { reportType: dto.reportType, format: dto.format, filters: this.cleanReportFilters(dto) });
    return { filename, mimeType, contentBase64: Buffer.from(content).toString('base64'), report, warning: 'Excel export is CSV-compatible in this MVP; open it with Excel or Google Sheets.' };
  }

  async requestReportExport(userId: string, businessId: string, dto: RequestReportExportDto) {
    const access = await this.businesses.getUserAccessForBusiness(userId, businessId);
    const request = await this.prisma.reportExportRequest.create({
      data: {
        organizationId: access.business.organizationId,
        businessId,
        requestedById: userId,
        reportType: dto.reportType,
        format: dto.format,
        dateFrom: dto.from ? new Date(dto.from) : null,
        dateTo: dto.to ? new Date(dto.to) : null,
        selectedHeadsJson: dto.accountCodes || dto.accountIds ? { accountCodes: dto.accountCodes || [], accountIds: dto.accountIds || [] } : undefined,
        filtersJson: this.cleanReportFilters(dto),
        reason: dto.reason,
        status: 'pending',
      },
    });
    await this.log(userId, businessId, 'REPORT_EXPORT_REQUESTED', 'ReportExportRequest', request.id, request);
    return { message: 'Report export request sent to firm for approval.', request };
  }

  async cashBankReport(userId: string, businessId: string, from?: string, to?: string) {
    await this.ensureCanViewReports(userId, businessId);
    const accounts = await this.prisma.account.findMany({
      where: { businessId, code: { in: ['1000', '1010', '1020'] }, isActive: true },
      orderBy: { code: 'asc' },
    });
    const rows = [];
    for (const account of accounts) {
      const lines = await this.prisma.journalLine.findMany({
        where: {
          accountId: account.id,
          journalEntry: {
            status: 'POSTED',
            ...(from || to ? { entryDate: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } } : {}),
          },
        },
      });
      const moneyIn = lines.reduce((sum, line) => sum + Number(line.debit), 0);
      const moneyOut = lines.reduce((sum, line) => sum + Number(line.credit), 0);
      rows.push({ code: account.code, account: account.name, openingBalance: 0, moneyIn, moneyOut, closingBalance: moneyIn - moneyOut });
    }
    return { reportType: 'cash-bank', rows, totalClosingBalance: rows.reduce((sum, row) => sum + row.closingBalance, 0) };
  }

  async taxSummary(userId: string, businessId: string, from?: string, to?: string) {
    await this.ensureCanViewReports(userId, businessId);
    const taxAccounts = await this.prisma.account.findMany({
      where: {
        businessId,
        isActive: true,
        OR: [
          { name: { contains: 'tax', mode: 'insensitive' } },
          { name: { contains: 'withholding', mode: 'insensitive' } },
          { requiresReview: true },
        ],
      },
      orderBy: { code: 'asc' },
    });
    const rows = [];
    for (const account of taxAccounts) {
      const ledger = await this.ledger(userId, businessId, account.code);
      rows.push({ code: account.code, account: account.name, type: account.type, balance: ledger.closingBalance, requiresReview: account.requiresReview });
    }
    return { reportType: 'tax-summary', period: { from, to }, rows, safetyNote: 'Preparation summary only. Review with accountant/CA before FBR/SECP use.' };
  }

  async accountUsageReport(userId: string, businessId: string) {
    await this.ensureCanViewReports(userId, businessId);
    const accounts = await this.prisma.account.findMany({ where: { businessId, isActive: true }, orderBy: { code: 'asc' } });
    const rows = [];
    for (const account of accounts) {
      const count = await this.prisma.journalLine.count({ where: { accountId: account.id } });
      rows.push({ code: account.code, account: account.name, type: account.type, usageCount: count, warning: count === 0 ? 'Unused' : account.name.toLowerCase().includes('misc') && count > 5 ? 'Heavy miscellaneous usage' : '' });
    }
    const pendingRequests = await this.prisma.accountHeadRequest.findMany({ where: { businessId, status: 'pending' }, orderBy: { createdAt: 'desc' } });
    return { reportType: 'account-usage', rows, pendingRequests };
  }

  async monthlyClosingReport(userId: string, businessId: string) {
    await this.ensureCanViewReports(userId, businessId);
    const dashboard = await this.dashboard(userId, businessId);
    const missing = await this.missingDocuments(userId, businessId);
    const trial = await this.trialBalance(userId, businessId);
    return {
      reportType: 'monthly-closing',
      status: missing.count > 0 || Math.abs(trial.totalDebit - trial.totalCredit) > 0.01 ? 'Needs Review' : 'Ready for Review',
      checklist: [
        { item: 'Sales recorded', status: dashboard.sales > 0 ? 'Complete' : 'Needs review' },
        { item: 'Purchases recorded', status: dashboard.purchases > 0 ? 'Complete' : 'Needs review' },
        { item: 'Expenses recorded', status: dashboard.expenses > 0 ? 'Complete' : 'Needs review' },
        { item: 'Cash/bank checked', status: 'Needs firm confirmation' },
        { item: 'Debtors reviewed', status: dashboard.receivables !== 0 ? 'Needs review' : 'Complete' },
        { item: 'Creditors reviewed', status: dashboard.payables !== 0 ? 'Needs review' : 'Complete' },
        { item: 'Receipts attached', status: missing.count === 0 ? 'Complete' : `${missing.count} missing` },
        { item: 'Tax summary reviewed', status: 'Accountant review required' },
        { item: 'Month locked', status: 'Pending firm approval' },
      ],
      dashboard,
    };
  }

  private async buildReport(userId: string, businessId: string, dto: ExportReportDto) {
    const type = dto.reportType;
    if (type === 'profit-loss') return { reportType: type, ...(await this.filteredProfitLoss(userId, businessId, dto)) };
    if (type === 'trial-balance') return { reportType: type, ...(await this.trialBalance(userId, businessId)) };
    if (type === 'balance-sheet') return { reportType: type, ...(await this.balanceSheet(userId, businessId)) };
    if (type === 'general-ledger') {
      const accountCode = dto.accountCodes?.[0] || dto.accountIds?.[0] || '1000';
      return { reportType: type, ...(await this.ledger(userId, businessId, accountCode)) };
    }
    if (type === 'debtors' || type === 'receivables') return { reportType: 'debtors', ...(await this.receivables(userId, businessId)) };
    if (type === 'creditors' || type === 'payables') return { reportType: 'creditors', ...(await this.payables(userId, businessId)) };
    if (type === 'sales') return { reportType: type, rows: await this.salesReport(userId, businessId) };
    if (type === 'purchases') return { reportType: type, ...(await this.purchaseSummary(userId, businessId, dto.from, dto.to)) };
    if (type === 'expenses') return { reportType: type, rows: await this.expensesReport(userId, businessId) };
    if (type === 'cash-bank') return this.cashBankReport(userId, businessId, dto.from, dto.to);
    if (type === 'tax-summary') return this.taxSummary(userId, businessId, dto.from, dto.to);
    if (type === 'missing-documents') return { reportType: type, ...(await this.missingDocuments(userId, businessId)) };
    if (type === 'account-usage') return this.accountUsageReport(userId, businessId);
    if (type === 'monthly-closing') return this.monthlyClosingReport(userId, businessId);
    throw new BadRequestException('Unsupported report type');
  }

  private async filteredProfitLoss(userId: string, businessId: string, dto: ExportReportDto) {
    await this.ensureCanViewReports(userId, businessId);
    const lines = await this.financialLines(businessId, ['INCOME', 'EXPENSE'], dto.from, dto.to, dto.accountCodes, dto.accountIds);
    const byAccount: Record<string, { code: string; account: string; type: AccountType; amount: number }> = {};
    for (const line of lines) {
      const debit = Number(line.debit);
      const credit = Number(line.credit);
      const signedAmount = line.account.type === 'INCOME' ? credit - debit : debit - credit;
      byAccount[line.account.code] ||= { code: line.account.code, account: line.account.name, type: line.account.type, amount: 0 };
      byAccount[line.account.code].amount += signedAmount;
    }
    const rows = Object.values(byAccount).filter((row) => Math.abs(row.amount) > 0.0001).sort((a, b) => a.code.localeCompare(b.code));
    const totalIncome = rows.filter((r) => r.type === 'INCOME').reduce((sum, r) => sum + r.amount, 0);
    const totalExpenses = rows.filter((r) => r.type === 'EXPENSE').reduce((sum, r) => sum + r.amount, 0);
    const purchases = rows.filter((r) => ['5000', '5010', '5020', '5030', '5040'].includes(r.code)).reduce((sum, r) => sum + r.amount, 0);
    return { rows, totalIncome, purchases, grossProfit: totalIncome - purchases, totalExpenses, netProfit: totalIncome - totalExpenses };
  }

  private async ensureCanViewReports(userId: string, businessId: string) {
    const access = await this.businesses.getUserAccessForBusiness(userId, businessId);
    if (access.firmMembership) return access;
    const role = access.clientMembership?.role || '';
    const permission = await this.ensureReportPermission(businessId);
    if (role === 'CLIENT_OWNER' && permission.allowClientOwnerViewReports) return access;
    if (role === 'CLIENT_MANAGER' && permission.allowClientManagerViewReports) return access;
    if (role === 'CLIENT_STAFF' && permission.allowClientStaffViewReports) return access;
    throw new BadRequestException('Report view permission required. Ask the firm to enable access.');
  }

  private async ensureCanGenerateReports(userId: string, businessId: string) {
    const access = await this.ensureCanViewReports(userId, businessId);
    if (access.firmMembership) return access;
    const role = access.clientMembership?.role || '';
    const permission = await this.ensureReportPermission(businessId);
    if (role === 'CLIENT_OWNER' && permission.allowClientOwnerGenerateReports) return access;
    if (role === 'CLIENT_MANAGER' && permission.allowClientManagerGenerateReports) return access;
    if (role === 'CLIENT_STAFF' && permission.allowClientStaffGenerateReports) return access;
    throw new BadRequestException('Report generation permission required. You can request an export from the firm.');
  }

  private async ensureCanExportReports(userId: string, businessId: string) {
    const access = await this.ensureCanGenerateReports(userId, businessId);
    if (access.firmMembership) return access;
    const role = access.clientMembership?.role || '';
    const permission = await this.ensureReportPermission(businessId);
    if (role === 'CLIENT_OWNER' && permission.allowClientOwnerExportReports) return access;
    if (role === 'CLIENT_MANAGER' && permission.allowClientManagerExportReports) return access;
    if (role === 'CLIENT_STAFF' && permission.allowClientStaffExportReports) return access;
    throw new BadRequestException('Report export/download permission required. Use Request Export Approval.');
  }

  private async ensureReportPermission(businessId: string) {
    return this.prisma.reportPermission.upsert({
      where: { businessId },
      update: {},
      create: { businessId },
    });
  }

  private renderExport(report: any, format: string) {
    if (format === 'json') return JSON.stringify(report, null, 2);
    if (format === 'word' || format === 'docx') {
      return `<html><body><h1>${this.escapeHtml(report.reportType || 'Report')}</h1><p>Generated by HisabDost AI.</p><pre>${this.escapeHtml(JSON.stringify(report, null, 2))}</pre></body></html>`;
    }
    if (format === 'pdf') {
      return `<html><body><h1>${this.escapeHtml(report.reportType || 'Report')}</h1><p>This HTML report can be printed/saved as PDF in the MVP.</p><pre>${this.escapeHtml(JSON.stringify(report, null, 2))}</pre></body></html>`;
    }
    return this.toCsv(report);
  }

  private toCsv(report: any) {
    const rows: Record<string, unknown>[] = Array.isArray(report.rows)
      ? report.rows
      : Array.isArray(report.checklist)
        ? report.checklist
        : [];

    if (!rows.length) {
      return `reportType,${report.reportType || 'report'}\njson,"${String(JSON.stringify(report)).replace(/"/g, '""')}"`;
    }

    const headers: string[] = Array.from(
      new Set<string>(rows.flatMap((row) => Object.keys(row))),
    );

    const lines = [headers.join(',')];

    for (const row of rows) {
      lines.push(
        headers
          .map((h) => `"${String(row[h] ?? '').replace(/"/g, '""')}"`)
          .join(','),
      );
    }

    return lines.join('\n');
  }

  private mimeForFormat(format: string) {
    if (format === 'json') return 'application/json';
    if (format === 'pdf') return 'text/html';
    if (format === 'word' || format === 'docx') return 'application/msword';
    return 'text/csv';
  }

  private extensionForFormat(format: string) {
    if (format === 'json') return 'json';
    if (format === 'pdf') return 'html';
    if (format === 'word' || format === 'docx') return 'doc';
    return 'csv';
  }

  private cleanReportFilters(dto: ExportReportDto | RequestReportExportDto) {
    return {
      from: dto.from,
      to: dto.to,
      accountCodes: dto.accountCodes || [],
      accountIds: dto.accountIds || [],
      customerId: dto.customerId,
      vendorId: dto.vendorId,
      paymentStatus: dto.paymentStatus,
      documentStatus: dto.documentStatus,
      approvalStatus: dto.approvalStatus,
      minAmount: dto.minAmount,
      maxAmount: dto.maxAmount,
    };
  }

  private escapeHtml(value: string) {
    return value.replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char] || char));
  }

  private async financialLines(businessId: string, types: AccountType[], from?: string, to?: string, accountCodes?: string[], accountIds?: string[]) {
    const dateFilter = { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) };
    return this.prisma.journalLine.findMany({
      where: {
        journalEntry: { businessId, status: 'POSTED', ...(from || to ? { entryDate: dateFilter } : {}) },
        account: {
          type: { in: types },
          ...(accountCodes?.length ? { code: { in: accountCodes } } : {}),
          ...(accountIds?.length ? { id: { in: accountIds } } : {}),
        },
      },
      include: { account: true },
    });
  }

  private async getAccountsMap(businessId: string) {
    const accounts = await this.prisma.account.findMany({ where: { businessId } });
    return Object.fromEntries(accounts.map((account) => [account.code, account])) as Record<string, Account>;
  }

  private paymentAccount(accounts: Record<string, Account>, method?: string) {
    if (method === 'bank') return accounts['1010'];
    if (method === 'wallet') return accounts['1020'];
    return accounts['1000'];
  }

  private findExpenseAccount(accounts: Record<string, Account>, hint: string) {
    const text = hint.toLowerCase();
    if (text.includes('rent') || text.includes('kiraya')) return accounts['5100'];
    if (text.includes('salary') || text.includes('salar') || text.includes('tankhwa')) return accounts['5200'];
    if (text.includes('electric') || text.includes('bijli')) return accounts['5310'];
    if (text.includes('gas')) return accounts['5320'];
    if (text.includes('internet') || text.includes('phone') || text.includes('mobile')) return accounts['5330'];
    if (text.includes('fuel') || text.includes('petrol')) return accounts['5410'];
    if (text.includes('transport')) return accounts['5400'];
    if (text.includes('delivery') || text.includes('rider')) return accounts['5040'];
    if (text.includes('marketing') || text.includes('ad')) return accounts['5700'];
    if (text.includes('software')) return accounts['5800'];
    if (text.includes('bank')) return accounts['5900'];
    if (text.includes('professional') || text.includes('legal') || text.includes('tax consultant')) return accounts['6010'];
    if (text.includes('tea') || text.includes('refresh') || text.includes('entertainment')) return accounts['6100'];
    if (text.includes('tax')) return accounts['6400'];
    if (text.includes('purchase') || text.includes('stock')) return accounts['5000'];
    return accounts['5600'] || accounts['6999'];
  }

  private async findSimilarAccount(businessId: string, name: string) {
    const normalized = this.normalizeName(name);
    const accounts = await this.prisma.account.findMany({ where: { businessId, isActive: true } });
    return accounts.find((account) => this.normalizeName(account.name) === normalized || this.similarity(this.normalizeName(account.name), normalized) > 0.82) || null;
  }

  private normalizeName(value: string) {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\b(expense|expenses|account|head)\b/g, '').trim();
  }

  private similarity(a: string, b: string) {
    if (!a || !b) return 0;
    const setA = new Set(a.split(/\s+/));
    const setB = new Set(b.split(/\s+/));
    const intersection = [...setA].filter((x) => setB.has(x)).length;
    const union = new Set([...setA, ...setB]).size;
    return union ? intersection / union : 0;
  }

  private suggestCategory(name: string) {
    const text = name.toLowerCase();
    if (text.includes('tax') || text.includes('withholding')) return 'Tax';
    if (text.includes('sale') || text.includes('income')) return 'Income';
    if (text.includes('cash') || text.includes('bank') || text.includes('advance')) return 'Asset';
    if (text.includes('payable') || text.includes('loan')) return 'Liability';
    return 'Expense';
  }

  private isTaxSensitive(name: string) {
    const text = name.toLowerCase();
    return ['tax', 'withholding', 'salary', 'loan', 'advance income', 'sales tax'].some((word) => text.includes(word));
  }

  private naturalBalance(type: AccountType, debit: number, credit: number) {
    return type === 'ASSET' || type === 'EXPENSE' ? debit - credit : credit - debit;
  }

  private async balanceByAccountCode(businessId: string, code: string) {
    const account = await this.prisma.account.findUnique({ where: { businessId_code: { businessId, code } } });
    if (!account) return 0;
    const lines = await this.prisma.journalLine.findMany({ where: { accountId: account.id, journalEntry: { status: 'POSTED' } } });
    const debit = lines.reduce((sum, line) => sum + Number(line.debit), 0);
    const credit = lines.reduce((sum, line) => sum + Number(line.credit), 0);
    return this.naturalBalance(account.type, debit, credit);
  }

  private async findOrCreateCustomer(businessId: string, name: string) {
    const existing = await this.prisma.customer.findFirst({ where: { businessId, name: { equals: name, mode: 'insensitive' } } });
    return existing || this.prisma.customer.create({ data: { businessId, name } });
  }

  private async findOrCreateVendor(businessId: string, name: string) {
    const existing = await this.prisma.vendor.findFirst({ where: { businessId, name: { equals: name, mode: 'insensitive' } } });
    return existing || this.prisma.vendor.create({ data: { businessId, name } });
  }

  private async nextAccountCode(businessId: string, type: AccountType) {
    const ranges: Record<AccountType, number> = { ASSET: 1800, LIABILITY: 2400, EQUITY: 3300, INCOME: 4400, EXPENSE: 7000 };
    const base = ranges[type];
    const existing = await this.prisma.account.findMany({ where: { businessId, type }, select: { code: true } });
    const codes = existing.map((a) => Number(a.code)).filter(Number.isFinite);
    let next = base;
    while (codes.includes(next)) next += 10;
    return String(next);
  }

  private async log(userId: string, businessId: string, action: string, entityType: string, entityId: string, afterJson?: unknown) {
    await this.prisma.auditLog.create({ data: { userId, businessId, action, entityType, entityId, afterJson: afterJson as object } });
  }
}
