import { BadRequestException, Injectable } from '@nestjs/common';
import { AccountType } from '@prisma/client';
import { BusinessesService } from '../businesses/businesses.service';
import { PrismaService } from '../../prisma/prisma.service';

type ReportType =
  | 'profit-loss'
  | 'balance-sheet'
  | 'trial-balance'
  | 'general-ledger'
  | 'sales'
  | 'purchases'
  | 'expenses'
  | 'cash-bank'
  | 'tax-summary'
  | 'missing-documents';

type ReportFilterDto = {
  reportType: ReportType;
  startDate?: string;
  endDate?: string;
  accountId?: string;
  accountCode?: string;
  accountCodes?: string[];
  includeZeroBalances?: boolean;
  showMovementColumns?: boolean;
  missingDocumentsOnly?: boolean;
  format?: 'preview' | 'csv' | 'excel' | 'xlsx' | 'pdf' | 'json';
};

type PreviewColumn = {
  key: string;
  label: string;
  align?: 'left' | 'right' | 'center';
};

type PreviewSection = {
  title: string;
  columns: PreviewColumn[];
  rows: Record<string, any>[];
  totals?: Record<string, any>;
};

@Injectable()
export class AccountingReportingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly businesses: BusinessesService,
  ) {}

  async preview(userId: string, businessId: string, dto: ReportFilterDto) {
    const business = await this.businesses.getAccessibleBusiness(userId, businessId);
    const filters = this.normalizeFilters(dto);

    switch (filters.reportType) {
      case 'profit-loss':
        return this.profitLossPreview(business.name, businessId, filters);

      case 'balance-sheet':
        return this.balanceSheetPreview(business.name, businessId, filters);

      case 'trial-balance':
        return this.trialBalancePreview(business.name, businessId, filters);

      case 'general-ledger':
        return this.generalLedgerPreview(business.name, businessId, filters);

      case 'sales':
        return this.salesPreview(business.name, businessId, filters);

      case 'purchases':
        return this.purchasesPreview(business.name, businessId, filters);

      case 'expenses':
        return this.expensesPreview(business.name, businessId, filters);

      case 'cash-bank':
        return this.cashBankPreview(business.name, businessId, filters);

      case 'tax-summary':
        return this.taxSummaryPreview(business.name, businessId, filters);

      case 'missing-documents':
        return this.missingDocumentsPreview(business.name, businessId, filters);

      default:
        throw new BadRequestException('Unsupported report type');
    }
  }

  async export(userId: string, businessId: string, dto: ReportFilterDto) {
    const preview = await this.preview(userId, businessId, dto);
    const csv = this.previewToCsv(preview);

    const business = await this.businesses.getAccessibleBusiness(userId, businessId);

    await this.prisma.reportExportLog.create({
      data: {
        organizationId: business.organizationId,
        businessId,
        userId,
        reportType: preview.reportType,
        format: 'csv',
        dateFrom: preview.filters.startDate ? new Date(preview.filters.startDate) : null,
        dateTo: preview.filters.endDate ? new Date(preview.filters.endDate) : null,
        selectedHeadsJson: dto.accountCodes || [],
        filtersJson: dto as any,
        filename: `${preview.reportType}-${preview.filters.startDate}-to-${preview.filters.endDate}.csv`,
      },
    });

    return {
      filename: `${preview.reportType}-${preview.filters.startDate}-to-${preview.filters.endDate}.csv`,
      mimeType: 'text/csv;charset=utf-8',
      contentBase64: Buffer.from(csv, 'utf8').toString('base64'),
      warning:
        'CSV export is enabled for beta. Full formatted XLSX export will be implemented in the next reports/export phase.',
    };
  }

  async requestExport(userId: string, businessId: string, dto: ReportFilterDto & { reason?: string }) {
    const access = await this.businesses.getUserAccessForBusiness(userId, businessId);

    const request = await this.prisma.reportExportRequest.create({
      data: {
        organizationId: access.business.organizationId,
        businessId,
        requestedById: userId,
        reportType: dto.reportType,
        format: dto.format || 'csv',
        dateFrom: dto.startDate ? new Date(dto.startDate) : null,
        dateTo: dto.endDate ? new Date(dto.endDate) : null,
        selectedHeadsJson: dto.accountCodes || [],
        filtersJson: dto as any,
        reason: dto.reason || 'Report export requested from Report Builder.',
        status: 'pending',
      },
    });

    return {
      message: 'Report export request sent to firm for approval.',
      request,
    };
  }

  private async profitLossPreview(clientName: string, businessId: string, filters: Required<ReportFilterDto>) {
    const balances = await this.accountBalances(businessId, filters.startDate, filters.endDate);
    const rows = balances
      .filter((row) => row.type === 'INCOME' || row.type === 'EXPENSE')
      .filter((row) => row.periodAmount !== 0 || filters.includeZeroBalances)
      .map((row) => ({
        code: row.code,
        account: row.name,
        type: row.type,
        amount: row.type === 'INCOME' ? row.periodAmount : -row.periodAmount,
      }));

    const totalIncome = rows
      .filter((row) => row.type === 'INCOME')
      .reduce((sum, row) => sum + row.amount, 0);

    const totalExpenses = rows
      .filter((row) => row.type === 'EXPENSE')
      .reduce((sum, row) => sum + Math.abs(row.amount), 0);

    return this.basePreview({
      reportType: 'profit-loss',
      title: 'Statement of Profit or Loss',
      clientName,
      filters,
      sections: [
        {
          title: 'Profit & Loss',
          columns: [
            { key: 'code', label: 'Code' },
            { key: 'account', label: 'Account' },
            { key: 'type', label: 'Type' },
            { key: 'amount', label: 'Amount', align: 'right' },
          ],
          rows,
          totals: {
            totalIncome,
            totalExpenses,
            netProfit: totalIncome - totalExpenses,
          },
        },
      ],
    });
  }

  private async balanceSheetPreview(clientName: string, businessId: string, filters: Required<ReportFilterDto>) {
    const balances = await this.accountBalances(businessId, filters.startDate, filters.endDate);

    const rows = balances
      .filter((row) => ['ASSET', 'LIABILITY', 'EQUITY'].includes(row.type))
      .filter((row) => row.closingBalance !== 0 || filters.includeZeroBalances)
      .map((row) => ({
        code: row.code,
        account: row.name,
        type: row.type,
        balance: row.closingBalance,
      }));

    const totalAssets = rows
      .filter((row) => row.type === 'ASSET')
      .reduce((sum, row) => sum + row.balance, 0);

    const totalLiabilities = rows
      .filter((row) => row.type === 'LIABILITY')
      .reduce((sum, row) => sum + row.balance, 0);

    const totalEquity = rows
      .filter((row) => row.type === 'EQUITY')
      .reduce((sum, row) => sum + row.balance, 0);

    return this.basePreview({
      reportType: 'balance-sheet',
      title: 'Statement of Financial Position',
      clientName,
      filters,
      subtitle: `As at ${filters.endDate}. Reporting calculation starts from ${filters.startDate}.`,
      sections: [
        {
          title: 'Assets, Liabilities and Equity',
          columns: [
            { key: 'code', label: 'Code' },
            { key: 'account', label: 'Account' },
            { key: 'type', label: 'Type' },
            { key: 'balance', label: 'Balance', align: 'right' },
          ],
          rows,
          totals: {
            totalAssets,
            totalLiabilities,
            totalEquity,
            check: totalAssets - (totalLiabilities + totalEquity),
          },
        },
      ],
    });
  }

  private async trialBalancePreview(clientName: string, businessId: string, filters: Required<ReportFilterDto>) {
    const balances = await this.accountBalances(businessId, filters.startDate, filters.endDate);

    const rows = balances
      .filter((row) => row.closingBalance !== 0 || row.periodDebit !== 0 || row.periodCredit !== 0 || filters.includeZeroBalances)
      .map((row) => {
        const opening = this.debitCredit(row.type, row.openingBalance);
        const closing = this.debitCredit(row.type, row.closingBalance);

        return {
          code: row.code,
          account: row.name,
          type: row.type,
          openingDebit: opening.debit,
          openingCredit: opening.credit,
          periodDebit: row.periodDebit,
          periodCredit: row.periodCredit,
          closingDebit: closing.debit,
          closingCredit: closing.credit,
        };
      });

    return this.basePreview({
      reportType: 'trial-balance',
      title: 'Trial Balance',
      clientName,
      filters,
      subtitle: `From ${filters.startDate} to ${filters.endDate}`,
      sections: [
        {
          title: 'Opening, Movement and Closing',
          columns: [
            { key: 'code', label: 'Code' },
            { key: 'account', label: 'Account' },
            { key: 'type', label: 'Type' },
            { key: 'openingDebit', label: 'Opening Dr', align: 'right' },
            { key: 'openingCredit', label: 'Opening Cr', align: 'right' },
            { key: 'periodDebit', label: 'Period Dr', align: 'right' },
            { key: 'periodCredit', label: 'Period Cr', align: 'right' },
            { key: 'closingDebit', label: 'Closing Dr', align: 'right' },
            { key: 'closingCredit', label: 'Closing Cr', align: 'right' },
          ],
          rows,
          totals: {
            openingDebit: rows.reduce((sum, row) => sum + row.openingDebit, 0),
            openingCredit: rows.reduce((sum, row) => sum + row.openingCredit, 0),
            periodDebit: rows.reduce((sum, row) => sum + row.periodDebit, 0),
            periodCredit: rows.reduce((sum, row) => sum + row.periodCredit, 0),
            closingDebit: rows.reduce((sum, row) => sum + row.closingDebit, 0),
            closingCredit: rows.reduce((sum, row) => sum + row.closingCredit, 0),
          },
        },
      ],
    });
  }

  private async generalLedgerPreview(clientName: string, businessId: string, filters: Required<ReportFilterDto>) {
    const accountIdOrCode = filters.accountId || filters.accountCode || filters.accountCodes?.[0];

    if (!accountIdOrCode) {
      throw new BadRequestException('Select an account for General Ledger.');
    }

    const account = await this.prisma.account.findFirst({
      where: {
        businessId,
        isActive: true,
        OR: [{ id: accountIdOrCode }, { code: accountIdOrCode }],
      },
    });

    if (!account) {
      throw new BadRequestException('Account not found for General Ledger.');
    }

    const rows = await this.ledgerRows(businessId, account.id, account.type, filters.startDate, filters.endDate);

    return this.basePreview({
      reportType: 'general-ledger',
      title: 'General Ledger',
      clientName,
      filters,
      subtitle: `${account.code} — ${account.name}`,
      sections: [
        {
          title: `${account.code} — ${account.name}`,
          columns: [
            { key: 'date', label: 'Date' },
            { key: 'entryNo', label: 'Entry No' },
            { key: 'narration', label: 'Narration' },
            { key: 'debit', label: 'Debit', align: 'right' },
            { key: 'credit', label: 'Credit', align: 'right' },
            { key: 'balance', label: 'Balance', align: 'right' },
          ],
          rows,
          totals: {
            debit: rows.reduce((sum, row) => sum + row.debit, 0),
            credit: rows.reduce((sum, row) => sum + row.credit, 0),
            closingBalance: rows.length ? rows[rows.length - 1].balance : 0,
          },
        },
      ],
    });
  }

  private async salesPreview(clientName: string, businessId: string, filters: Required<ReportFilterDto>) {
    const invoices = await this.prisma.invoice.findMany({
      where: {
        businessId,
        invoiceDate: this.dateWhere(filters.startDate, filters.endDate),
      },
      include: {
        customer: true,
      },
      orderBy: {
        invoiceDate: 'asc',
      },
    });

    const rows = invoices.map((invoice) => ({
      date: this.formatDate(invoice.invoiceDate),
      invoiceNumber: invoice.invoiceNumber,
      customer: invoice.customer?.name || '-',
      subtotal: Number(invoice.subtotal || 0),
      taxAmount: Number(invoice.taxAmount || 0),
      discountAmount: Number(invoice.discountAmount || 0),
      totalAmount: Number(invoice.totalAmount || 0),
      status: invoice.status,
    }));

    return this.basePreview({
      reportType: 'sales',
      title: 'Sales Report',
      clientName,
      filters,
      sections: [
        {
          title: 'Sales invoices',
          columns: [
            { key: 'date', label: 'Date' },
            { key: 'invoiceNumber', label: 'Invoice No' },
            { key: 'customer', label: 'Customer' },
            { key: 'subtotal', label: 'Subtotal', align: 'right' },
            { key: 'taxAmount', label: 'Tax', align: 'right' },
            { key: 'discountAmount', label: 'Discount', align: 'right' },
            { key: 'totalAmount', label: 'Total', align: 'right' },
            { key: 'status', label: 'Status' },
          ],
          rows,
          totals: {
            subtotal: rows.reduce((sum, row) => sum + row.subtotal, 0),
            taxAmount: rows.reduce((sum, row) => sum + row.taxAmount, 0),
            discountAmount: rows.reduce((sum, row) => sum + row.discountAmount, 0),
            totalAmount: rows.reduce((sum, row) => sum + row.totalAmount, 0),
          },
        },
      ],
    });
  }

  private async purchasesPreview(clientName: string, businessId: string, filters: Required<ReportFilterDto>) {
    return this.expenseLikePreview(clientName, businessId, filters, 'purchases', 'Purchase Report', ['purchase']);
  }

  private async expensesPreview(clientName: string, businessId: string, filters: Required<ReportFilterDto>) {
    return this.expenseLikePreview(clientName, businessId, filters, 'expenses', 'Expense Report', ['expense']);
  }

  private async expenseLikePreview(
    clientName: string,
    businessId: string,
    filters: Required<ReportFilterDto>,
    reportType: ReportType,
    title: string,
    kinds: string[],
  ) {
    const expenses = await this.prisma.expense.findMany({
      where: {
        businessId,
        expenseDate: this.dateWhere(filters.startDate, filters.endDate),
        kind: {
          in: kinds,
        },
      },
      include: {
        vendor: true,
      },
      orderBy: {
        expenseDate: 'asc',
      },
    });

    const accountIds = Array.from(new Set(expenses.map((expense) => expense.categoryAccountId)));
    const accounts = await this.prisma.account.findMany({
      where: {
        id: {
          in: accountIds,
        },
      },
    });

    const accountMap = Object.fromEntries(accounts.map((account) => [account.id, account]));

    const rows = expenses
      .filter((expense) => !filters.missingDocumentsOnly || !expense.documentId)
      .map((expense) => ({
        date: this.formatDate(expense.expenseDate),
        vendor: expense.vendor?.name || '-',
        account: accountMap[expense.categoryAccountId]?.name || expense.categoryAccountId,
        description: expense.description || '-',
        amount: Number(expense.amount || 0),
        taxAmount: Number(expense.taxAmount || 0),
        document: expense.documentId ? 'Attached' : 'Missing',
        status: expense.status,
      }));

    return this.basePreview({
      reportType,
      title,
      clientName,
      filters,
      sections: [
        {
          title,
          columns: [
            { key: 'date', label: 'Date' },
            { key: 'vendor', label: 'Vendor/Supplier' },
            { key: 'account', label: 'Account' },
            { key: 'description', label: 'Description' },
            { key: 'amount', label: 'Amount', align: 'right' },
            { key: 'taxAmount', label: 'Tax', align: 'right' },
            { key: 'document', label: 'Document' },
            { key: 'status', label: 'Status' },
          ],
          rows,
          totals: {
            amount: rows.reduce((sum, row) => sum + row.amount, 0),
            taxAmount: rows.reduce((sum, row) => sum + row.taxAmount, 0),
          },
        },
      ],
    });
  }

  private async cashBankPreview(clientName: string, businessId: string, filters: Required<ReportFilterDto>) {
    const balances = await this.accountBalances(businessId, filters.startDate, filters.endDate);

    const rows = balances
      .filter((row) => row.type === 'ASSET')
      .filter((row) => /cash|bank|wallet|easypaisa|jazzcash/i.test(row.name))
      .map((row) => ({
        code: row.code,
        account: row.name,
        openingBalance: row.openingBalance,
        periodDebit: row.periodDebit,
        periodCredit: row.periodCredit,
        closingBalance: row.closingBalance,
      }));

    return this.basePreview({
      reportType: 'cash-bank',
      title: 'Cash & Bank Report',
      clientName,
      filters,
      sections: [
        {
          title: 'Cash and bank balances',
          columns: [
            { key: 'code', label: 'Code' },
            { key: 'account', label: 'Account' },
            { key: 'openingBalance', label: 'Opening', align: 'right' },
            { key: 'periodDebit', label: 'Debit', align: 'right' },
            { key: 'periodCredit', label: 'Credit', align: 'right' },
            { key: 'closingBalance', label: 'Closing', align: 'right' },
          ],
          rows,
          totals: {
            closingBalance: rows.reduce((sum, row) => sum + row.closingBalance, 0),
          },
        },
      ],
    });
  }

  private async taxSummaryPreview(clientName: string, businessId: string, filters: Required<ReportFilterDto>) {
    const balances = await this.accountBalances(businessId, filters.startDate, filters.endDate);

    const rows = balances
      .filter((row) => /tax|withholding|advance income|sales tax/i.test(row.name))
      .map((row) => ({
        code: row.code,
        account: row.name,
        type: row.type,
        openingBalance: row.openingBalance,
        periodDebit: row.periodDebit,
        periodCredit: row.periodCredit,
        closingBalance: row.closingBalance,
      }));

    return this.basePreview({
      reportType: 'tax-summary',
      title: 'Tax Summary',
      clientName,
      filters,
      sections: [
        {
          title: 'Tax-sensitive balances',
          columns: [
            { key: 'code', label: 'Code' },
            { key: 'account', label: 'Account' },
            { key: 'type', label: 'Type' },
            { key: 'openingBalance', label: 'Opening', align: 'right' },
            { key: 'periodDebit', label: 'Period Dr', align: 'right' },
            { key: 'periodCredit', label: 'Period Cr', align: 'right' },
            { key: 'closingBalance', label: 'Closing', align: 'right' },
          ],
          rows,
        },
      ],
    });
  }

  private async missingDocumentsPreview(clientName: string, businessId: string, filters: Required<ReportFilterDto>) {
    const expenses = await this.prisma.expense.findMany({
      where: {
        businessId,
        documentId: null,
        expenseDate: this.dateWhere(filters.startDate, filters.endDate),
      },
      include: {
        vendor: true,
      },
      orderBy: {
        expenseDate: 'asc',
      },
    });

    const rows = expenses.map((expense) => ({
      date: this.formatDate(expense.expenseDate),
      vendor: expense.vendor?.name || '-',
      description: expense.description || '-',
      amount: Number(expense.amount || 0),
      taxAmount: Number(expense.taxAmount || 0),
      status: expense.status,
    }));

    return this.basePreview({
      reportType: 'missing-documents',
      title: 'Missing Documents Report',
      clientName,
      filters,
      sections: [
        {
          title: 'Expenses without receipt/document',
          columns: [
            { key: 'date', label: 'Date' },
            { key: 'vendor', label: 'Vendor' },
            { key: 'description', label: 'Description' },
            { key: 'amount', label: 'Amount', align: 'right' },
            { key: 'taxAmount', label: 'Tax', align: 'right' },
            { key: 'status', label: 'Status' },
          ],
          rows,
          totals: {
            amount: rows.reduce((sum, row) => sum + row.amount, 0),
            taxAmount: rows.reduce((sum, row) => sum + row.taxAmount, 0),
          },
        },
      ],
    });
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

    const start = new Date(startDate);
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

      const openingLines = accountLines.filter((line) => line.journalEntry.entryDate < start);
      const periodLines = accountLines.filter(
        (line) => line.journalEntry.entryDate >= start && line.journalEntry.entryDate <= end,
      );

      const openingBalance = openingLines.reduce(
        (sum, line) => sum + this.signedAmount(account.type, Number(line.debit || 0), Number(line.credit || 0)),
        0,
      );

      const periodDebit = periodLines.reduce((sum, line) => sum + Number(line.debit || 0), 0);
      const periodCredit = periodLines.reduce((sum, line) => sum + Number(line.credit || 0), 0);
      const periodAmount = periodLines.reduce(
        (sum, line) => sum + this.signedAmount(account.type, Number(line.debit || 0), Number(line.credit || 0)),
        0,
      );

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

  private async ledgerRows(
    businessId: string,
    accountId: string,
    accountType: AccountType,
    startDate: string,
    endDate: string,
  ) {
    const start = new Date(startDate);
    const end = this.endOfDay(endDate);

    const openingLines = await this.prisma.journalLine.findMany({
      where: {
        accountId,
        journalEntry: {
          businessId,
          status: 'POSTED',
          entryDate: {
            lt: start,
          },
        },
      },
    });

    let runningBalance = openingLines.reduce(
      (sum, line) => sum + this.signedAmount(accountType, Number(line.debit || 0), Number(line.credit || 0)),
      0,
    );

    const lines = await this.prisma.journalLine.findMany({
      where: {
        accountId,
        journalEntry: {
          businessId,
          status: 'POSTED',
          entryDate: {
            gte: start,
            lte: end,
          },
        },
      },
      include: {
        journalEntry: true,
      },
      orderBy: [{ journalEntry: { entryDate: 'asc' } }, { id: 'asc' }],
    });

    return lines.map((line) => {
      const debit = Number(line.debit || 0);
      const credit = Number(line.credit || 0);
      runningBalance += this.signedAmount(accountType, debit, credit);

      return {
        date: this.formatDate(line.journalEntry.entryDate),
        entryNo: this.displayEntryNo(line.journalEntry.entryDate, line.journalEntry.id),
        narration: line.journalEntry.narration,
        debit,
        credit,
        balance: runningBalance,
      };
    });
  }

  private normalizeFilters(dto: ReportFilterDto): Required<ReportFilterDto> {
    const today = new Date();
    const defaultEnd = today.toISOString().slice(0, 10);
    const defaultStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);

    return {
      reportType: dto.reportType || 'profit-loss',
      startDate: dto.startDate || dto['from' as keyof ReportFilterDto] as string || defaultStart,
      endDate: dto.endDate || dto['to' as keyof ReportFilterDto] as string || defaultEnd,
      accountId: dto.accountId || '',
      accountCode: dto.accountCode || '',
      accountCodes: dto.accountCodes || [],
      includeZeroBalances: dto.includeZeroBalances ?? false,
      showMovementColumns: dto.showMovementColumns ?? true,
      missingDocumentsOnly: dto.missingDocumentsOnly ?? false,
      format: dto.format || 'preview',
    };
  }

  private basePreview(input: {
    reportType: string;
    title: string;
    subtitle?: string;
    clientName: string;
    filters: Required<ReportFilterDto>;
    sections: PreviewSection[];
  }) {
    return {
      reportType: input.reportType,
      title: input.title,
      subtitle: input.subtitle || `From ${input.filters.startDate} to ${input.filters.endDate}`,
      clientName: input.clientName,
      generatedAt: this.formatDateTime(new Date()),
      timezone: 'Asia/Karachi',
      filters: {
        startDate: input.filters.startDate,
        endDate: input.filters.endDate,
        accountId: input.filters.accountId,
        accountCode: input.filters.accountCode,
        accountCodes: input.filters.accountCodes,
        includeZeroBalances: input.filters.includeZeroBalances,
        showMovementColumns: input.filters.showMovementColumns,
        missingDocumentsOnly: input.filters.missingDocumentsOnly,
      },
      sections: input.sections,
    };
  }

  private previewToCsv(preview: any) {
    const lines: string[] = [];

    lines.push(this.csvRow([preview.title]));
    lines.push(this.csvRow([preview.clientName]));
    lines.push(this.csvRow([preview.subtitle]));
    lines.push(this.csvRow([`Generated at: ${preview.generatedAt}`]));
    lines.push('');

    for (const section of preview.sections || []) {
      lines.push(this.csvRow([section.title]));

      const headers = section.columns.map((column: PreviewColumn) => column.label);
      lines.push(this.csvRow(headers));

      for (const row of section.rows || []) {
        lines.push(this.csvRow(section.columns.map((column: PreviewColumn) => this.formatCell(row[column.key]))));
      }

      if (section.totals) {
        lines.push('');
        lines.push(this.csvRow(['Totals']));
        for (const [key, value] of Object.entries(section.totals)) {
          lines.push(this.csvRow([key, this.formatCell(value)]));
        }
      }

      lines.push('');
    }

    return lines.join('\n');
  }

  private csvRow(values: any[]) {
    return values
      .map((value) => {
        const text = String(value ?? '');
        return `"${text.replace(/"/g, '""')}"`;
      })
      .join(',');
  }

  private formatCell(value: any) {
    if (typeof value === 'number') {
      return Math.round(value).toLocaleString('en-PK');
    }

    return value ?? '';
  }

  private dateWhere(startDate: string, endDate: string) {
    return {
      gte: new Date(startDate),
      lte: this.endOfDay(endDate),
    };
  }

  private signedAmount(type: AccountType, debit: number, credit: number) {
    if (type === 'ASSET' || type === 'EXPENSE') {
      return debit - credit;
    }

    return credit - debit;
  }

  private debitCredit(type: AccountType, signedBalance: number) {
    if (signedBalance === 0) {
      return {
        debit: 0,
        credit: 0,
      };
    }

    const normalDebit = type === 'ASSET' || type === 'EXPENSE';

    if (normalDebit) {
      return signedBalance >= 0
        ? { debit: signedBalance, credit: 0 }
        : { debit: 0, credit: Math.abs(signedBalance) };
    }

    return signedBalance >= 0
      ? { debit: 0, credit: signedBalance }
      : { debit: Math.abs(signedBalance), credit: 0 };
  }

  private displayEntryNo(date: Date, id: string) {
    const year = new Date(date).getFullYear();
    return `JE-${year}-${id.slice(-6).toUpperCase()}`;
  }

  private formatDate(date: Date) {
    return new Date(date).toLocaleDateString('en-PK', {
      timeZone: 'Asia/Karachi',
      year: 'numeric',
      month: 'short',
      day: '2-digit',
    });
  }

  private formatDateTime(date: Date) {
    return new Date(date).toLocaleString('en-PK', {
      timeZone: 'Asia/Karachi',
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  }

  private endOfDay(value: string) {
    const date = new Date(value);
    date.setHours(23, 59, 59, 999);
    return date;
  }
}
