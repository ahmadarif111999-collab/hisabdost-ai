import { Injectable } from '@nestjs/common';
import { AccountType } from '@prisma/client';
import { BusinessesService } from '../businesses/businesses.service';
import { PrismaService } from '../../prisma/prisma.service';
import { formatPakistanDate, formatPakistanDateTime, normalBalanceLabel } from '../../common/accounting-format.util';

type FinancialStatementFilterDto = {
  startDate?: string;
  endDate?: string;
  includeZeroBalances?: boolean;
};

type NormalizedFilter = {
  startDate: string;
  endDate: string;
  includeZeroBalances: boolean;
};

type StatementColumn = {
  key: string;
  label: string;
  align?: 'left' | 'right' | 'center';
};

type StatementSection = {
  title: string;
  columns: StatementColumn[];
  rows: Record<string, any>[];
  totals?: Record<string, any>;
  note?: string;
};

type Statement = {
  key: string;
  title: string;
  subtitle: string;
  sections: StatementSection[];
};

@Injectable()
export class FinancialStatementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly businesses: BusinessesService,
  ) {}

  async preview(userId: string, businessId: string, dto: FinancialStatementFilterDto) {
    const business = await this.businesses.getAccessibleBusiness(userId, businessId);

    const filters = this.normalizeFilters(
      dto,
      business.fiscalYearStartMonth || 7,
      business.fiscalYearStartDay || 1,
    );

    const profitLoss = await this.statementOfProfitOrLoss(business.name, businessId, filters);
    const financialPosition = await this.statementOfFinancialPosition(
      business.name,
      businessId,
      filters,
    );
    const cashFlows = await this.statementOfCashFlows(business.name, businessId, filters);
    const changesInEquity = await this.statementOfChangesInEquity(
      business.name,
      businessId,
      filters,
    );
    const notes = await this.notesToFinancialStatements(business.name, businessId, filters);

    return {
      title: 'Financial Statements',
      clientName: business.name,
      generatedAt: formatPakistanDateTime(new Date()),
      timezone: 'Asia/Karachi',
      filters: {
        startDate: filters.startDate,
        startDateDisplay: formatPakistanDate(filters.startDate),
        endDate: filters.endDate,
        endDateDisplay: formatPakistanDate(filters.endDate),
        includeZeroBalances: filters.includeZeroBalances,
      },
      statements: [financialPosition, profitLoss, cashFlows, changesInEquity, notes],
    };
  }

  private async statementOfProfitOrLoss(
    clientName: string,
    businessId: string,
    filters: NormalizedFilter,
  ): Promise<Statement> {
    const lines = await this.periodLines(businessId, filters.startDate, filters.endDate, [
      AccountType.INCOME,
      AccountType.EXPENSE,
    ]);

    const grouped = new Map<
      string,
      {
        code: string;
        account: string;
        type: AccountType;
        amount: number;
      }
    >();

    for (const line of lines) {
      if (line.journalEntry.sourceType === 'year_end_close') continue;

      const key = line.accountId;
      const signed = this.signedAmount(
        line.account.type,
        Number(line.debit || 0),
        Number(line.credit || 0),
      );

      const current =
        grouped.get(key) ||
        {
          code: line.account.code,
          account: line.account.name,
          type: line.account.type,
          amount: 0,
        };

      current.amount += signed;
      grouped.set(key, current);
    }

    const incomeRows = Array.from(grouped.values())
      .filter((row) => row.type === AccountType.INCOME)
      .filter((row) => filters.includeZeroBalances || Math.abs(row.amount) >= 0.01)
      .map((row) => ({
        code: row.code,
        account: row.account,
        amount: row.amount,
      }))
      .sort((a, b) => a.code.localeCompare(b.code));

    const expenseRows = Array.from(grouped.values())
      .filter((row) => row.type === AccountType.EXPENSE)
      .filter((row) => filters.includeZeroBalances || Math.abs(row.amount) >= 0.01)
      .map((row) => ({
        code: row.code,
        account: row.account,
        amount: Math.abs(row.amount),
      }))
      .sort((a, b) => a.code.localeCompare(b.code));

    const totalIncome = incomeRows.reduce((sum, row) => sum + row.amount, 0);
    const totalExpenses = expenseRows.reduce((sum, row) => sum + row.amount, 0);
    const profitBeforeTax = totalIncome - totalExpenses;

    return {
      key: 'profit-loss',
      title: 'Statement of Profit or Loss',
      subtitle: `${clientName} — From ${formatPakistanDate(filters.startDate)} to ${formatPakistanDate(
        filters.endDate,
      )}`,
      sections: [
        {
          title: 'Revenue',
          columns: [
            { key: 'code', label: 'Code' },
            { key: 'account', label: 'Account' },
            { key: 'amount', label: 'Amount', align: 'right' },
          ],
          rows: incomeRows,
          totals: {
            totalRevenue: totalIncome,
          },
        },
        {
          title: 'Expenses',
          columns: [
            { key: 'code', label: 'Code' },
            { key: 'account', label: 'Account' },
            { key: 'amount', label: 'Amount', align: 'right' },
          ],
          rows: expenseRows,
          totals: {
            totalExpenses,
          },
        },
        {
          title: 'Profit / Loss Summary',
          columns: [
            { key: 'description', label: 'Description' },
            { key: 'amount', label: 'Amount', align: 'right' },
          ],
          rows: [
            { description: 'Total revenue', amount: totalIncome },
            { description: 'Total expenses', amount: totalExpenses },
            { description: profitBeforeTax >= 0 ? 'Profit for the period' : 'Loss for the period', amount: profitBeforeTax },
          ],
        },
      ],
    };
  }

  private async statementOfFinancialPosition(
    clientName: string,
    businessId: string,
    filters: NormalizedFilter,
  ): Promise<Statement> {
    const balances = await this.accountBalances(businessId, filters.startDate, filters.endDate);
    const hasClosingEntry = await this.hasYearEndClose(businessId, filters.startDate, filters.endDate);
    const profitLossTotals = await this.profitLossTotals(businessId, filters.startDate, filters.endDate);

    const assets = balances
      .filter((row) => row.type === AccountType.ASSET)
      .filter((row) => filters.includeZeroBalances || Math.abs(row.closingBalance) >= 0.01)
      .map((row) => ({
        code: row.code,
        account: row.name,
        amount: Math.abs(row.closingBalance),
        side: normalBalanceLabel(row.type, row.closingBalance),
        signedBalance: row.closingBalance,
      }));

    const liabilities = balances
      .filter((row) => row.type === AccountType.LIABILITY)
      .filter((row) => filters.includeZeroBalances || Math.abs(row.closingBalance) >= 0.01)
      .map((row) => ({
        code: row.code,
        account: row.name,
        amount: Math.abs(row.closingBalance),
        side: normalBalanceLabel(row.type, row.closingBalance),
        signedBalance: row.closingBalance,
      }));

    const equity = balances
      .filter((row) => row.type === AccountType.EQUITY)
      .filter((row) => filters.includeZeroBalances || Math.abs(row.closingBalance) >= 0.01)
      .map((row) => ({
        code: row.code,
        account: row.name,
        amount: Math.abs(row.closingBalance),
        side: normalBalanceLabel(row.type, row.closingBalance),
        signedBalance: row.closingBalance,
      }));

    if (!hasClosingEntry && Math.abs(profitLossTotals.netProfit) >= 0.01) {
      equity.push({
        code: 'PL',
        account: profitLossTotals.netProfit >= 0 ? 'Current period profit' : 'Current period loss',
        amount: Math.abs(profitLossTotals.netProfit),
        side: profitLossTotals.netProfit >= 0 ? 'Credit' : 'Debit',
        signedBalance: profitLossTotals.netProfit,
      });
    }

    const totalAssets = assets.reduce((sum, row) => sum + row.signedBalance, 0);
    const totalLiabilities = liabilities.reduce((sum, row) => sum + row.signedBalance, 0);
    const totalEquity = equity.reduce((sum, row) => sum + row.signedBalance, 0);
    const balanceCheck = Math.round((totalAssets - totalLiabilities - totalEquity) * 100) / 100;

    return {
      key: 'financial-position',
      title: 'Statement of Financial Position',
      subtitle: `${clientName} — As at ${formatPakistanDate(filters.endDate)}`,
      sections: [
        {
          title: 'Assets',
          columns: [
            { key: 'code', label: 'Code' },
            { key: 'account', label: 'Account' },
            { key: 'amount', label: 'Amount', align: 'right' },
            { key: 'side', label: 'Side' },
          ],
          rows: assets,
          totals: {
            totalAssets,
          },
        },
        {
          title: 'Liabilities',
          columns: [
            { key: 'code', label: 'Code' },
            { key: 'account', label: 'Account' },
            { key: 'amount', label: 'Amount', align: 'right' },
            { key: 'side', label: 'Side' },
          ],
          rows: liabilities,
          totals: {
            totalLiabilities,
          },
        },
        {
          title: 'Equity',
          columns: [
            { key: 'code', label: 'Code' },
            { key: 'account', label: 'Account' },
            { key: 'amount', label: 'Amount', align: 'right' },
            { key: 'side', label: 'Side' },
          ],
          rows: equity,
          totals: {
            totalEquity,
            liabilitiesPlusEquity: totalLiabilities + totalEquity,
            balanceCheck,
          },
          note:
            hasClosingEntry
              ? 'Year-end closing entry is posted for this period.'
              : 'Current-period profit/loss is shown in equity because the year-end closing entry has not been posted yet.',
        },
      ],
    };
  }

  private async statementOfCashFlows(
    clientName: string,
    businessId: string,
    filters: NormalizedFilter,
  ): Promise<Statement> {
    const cashAccounts = await this.cashAccounts(businessId);
    const cashAccountIds = new Set(cashAccounts.map((account) => account.id));

    const openingCash = await this.balanceForAccountsBeforeDate(
      Array.from(cashAccountIds),
      filters.startDate,
    );

    const entries = await this.prisma.journalEntry.findMany({
      where: {
        businessId,
        status: 'POSTED',
        entryDate: {
          gte: new Date(filters.startDate),
          lte: this.endOfDay(filters.endDate),
        },
      },
      include: {
        lines: {
          include: {
            account: true,
          },
        },
      },
    });

    entries.sort((a, b) => {
      const dateA = new Date(a.entryDate).getTime();
      const dateB = new Date(b.entryDate).getTime();
      if (dateA !== dateB) return dateA - dateB;
      return a.id.localeCompare(b.id);
    });

    const rows = entries
      .map((entry) => {
        const cashMovement = entry.lines
          .filter((line) => cashAccountIds.has(line.accountId))
          .reduce((sum, line) => sum + Number(line.debit || 0) - Number(line.credit || 0), 0);

        if (Math.abs(cashMovement) < 0.01) return null;

        const nonCashAccounts = entry.lines
          .filter((line) => !cashAccountIds.has(line.accountId))
          .map((line) => line.account);

        return {
          date: formatPakistanDate(entry.entryDate),
          activity: entry.narration,
          category: this.classifyCashFlow(entry.sourceType, nonCashAccounts),
          cashInflow: cashMovement > 0 ? cashMovement : 0,
          cashOutflow: cashMovement < 0 ? Math.abs(cashMovement) : 0,
          netMovement: cashMovement,
        };
      })
      .filter(Boolean) as Record<string, any>[];

    const operatingRows = rows.filter((row) => row.category === 'Operating');
    const investingRows = rows.filter((row) => row.category === 'Investing');
    const financingRows = rows.filter((row) => row.category === 'Financing');

    const operatingNet = operatingRows.reduce((sum, row) => sum + row.netMovement, 0);
    const investingNet = investingRows.reduce((sum, row) => sum + row.netMovement, 0);
    const financingNet = financingRows.reduce((sum, row) => sum + row.netMovement, 0);
    const netIncrease = operatingNet + investingNet + financingNet;
    const closingCash = openingCash + netIncrease;

    const columns: StatementColumn[] = [
      { key: 'date', label: 'Date' },
      { key: 'activity', label: 'Activity' },
      { key: 'cashInflow', label: 'Cash Inflow', align: 'right' },
      { key: 'cashOutflow', label: 'Cash Outflow', align: 'right' },
      { key: 'netMovement', label: 'Net Movement', align: 'right' },
    ];

    return {
      key: 'cash-flows',
      title: 'Statement of Cash Flows',
      subtitle: `${clientName} — From ${formatPakistanDate(filters.startDate)} to ${formatPakistanDate(
        filters.endDate,
      )}`,
      sections: [
        {
          title: 'Operating Activities',
          columns,
          rows: operatingRows,
          totals: {
            netCashFromOperatingActivities: operatingNet,
          },
        },
        {
          title: 'Investing Activities',
          columns,
          rows: investingRows,
          totals: {
            netCashFromInvestingActivities: investingNet,
          },
        },
        {
          title: 'Financing Activities',
          columns,
          rows: financingRows,
          totals: {
            netCashFromFinancingActivities: financingNet,
          },
        },
        {
          title: 'Cash and Cash Equivalents Summary',
          columns: [
            { key: 'description', label: 'Description' },
            { key: 'amount', label: 'Amount', align: 'right' },
          ],
          rows: [
            { description: 'Opening cash and bank balance', amount: openingCash },
            { description: 'Net increase / decrease in cash', amount: netIncrease },
            { description: 'Closing cash and bank balance', amount: closingCash },
          ],
        },
      ],
    };
  }

  private async statementOfChangesInEquity(
    clientName: string,
    businessId: string,
    filters: NormalizedFilter,
  ): Promise<Statement> {
    const accounts = await this.prisma.account.findMany({
      where: {
        businessId,
        isActive: true,
        type: AccountType.EQUITY,
      },
      orderBy: {
        code: 'asc',
      },
    });

    const rows = [];

    for (const account of accounts) {
      const opening = await this.balanceForAccountBeforeDate(account.id, account.type, filters.startDate);
      const movement = await this.periodMovementForAccount(
        account.id,
        account.type,
        filters.startDate,
        filters.endDate,
      );

      const closing = opening + movement.netMovement;

      if (
        filters.includeZeroBalances ||
        Math.abs(opening) >= 0.01 ||
        Math.abs(movement.debit) >= 0.01 ||
        Math.abs(movement.credit) >= 0.01 ||
        Math.abs(closing) >= 0.01
      ) {
        rows.push({
          code: account.code,
          account: account.name,
          openingBalance: opening,
          debitMovement: movement.debit,
          creditMovement: movement.credit,
          closingBalance: closing,
          side: normalBalanceLabel(account.type, closing),
        });
      }
    }

    const profitLossTotals = await this.profitLossTotals(businessId, filters.startDate, filters.endDate);

    return {
      key: 'changes-in-equity',
      title: 'Statement of Changes in Equity',
      subtitle: `${clientName} — From ${formatPakistanDate(filters.startDate)} to ${formatPakistanDate(
        filters.endDate,
      )}`,
      sections: [
        {
          title: 'Equity Account Movement',
          columns: [
            { key: 'code', label: 'Code' },
            { key: 'account', label: 'Equity Account' },
            { key: 'openingBalance', label: 'Opening', align: 'right' },
            { key: 'debitMovement', label: 'Debit Movement', align: 'right' },
            { key: 'creditMovement', label: 'Credit Movement', align: 'right' },
            { key: 'closingBalance', label: 'Closing', align: 'right' },
            { key: 'side', label: 'Side' },
          ],
          rows,
          totals: {
            openingEquity: rows.reduce((sum, row) => sum + row.openingBalance, 0),
            debitMovement: rows.reduce((sum, row) => sum + row.debitMovement, 0),
            creditMovement: rows.reduce((sum, row) => sum + row.creditMovement, 0),
            closingEquity: rows.reduce((sum, row) => sum + row.closingBalance, 0),
          },
        },
        {
          title: 'Profit / Loss Transfer Summary',
          columns: [
            { key: 'description', label: 'Description' },
            { key: 'amount', label: 'Amount', align: 'right' },
          ],
          rows: [
            { description: 'Profit / loss for the period before year-end close', amount: profitLossTotals.netProfit },
          ],
          note:
            'When year-end close is posted, profit/loss is transferred into owner capital or retained earnings.',
        },
      ],
    };
  }

  private async notesToFinancialStatements(
    clientName: string,
    businessId: string,
    filters: NormalizedFilter,
  ): Promise<Statement> {
    const accounts = await this.prisma.account.findMany({
      where: {
        businessId,
        isActive: true,
      },
      orderBy: {
        code: 'asc',
      },
    });

    const taxAccounts = accounts.filter((account) =>
      /tax|withholding|advance income|sales tax|income tax/i.test(account.name),
    );

    const cashAccounts = accounts.filter((account) => this.isCashAccount(account));
    const ppeAccounts = accounts.filter((account) =>
      /fixed asset|property|plant|equipment|vehicle|furniture|computer|machinery/i.test(account.name),
    );

    const noteRows = [
      {
        noteNo: '1',
        title: 'Basis of preparation',
        description:
          'These financial statements are generated from posted journal entries in HisabDost AI for the selected client and period.',
      },
      {
        noteNo: '2',
        title: 'Reporting period',
        description: `The reporting period is from ${formatPakistanDate(filters.startDate)} to ${formatPakistanDate(
          filters.endDate,
        )}.`,
      },
      {
        noteNo: '3',
        title: 'Revenue recognition',
        description:
          'Revenue is presented from income accounts posted during the selected reporting period, excluding year-end closing entries.',
      },
      {
        noteNo: '4',
        title: 'Expense recognition',
        description:
          'Expenses are presented from expense accounts posted during the selected reporting period, excluding year-end closing entries.',
      },
      {
        noteNo: '5',
        title: 'Cash and bank',
        description: cashAccounts.length
          ? `Cash and bank balances include: ${cashAccounts.map((account) => `${account.code} ${account.name}`).join(', ')}.`
          : 'No cash or bank accounts were identified from the chart of accounts.',
      },
      {
        noteNo: '6',
        title: 'Property and equipment',
        description: ppeAccounts.length
          ? `Property/equipment related accounts identified: ${ppeAccounts
              .map((account) => `${account.code} ${account.name}`)
              .join(', ')}.`
          : 'No property/equipment accounts were identified from the chart of accounts.',
      },
      {
        noteNo: '7',
        title: 'Tax-sensitive accounts',
        description: taxAccounts.length
          ? `Tax-sensitive accounts include: ${taxAccounts
              .map((account) => `${account.code} ${account.name}`)
              .join(', ')}.`
          : 'No tax-sensitive accounts were identified from the chart of accounts.',
      },
      {
        noteNo: '8',
        title: 'System limitation',
        description:
          'These are beta financial statements. Accountant review is required before sharing with clients, banks, tax authorities, or regulators.',
      },
    ];

    return {
      key: 'notes',
      title: 'Notes to the Financial Statements',
      subtitle: `${clientName} — For the period ended ${formatPakistanDate(filters.endDate)}`,
      sections: [
        {
          title: 'Notes',
          columns: [
            { key: 'noteNo', label: 'Note' },
            { key: 'title', label: 'Title' },
            { key: 'description', label: 'Description' },
          ],
          rows: noteRows,
        },
      ],
    };
  }

  private async accountBalances(businessId: string, startDate: string, endDate: string) {
    const accounts = await this.prisma.account.findMany({
      where: {
        businessId,
        isActive: true,
      },
      orderBy: {
        code: 'asc',
      },
    });

    const end = this.endOfDay(endDate);

    const lines = await this.prisma.journalLine.findMany({
      where: {
        account: {
          businessId,
        },
        journalEntry: {
          status: 'POSTED',
          entryDate: {
            lte: end,
          },
        },
      },
      include: {
        account: true,
        journalEntry: true,
      },
    });

    return accounts.map((account) => {
      const accountLines = lines.filter((line) => line.accountId === account.id);

      const openingLines = accountLines.filter(
        (line) => new Date(line.journalEntry.entryDate) < new Date(startDate),
      );

      const periodLines = accountLines.filter(
        (line) =>
          new Date(line.journalEntry.entryDate) >= new Date(startDate) &&
          new Date(line.journalEntry.entryDate) <= end,
      );

      const openingBalance = openingLines.reduce(
        (sum, line) =>
          sum + this.signedAmount(account.type, Number(line.debit || 0), Number(line.credit || 0)),
        0,
      );

      const periodAmount = periodLines.reduce(
        (sum, line) =>
          sum + this.signedAmount(account.type, Number(line.debit || 0), Number(line.credit || 0)),
        0,
      );

      const periodDebit = periodLines.reduce((sum, line) => sum + Number(line.debit || 0), 0);
      const periodCredit = periodLines.reduce((sum, line) => sum + Number(line.credit || 0), 0);

      return {
        id: account.id,
        code: account.code,
        name: account.name,
        type: account.type,
        openingBalance,
        periodDebit,
        periodCredit,
        periodAmount,
        closingBalance: openingBalance + periodAmount,
      };
    });
  }

  private async periodLines(
    businessId: string,
    startDate: string,
    endDate: string,
    types: AccountType[],
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
          businessId,
          status: 'POSTED',
          entryDate: {
            gte: new Date(startDate),
            lte: this.endOfDay(endDate),
          },
        },
      },
      include: {
        account: true,
        journalEntry: true,
      },
    });
  }

  private async profitLossTotals(businessId: string, startDate: string, endDate: string) {
    const lines = await this.periodLines(businessId, startDate, endDate, [
      AccountType.INCOME,
      AccountType.EXPENSE,
    ]);

    let totalIncome = 0;
    let totalExpenses = 0;

    for (const line of lines) {
      if (line.journalEntry.sourceType === 'year_end_close') continue;

      const amount = this.signedAmount(
        line.account.type,
        Number(line.debit || 0),
        Number(line.credit || 0),
      );

      if (line.account.type === AccountType.INCOME) {
        totalIncome += amount;
      }

      if (line.account.type === AccountType.EXPENSE) {
        totalExpenses += amount;
      }
    }

    return {
      totalIncome,
      totalExpenses,
      netProfit: totalIncome - totalExpenses,
    };
  }

  private async hasYearEndClose(businessId: string, startDate: string, endDate: string) {
    const count = await this.prisma.journalEntry.count({
      where: {
        businessId,
        status: 'POSTED',
        sourceType: 'year_end_close',
        entryDate: {
          gte: new Date(startDate),
          lte: this.endOfDay(endDate),
        },
      },
    });

    return count > 0;
  }

  private async cashAccounts(businessId: string) {
    const accounts = await this.prisma.account.findMany({
      where: {
        businessId,
        isActive: true,
        type: AccountType.ASSET,
      },
      orderBy: {
        code: 'asc',
      },
    });

    return accounts.filter((account) => this.isCashAccount(account));
  }

  private isCashAccount(account: { code: string; name: string }) {
    return (
      ['1000', '1010', '1020'].includes(account.code) ||
      /cash|bank|wallet|easypaisa|jazzcash/i.test(account.name)
    );
  }

  private async balanceForAccountsBeforeDate(accountIds: string[], date: string) {
    if (!accountIds.length) return 0;

    const lines = await this.prisma.journalLine.findMany({
      where: {
        accountId: {
          in: accountIds,
        },
        journalEntry: {
          status: 'POSTED',
          entryDate: {
            lt: new Date(date),
          },
        },
      },
      include: {
        account: true,
      },
    });

    return lines.reduce((sum, line) => {
      return sum + this.signedAmount(line.account.type, Number(line.debit || 0), Number(line.credit || 0));
    }, 0);
  }

  private async balanceForAccountBeforeDate(accountId: string, type: AccountType, date: string) {
    const lines = await this.prisma.journalLine.findMany({
      where: {
        accountId,
        journalEntry: {
          status: 'POSTED',
          entryDate: {
            lt: new Date(date),
          },
        },
      },
    });

    return lines.reduce((sum, line) => {
      return sum + this.signedAmount(type, Number(line.debit || 0), Number(line.credit || 0));
    }, 0);
  }

  private async periodMovementForAccount(
    accountId: string,
    type: AccountType,
    startDate: string,
    endDate: string,
  ) {
    const lines = await this.prisma.journalLine.findMany({
      where: {
        accountId,
        journalEntry: {
          status: 'POSTED',
          entryDate: {
            gte: new Date(startDate),
            lte: this.endOfDay(endDate),
          },
        },
      },
    });

    const debit = lines.reduce((sum, line) => sum + Number(line.debit || 0), 0);
    const credit = lines.reduce((sum, line) => sum + Number(line.credit || 0), 0);

    return {
      debit,
      credit,
      netMovement: this.signedAmount(type, debit, credit),
    };
  }

  private classifyCashFlow(
    sourceType: string,
    nonCashAccounts: Array<{ name: string; type: AccountType }>,
  ) {
    const text = `${sourceType} ${nonCashAccounts.map((account) => account.name).join(' ')}`;

    if (/fixed asset|property|plant|equipment|vehicle|furniture|computer|machinery/i.test(text)) {
      return 'Investing';
    }

    if (/loan|capital|equity|drawing|dividend|owner|share/i.test(text)) {
      return 'Financing';
    }

    return 'Operating';
  }

  private normalizeFilters(
    dto: FinancialStatementFilterDto,
    fiscalYearStartMonth: number,
    fiscalYearStartDay: number,
  ): NormalizedFilter {
    const today = new Date();
    const defaultRange = this.periodRangeForDate(today, fiscalYearStartMonth, fiscalYearStartDay);

    return {
      startDate: dto.startDate || defaultRange.startDate.toISOString().slice(0, 10),
      endDate: dto.endDate || today.toISOString().slice(0, 10),
      includeZeroBalances: dto.includeZeroBalances ?? false,
    };
  }

  private periodRangeForDate(date: Date, fiscalYearStartMonth: number, fiscalYearStartDay: number) {
    const current = this.startOfUtcDate(date);

    let start = this.safeUtcDate(
      current.getUTCFullYear(),
      fiscalYearStartMonth,
      fiscalYearStartDay,
    );

    if (current < start) {
      start = this.safeUtcDate(
        current.getUTCFullYear() - 1,
        fiscalYearStartMonth,
        fiscalYearStartDay,
      );
    }

    const nextStart = this.safeUtcDate(
      start.getUTCFullYear() + 1,
      fiscalYearStartMonth,
      fiscalYearStartDay,
    );

    return {
      startDate: start,
      endDate: new Date(nextStart.getTime() - 1),
    };
  }

  private safeUtcDate(year: number, month: number, day: number) {
    const lastDayOfMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const safeDay = Math.min(day, lastDayOfMonth);

    return new Date(Date.UTC(year, month - 1, safeDay, 0, 0, 0, 0));
  }

  private startOfUtcDate(date: Date) {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  }

  private signedAmount(type: AccountType, debit: number, credit: number) {
    if (type === AccountType.ASSET || type === AccountType.EXPENSE) {
      return debit - credit;
    }

    return credit - debit;
  }

  private endOfDay(value: string) {
    const date = new Date(value);
    date.setHours(23, 59, 59, 999);
    return date;
  }
}
