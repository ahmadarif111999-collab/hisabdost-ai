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
  expense: 'EXP',
  purchase: 'PUR',
  report_request: 'RPT',
  report_export: 'EX',
  document: 'DOC',
};

@Injectable()
export class ReferenceNumbersService {
  constructor(private readonly prisma: PrismaService) {}

  async nextReferenceNo(
    businessId: string,
    entityType: string,
    referenceDate: Date | string = new Date(),
  ) {
    const date = this.validDate(referenceDate);
    const year = this.pakistanYear(date);
    const prefix = this.prefix(entityType);

    const sequence = await this.prisma.businessReferenceSequence.upsert({
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

    return this.format(prefix, year, sequence.lastNumber);
  }

  async attachReference(
    businessId: string,
    entityType: string,
    entityId: string,
    referenceDate: Date | string,
    preferredReferenceNo?: string,
  ) {
    const existing = await this.prisma.businessReference.findUnique({
      where: {
        businessId_entityType_entityId: {
          businessId,
          entityType,
          entityId,
        },
      },
    });

    if (existing) {
      return existing.referenceNo;
    }

    const date = this.validDate(referenceDate);

    const referenceNo =
      preferredReferenceNo ||
      (await this.nextReferenceNo(businessId, entityType, date));

    try {
      const created = await this.prisma.businessReference.create({
        data: {
          businessId,
          entityType,
          entityId,
          referenceNo,
          referenceDate: date,
        },
      });

      return created.referenceNo;
    } catch (error) {
      if (this.isUniqueConflict(error)) {
        const concurrent = await this.prisma.businessReference.findUnique({
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

  async ensureMany(
    businessId: string,
    entityType: string,
    records: ReferenceRecord[],
  ): Promise<Record<string, string>> {
    if (!records.length) {
      return {};
    }

    const uniqueRecords = Array.from(
      new Map(records.map((record) => [record.id, record])).values(),
    );

    const existing = await this.prisma.businessReference.findMany({
      where: {
        businessId,
        entityType,
        entityId: {
          in: uniqueRecords.map((record) => record.id),
        },
      },
      select: {
        entityId: true,
        referenceNo: true,
      },
    });

    const existingIds = new Set(
      existing.map((reference) => reference.entityId),
    );

    const missing = uniqueRecords.filter(
      (record) => !existingIds.has(record.id),
    );

    const groups = new Map<number, ReferenceRecord[]>();

    for (const record of missing) {
      const date = this.validDate(record.date);
      const year = this.pakistanYear(date);
      const group = groups.get(year) || [];

      group.push({
        id: record.id,
        date,
      });

      groups.set(year, group);
    }

    for (const [year, group] of groups.entries()) {
      group.sort((left, right) => {
        const dateDifference =
          this.validDate(left.date).getTime() -
          this.validDate(right.date).getTime();

        if (dateDifference !== 0) {
          return dateDifference;
        }

        return left.id.localeCompare(right.id);
      });

      await this.allocateGroup(
        businessId,
        entityType,
        year,
        group,
      );
    }

    const allReferences = await this.prisma.businessReference.findMany({
      where: {
        businessId,
        entityType,
        entityId: {
          in: uniqueRecords.map((record) => record.id),
        },
      },
      select: {
        entityId: true,
        referenceNo: true,
      },
    });

    return allReferences.reduce<Record<string, string>>(
      (map, reference) => {
        map[reference.entityId] = reference.referenceNo;
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
    if (!records.length) {
      return;
    }

    const prefix = this.prefix(entityType);

    await this.prisma.$transaction(async (tx) => {
      const sequence = await tx.businessReferenceSequence.upsert({
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
          lastNumber: records.length,
        },
        update: {
          lastNumber: {
            increment: records.length,
          },
        },
        select: {
          lastNumber: true,
        },
      });

      const firstNumber =
        sequence.lastNumber - records.length + 1;

      await tx.businessReference.createMany({
        data: records.map((record, index) => ({
          businessId,
          entityType,
          entityId: record.id,
          referenceNo: this.format(
            prefix,
            year,
            firstNumber + index,
          ),
          referenceDate: this.validDate(record.date),
        })),
        skipDuplicates: true,
      });
    });
  }

  private prefix(entityType: string) {
    return (
      PREFIXES[entityType] ||
      String(entityType || 'REF').slice(0, 3).toUpperCase()
    );
  }

  private format(
    prefix: string,
    year: number,
    sequence: number,
  ) {
    return `${prefix}-${year}-${String(sequence).padStart(6, '0')}`;
  }

  private pakistanYear(value: Date) {
    return Number(
      new Intl.DateTimeFormat('en', {
        timeZone: 'Asia/Karachi',
        year: 'numeric',
      }).format(value),
    );
  }

  private validDate(value: Date | string) {
    const date =
      value instanceof Date ? value : new Date(value);

    if (Number.isNaN(date.getTime())) {
      return new Date();
    }

    return date;
  }

  private isUniqueConflict(error: unknown) {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
  }
}
