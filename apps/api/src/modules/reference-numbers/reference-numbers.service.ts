import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

type ReferenceRecord = {
  id: string;
  date: Date | string;
};

const PREFIXES: Record<string, string> = {
  journal: 'JE',
  invoice: 'INV',
  payment: 'PAY',
  receipt: 'REC',
  expense: 'EXP',
  purchase: 'PUR',
  report_request: 'RPT',
  report_export: 'EX',
  document: 'DOC',
};

const LEGACY_RECEIVED_PAYMENT_ENTITY_TYPE =
  'legacy_received_payment';

@Injectable()
export class ReferenceNumbersService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  async nextReferenceNo(
    businessId: string,
    entityType: string,
    referenceDate: Date | string = new Date(),
  ) {
    const date =
      this.validDate(
        referenceDate,
      );

    const year =
      this.pakistanYear(
        date,
      );

    const prefix =
      this.prefix(
        entityType,
      );

    const sequence =
      await this.prisma.businessReferenceSequence.upsert({
        where: {
          businessId_entityType_year: {
            businessId,
            entityType,
            year,
          },
        },

        create: {
          businessId,
          entityType,
          year,
          lastNumber: 1,
        },

        update: {
          lastNumber: {
            increment: 1,
          },
        },

        select: {
          lastNumber: true,
        },
      });

    return this.format(
      prefix,
      year,
      sequence.lastNumber,
    );
  }

  async attachReference(
    businessId: string,
    entityType: string,
    entityId: string,
    referenceDate: Date | string,
    preferredReferenceNo?: string,
  ) {
    if (
      entityType ===
      'payment'
    ) {
      const payment =
        await this.prisma.payment.findFirst({
          where: {
            id: entityId,
            businessId,
          },

          select: {
            direction: true,
            paymentDate: true,
          },
        });

      if (
        payment?.direction ===
        'received'
      ) {
        const receiptNo =
          await this.attachStandardReference(
            businessId,
            'receipt',
            entityId,
            payment.paymentDate ||
              referenceDate,
            preferredReferenceNo?.startsWith(
              'REC-',
            )
              ? preferredReferenceNo
              : undefined,
          );

        await this.archiveStalePaymentReferences(
          businessId,
          [
            entityId,
          ],
        );

        return receiptNo;
      }
    }

    return this.attachStandardReference(
      businessId,
      entityType,
      entityId,
      referenceDate,
      preferredReferenceNo,
    );
  }

  async ensureMany(
    businessId: string,
    entityType: string,
    records: ReferenceRecord[],
  ): Promise<
    Record<
      string,
      string
    >
  > {
    if (
      !records.length
    ) {
      return {};
    }

    if (
      entityType !==
      'payment'
    ) {
      return this.ensureManyStandard(
        businessId,
        entityType,
        records,
      );
    }

    /*
     * Before returning any payment activity, make sure every
     * historical incoming payment has a permanent REC reference.
     *
     * This makes the correction lazy but business-wide:
     * opening Cash & Bank, reports, or any other payment-backed
     * view corrects every received payment for that business.
     */
    await this.backfillReceivedPaymentReferences(
      businessId,
    );

    const uniqueRecords =
      this.uniqueRecords(
        records,
      );

    const payments =
      await this.prisma.payment.findMany({
        where: {
          businessId,

          id: {
            in: uniqueRecords.map(
              (record) =>
                record.id,
            ),
          },
        },

        select: {
          id: true,
          direction: true,
          paymentDate: true,
        },
      });

    const paymentMap =
      new Map<
        string,
        {
          id: string;
          direction: string;
          paymentDate: Date;
        }
      >(
        payments.map(
          (payment) => [
            payment.id,
            payment,
          ],
        ),
      );

    const receivedRecords:
      ReferenceRecord[] =
      [];

    const paidRecords:
      ReferenceRecord[] =
      [];

    for (
      const record of
      uniqueRecords
    ) {
      const payment =
        paymentMap.get(
          record.id,
        );

      if (
        payment?.direction ===
        'received'
      ) {
        receivedRecords.push({
          id: record.id,

          date:
            payment.paymentDate ||
            record.date,
        });
      } else {
        paidRecords.push(
          record,
        );
      }
    }

    const [
      paymentReferences,
      receiptReferences,
    ] =
      await Promise.all([
        this.ensureManyStandard(
          businessId,
          'payment',
          paidRecords,
        ),

        this.ensureManyStandard(
          businessId,
          'receipt',
          receivedRecords,
        ),
      ]);

    /*
     * A received payment must have only one active internal
     * user-facing reference type: receipt/REC.
     *
     * Older payment/PAY references are retained as legacy audit
     * records rather than deleted.
     */
    if (
      receivedRecords.length
    ) {
      await this.archiveStalePaymentReferences(
        businessId,

        receivedRecords.map(
          (record) =>
            record.id,
        ),
      );
    }

    return {
      ...paymentReferences,
      ...receiptReferences,
    };
  }

  private async backfillReceivedPaymentReferences(
    businessId: string,
  ) {
    const receivedPayments =
      await this.prisma.payment.findMany({
        where: {
          businessId,
          direction:
            'received',
        },

        orderBy: [
          {
            paymentDate:
              'asc',
          },
          {
            id: 'asc',
          },
        ],

        select: {
          id: true,
          paymentDate: true,
        },
      });

    if (
      !receivedPayments.length
    ) {
      return;
    }

    /*
     * ensureManyStandard is deterministic for missing references:
     *
     * 1. records are grouped by Pakistan reference year
     * 2. each group is sorted by transaction date
     * 3. equal dates are sorted by immutable entity ID
     * 4. one atomic sequence reservation allocates the numbers
     */
    await this.ensureManyStandard(
      businessId,
      'receipt',

      receivedPayments.map(
        (payment) => ({
          id: payment.id,
          date:
            payment.paymentDate,
        }),
      ),
    );

    /*
     * Preserve any historical PAY reference rows rather than
     * deleting them.
     *
     * They cease to be active "payment" references and therefore
     * cannot be returned as the current reference for received
     * money.
     */
    await this.archiveStalePaymentReferences(
      businessId,

      receivedPayments.map(
        (payment) =>
          payment.id,
      ),
    );
  }

  private async attachStandardReference(
    businessId: string,
    entityType: string,
    entityId: string,
    referenceDate: Date | string,
    preferredReferenceNo?: string,
  ) {
    const existing =
      await this.prisma.businessReference.findUnique({
        where: {
          businessId_entityType_entityId: {
            businessId,
            entityType,
            entityId,
          },
        },
      });

    /*
     * References are permanent.
     *
     * A refresh or repeat request always returns the existing
     * number instead of allocating another one.
     */
    if (existing) {
      return existing.referenceNo;
    }

    const date =
      this.validDate(
        referenceDate,
      );

    const referenceNo =
      preferredReferenceNo ||
      (await this.nextReferenceNo(
        businessId,
        entityType,
        date,
      ));

    try {
      const created =
        await this.prisma.businessReference.create({
          data: {
            businessId,
            entityType,
            entityId,
            referenceNo,
            referenceDate:
              date,
          },
        });

      return created.referenceNo;
    } catch (error) {
      /*
       * Two requests can attempt to allocate the same entity
       * simultaneously.
       *
       * The database unique constraint is authoritative. If
       * another request created it first, return that permanent
       * reference.
       */
      if (
        this.isUniqueConflict(
          error,
        )
      ) {
        const concurrent =
          await this.prisma.businessReference.findUnique({
            where: {
              businessId_entityType_entityId: {
                businessId,
                entityType,
                entityId,
              },
            },
          });

        if (concurrent) {
          return concurrent.referenceNo;
        }
      }

      throw error;
    }
  }

  private async ensureManyStandard(
    businessId: string,
    entityType: string,
    records: ReferenceRecord[],
  ): Promise<
    Record<
      string,
      string
    >
  > {
    if (
      !records.length
    ) {
      return {};
    }

    const uniqueRecords =
      this.uniqueRecords(
        records,
      );

    const existing =
      await this.prisma.businessReference.findMany({
        where: {
          businessId,
          entityType,

          entityId: {
            in: uniqueRecords.map(
              (record) =>
                record.id,
            ),
          },
        },

        select: {
          entityId: true,
          referenceNo: true,
        },
      });

    const existingIds =
      new Set(
        existing.map(
          (reference) =>
            reference.entityId,
        ),
      );

    const missing =
      uniqueRecords.filter(
        (record) =>
          !existingIds.has(
            record.id,
          ),
      );

    const groups =
      new Map<
        number,
        ReferenceRecord[]
      >();

    for (
      const record of
      missing
    ) {
      const date =
        this.validDate(
          record.date,
        );

      const year =
        this.pakistanYear(
          date,
        );

      const group =
        groups.get(
          year,
        ) || [];

      group.push({
        id: record.id,
        date,
      });

      groups.set(
        year,
        group,
      );
    }

    for (
      const [
        year,
        group,
      ] of
      groups.entries()
    ) {
      group.sort(
        (
          left,
          right,
        ) => {
          const dateDifference =
            this.validDate(
              left.date,
            ).getTime() -
            this.validDate(
              right.date,
            ).getTime();

          if (
            dateDifference !==
            0
          ) {
            return dateDifference;
          }

          return left.id.localeCompare(
            right.id,
          );
        },
      );

      await this.allocateGroup(
        businessId,
        entityType,
        year,
        group,
      );
    }

    const allReferences =
      await this.prisma.businessReference.findMany({
        where: {
          businessId,
          entityType,

          entityId: {
            in: uniqueRecords.map(
              (record) =>
                record.id,
            ),
          },
        },

        select: {
          entityId: true,
          referenceNo: true,
        },
      });

    return allReferences.reduce<
      Record<
        string,
        string
      >
    >(
      (
        map,
        reference,
      ) => {
        map[
          reference.entityId
        ] =
          reference.referenceNo;

        return map;
      },
      {},
    );
  }

  private async allocateGroup(
    businessId: string,
    entityType: string,
    year: number,
    records: ReferenceRecord[],
  ) {
    if (
      !records.length
    ) {
      return;
    }

    const prefix =
      this.prefix(
        entityType,
      );

    await this.prisma.$transaction(
      async (tx) => {
        /*
         * Reserve the entire block atomically.
         *
         * This avoids count()+1 and ensures concurrent requests
         * cannot receive the same sequence number.
         */
        const sequence =
          await tx.businessReferenceSequence.upsert({
            where: {
              businessId_entityType_year: {
                businessId,
                entityType,
                year,
              },
            },

            create: {
              businessId,
              entityType,
              year,

              lastNumber:
                records.length,
            },

            update: {
              lastNumber: {
                increment:
                  records.length,
              },
            },

            select: {
              lastNumber: true,
            },
          });

        const firstNumber =
          sequence.lastNumber -
          records.length +
          1;

        await tx.businessReference.createMany({
          data:
            records.map(
              (
                record,
                index,
              ) => ({
                businessId,
                entityType,
                entityId:
                  record.id,

                referenceNo:
                  this.format(
                    prefix,
                    year,
                    firstNumber +
                      index,
                  ),

                referenceDate:
                  this.validDate(
                    record.date,
                  ),
              }),
            ),

          /*
           * If another concurrent backfill created an entity
           * between our initial lookup and this transaction,
           * its permanent reference wins.
           */
          skipDuplicates:
            true,
        });
      },
    );
  }

  private async archiveStalePaymentReferences(
    businessId: string,
    receivedPaymentIds: string[],
  ) {
    const uniqueIds =
      Array.from(
        new Set(
          receivedPaymentIds,
        ),
      );

    if (
      !uniqueIds.length
    ) {
      return;
    }

    /*
     * IMPORTANT:
     *
     * Do not delete historical references.
     *
     * Phase 2 could have created:
     *
     *   entityType = payment
     *   referenceNo = PAY-2026-000001
     *
     * for an incoming customer receipt.
     *
     * Phase 3 creates the correct active reference:
     *
     *   entityType = receipt
     *   referenceNo = REC-2026-000001
     *
     * The old PAY row is retained for audit/history purposes but
     * moved out of the active payment namespace.
     *
     * Running this repeatedly is safe because only rows whose
     * current entityType is exactly "payment" are changed.
     */
    await this.prisma.businessReference.updateMany({
      where: {
        businessId,

        entityType:
          'payment',

        entityId: {
          in: uniqueIds,
        },
      },

      data: {
        entityType:
          LEGACY_RECEIVED_PAYMENT_ENTITY_TYPE,
      },
    });
  }

  private uniqueRecords(
    records: ReferenceRecord[],
  ) {
    return Array.from(
      new Map(
        records.map(
          (record) => [
            record.id,
            record,
          ],
        ),
      ).values(),
    );
  }

  private prefix(
    entityType: string,
  ) {
    return (
      PREFIXES[
        entityType
      ] ||
      String(
        entityType ||
          'REF',
      )
        .slice(
          0,
          3,
        )
        .toUpperCase()
    );
  }

  private format(
    prefix: string,
    year: number,
    sequence: number,
  ) {
    return `${prefix}-${year}-${String(
      sequence,
    ).padStart(
      6,
      '0',
    )}`;
  }

  private pakistanYear(
    value: Date,
  ) {
    return Number(
      new Intl.DateTimeFormat(
        'en',
        {
          timeZone:
            'Asia/Karachi',

          year:
            'numeric',
        },
      ).format(
        value,
      ),
    );
  }

  private validDate(
    value:
      | Date
      | string,
  ) {
    const date =
      value instanceof
      Date
        ? value
        : new Date(
            value,
          );

    if (
      Number.isNaN(
        date.getTime(),
      )
    ) {
      return new Date();
    }

    return date;
  }

  private isUniqueConflict(
    error: unknown,
  ) {
    return (
      error instanceof
        Prisma.PrismaClientKnownRequestError &&
      (
        error as
          Prisma.PrismaClientKnownRequestError
      ).code ===
        'P2002'
    );
  }
}
