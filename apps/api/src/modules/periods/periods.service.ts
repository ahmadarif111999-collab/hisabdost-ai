import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AccountType, Business, PeriodStatus } from '@prisma/client';
import { BusinessesService } from '../businesses/businesses.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  formatPakistanDate,
  formatPakistanDateTime,
  normalBalanceLabel,
} from '../../common/accounting-format.util';

const AHMAD_EMAIL = 'ahmadarif111999@gmail.com';

type FiscalCalendarDto = {
  fiscalYearStartMonth: number;
  fiscalYearStartDay: number;
  reason?: string;
};

@Injectable()
export class PeriodsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly businesses: BusinessesService,
  ) {}

  async dashboard(userId: string, businessId: string) {
    const access = await this.businesses.getUserAccessForBusiness(userId, businessId);

    const ensured = await this.ensureCurrentPeriod(userId, businessId);

    const periods = await this.prisma.accountingPeriod.findMany({
      where: {
        businessId,
      },
      orderBy: {
        startDate: 'desc',
      },
      include: {
        openingBalances: true,
      },
    });

    const currentPeriod =
      periods.find((period) => period.id === ensured.currentPeriod.id) || ensured.currentPeriod;

    const openingSummary = await this.openingBalanceSummary(businessId, currentPeriod.id);

    return {
      business: {
        id: access.business.id,
        name: access.business.name,
        entityType: access.business.entityType,
        fiscalYearStartMonth: access.business.fiscalYearStartMonth,
        fiscalYearStartDay: access.business.fiscalYearStartDay || 1,
      },
      currentPeriod: this.serializePeriod(currentPeriod),
      periods: periods.map((period) => this.serializePeriod(period)),
      openingSummary,
      autoCloseResult: ensured.autoCloseResult,
      openingRepairResult: ensured.openingRepairResult,
      permissions: {
        canReopenPreviousPeriod: await this.isAhmad(userId),
        canFinalClosePeriod: await this.isAhmad(userId),
      },
    };
  }

  async updateFiscalCalendar(userId: string, businessId: string, dto: FiscalCalendarDto) {
    const access = await this.businesses.getUserAccessForBusiness(userId, businessId);

    if (!access.firmMembership) {
      throw new ForbiddenException('Only ProBiz firm users can update the fiscal calendar.');
    }

    const fiscalYearStartMonth = Number(dto.fiscalYearStartMonth);
    const fiscalYearStartDay = Number(dto.fiscalYearStartDay);

    if (!Number.isInteger(fiscalYearStartMonth) || fiscalYearStartMonth < 1 || fiscalYearStartMonth > 12) {
      throw new BadRequestException('Fiscal year start month must be between 1 and 12.');
    }

    if (!Number.isInteger(fiscalYearStartDay) || fiscalYearStartDay < 1 || fiscalYearStartDay > 31) {
      throw new BadRequestException('Fiscal year start day must be between 1 and 31.');
    }

    const before = {
      fiscalYearStartMonth: access.business.fiscalYearStartMonth,
      fiscalYearStartDay: access.business.fiscalYearStartDay || 1,
    };

    const updated = await this.prisma.business.update({
      where: {
        id: businessId,
      },
      data: {
        fiscalYearStartMonth,
        fiscalYearStartDay,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        organizationId: access.business.organizationId,
        businessId,
        userId,
        action: 'CLIENT_FISCAL_CALENDAR_UPDATED',
        entityType: 'Business',
        entityId: businessId,
        beforeJson: before,
        afterJson: {
          fiscalYearStartMonth,
          fiscalYearStartDay,
          reason: dto.reason || 'Fiscal calendar updated from Periods page.',
        },
      },
    });

    const ensured = await this.ensureCurrentPeriod(userId, businessId);

    return {
      message: 'Fiscal calendar updated and current accounting period checked.',
      business: updated,
      currentPeriod: ensured.currentPeriod,
      autoCloseResult: ensured.autoCloseResult,
      openingRepairResult: ensured.openingRepairResult,
    };
  }

  async ensureCurrentPeriod(userId: string, businessId: string) {
    const access = await this.businesses.getUserAccessForBusiness(userId, businessId);
    const business = access.business as Business;

    const range = this.periodRangeForDate(
      new Date(),
      business.fiscalYearStartMonth || 7,
      business.fiscalYearStartDay || 1,
    );

    let currentPeriod = await this.prisma.accountingPeriod.findFirst({
      where: {
        businessId,
        startDate: range.startDate,
        endDate: range.endDate,
      },
    });

    if (!currentPeriod) {
      currentPeriod = await this.prisma.accountingPeriod.create({
        data: {
          businessId,
          label: range.label,
          startDate: range.startDate,
          endDate: range.endDate,
          status: PeriodStatus.OPEN,
        },
      });

      await this.prisma.periodCloseLog.create({
        data: {
          businessId,
          accountingPeriodId: currentPeriod.id,
          action: 'PERIOD_CREATED',
          performedById: userId,
          afterJson: {
            label: currentPeriod.label,
            startDate: currentPeriod.startDate,
            endDate: currentPeriod.endDate,
          },
        },
      });
    }

    const autoCloseResult = await this.autoClosePreviousPeriods(
      userId,
      businessId,
      currentPeriod.startDate,
    );

    const openingRepairResult = await this.repairOpeningBalances(
      userId,
      businessId,
      currentPeriod.id,
      true,
    );

    return {
      message: 'Current period checked.',
      currentPeriod: this.serializePeriod(currentPeriod),
      autoCloseResult,
      openingRepairResult,
    };
  }

  async repairOpeningBalances(
    userId: string,
    businessId: string,
    periodId: string,
    silent = false,
  ) {
    await this.businesses.getAccessibleBusiness(userId, businessId);

    const period = await this.prisma.accountingPeriod.findFirst({
      where: {
        id: periodId,
        businessId,
      },
    });

    if (!period) {
      throw new NotFoundException('Accounting period not found.');
    }

    const business = await this.prisma.business.findUnique({
      where: {
        id: businessId,
      },
    });

    if (!business) {
      throw new NotFoundException('Client business not found.');
    }

    const calculation = await this.calculateOpeningRows(business, period.startDate);

    if (!calculation.isBalanced && !silent) {
      throw new BadRequestException(
        `Opening balance is not balanced. Difference: ${calculation.difference}. Review previous-period postings first.`,
      );
    }

    if (!calculation.isBalanced) {
      return {
        message: 'Opening balance calculation is not balanced, so no system opening journal was posted.',
        ...calculation,
      };
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.openingBalance.deleteMany({
        where: {
          accountingPeriodId: period.id,
        },
      });

      if (calculation.rows.length) {
        await tx.openingBalance.createMany({
          data: calculation.rows.map((row) => ({
            businessId,
            accountingPeriodId: period.id,
            accountId: row.accountId,
            debit: row.debit,
            credit: row.credit,
            narration: `Opening balance for ${period.label}`,
            createdById: userId,
          })),
        });
      }

      const sourceId = `period:${period.id}`;
      const existingEntry = await tx.journalEntry.findFirst({
        where: {
          businessId,
          sourceType: 'opening_balance',
          sourceId,
        },
      });

      if (!calculation.rows.length) {
        if (existingEntry) {
          await tx.journalEntry.delete({
            where: {
              id: existingEntry.id,
            },
          });
        }
      } else if (existingEntry) {
        await tx.journalLine.deleteMany({
          where: {
            journalEntryId: existingEntry.id,
          },
        });

        await tx.journalEntry.update({
          where: {
            id: existingEntry.id,
          },
          data: {
            accountingPeriodId: period.id,
            entryDate: period.startDate,
            narration: `Opening balances carried forward for ${period.label}.`,
            status: 'POSTED',
            isSystemGenerated: true,
            createdById: userId,
            lines: {
              createMany: {
                data: calculation.rows.map((row) => ({
                  accountId: row.accountId,
                  debit: row.debit,
                  credit: row.credit,
                  description: `Opening balance ${row.side}`,
                })),
              },
            },
          },
        });
      } else {
        await tx.journalEntry.create({
          data: {
            businessId,
            accountingPeriodId: period.id,
            entryDate: period.startDate,
            sourceType: 'opening_balance',
            sourceId,
            narration: `Opening balances carried forward for ${period.label}.`,
            status: 'POSTED',
            isSystemGenerated: true,
            createdById: userId,
            lines: {
              createMany: {
                data: calculation.rows.map((row) => ({
                  accountId: row.accountId,
                  debit: row.debit,
                  credit: row.credit,
                  description: `Opening balance ${row.side}`,
                })),
              },
            },
          },
        });
      }

      await tx.periodCloseLog.create({
        data: {
          businessId,
          accountingPeriodId: period.id,
          action: 'OPENING_BALANCES_REPAIRED',
          performedById: userId,
          afterJson: calculation,
        },
      });
    });

    return {
      message: 'Opening balances repaired.',
      ...calculation,
    };
  }

  async reopenPeriod(userId: string, businessId: string, periodId: string, reason?: string) {
    await this.assertAhmad(userId);

    if (!reason || !reason.trim()) {
      throw new BadRequestException('Reason is required to reopen a previous period.');
    }

    const period = await this.prisma.accountingPeriod.findFirst({
      where: {
        id: periodId,
        businessId,
      },
    });

    if (!period) {
      throw new NotFoundException('Accounting period not found.');
    }

    if (period.status === PeriodStatus.OPEN || period.status === PeriodStatus.REOPENED) {
      throw new BadRequestException('This period is already open/reopened.');
    }

    const updated = await this.prisma.accountingPeriod.update({
      where: {
        id: periodId,
      },
      data: {
        status: PeriodStatus.REOPENED,
        reopenedAt: new Date(),
        reopenedById: userId,
        reopenReason: reason.trim(),
      },
    });

    await this.prisma.periodCloseLog.create({
      data: {
        businessId,
        accountingPeriodId: periodId,
        action: 'PERIOD_REOPENED_BY_AHMAD',
        performedById: userId,
        reason: reason.trim(),
        beforeJson: period,
        afterJson: updated,
      },
    });

    return {
      message:
        'Period reopened by Ahmad Arif. Changes to this period may affect current-period opening balances.',
      period: this.serializePeriod(updated),
    };
  }

  async finalClosePeriod(userId: string, businessId: string, periodId: string, reason?: string) {
    await this.assertAhmad(userId);

    const period = await this.prisma.accountingPeriod.findFirst({
      where: {
        id: periodId,
        businessId,
      },
    });

    if (!period) {
      throw new NotFoundException('Accounting period not found.');
    }

    const updated = await this.prisma.accountingPeriod.update({
      where: {
        id: periodId,
      },
      data: {
        status: PeriodStatus.FINAL_CLOSED,
        finalizedAt: new Date(),
        finalizedById: userId,
      },
    });

    await this.prisma.periodCloseLog.create({
      data: {
        businessId,
        accountingPeriodId: periodId,
        action: 'PERIOD_FINAL_CLOSED_BY_AHMAD',
        performedById: userId,
        reason: reason || 'Final close from Periods page.',
        beforeJson: period,
        afterJson: updated,
      },
    });

    return {
      message: 'Period final-closed by Ahmad Arif.',
      period: this.serializePeriod(updated),
    };
  }

  private async autoClosePreviousPeriods(
    userId: string,
    businessId: string,
    currentPeriodStartDate: Date,
  ) {
    const previousPeriods = await this.prisma.accountingPeriod.findMany({
      where: {
        businessId,
        endDate: {
          lt: currentPeriodStartDate,
        },
        status: {
          in: [PeriodStatus.OPEN, PeriodStatus.REOPENED],
        },
      },
    });

    const closed = [];

    for (const period of previousPeriods) {
      const updated = await this.prisma.accountingPeriod.update({
        where: {
          id: period.id,
        },
        data: {
          status: PeriodStatus.AUTO_CLOSED,
          autoClosedAt: new Date(),
          closedAt: new Date(),
        },
      });

      await this.prisma.periodCloseLog.create({
        data: {
          businessId,
          accountingPeriodId: period.id,
          action: 'PERIOD_AUTO_CLOSED_ON_NEW_PERIOD',
          performedById: userId,
          beforeJson: period,
          afterJson: updated,
        },
      });

      closed.push(this.serializePeriod(updated));
    }

    return {
      closedCount: closed.length,
      closed,
    };
  }

  private async calculateOpeningRows(business: Business, startDate: Date) {
    const accounts = await this.prisma.account.findMany({
      where: {
        businessId: business.id,
        isActive: true,
      },
      orderBy: {
        code: 'asc',
      },
    });

    const lines = await this.prisma.journalLine.findMany({
      where: {
        account: {
          businessId: business.id,
        },
        journalEntry: {
          status: 'POSTED',
          entryDate: {
            lt: startDate,
          },
        },
      },
      include: {
        account: true,
        journalEntry: true,
      },
    });

    const accountMap = new Map(accounts.map((account) => [account.id, account]));
    const permanentBalances = new Map<string, number>();
    let incomeBalance = 0;
    let expenseBalance = 0;

    for (const line of lines) {
      const account = line.account;
      const signed = this.signedAmount(account.type, Number(line.debit || 0), Number(line.credit || 0));

      if (account.type === 'ASSET' || account.type === 'LIABILITY' || account.type === 'EQUITY') {
        permanentBalances.set(account.id, (permanentBalances.get(account.id) || 0) + signed);
      }

      if (account.type === 'INCOME') {
        incomeBalance += signed;
      }

      if (account.type === 'EXPENSE') {
        expenseBalance += signed;
      }
    }

    const netProfit = incomeBalance - expenseBalance;

    if (Math.abs(netProfit) >= 0.01) {
      const equityAccount =
        business.entityType === 'PVT_LTD'
          ? accounts.find((account) => account.code === '3200') ||
            accounts.find((account) => /retained earnings/i.test(account.name))
          : accounts.find((account) => account.code === '3000') ||
            accounts.find((account) => /owner capital/i.test(account.name));

      if (equityAccount) {
        permanentBalances.set(
          equityAccount.id,
          (permanentBalances.get(equityAccount.id) || 0) + netProfit,
        );
      }
    }

    const rows = Array.from(permanentBalances.entries())
      .map(([accountId, signedBalance]) => {
        const account = accountMap.get(accountId);

        if (!account || Math.abs(signedBalance) < 0.01) return null;

        const dc = this.debitCredit(account.type, signedBalance);

        return {
          accountId,
          code: account.code,
          account: account.name,
          type: account.type,
          signedBalance,
          side: normalBalanceLabel(account.type, signedBalance),
          debit: dc.debit,
          credit: dc.credit,
        };
      })
      .filter(Boolean) as Array<{
      accountId: string;
      code: string;
      account: string;
      type: AccountType;
      signedBalance: number;
      side: string;
      debit: number;
      credit: number;
    }>;

    const totalDebit = rows.reduce((sum, row) => sum + row.debit, 0);
    const totalCredit = rows.reduce((sum, row) => sum + row.credit, 0);
    const difference = Math.round((totalDebit - totalCredit) * 100) / 100;

    return {
      startDate: formatPakistanDate(startDate),
      rows,
      incomeBalance,
      expenseBalance,
      netProfitClosedToEquity: netProfit,
      totalDebit,
      totalCredit,
      difference,
      isBalanced: Math.abs(difference) < 0.01,
    };
  }

  private async openingBalanceSummary(businessId: string, periodId: string) {
    const rows = await this.prisma.openingBalance.findMany({
      where: {
        businessId,
        accountingPeriodId: periodId,
      },
      include: {
        account: true,
      },
      orderBy: {
        account: {
          code: 'asc',
        },
      },
    });

    const totalDebit = rows.reduce((sum, row) => sum + Number(row.debit || 0), 0);
    const totalCredit = rows.reduce((sum, row) => sum + Number(row.credit || 0), 0);

    return {
      count: rows.length,
      totalDebit,
      totalCredit,
      difference: Math.round((totalDebit - totalCredit) * 100) / 100,
      rows: rows.map((row) => ({
        id: row.id,
        code: row.account.code,
        account: row.account.name,
        type: row.account.type,
        debit: Number(row.debit || 0),
        credit: Number(row.credit || 0),
      })),
    };
  }

  private signedAmount(type: AccountType, debit: number, credit: number) {
    if (type === 'ASSET' || type === 'EXPENSE') {
      return debit - credit;
    }

    return credit - debit;
  }

  private debitCredit(type: AccountType, signedBalance: number) {
    if (Math.abs(signedBalance) < 0.01) {
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

    const endDate = new Date(nextStart.getTime() - 1);

    return {
      startDate: start,
      endDate,
      label: `FY ${start.getUTCFullYear()}-${nextStart.getUTCFullYear()}`,
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

  private serializePeriod(period: any) {
    return {
      id: period.id,
      label: period.label,
      startDate: period.startDate,
      endDate: period.endDate,
      startDateDisplay: formatPakistanDate(period.startDate),
      endDateDisplay: formatPakistanDate(period.endDate),
      status: period.status,
      autoClosedAtDisplay: period.autoClosedAt ? formatPakistanDateTime(period.autoClosedAt) : null,
      closedAtDisplay: period.closedAt ? formatPakistanDateTime(period.closedAt) : null,
      reopenedAtDisplay: period.reopenedAt ? formatPakistanDateTime(period.reopenedAt) : null,
      reopenReason: period.reopenReason || null,
      finalizedAtDisplay: period.finalizedAt ? formatPakistanDateTime(period.finalizedAt) : null,
      openingBalancesCount: period.openingBalances?.length || 0,
    };
  }

  private async isAhmad(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: {
        id: userId,
      },
      select: {
        email: true,
      },
    });

    return user?.email?.toLowerCase().trim() === AHMAD_EMAIL;
  }

  private async assertAhmad(userId: string) {
    const allowed = await this.isAhmad(userId);

    if (!allowed) {
      throw new ForbiddenException('Only Ahmad Arif can reopen or final-close previous periods.');
    }
  }
}
