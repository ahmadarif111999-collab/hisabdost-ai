import {
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import { BusinessesService } from '../businesses/businesses.service';
import { PrismaService } from '../../prisma/prisma.service';
import { formatPakistanDateTime } from '../../common/accounting-format.util';
import { ReferenceNumbersService } from './reference-numbers.service';

type PaymentActivityFilter = {
  from?: string;
  to?: string;
  direction?: string;
  paymentMethod?: string;
  limit?: string;
  reference?: string;
};

@Injectable()
export class PaymentActivityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly businesses: BusinessesService,
    private readonly references: ReferenceNumbersService,
  ) {}

  async list(
    userId: string,
    businessId: string,
    filter: PaymentActivityFilter = {},
  ) {
    await this.businesses.getAccessibleBusiness(
      userId,
      businessId,
    );

    const reference = String(filter.reference || '').trim().toUpperCase();
    if (reference && !/^(REC|PAY)-\d{4}-\d{6,}$/.test(reference)) {
      throw new BadRequestException('Invalid payment reference');
    }
    const linked = reference ? await this.prisma.businessReference.findFirst({
      where: { businessId, referenceNo: reference, entityType: reference.startsWith('REC-') ? 'receipt' : 'payment' },
      select: { entityId: true },
    }) : null;
    const direction = this.normalizeDirection(
      filter.direction,
    );

    const paymentMethod = String(
      filter.paymentMethod || '',
    )
      .trim()
      .toLowerCase();

    const fromDate = filter.from
      ? this.startOfPakistanDay(filter.from)
      : null;

    const toDate = filter.to
      ? this.endOfPakistanDay(filter.to)
      : null;

    const limit = this.normalizeLimit(
      filter.limit,
    );

    if (
      !reference && fromDate &&
      toDate &&
      fromDate.getTime() > toDate.getTime()
    ) {
      throw new BadRequestException(
        'Start date cannot be after end date',
      );
    }

    const where = {
      businessId,
      ...(reference ? { id: { in: linked ? [linked.entityId] : [] }, direction: reference.startsWith('REC-') ? 'received' : 'paid' } : {}),
      ...(!reference && direction
        ? {
            direction,
          }
        : {}),
      ...(!reference && paymentMethod
        ? {
            paymentMethod,
          }
        : {}),
      ...(!reference && (fromDate || toDate)
        ? {
            paymentDate: {
              ...(fromDate
                ? {
                    gte: fromDate,
                  }
                : {}),
              ...(toDate
                ? {
                    lte: toDate,
                  }
                : {}),
            },
          }
        : {}),
    };

    const [
      payments,
      summaryGroups,
    ] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        orderBy: [
          {
            paymentDate: 'desc',
          },
          {
            createdAt: 'desc',
          },
        ],
        take: limit,
      }),

      this.prisma.payment.groupBy({
        by: [
          'direction',
        ],
        where,
        _sum: {
          amount: true,
        },
        _count: {
          _all: true,
        },
      }),
    ]);

    const referenceMap =
      await this.references.ensureMany(
        businessId,
        'payment',
        payments.map((payment) => ({
          id: payment.id,
          date: payment.paymentDate,
        })),
      );

    const journalEntries = payments.length ? await this.prisma.journalEntry.findMany({
      where: { businessId, sourceType: { in: ['customer_payment', 'supplier_payment', 'payment'] }, sourceId: { in: payments.map((payment) => payment.id) } },
      select: { id: true, sourceId: true, sourceType: true, entryDate: true },
      orderBy: [{ entryDate: 'asc' }, { id: 'asc' }],
    }) : [];
    const journalReferences = await this.references.ensureMany(businessId, 'journal', journalEntries.map((entry) => ({ id: entry.id, date: entry.entryDate })));
    const journalByPayment = new Map<string, string>();
    const paymentById = new Map(payments.map((payment) => [payment.id, payment]));
    for (const entry of journalEntries) {
      if (!entry.sourceId || journalByPayment.has(entry.sourceId)) continue;
      const payment = paymentById.get(entry.sourceId);
      if (!payment || (entry.sourceType !== 'payment' && entry.sourceType !== (payment.direction === 'received' ? 'customer_payment' : 'supplier_payment'))) continue;
      const journalNo = journalReferences[entry.id];
      if (journalNo) journalByPayment.set(entry.sourceId, journalNo);
    }

    const customerIds = payments
      .filter(
        (payment) =>
          payment.partyType ===
            'customer' &&
          payment.partyId,
      )
      .map(
        (payment) =>
          payment.partyId as string,
      );

    const vendorIds = payments
      .filter(
        (payment) =>
          payment.partyType ===
            'vendor' &&
          payment.partyId,
      )
      .map(
        (payment) =>
          payment.partyId as string,
      );

    const accountIds = payments.map(
      (payment) =>
        payment.paymentAccountId,
    );

    const customers: Array<{
      id: string;
      name: string;
    }> = customerIds.length
      ? await this.prisma.customer.findMany({
          where: {
            businessId,
            id: {
              in: Array.from(
                new Set(customerIds),
              ),
            },
          },
          select: {
            id: true,
            name: true,
          },
        })
      : [];

    const vendors: Array<{
      id: string;
      name: string;
    }> = vendorIds.length
      ? await this.prisma.vendor.findMany({
          where: {
            businessId,
            id: {
              in: Array.from(
                new Set(vendorIds),
              ),
            },
          },
          select: {
            id: true,
            name: true,
          },
        })
      : [];

    const accounts: Array<{
      id: string;
      code: string;
      name: string;
    }> = accountIds.length
      ? await this.prisma.account.findMany({
          where: {
            businessId,
            id: {
              in: Array.from(
                new Set(accountIds),
              ),
            },
          },
          select: {
            id: true,
            code: true,
            name: true,
          },
        })
      : [];

    const customerMap = new Map(
      customers.map((customer) => [
        customer.id,
        customer.name,
      ]),
    );

    const vendorMap = new Map(
      vendors.map((vendor) => [
        vendor.id,
        vendor.name,
      ]),
    );

    const accountMap = new Map(
      accounts.map((account) => [
        account.id,
        account,
      ]),
    );

    const totalReceived =
      this.summaryAmount(
        summaryGroups,
        'received',
      );

    const totalPaid =
      this.summaryAmount(
        summaryGroups,
        'paid',
      );

    return {
      timezone: 'Asia/Karachi',

      filters: {
        reference: reference || null,
        from: reference ? null : filter.from || null,
        to: reference ? null : filter.to || null,
        direction:
          reference ? (reference.startsWith('REC-') ? 'received' : 'paid') : direction || 'all',
        paymentMethod:
          reference ? 'all' : paymentMethod || 'all',
        limit,
      },

      summary: {
        totalReceived,
        totalPaid,
        netMovement:
          totalReceived - totalPaid,

        receivedCount:
          this.summaryCount(
            summaryGroups,
            'received',
          ),

        paidCount:
          this.summaryCount(
            summaryGroups,
            'paid',
          ),

        returnedCount:
          payments.length,
      },

      rows: payments.map(
        (payment) => {
          const account =
            accountMap.get(
              payment.paymentAccountId,
            );

          return {
            id: payment.id,

            paymentNo:
              referenceMap[
                payment.id
              ] ||
              (payment.direction === 'received' ? 'REC-PENDING' : 'PAY-PENDING'),

            displayNumber:
              referenceMap[
                payment.id
              ] ||
              (payment.direction === 'received' ? 'REC-PENDING' : 'PAY-PENDING'),

            journalReference: journalByPayment.get(payment.id) || null,

            direction:
              payment.direction,

            directionLabel:
              payment.direction ===
              'received'
                ? 'Money received'
                : 'Money paid',

            partyType:
              payment.partyType,

            partyName:
              this.partyName(
                payment,
                customerMap,
                vendorMap,
              ),

            amount: Number(
              payment.amount || 0,
            ),

            paymentMethod:
              payment.paymentMethod,

            paymentMethodLabel:
              this.paymentMethodLabel(
                payment.paymentMethod,
              ),

            paymentDate:
              payment.paymentDate,

            paymentDateDisplay:
              formatPakistanDateTime(
                payment.paymentDate,
              ),

            externalReference:
              payment.referenceNo ||
              null,

            notes:
              payment.notes || null,

            accountCode:
              account?.code || null,

            accountName:
              account?.name ||
              'Payment account',

            createdAt:
              payment.createdAt,
          };
        },
      ),
    };
  }

  private partyName(
    payment: {
      partyType: string | null;
      partyId: string | null;
      direction: string;
    },
    customerMap: Map<
      string,
      string
    >,
    vendorMap: Map<
      string,
      string
    >,
  ) {
    if (
      payment.partyType ===
        'customer' &&
      payment.partyId
    ) {
      return (
        customerMap.get(
          payment.partyId,
        ) || 'Customer'
      );
    }

    if (
      payment.partyType ===
        'vendor' &&
      payment.partyId
    ) {
      return (
        vendorMap.get(
          payment.partyId,
        ) || 'Supplier'
      );
    }

    return payment.direction ===
      'received'
      ? 'Customer / other receipt'
      : 'Supplier / other payment';
  }

  private normalizeDirection(
    value?: string,
  ) {
    const direction = String(
      value || '',
    )
      .trim()
      .toLowerCase();

    if (
      !direction ||
      direction === 'all'
    ) {
      return '';
    }

    if (
      direction !== 'received' &&
      direction !== 'paid'
    ) {
      throw new BadRequestException(
        'Direction must be received or paid',
      );
    }

    return direction;
  }

  private normalizeLimit(
    value?: string,
  ) {
    const parsed = Number(
      value || 100,
    );

    if (
      !Number.isFinite(parsed)
    ) {
      return 100;
    }

    return Math.min(
      200,
      Math.max(
        1,
        Math.trunc(parsed),
      ),
    );
  }

  private startOfPakistanDay(
    value: string,
  ) {
    return this.parsePakistanBoundary(
      value,
      false,
    );
  }

  private endOfPakistanDay(
    value: string,
  ) {
    return this.parsePakistanBoundary(
      value,
      true,
    );
  }

  private parsePakistanBoundary(
    value: string,
    endOfDay: boolean,
  ) {
    const dateOnly =
      /^\d{4}-\d{2}-\d{2}$/.test(
        value,
      );

    const date = new Date(
      dateOnly
        ? `${value}T${
            endOfDay
              ? '23:59:59.999'
              : '00:00:00.000'
          }+05:00`
        : value,
    );

    if (
      Number.isNaN(
        date.getTime(),
      )
    ) {
      throw new BadRequestException(
        'Invalid payment date filter',
      );
    }

    return date;
  }

  private paymentMethodLabel(
    value: string,
  ) {
    const normalized = String(
      value || '',
    ).toLowerCase();

    if (normalized === 'cash') {
      return 'Cash';
    }

    if (normalized === 'bank') {
      return 'Bank';
    }

    if (normalized === 'wallet') {
      return 'Wallet';
    }

    return normalized
      ? normalized
          .replace(
            /[_-]+/g,
            ' ',
          )
          .replace(
            /\b\w/g,
            (letter) =>
              letter.toUpperCase(),
          )
      : 'Other';
  }

  private summaryAmount(
    groups: Array<{
      direction: string;
      _sum: {
        amount: unknown;
      };
    }>,
    direction: string,
  ) {
    const group = groups.find(
      (item) =>
        item.direction ===
        direction,
    );

    return Number(
      group?._sum.amount || 0,
    );
  }

  private summaryCount(
    groups: Array<{
      direction: string;
      _count: {
        _all: number;
      };
    }>,
    direction: string,
  ) {
    return (
      groups.find(
        (item) =>
          item.direction ===
          direction,
      )?._count._all || 0
    );
  }
}
