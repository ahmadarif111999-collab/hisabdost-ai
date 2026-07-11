import { BadRequestException, Injectable } from '@nestjs/common';
import { Account, AccountType } from '@prisma/client';
import { endOfMonth, formatISO, startOfMonth } from 'date-fns';
import { BusinessesService } from '../businesses/businesses.service';
import { PeriodsService } from '../periods/periods.service';
import { PrismaService } from '../../prisma/prisma.service';
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

@Injectable()
export class AccountingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly businesses: BusinessesService,
    private readonly periods: PeriodsService,
  ) {}

  async accounts(userId: string, businessId: string) {
    await this.businesses.getAccessibleBusiness(userId, businessId);

    return this.prisma.account.findMany({
      where: {
        businessId,
        isActive: true,
      },
      orderBy: {
        code: 'asc',
      },
    });
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

      await this.log(
        userId,
        businessId,
        'ACCOUNT_HEAD_REQUEST_CREATED',
        'AccountHeadRequest',
        request.id,
        request,
      );

      return {
        message: similar
          ? `Similar account exists (${similar.name}). Request sent to firm for review.`
          : 'Account head request sent to firm for approval.',
        requiresFirmApproval: true,
        request,
        similarAccount: similar,
      };
    }

    if (similar) {
      throw new BadRequestException(`Similar account already exists: ${similar.name}`);
    }

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

    return {
      message: 'Account head created',
      account,
    };
  }

  async createSale(userId: string, businessId: string, dto: CreateSaleDto) {
    await this.businesses.getAccessibleBusiness(userId, businessId);

    const entryDate = dto.date ? new Date(dto.date) : new Date();
    const period = await this.periods.ensurePostingAllowed(userId, businessId, entryDate);

    const accounts = await this.getAccountsMap(businessId);
    const paymentMethod = dto.paymentMethod || 'cash';

    const debitAccount =
      paymentMethod === 'credit' ? accounts['1100'] : this.paymentAccount(accounts, paymentMethod);

    const salesAccount = dto.accountCode ? accounts[dto.accountCode] : accounts['4000'];

    if (!debitAccount || !salesAccount) {
      throw new BadRequestException('Default accounts missing');
    }

    if (salesAccount.type !== 'INCOME') {
      throw new BadRequestException('Sale account must be an income account');
    }

    const customer = dto.customerName
      ? await this.findOrCreateCustomer(businessId, dto.customerName)
      : null;

    const entry = await this.prisma.journalEntry.create({
      data: {
        businessId,
        accountingPeriodId: period.id,
        entryDate,
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
      include: {
        accountingPeriod: true,
        lines: {
          include: {
            account: true,
          },
        },
      },
    });

    return {
      message: `Sale recorded in ${period.label}`,
      entry,
    };
  }

  async createPurchase(userId: string, businessId: string, dto: CreatePurchaseDto) {
    await this.businesses.getAccessibleBusiness(userId, businessId);

    const entryDate = dto.date ? new Date(dto.date) : new Date();
    const period = await this.periods.ensurePostingAllowed(userId, businessId, entryDate);

    const accounts = await this.getAccountsMap(businessId);
    const paymentMethod = dto.paymentMethod || 'cash';

    const creditAccount =
      paymentMethod === 'payable' ? accounts['2000'] : this.paymentAccount(accounts, paymentMethod);

    const purchaseAccount = dto.accountCode ? accounts[dto.accountCode] : accounts['5000'];

    if (!creditAccount || !purchaseAccount) {
      throw new BadRequestException('Default accounts missing');
    }

    if (purchaseAccount.type !== 'EXPENSE' && purchaseAccount.type !== 'ASSET') {
      throw new BadRequestException('Purchase account must be expense or asset');
    }

    const vendor = dto.vendorName ? await this.findOrCreateVendor(businessId, dto.vendorName) : null;

    const purchase = await this.prisma.expense.create({
      data: {
        businessId,
        vendorId: vendor?.id,
        kind: 'purchase',
        expenseDate: entryDate,
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
        accountingPeriodId: period.id,
        entryDate,
        sourceType: 'purchase',
        sourceId: purchase.id,
        narration: dto.description || `Purchase recorded via ${paymentMethod}`,
        createdById: userId,
        lines: {
          create: [
            {
              accountId: purchaseAccount.id,
              debit: dto.amount,
              credit: 0,
              partyType: vendor ? 'vendor' : undefined,
              partyId: vendor?.id,
              description: dto.description,
            },
            {
              accountId: creditAccount.id,
              debit: 0,
              credit: dto.amount,
              partyType: vendor ? 'vendor' : undefined,
              partyId: vendor?.id,
              description: dto.description,
            },
          ],
        },
      },
      include: {
        accountingPeriod: true,
        lines: {
          include: {
            account: true,
          },
        },
      },
    });

    return {
      message: `Purchase recorded in ${period.label}`,
      purchase,
      entry,
    };
  }

  async createExpense(userId: string, businessId: string, dto: CreateExpenseDto) {
    await this.businesses.getAccessibleBusiness(userId, businessId);

    const entryDate = dto.date ? new Date(dto.date) : new Date();
    const period = await this.periods.ensurePostingAllowed(userId, businessId, entryDate);

    const accounts = await this.getAccountsMap(businessId);
    const paymentMethod = dto.paymentMethod || 'cash';

    const creditAccount =
      paymentMethod === 'payable' ? accounts['2000'] : this.paymentAccount(accounts, paymentMethod);

    const expenseAccount = dto.accountCode
      ? accounts[dto.accountCode]
      : this.findExpenseAccount(accounts, dto.category || dto.description || 'office');

    if (!creditAccount || !expenseAccount) {
      throw new BadRequestException('Default accounts missing');
    }

    if (expenseAccount.type !== 'EXPENSE') {
      throw new BadRequestException('Expense account must be an expense account');
    }

    const vendor = dto.vendorName ? await this.findOrCreateVendor(businessId, dto.vendorName) : null;

    const expense = await this.prisma.expense.create({
      data: {
        businessId,
        vendorId: vendor?.id,
        kind: 'expense',
        expenseDate: entryDate,
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
        accountingPeriodId: period.id,
        entryDate,
        sourceType: 'expense',
        sourceId: expense.id,
        narration: dto.description || `${expenseAccount.name} recorded via ${paymentMethod}`,
        createdById: userId,
        lines: {
          create: [
            {
              accountId: expenseAccount.id,
              debit: dto.amount,
              credit: 0,
              partyType: vendor ? 'vendor' : undefined,
              partyId: vendor?.id,
              description: dto.description,
            },
            {
              accountId: creditAccount.id,
              debit: 0,
              credit: dto.amount,
              partyType: vendor ? 'vendor' : undefined,
              partyId: vendor?.id,
              description: dto.description,
            },
          ],
        },
      },
      include: {
        accountingPeriod: true,
        lines: {
          include: {
            account: true,
          },
        },
      },
    });

    return {
      message: `Expense recorded in ${period.label}`,
      expense,
      entry,
    };
  }

  async receivePayment(userId: string, businessId: string, dto: CreatePaymentDto) {
    await this.businesses.getAccessibleBusiness(userId, businessId);

    const entryDate = dto.date ? new Date(dto.date) : new Date();
    const period = await this.periods.ensurePostingAllowed(userId, businessId, entryDate);

    const accounts = await this.getAccountsMap(businessId);
    const debitAccount = this.paymentAccount(accounts, dto.paymentMethod);
    const receivableAccount = accounts['1100'];

    if (!debitAccount || !receivableAccount) {
      throw new BadRequestException('Default accounts missing');
    }

    const customer = dto.partyId
      ? null
      : dto.partyName
        ? await this.findOrCreateCustomer(businessId, dto.partyName)
        : null;

    const payment = await this.prisma.payment.create({
      data: {
        businessId,
        direction: 'received',
        partyType: 'customer',
        partyId: dto.partyId || customer?.id,
        amount: dto.amount,
        paymentMethod: dto.paymentMethod,
        paymentAccountId: debitAccount.id,
        paymentDate: entryDate,
        notes: dto.notes,
      },
    });

    const entry = await this.prisma.journalEntry.create({
      data: {
        businessId,
        accountingPeriodId: period.id,
        entryDate,
        sourceType: 'customer_payment',
        sourceId: payment.id,
        narration: dto.notes || 'Customer payment received',
        createdById: userId,
        lines: {
          create: [
            {
              accountId: debitAccount.id,
              debit: dto.amount,
              credit: 0,
              partyType: 'customer',
              partyId: dto.partyId || customer?.id,
            },
            {
              accountId: receivableAccount.id,
              debit: 0,
              credit: dto.amount,
              partyType: 'customer',
              partyId: dto.partyId || customer?.id,
            },
          ],
        },
      },
      include: {
        accountingPeriod: true,
        lines: {
          include: {
            account: true,
          },
        },
      },
    });

    return {
      message: `Customer payment recorded in ${period.label}`,
      payment,
      entry,
    };
  }

  async paySupplier(userId: string, businessId: string, dto: CreatePaymentDto) {
    await this.businesses.getAccessibleBusiness(userId, businessId);

    const entryDate = dto.date ? new Date(dto.date) : new Date();
    const period = await this.periods.ensurePostingAllowed(userId, businessId, entryDate);

    const accounts = await this.getAccountsMap(businessId);
    const creditAccount = this.paymentAccount(accounts, dto.paymentMethod);
    const payableAccount = accounts['2000'];

    if (!creditAccount || !payableAccount) {
      throw new BadRequestException('Default accounts missing');
    }

    const vendor = dto.partyId
      ? null
      : dto.partyName
        ? await this.findOrCreateVendor(businessId, dto.partyName)
        : null;

    const payment = await this.prisma.payment.create({
      data: {
        businessId,
        direction: 'paid',
        partyType: 'vendor',
        partyId: dto.partyId || vendor?.id,
        amount: dto.amount,
        paymentMethod: dto.paymentMethod,
        paymentAccountId: creditAccount.id,
        paymentDate: entryDate,
        notes: dto.notes,
      },
    });

    const entry = await this.prisma.journalEntry.create({
      data: {
        businessId,
        accountingPeriodId: period.id,
        entryDate,
        sourceType: 'supplier_payment',
        sourceId: payment.id,
        narration: dto.notes || 'Supplier payment made',
        createdById: userId,
        lines: {
          create: [
            {
              accountId: payableAccount.id,
              debit: dto.amount,
              credit: 0,
              partyType: 'vendor',
              partyId: dto.partyId || vendor?.id,
            },
            {
              accountId: creditAccount.id,
              debit: 0,
              credit: dto.amount,
              partyType: 'vendor',
              partyId: dto.partyId || vendor?.id,
            },
          ],
        },
      },
      include: {
        accountingPeriod: true,
        lines: {
          include: {
            account: true,
          },
        },
      },
    });

    return {
      message: `Supplier payment recorded in ${period.label}`,
      payment,
      entry,
    };
  }

  async createJournalEntry(userId: string, businessId: string, dto: CreateJournalEntryDto) {
    await this.businesses.getAccessibleBusiness(userId, businessId);

    const entryDate = dto.date ? new Date(dto.date) : new Date();
    const period = await this.periods.ensurePostingAllowed(userId, businessId, entryDate);

    if (!dto.lines?.length || dto.lines.length < 2) {
      throw new BadRequestException('Journal entry needs at least two lines');
    }

    const debitTotal = dto.lines.reduce((sum, line) => sum + Number(line.debit || 0), 0);
    const creditTotal = dto.lines.reduce((sum, line) => sum + Number(line.credit || 0), 0);

    if (Math.abs(debitTotal - creditTotal) > 0.001) {
      throw new BadRequestException('Debits and credits must be equal');
    }

    const entry = await this.prisma.journalEntry.create({
      data: {
        businessId,
        accountingPeriodId: period.id,
        entryDate,
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
      include: {
        accountingPeriod: true,
        lines: {
          include: {
            account: true,
          },
        },
      },
    });

    await this.log(userId, businessId, 'MANUAL_JOURNAL_CREATED', 'JournalEntry', entry.id, {
      narration: dto.narration,
      debitTotal,
      creditTotal,
      period: period.label,
    });

    return {
      message: `Manual journal posted in ${period.label}`,
      entry,
    };
  }

  async dashboard(userId: string, businessId: string) {
    await this.businesses.getAccessibleBusiness(userId, businessId);

    const from = startOfMonth(new Date());
    const to = endOfMonth(new Date());

    const profitLoss = await this.profitLoss(userId, businessId, from.toISOString(), to.toISOString());
    const purchaseReport = await this.purchaseSummary(
      userId,
      businessId,
      from.toISOString(),
      to.toISOString(),
    );

    const receivables = await this.balanceByAccountCode(businessId, '1100');
    const payables = await this.balanceByAccountCode(businessId, '2000');
    const cash = await this.balanceByAccountCode(businessId, '1000');
    const bank = await this.balanceByAccountCode(businessId, '1010');
    const wallet = await this.balanceByAccountCode(businessId, '1020');

    const missingDocs = await this.prisma.expense.count({
      where: {
        businessId,
        documentId: null,
      },
    });

    return {
      period: {
        from: formatISO(from),
        to: formatISO(to),
      },
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

    const byAccount: Record<
      string,
      {
        code: string;
        account: string;
        type: AccountType;
        amount: number;
      }
    > = {};

    for (const line of lines) {
      const debit = Number(line.debit);
      const credit = Number(line.credit);
      const key = line.account.code;
      const signedAmount = line.account.type === 'INCOME' ? credit - debit : debit - credit;

      byAccount[key] ||= {
        code: line.account.code,
        account: line.account.name,
        type: line.account.type,
        amount: 0,
      };

      byAccount[key].amount += signedAmount;
    }

    const rows = Object.values(byAccount)
      .filter((row) => Math.abs(row.amount) > 0.0001)
      .sort((a, b) => a.code.localeCompare(b.code));

    const totalIncome = rows
      .filter((row) => row.type === 'INCOME')
      .reduce((sum, row) => sum + row.amount, 0);

    const totalExpenses = rows
      .filter((row) => row.type === 'EXPENSE')
      .reduce((sum, row) => sum + row.amount, 0);

    return {
      rows,
      totalIncome,
      totalExpenses,
      netProfit: totalIncome - totalExpenses,
    };
  }

  async balanceSheet(userId: string, businessId: string) {
    await this.businesses.getAccessibleBusiness(userId, businessId);

    const trial = await this.trialBalance(userId, businessId);
    const rows = trial.rows.filter((row) => ['ASSET', 'LIABILITY', 'EQUITY'].includes(row.type));

    return {
      assets: rows.filter((row) => row.type === 'ASSET'),
      liabilities: rows.filter((row) => row.type === 'LIABILITY'),
      equity: rows.filter((row) => row.type === 'EQUITY'),
      totalAssets: rows
        .filter((row) => row.type === 'ASSET')
        .reduce((sum, row) => sum + row.balance, 0),
      totalLiabilities: rows
        .filter((row) => row.type === 'LIABILITY')
        .reduce((sum, row) => sum + row.balance, 0),
      totalEquity: rows
        .filter((row) => row.type === 'EQUITY')
        .reduce((sum, row) => sum + row.balance, 0),
    };
  }

  async trialBalance(userId: string, businessId: string) {
    await this.businesses.getAccessibleBusiness(userId, businessId);

    const accounts = await this.prisma.account.findMany({
      where: {
        businessId,
        isActive: true,
      },
      orderBy: {
        code: 'asc',
      },
    });

    const rows: Array<{
      id: string;
      code: string;
      account: string;
      type: AccountType;
      debit: number;
      credit: number;
      balance: number;
    }> = [];

    for (const account of accounts) {
      const lines = await this.prisma.journalLine.findMany({
        where: {
          accountId: account.id,
          journalEntry: {
            status: 'POSTED',
          },
        },
      });

      const debit = lines.reduce((sum, line) => sum + Number(line.debit), 0);
      const credit = lines.reduce((sum, line) => sum + Number(line.credit), 0);
      const balance = this.naturalBalance(account.type, debit, credit);

      if (Math.abs(debit) > 0.001 || Math.abs(credit) > 0.001) {
        rows.push({
          id: account.id,
          code: account.code,
          account: account.name,
          type: account.type,
          debit,
          credit,
          balance,
        });
      }
    }

    return {
      rows,
      totalDebit: rows.reduce((sum, row) => sum + row.debit, 0),
      totalCredit: rows.reduce((sum, row) => sum + row.credit, 0),
    };
  }

  async ledger(userId: string, businessId: string, accountIdOrCode: string) {
    await this.businesses.getAccessibleBusiness(userId, businessId);

    const account = await this.prisma.account.findFirst({
      where: {
        businessId,
        OR: [{ id: accountIdOrCode }, { code: accountIdOrCode }],
      },
    });

    if (!account) {
      throw new BadRequestException('Account not found');
    }

    const lines = await this.prisma.journalLine.findMany({
      where: {
        accountId: account.id,
        journalEntry: {
          status: 'POSTED',
        },
      },
      include: {
        journalEntry: true,
      },
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

    return {
      account,
      rows,
      closingBalance: running,
    };
  }

  async salesReport(userId: string, businessId: string) {
    await this.businesses.getAccessibleBusiness(userId, businessId);

    return this.prisma.journalEntry.findMany({
      where: {
        businessId,
        sourceType: {
          in: ['sale', 'invoice'],
        },
      },
      include: {
        accountingPeriod: true,
        lines: {
          include: {
            account: true,
          },
        },
      },
      orderBy: {
        entryDate: 'desc',
      },
      take: 100,
    });
  }

  async purchaseSummary(userId: string, businessId: string, from?: string, to?: string) {
    await this.businesses.getAccessibleBusiness(userId, businessId);

    const purchases = await this.prisma.expense.findMany({
      where: {
        businessId,
        kind: 'purchase',
        ...(from || to
          ? {
              expenseDate: {
                ...(from ? { gte: new Date(from) } : {}),
                ...(to ? { lte: new Date(to) } : {}),
              },
            }
          : {}),
      },
      orderBy: {
        expenseDate: 'desc',
      },
      take: 100,
    });

    return {
      purchases,
      totalPurchases: purchases.reduce((sum, purchase) => sum + Number(purchase.amount), 0),
    };
  }

  async expensesReport(userId: string, businessId: string) {
    await this.businesses.getAccessibleBusiness(userId, businessId);

    return this.prisma.expense.findMany({
      where: {
        businessId,
        kind: 'expense',
      },
      orderBy: {
        expenseDate: 'desc',
      },
      take: 100,
    });
  }

  async receivables(userId: string, businessId: string) {
    await this.businesses.getAccessibleBusiness(userId, businessId);

    const ledger = await this.ledger(userId, businessId, '1100');

    return {
      total: ledger.closingBalance,
      rows: ledger.rows.slice(-100).reverse(),
    };
  }

  async payables(userId: string, businessId: string) {
    await this.businesses.getAccessibleBusiness(userId, businessId);

    const ledger = await this.ledger(userId, businessId, '2000');

    return {
      total: ledger.closingBalance,
      rows: ledger.rows.slice(-100).reverse(),
    };
  }

  async missingDocuments(userId: string, businessId: string) {
    await this.businesses.getAccessibleBusiness(userId, businessId);

    const items = await this.prisma.expense.findMany({
      where: {
        businessId,
        documentId: null,
      },
      orderBy: {
        expenseDate: 'desc',
      },
      take: 100,
    });

    return {
      count: items.length,
      items,
    };
  }

  async cashBankReport(userId: string, businessId: string, from?: string, to?: string) {
    await this.businesses.getAccessibleBusiness(userId, businessId);

    const cashBankAccounts = await this.prisma.account.findMany({
      where: {
        businessId,
        isActive: true,
        type: 'ASSET',
        OR: [
          { code: { in: ['1000', '1010', '1020'] } },
          { name: { contains: 'cash', mode: 'insensitive' } },
          { name: { contains: 'bank', mode: 'insensitive' } },
          { name: { contains: 'wallet', mode: 'insensitive' } },
          { name: { contains: 'easypaisa', mode: 'insensitive' } },
          { name: { contains: 'jazzcash', mode: 'insensitive' } },
        ],
      },
      orderBy: {
        code: 'asc',
      },
    });

    const rows: Array<{
      accountId: string;
      code: string;
      account: string;
      type: AccountType;
      debit: number;
      credit: number;
      balance: number;
    }> = [];

    for (const account of cashBankAccounts) {
      const lines = await this.prisma.journalLine.findMany({
        where: {
          accountId: account.id,
          journalEntry: {
            status: 'POSTED',
            ...(from || to
              ? {
                  entryDate: {
                    ...(from ? { gte: new Date(from) } : {}),
                    ...(to ? { lte: new Date(to) } : {}),
                  },
                }
              : {}),
          },
        },
      });

      const debit = lines.reduce((sum, line) => sum + Number(line.debit || 0), 0);
      const credit = lines.reduce((sum, line) => sum + Number(line.credit || 0), 0);
      const balance = this.naturalBalance(account.type, debit, credit);

      rows.push({
        accountId: account.id,
        code: account.code,
        account: account.name,
        type: account.type,
        debit,
        credit,
        balance,
      });
    }

    return {
      from: from || null,
      to: to || null,
      rows,
      totalDebit: rows.reduce((sum, row) => sum + row.debit, 0),
      totalCredit: rows.reduce((sum, row) => sum + row.credit, 0),
      closingBalance: rows.reduce((sum, row) => sum + row.balance, 0),
    };
  }

  async taxSummary(userId: string, businessId: string, from?: string, to?: string) {
    await this.businesses.getAccessibleBusiness(userId, businessId);

    const taxAccounts = await this.prisma.account.findMany({
      where: {
        businessId,
        isActive: true,
        OR: [
          { name: { contains: 'tax', mode: 'insensitive' } },
          { name: { contains: 'withholding', mode: 'insensitive' } },
          { name: { contains: 'advance income', mode: 'insensitive' } },
          { name: { contains: 'sales tax', mode: 'insensitive' } },
          { name: { contains: 'income tax', mode: 'insensitive' } },
        ],
      },
      orderBy: {
        code: 'asc',
      },
    });

    const rows: Array<{
      accountId: string;
      code: string;
      account: string;
      type: AccountType;
      debit: number;
      credit: number;
      balance: number;
    }> = [];

    for (const account of taxAccounts) {
      const lines = await this.prisma.journalLine.findMany({
        where: {
          accountId: account.id,
          journalEntry: {
            status: 'POSTED',
            ...(from || to
              ? {
                  entryDate: {
                    ...(from ? { gte: new Date(from) } : {}),
                    ...(to ? { lte: new Date(to) } : {}),
                  },
                }
              : {}),
          },
        },
      });

      const debit = lines.reduce((sum, line) => sum + Number(line.debit || 0), 0);
      const credit = lines.reduce((sum, line) => sum + Number(line.credit || 0), 0);
      const balance = this.naturalBalance(account.type, debit, credit);

      rows.push({
        accountId: account.id,
        code: account.code,
        account: account.name,
        type: account.type,
        debit,
        credit,
        balance,
      });
    }

    return {
      from: from || null,
      to: to || null,
      rows,
      totalDebit: rows.reduce((sum, row) => sum + row.debit, 0),
      totalCredit: rows.reduce((sum, row) => sum + row.credit, 0),
      netTaxBalance: rows.reduce((sum, row) => sum + row.balance, 0),
    };
  }

  async accountUsageReport(userId: string, businessId: string) {
    await this.businesses.getAccessibleBusiness(userId, businessId);

    const accounts = await this.prisma.account.findMany({
      where: {
        businessId,
        isActive: true,
      },
      orderBy: {
        code: 'asc',
      },
    });

    const rows: Array<{
      accountId: string;
      code: string;
      account: string;
      type: AccountType;
      isSystem: boolean;
      requiresReview: boolean;
      entriesCount: number;
      debit: number;
      credit: number;
      balance: number;
      used: boolean;
    }> = [];

    for (const account of accounts) {
      const lines = await this.prisma.journalLine.findMany({
        where: {
          accountId: account.id,
          journalEntry: {
            status: 'POSTED',
          },
        },
      });

      const debit = lines.reduce((sum, line) => sum + Number(line.debit || 0), 0);
      const credit = lines.reduce((sum, line) => sum + Number(line.credit || 0), 0);
      const balance = this.naturalBalance(account.type, debit, credit);

      rows.push({
        accountId: account.id,
        code: account.code,
        account: account.name,
        type: account.type,
        isSystem: account.isSystem,
        requiresReview: account.requiresReview,
        entriesCount: lines.length,
        debit,
        credit,
        balance,
        used: lines.length > 0,
      });
    }

    return {
      totalAccounts: rows.length,
      usedAccounts: rows.filter((row) => row.used).length,
      unusedAccounts: rows.filter((row) => !row.used).length,
      reviewAccounts: rows.filter((row) => row.requiresReview).length,
      rows,
    };
  }

  async monthlyClosingReport(userId: string, businessId: string) {
    await this.businesses.getAccessibleBusiness(userId, businessId);

    const from = startOfMonth(new Date());
    const to = endOfMonth(new Date());

    const profitLoss = await this.profitLoss(
      userId,
      businessId,
      from.toISOString(),
      to.toISOString(),
    );

    const trialBalance = await this.trialBalance(userId, businessId);

    const cashBank = await this.cashBankReport(
      userId,
      businessId,
      from.toISOString(),
      to.toISOString(),
    );

    const missingDocs = await this.missingDocuments(userId, businessId);

    const totalDebit = trialBalance.totalDebit;
    const totalCredit = trialBalance.totalCredit;
    const trialBalanceDifference = Math.round((totalDebit - totalCredit) * 100) / 100;

    return {
      period: {
        from: from.toISOString(),
        to: to.toISOString(),
      },
      checks: {
        trialBalanceBalanced: Math.abs(trialBalanceDifference) < 0.01,
        trialBalanceDifference,
        missingDocumentsCount: missingDocs.count,
      },
      summary: {
        totalIncome: profitLoss.totalIncome,
        totalExpenses: profitLoss.totalExpenses,
        netProfit: profitLoss.netProfit,
        cashBankClosingBalance: cashBank.closingBalance,
      },
      trialBalance,
      cashBank,
      missingDocuments: missingDocs,
    };
  }

  async previewReport(userId: string, businessId: string, dto: ExportReportDto) {
    await this.ensureCanViewReports(userId, businessId);

    const report = await this.buildReport(userId, businessId, dto);

    return {
      ...report,
      filters: this.cleanReportFilters(dto),
      note: 'Preview only. Export requires permission or firm approval.',
    };
  }

  async exportReport(userId: string, businessId: string, dto: ExportReportDto) {
    await this.ensureCanExportReports(userId, businessId);

    const report = await this.buildReport(userId, businessId, dto);
    const business = await this.businesses.getAccessibleBusiness(userId, businessId);

    await this.prisma.reportExportLog.create({
      data: {
        organizationId: business.organizationId,
        businessId,
        userId,
        reportType: dto.reportType,
        format: dto.format,
        dateFrom: dto.from ? new Date(dto.from) : null,
        dateTo: dto.to ? new Date(dto.to) : null,
        selectedHeadsJson: dto.accountCodes || dto.accountIds || [],
        filtersJson: this.cleanReportFilters(dto) as any,
        filename: `${dto.reportType}-${Date.now()}.${dto.format}`,
      },
    });

    return {
      message: 'Report export generated',
      report,
    };
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
        selectedHeadsJson: dto.accountCodes || dto.accountIds || [],
        filtersJson: this.cleanReportFilters(dto) as any,
        reason: dto.reason,
        status: 'pending',
      },
    });

    return {
      message: 'Report export request sent to firm for approval.',
      request,
    };
  }

  private async buildReport(userId: string, businessId: string, dto: ExportReportDto) {
    switch (dto.reportType) {
      case 'profit-loss':
        return this.profitLoss(userId, businessId, dto.from, dto.to);

      case 'balance-sheet':
        return this.balanceSheet(userId, businessId);

      case 'trial-balance':
        return this.trialBalance(userId, businessId);

      case 'sales':
        return this.salesReport(userId, businessId);

      case 'purchases':
        return this.purchaseSummary(userId, businessId, dto.from, dto.to);

      case 'expenses':
        return this.expensesReport(userId, businessId);

      case 'receivables':
        return this.receivables(userId, businessId);

      case 'payables':
        return this.payables(userId, businessId);

      case 'missing-documents':
        return this.missingDocuments(userId, businessId);

      default:
        throw new BadRequestException(`Unsupported report type: ${dto.reportType}`);
    }
  }

  private cleanReportFilters(dto: ExportReportDto | RequestReportExportDto) {
    return {
      reportType: dto.reportType,
      format: dto.format,
      from: dto.from,
      to: dto.to,
      accountCodes: dto.accountCodes,
      accountIds: dto.accountIds,
      customerId: dto.customerId,
      vendorId: dto.vendorId,
      paymentStatus: dto.paymentStatus,
      documentStatus: dto.documentStatus,
      approvalStatus: dto.approvalStatus,
      minAmount: dto.minAmount,
      maxAmount: dto.maxAmount,
    };
  }

  private async ensureCanViewReports(userId: string, businessId: string) {
    const access = await this.businesses.getUserAccessForBusiness(userId, businessId);

    if (access.firmMembership) {
      return access;
    }

    const role = access.clientMembership?.role || '';

    const permission = await this.prisma.reportPermission.findUnique({
      where: {
        businessId,
      },
    });

    if (!permission) {
      return access;
    }

    const allowed =
      (role === 'CLIENT_OWNER' && permission.allowClientOwnerViewReports) ||
      (role === 'CLIENT_MANAGER' && permission.allowClientManagerViewReports) ||
      (role === 'CLIENT_STAFF' && permission.allowClientStaffViewReports);

    if (!allowed) {
      throw new BadRequestException('You do not have permission to view reports.');
    }

    return access;
  }

  private async ensureCanExportReports(userId: string, businessId: string) {
    const access = await this.businesses.getUserAccessForBusiness(userId, businessId);

    if (access.firmMembership) {
      return access;
    }

    const role = access.clientMembership?.role || '';

    const permission = await this.prisma.reportPermission.findUnique({
      where: {
        businessId,
      },
    });

    if (!permission) {
      throw new BadRequestException('Report export requires firm approval.');
    }

    const allowed =
      (role === 'CLIENT_OWNER' && permission.allowClientOwnerExportReports) ||
      (role === 'CLIENT_MANAGER' && permission.allowClientManagerExportReports) ||
      (role === 'CLIENT_STAFF' && permission.allowClientStaffExportReports);

    if (!allowed) {
      throw new BadRequestException('Report export requires firm approval.');
    }

    return access;
  }

  private async financialLines(
    businessId: string,
    types: AccountType[],
    from?: string,
    to?: string,
  ) {
    return this.prisma.journalLine.findMany({
      where: {
        account: {
          businessId,
          type: {
            in: types,
          },
        },
        journalEntry: {
          status: 'POSTED',
          ...(from || to
            ? {
                entryDate: {
                  ...(from ? { gte: new Date(from) } : {}),
                  ...(to ? { lte: new Date(to) } : {}),
                },
              }
            : {}),
        },
      },
      include: {
        account: true,
        journalEntry: true,
      },
    });
  }

  private async balanceByAccountCode(businessId: string, code: string) {
    const account = await this.prisma.account.findUnique({
      where: {
        businessId_code: {
          businessId,
          code,
        },
      },
    });

    if (!account) {
      return 0;
    }

    const lines = await this.prisma.journalLine.findMany({
      where: {
        accountId: account.id,
        journalEntry: {
          status: 'POSTED',
        },
      },
    });

    const debit = lines.reduce((sum, line) => sum + Number(line.debit), 0);
    const credit = lines.reduce((sum, line) => sum + Number(line.credit), 0);

    return this.naturalBalance(account.type, debit, credit);
  }

  private naturalBalance(type: AccountType, debit: number, credit: number) {
    if (type === 'ASSET' || type === 'EXPENSE') {
      return debit - credit;
    }

    return credit - debit;
  }

  private async getAccountsMap(businessId: string) {
    const accounts = await this.prisma.account.findMany({
      where: {
        businessId,
        isActive: true,
      },
    });

    return accounts.reduce<Record<string, Account>>((map, account) => {
      map[account.code] = account;
      return map;
    }, {});
  }

  private paymentAccount(accounts: Record<string, Account>, paymentMethod: string) {
    if (paymentMethod === 'bank') return accounts['1010'];
    if (paymentMethod === 'wallet') return accounts['1020'];
    return accounts['1000'];
  }

  private findExpenseAccount(accounts: Record<string, Account>, text: string) {
    const normalized = text.toLowerCase();

    const match = Object.values(accounts).find((account) => {
      return account.type === 'EXPENSE' && normalized.includes(account.name.toLowerCase().split(' ')[0]);
    });

    return match || accounts['5600'] || accounts['6999'];
  }

  private async findOrCreateCustomer(businessId: string, name: string) {
    const existing = await this.prisma.customer.findFirst({
      where: {
        businessId,
        name: {
          equals: name,
          mode: 'insensitive',
        },
      },
    });

    if (existing) {
      return existing;
    }

    return this.prisma.customer.create({
      data: {
        businessId,
        name,
      },
    });
  }

  private async findOrCreateVendor(businessId: string, name: string) {
    const existing = await this.prisma.vendor.findFirst({
      where: {
        businessId,
        name: {
          equals: name,
          mode: 'insensitive',
        },
      },
    });

    if (existing) {
      return existing;
    }

    return this.prisma.vendor.create({
      data: {
        businessId,
        name,
      },
    });
  }

  private async findSimilarAccount(businessId: string, name: string) {
    const normalized = name.toLowerCase().trim();

    const accounts = await this.prisma.account.findMany({
      where: {
        businessId,
        isActive: true,
      },
    });

    return (
      accounts.find((account) => account.name.toLowerCase().trim() === normalized) ||
      accounts.find(
        (account) =>
          account.name.toLowerCase().includes(normalized) ||
          normalized.includes(account.name.toLowerCase()),
      ) ||
      null
    );
  }

  private async nextAccountCode(businessId: string, type: AccountType) {
    const bases: Record<AccountType, number> = {
      ASSET: 1000,
      LIABILITY: 2000,
      EQUITY: 3000,
      INCOME: 4000,
      EXPENSE: 5000,
    };

    const accounts = await this.prisma.account.findMany({
      where: {
        businessId,
        type,
      },
      select: {
        code: true,
      },
    });

    const used = new Set(accounts.map((account) => Number(account.code)).filter(Boolean));

    let code = bases[type] + 900;

    while (used.has(code)) {
      code += 10;
    }

    return String(code);
  }

  private suggestCategory(name: string) {
    const text = name.toLowerCase();

    if (text.includes('tax') || text.includes('withholding')) return 'Tax';
    if (text.includes('salary') || text.includes('wage')) return 'Payroll';
    if (text.includes('rent')) return 'Rent';
    if (text.includes('bank')) return 'Bank';
    if (text.includes('sale')) return 'Sales';
    if (text.includes('purchase')) return 'Purchases';

    return 'General';
  }

  private isTaxSensitive(name: string) {
    const text = name.toLowerCase();

    return ['tax', 'withholding', 'salary', 'loan', 'advance income', 'sales tax'].some((word) =>
      text.includes(word),
    );
  }

  private async log(
    userId: string,
    businessId: string,
    action: string,
    entityType: string,
    entityId: string,
    afterJson: any,
  ) {
    const business = await this.prisma.business.findUnique({
      where: {
        id: businessId,
      },
      select: {
        organizationId: true,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        organizationId: business?.organizationId,
        businessId,
        userId,
        action,
        entityType,
        entityId,
        afterJson: JSON.parse(JSON.stringify(afterJson)) as any,
      },
    });
  }
}
