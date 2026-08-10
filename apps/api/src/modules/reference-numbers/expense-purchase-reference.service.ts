import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ReferenceNumbersService } from './reference-numbers.service';

type ExpensePurchaseKind = 'expense' | 'purchase';

type AnyRecord = Record<string, any>;

@Injectable()
export class ExpensePurchaseReferenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly references: ReferenceNumbersService,
  ) {}

  async decorateCreation(
    businessId: string,
    kind: ExpensePurchaseKind,
    result: AnyRecord,
  ) {
    const recordKey =
      kind === 'purchase'
        ? 'purchase'
        : 'expense';

    const record =
      result?.[recordKey];

    if (!record?.id) {
      return result;
    }

    const entry =
      result?.entry ||
      (await this.prisma.journalEntry.findFirst({
        where: {
          businessId,
          sourceType: kind,
          sourceId: record.id,
        },
        orderBy: [
          {
            entryDate: 'asc',
          },
          {
            createdAt: 'asc',
          },
        ],
      }));

    const entityReference =
      await this.references.attachReference(
        businessId,
        kind,
        record.id,
        record.expenseDate ||
          record.createdAt ||
          new Date(),
      );

    const journalReference =
      entry?.id
        ? await this.references.attachReference(
            businessId,
            'journal',
            entry.id,
            entry.entryDate ||
              entry.createdAt ||
              record.expenseDate ||
              new Date(),
          )
        : null;

    const referenceField =
      kind === 'purchase'
        ? 'purchaseNo'
        : 'expenseNo';

    const decoratedRecord = {
      ...record,

      [referenceField]:
        entityReference,

      referenceNo:
        entityReference,

      displayNumber:
        entityReference,

      journalReferenceNo:
        journalReference,
    };

    const decoratedEntry =
      entry
        ? {
            ...entry,

            entryNo:
              journalReference,

            referenceNo:
              journalReference,

            displayNumber:
              journalReference,

            sourceReferenceNo:
              entityReference,
          }
        : result?.entry;

    return {
      ...result,

      referenceNo:
        entityReference,

      journalReferenceNo:
        journalReference,

      [recordKey]:
        decoratedRecord,

      ...(decoratedEntry
        ? {
            entry:
              decoratedEntry,
          }
        : {}),

      message:
        this.creationMessage(
          result?.message,
          entityReference,
          journalReference,
        ),
    };
  }

  async decorateReportPayload(
    businessId: string,
    kind: ExpensePurchaseKind,
    payload: any,
  ) {
    if (
      Array.isArray(payload)
    ) {
      return this.decorateRows(
        businessId,
        kind,
        payload,
      );
    }

    if (
      !payload ||
      typeof payload !==
        'object'
    ) {
      return payload;
    }

    const output = {
      ...payload,
    };

    if (
      Array.isArray(
        payload.purchases,
      )
    ) {
      output.purchases =
        await this.decorateRows(
          businessId,
          'purchase',
          payload.purchases,
        );
    }

    if (
      Array.isArray(
        payload.expenses,
      )
    ) {
      output.expenses =
        await this.decorateRows(
          businessId,
          'expense',
          payload.expenses,
        );
    }

    if (
      Array.isArray(
        payload.rows,
      )
    ) {
      output.rows =
        await this.decorateRows(
          businessId,
          kind,
          payload.rows,
        );
    }

    return output;
  }

  private async decorateRows(
    businessId: string,
    kind: ExpensePurchaseKind,
    records: AnyRecord[],
  ) {
    const validRecords =
      records.filter(
        (record) =>
          record?.id,
      );

    if (
      !validRecords.length
    ) {
      return records.map(
        (record) =>
          this.safeFallbackRow(
            kind,
            record,
          ),
      );
    }

    const recordIds =
      Array.from(
        new Set(
          validRecords.map(
            (record) =>
              String(
                record.id,
              ),
          ),
        ),
      );

    const journals =
      await this.prisma.journalEntry.findMany({
        where: {
          businessId,

          sourceType:
            kind,

          sourceId: {
            in: recordIds,
          },
        },

        orderBy: [
          {
            entryDate:
              'asc',
          },

          {
            createdAt:
              'asc',
          },
        ],
      });

    const journalBySource =
      new Map<
        string,
        (typeof journals)[number]
      >();

    for (
      const journal of
      journals
    ) {
      if (
        journal.sourceId &&
        !journalBySource.has(
          journal.sourceId,
        )
      ) {
        journalBySource.set(
          journal.sourceId,
          journal,
        );
      }
    }

    const entityReferences =
      await this.references.ensureMany(
        businessId,
        kind,

        validRecords.map(
          (record) => ({
            id: record.id,

            date:
              record.expenseDate ||
              record.createdAt ||
              new Date(),
          }),
        ),
      );

    const journalReferences =
      await this.references.ensureMany(
        businessId,
        'journal',

        journals.map(
          (journal) => ({
            id: journal.id,

            date:
              journal.entryDate ||
              journal.createdAt,
          }),
        ),
      );

    const vendorIds =
      Array.from(
        new Set(
          validRecords
            .map(
              (record) =>
                record.vendorId,
            )
            .filter(
              (
                id,
              ): id is string =>
                Boolean(id),
            ),
        ),
      );

    const accountIds =
      Array.from(
        new Set(
          validRecords
            .flatMap(
              (record) => [
                record.categoryAccountId,
                record.paymentAccountId,
              ],
            )
            .filter(
              (
                id,
              ): id is string =>
                Boolean(id),
            ),
        ),
      );

    const userIds =
      Array.from(
        new Set(
          journals
            .flatMap(
              (journal) => [
                journal.createdById,
                journal.approvedById,
              ],
            )
            .filter(
              (
                id,
              ): id is string =>
                Boolean(id),
            ),
        ),
      );

    const [
      vendors,
      accounts,
      users,
    ] =
      await Promise.all([
        vendorIds.length
          ? this.prisma.vendor.findMany({
              where: {
                businessId,

                id: {
                  in: vendorIds,
                },
              },

              select: {
                id: true,
                name: true,
              },
            })
          : Promise.resolve([]),

        accountIds.length
          ? this.prisma.account.findMany({
              where: {
                businessId,

                id: {
                  in: accountIds,
                },
              },

              select: {
                id: true,
                code: true,
                name: true,
              },
            })
          : Promise.resolve([]),

        userIds.length
          ? this.prisma.user.findMany({
              where: {
                id: {
                  in: userIds,
                },
              },

              select: {
                id: true,
                name: true,
                email: true,
              },
            })
          : Promise.resolve([]),
      ]);

    const vendorMap =
      new Map(
        vendors.map(
          (vendor) => [
            vendor.id,
            vendor.name,
          ],
        ),
      );

    const accountMap =
      new Map(
        accounts.map(
          (account) => [
            account.id,
            account,
          ],
        ),
      );

    const userMap =
      new Map(
        users.map(
          (user) => [
            user.id,
            user,
          ],
        ),
      );

    return records.map(
      (record) => {
        if (
          !record?.id
        ) {
          return this.safeFallbackRow(
            kind,
            record,
          );
        }

        const journal =
          journalBySource.get(
            record.id,
          );

        const entityReference =
          entityReferences[
            record.id
          ] ||
          'Not assigned';

        const journalReference =
          journal
            ? journalReferences[
                journal.id
              ] ||
              'Not assigned'
            : 'Not assigned';

        const categoryAccount =
          record.categoryAccountId
            ? accountMap.get(
                record.categoryAccountId,
              )
            : undefined;

        const paymentAccount =
          record.paymentAccountId
            ? accountMap.get(
                record.paymentAccountId,
              )
            : undefined;

        const createdBy =
          journal?.createdById
            ? userMap.get(
                journal.createdById,
              )
            : undefined;

        const approvedBy =
          journal?.approvedById
            ? userMap.get(
                journal.approvedById,
              )
            : undefined;

        const referenceField =
          kind === 'purchase'
            ? 'purchaseNo'
            : 'expenseNo';

        return {
          [referenceField]:
            entityReference,

          referenceNo:
            entityReference,

          displayNumber:
            entityReference,

          journalReferenceNo:
            journalReference,

          journalNo:
            journalReference,

          kind,

          date:
            record.expenseDate ||
            null,

          expenseDate:
            record.expenseDate ||
            null,

          vendor:
            record.vendor?.name ||
            vendorMap.get(
              record.vendorId,
            ) ||
            'Not specified',

          account:
            categoryAccount?.name ||
            'Account not found',

          paymentMethod:
            this.paymentMethodLabel(
              paymentAccount,
            ),

          description:
            record.description ||
            (kind ===
            'purchase'
              ? 'Purchase'
              : 'Expense'),

          amount:
            this.numberValue(
              record.amount,
            ),

          taxAmount:
            this.numberValue(
              record.taxAmount,
            ),

          documentStatus:
            record.documentId
              ? 'Attached'
              : 'Missing',

          status:
            record.status ||
            journal?.status ||
            'posted',

          createdBy:
            this.personLabel(
              createdBy,
            ) ||
            'Unknown user',

          approvedBy:
            this.personLabel(
              approvedBy,
            ) ||
            'Not approved',

          createdAt:
            record.createdAt ||
            null,
        };
      },
    );
  }

  private safeFallbackRow(
    kind: ExpensePurchaseKind,
    record: AnyRecord,
  ) {
    const output:
      AnyRecord = {};

    for (
      const [
        key,
        value,
      ] of Object.entries(
        record || {},
      )
    ) {
      if (
        this.isInternalIdKey(
          key,
        )
      ) {
        continue;
      }

      output[key] =
        value;
    }

    return {
      ...output,

      kind,

      referenceNo:
        output.referenceNo ||
        'Not assigned',

      displayNumber:
        output.displayNumber ||
        output.referenceNo ||
        'Not assigned',

      journalReferenceNo:
        output.journalReferenceNo ||
        'Not assigned',
    };
  }

  private paymentMethodLabel(
    account:
      | {
          code: string;
          name: string;
        }
      | undefined,
  ) {
    if (!account) {
      return 'Not specified';
    }

    const code =
      String(
        account.code ||
          '',
      ).trim();

    if (
      code === '1000'
    ) {
      return 'Cash';
    }

    if (
      code === '1010'
    ) {
      return 'Bank';
    }

    if (
      code === '1020'
    ) {
      return 'Wallet';
    }

    if (
      code === '2000'
    ) {
      return 'Payable';
    }

    return (
      account.name ||
      code ||
      'Not specified'
    );
  }

  private personLabel(
    person:
      | {
          name:
            | string
            | null;

          email: string;
        }
      | undefined,
  ) {
    return (
      person?.name ||
      person?.email ||
      ''
    );
  }

  private numberValue(
    value: unknown,
  ) {
    const number =
      Number(
        value || 0,
      );

    return Number.isFinite(
      number,
    )
      ? number
      : 0;
  }

  private creationMessage(
    existingMessage: unknown,
    entityReference: string,
    journalReference:
      | string
      | null,
  ) {
    const base =
      String(
        existingMessage ||
          'Transaction recorded',
      ).trim();

    return journalReference
      ? `${base} — ${entityReference} / ${journalReference}`
      : `${base} — ${entityReference}`;
  }

  private isInternalIdKey(
    key: string,
  ) {
    return (
      key === 'id' ||
      key ===
        'businessId' ||
      key.endsWith(
        'Id',
      ) ||
      key.endsWith(
        '_id',
      )
    );
  }
}
