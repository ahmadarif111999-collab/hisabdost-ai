import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AccountType } from '@prisma/client';
import { BusinessesService } from '../businesses/businesses.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  cleanAccountingNarration,
  displayJournalEntryNo,
  displayUserName,
  formatPakistanDate,
  formatPakistanDateTime,
  normalBalanceLabel,
  sourceTypeLabel,
} from '../../common/accounting-format.util';

type DateFilter = {
  from?: string;
  to?: string;
};

@Injectable()
export class AccountingViewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly businesses: BusinessesService,
  ) {}

  async journalEntries(userId: string, businessId: string, filter: DateFilter = {}) {
    await this.businesses.getAccessibleBusiness(userId, businessId);

    const entries = await this.prisma.journalEntry.findMany({
      where: {
        businessId,
        ...(filter.from || filter.to
          ? {
              entryDate: {
                ...(filter.from ? { gte: new Date(filter.from) } : {}),
                ...(filter.to ? { lte: this.endOfDay(filter.to) } : {}),
              },
            }
          : {}),
      },
      include: {
        lines: {
          include: {
            account: true,
          },
          orderBy: {
            id: 'asc',
          },
        },
      },
      orderBy: {
        entryDate: 'desc',
      },
      take: 300,
    });

    const userMap = await this.userMap(
      entries.flatMap((entry) => [entry.createdById, entry.approvedById]).filter(Boolean) as string[],
    );

    return {
      timezone: 'Asia/Karachi',
      rows: entries.map((entry) => {
        const debitTotal = entry.lines.reduce((sum, line) => sum + Number(line.debit || 0), 0);
        const creditTotal = entry.lines.reduce((sum, line) => sum + Number(line.credit || 0), 0);

        return {
          id: entry.id,
          entryNo: displayJournalEntryNo(entry.entryDate, entry.id),
          entryDate: entry.entryDate,
          entryDateDisplay: formatPakistanDateTime(entry.entryDate),
          sourceType: entry.sourceType,
          sourceLabel: sourceTypeLabel(entry.sourceType),
          narration: cleanAccountingNarration(entry.narration, entry.sourceType),
          rawNarration: entry.narration,
          status: entry.status,
          debitTotal,
          creditTotal,
          createdBy: entry.createdById ? displayUserName(userMap[entry.createdById]) : 'System',
          approvedBy: entry.approvedById ? displayUserName(userMap[entry.approvedById]) : '-',
          linesCount: entry.lines.length,
          lines: entry.lines.map((line) => ({
            id: line.id,
            accountCode: line.account.code,
            accountName: line.account.name,
            accountType: line.account.type,
            debit: Number(line.debit || 0),
            credit: Number(line.credit || 0),
            description: cleanAccountingNarration(line.description, entry.sourceType),
          })),
        };
      }),
    };
  }

  async journalEntryDetail(userId: string, businessId: string, entryId: string) {
    await this.businesses.getAccessibleBusiness(userId, businessId);

    const entry = await this.prisma.journalEntry.findFirst({
      where: {
        id: entryId,
        businessId,
      },
      include: {
        lines: {
          include: {
            account: true,
          },
          orderBy: {
            id: 'asc',
          },
        },
      },
    });

    if (!entry) {
      throw new NotFoundException('Journal entry not found');
    }

    const userMap = await this.userMap(
      [entry.createdById, entry.approvedById].filter(Boolean) as string[],
    );

    const debitTotal = entry.lines.reduce((sum, line) => sum + Number(line.debit || 0), 0);
    const creditTotal = entry.lines.reduce((sum, line) => sum + Number(line.credit || 0), 0);

    return {
      id: entry.id,
      entryNo: displayJournalEntryNo(entry.entryDate, entry.id),
      entryDate: entry.entryDate,
      entryDateDisplay: formatPakistanDateTime(entry.entryDate),
      sourceType: entry.sourceType,
      sourceLabel: sourceTypeLabel(entry.sourceType),
      narration: cleanAccountingNarration(entry.narration, entry.sourceType),
      rawNarration: entry.narration,
      status: entry.status,
      createdBy: entry.createdById ? displayUserName(userMap[entry.createdById]) : 'System',
      approvedBy: entry.approvedById ? displayUserName(userMap[entry.approvedById]) : '-',
      debitTotal,
      creditTotal,
      lines: entry.lines.map((line) => ({
        id: line.id,
        accountId: line.accountId,
        accountCode: line.account.code,
        accountName: line.account.name,
        accountType: line.account.type,
        debit: Number(line.debit || 0),
        credit: Number(line.credit || 0),
        description: cleanAccountingNarration(line.description, entry.sourceType),
        partyType: line.partyType,
      })),
    };
  }

  async ledger(
    userId: string,
    businessId: string,
    accountIdOrCode: string,
    filter: DateFilter = {},
  ) {
    await this.businesses.getAccessibleBusiness(userId, businessId);

    const account = await this.prisma.account.findFirst({
      where: {
        businessId,
        isActive: true,
        OR: [{ id: accountIdOrCode }, { code: accountIdOrCode }],
      },
    });

    if (!account) {
      throw new BadRequestException('Account not found');
    }

    const fromDate = filter.from ? new Date(filter.from) : null;
    const toDate = filter.to ? this.endOfDay(filter.to) : null;

    const openingLines = fromDate
      ? await this.prisma.journalLine.findMany({
          where: {
            accountId: account.id,
            journalEntry: {
              status: 'POSTED',
              entryDate: {
                lt: fromDate,
              },
            },
          },
        })
      : [];

    const openingBalance = openingLines.reduce((sum, line) => {
      return sum + this.signedAmount(account.type, Number(line.debit || 0), Number(line.credit || 0));
    }, 0);

    let runningBalance = openingBalance;

    const periodLines = await this.prisma.journalLine.findMany({
      where: {
        accountId: account.id,
        journalEntry: {
          status: 'POSTED',
          ...(fromDate || toDate
            ? {
                entryDate: {
                  ...(fromDate ? { gte: fromDate } : {}),
                  ...(toDate ? { lte: toDate } : {}),
                },
              }
            : {}),
        },
      },
      include: {
        journalEntry: true,
        account: true,
      },
      orderBy: [{ journalEntry: { entryDate: 'asc' } }, { id: 'asc' }],
    });

    const rows = periodLines.map((line) => {
      const debit = Number(line.debit || 0);
      const credit = Number(line.credit || 0);

      runningBalance += this.signedAmount(account.type, debit, credit);

      return {
        id: line.id,
        journalEntryId: line.journalEntryId,
        entryNo: displayJournalEntryNo(line.journalEntry.entryDate, line.journalEntry.id),
        date: line.journalEntry.entryDate,
        dateDisplay: formatPakistanDate(line.journalEntry.entryDate),
        narration: cleanAccountingNarration(line.journalEntry.narration, line.journalEntry.sourceType),
        description: cleanAccountingNarration(line.description, line.journalEntry.sourceType),
        sourceType: line.journalEntry.sourceType,
        sourceLabel: sourceTypeLabel(line.journalEntry.sourceType),
        debit,
        credit,
        balance: runningBalance,
        balanceSide: normalBalanceLabel(account.type, runningBalance),
      };
    });

    const periodDebit = rows.reduce((sum, row) => sum + row.debit, 0);
    const periodCredit = rows.reduce((sum, row) => sum + row.credit, 0);

    return {
      timezone: 'Asia/Karachi',
      account: {
        id: account.id,
        code: account.code,
        name: account.name,
        type: account.type,
      },
      period: {
        from: filter.from || null,
        to: filter.to || null,
      },
      openingBalance,
      openingBalanceSide: normalBalanceLabel(account.type, openingBalance),
      rows,
      periodDebit,
      periodCredit,
      closingBalance: runningBalance,
      closingBalanceSide: normalBalanceLabel(account.type, runningBalance),
    };
  }

  private signedAmount(type: AccountType, debit: number, credit: number) {
    if (type === 'ASSET' || type === 'EXPENSE') {
      return debit - credit;
    }

    return credit - debit;
  }

  private async userMap(userIds: string[]) {
    const uniqueIds = Array.from(new Set(userIds));

    if (!uniqueIds.length) {
      return {};
    }

    const users = await this.prisma.user.findMany({
      where: {
        id: {
          in: uniqueIds,
        },
      },
      select: {
        id: true,
        name: true,
        email: true,
      },
    });

    return users.reduce<Record<string, { name: string | null; email: string | null }>>((map, user) => {
      map[user.id] = {
        name: user.name,
        email: user.email,
      };
      return map;
    }, {});
  }

  private endOfDay(value: string) {
    const date = new Date(value);
    date.setHours(23, 59, 59, 999);
    return date;
  }
}
