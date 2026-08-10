import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { BusinessesService } from '../businesses/businesses.service';

const REFERENCE_PATTERN =
  /^(JE|INV|EXP|PUR|PAY|REC|RPT|EX|DOC)-\d{4}-\d{6}$/;

@Injectable()
export class ReferenceResolutionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly businesses: BusinessesService,
  ) {}

  async resolve(
    userId: string,
    businessId: string,
    referenceNo: string,
  ) {
    await this.businesses.getAccessibleBusiness(
      userId,
      businessId,
    );

    const normalizedReference = String(
      referenceNo || '',
    )
      .trim()
      .toUpperCase();

    if (
      !REFERENCE_PATTERN.test(
        normalizedReference,
      )
    ) {
      throw new BadRequestException(
        'Invalid human-readable reference.',
      );
    }

    const reference =
      await this.prisma.businessReference.findFirst({
        where: {
          businessId,
          referenceNo:
            normalizedReference,
        },
      });

    if (!reference) {
      throw new NotFoundException(
        `Reference ${normalizedReference} was not found for this client.`,
      );
    }

    const base = {
      referenceNo:
        reference.referenceNo,

      entityType:
        reference.entityType,

      referenceDate:
        reference.referenceDate,

      internalEntityId:
        reference.entityId,

      linkedReferenceNo:
        null as string | null,

      linkedEntityType:
        null as string | null,

      linkedJournalReferenceNo:
        null as string | null,

      sourceType:
        null as string | null,
    };

    if (
      reference.entityType ===
      'journal'
    ) {
      const entry =
        await this.prisma.journalEntry.findFirst({
          where: {
            id: reference.entityId,
            businessId,
          },

          select: {
            sourceType: true,
            sourceId: true,
          },
        });

      if (!entry) {
        throw new NotFoundException(
          `The journal entry for ${normalizedReference} no longer exists.`,
        );
      }

      const linked =
        entry.sourceId
          ? await this.findEntityReference(
              businessId,
              entry.sourceId,
              this.referenceTypesForSource(
                entry.sourceType,
              ),
            )
          : null;

      return {
        ...base,

        sourceType:
          entry.sourceType,

        linkedReferenceNo:
          linked?.referenceNo ||
          null,

        linkedEntityType:
          linked?.entityType ||
          null,
      };
    }

    if (
      reference.entityType ===
      'document'
    ) {
      const document =
        await this.prisma.document.findFirst({
          where: {
            id: reference.entityId,
            businessId,
          },

          select: {
            linkedEntityType:
              true,

            linkedEntityId:
              true,
          },
        });

      if (!document) {
        throw new NotFoundException(
          `The document for ${normalizedReference} no longer exists.`,
        );
      }

      const linked =
        document.linkedEntityId
          ? await this.findEntityReference(
              businessId,
              document.linkedEntityId,
              this.referenceTypesForLinkedEntity(
                document.linkedEntityType,
              ),
            )
          : null;

      const linkedJournal =
        document.linkedEntityId
          ? await this.prisma.journalEntry.findFirst(
              {
                where: {
                  businessId,

                  sourceId:
                    document.linkedEntityId,

                  ...(document.linkedEntityType
                    ? {
                        sourceType:
                          document.linkedEntityType,
                      }
                    : {}),
                },

                select: {
                  id: true,
                },
              },
            )
          : null;

      const journalReference =
        linkedJournal
          ? await this.prisma.businessReference.findFirst(
              {
                where: {
                  businessId,

                  entityType:
                    'journal',

                  entityId:
                    linkedJournal.id,
                },

                select: {
                  referenceNo:
                    true,
                },
              },
            )
          : null;

      return {
        ...base,

        linkedReferenceNo:
          linked?.referenceNo ||
          null,

        linkedEntityType:
          linked?.entityType ||
          document.linkedEntityType ||
          null,

        linkedJournalReferenceNo:
          journalReference?.referenceNo ||
          null,
      };
    }

    if (
      [
        'expense',
        'purchase',
        'payment',
        'receipt',
      ].includes(
        reference.entityType,
      )
    ) {
      const linkedJournal =
        await this.prisma.journalEntry.findFirst({
          where: {
            businessId,

            sourceId:
              reference.entityId,
          },

          select: {
            id: true,

            sourceType: true,
          },
        });

      const journalReference =
        linkedJournal
          ? await this.prisma.businessReference.findFirst(
              {
                where: {
                  businessId,

                  entityType:
                    'journal',

                  entityId:
                    linkedJournal.id,
                },

                select: {
                  referenceNo:
                    true,
                },
              },
            )
          : null;

      return {
        ...base,

        sourceType:
          linkedJournal?.sourceType ||
          null,

        linkedJournalReferenceNo:
          journalReference?.referenceNo ||
          null,
      };
    }

    return base;
  }

  private async findEntityReference(
    businessId: string,
    entityId: string,
    preferredTypes: string[],
  ) {
    for (
      const entityType of
      preferredTypes
    ) {
      const reference =
        await this.prisma.businessReference.findFirst(
          {
            where: {
              businessId,

              entityType,

              entityId,
            },

            select: {
              entityType:
                true,

              referenceNo:
                true,
            },
          },
        );

      if (reference) {
        return reference;
      }
    }

    return this.prisma.businessReference.findFirst(
      {
        where: {
          businessId,

          entityId,
        },

        select: {
          entityType:
            true,

          referenceNo:
            true,
        },
      },
    );
  }

  private referenceTypesForSource(
    sourceType: string,
  ) {
    switch (
      String(
        sourceType || '',
      ).toLowerCase()
    ) {
      case 'expense':
        return [
          'expense',
        ];

      case 'purchase':
        return [
          'purchase',
        ];

      case 'customer_payment':
        return [
          'receipt',
          'payment',
        ];

      case 'supplier_payment':
        return [
          'payment',
        ];

      case 'payment':
        return [
          'receipt',
          'payment',
        ];

      default:
        return [];
    }
  }

  private referenceTypesForLinkedEntity(
    entityType?:
      | string
      | null,
  ) {
    switch (
      String(
        entityType || '',
      ).toLowerCase()
    ) {
      case 'expense':
        return [
          'expense',
        ];

      case 'purchase':
        return [
          'purchase',
        ];

      case 'payment':
        return [
          'receipt',
          'payment',
        ];

      default:
        return [];
    }
  }
}
