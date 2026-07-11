import { BadRequestException, Injectable } from '@nestjs/common';
import { BusinessesService } from '../businesses/businesses.service';
import { PeriodsService } from '../periods/periods.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';

@Injectable()
export class InvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly businesses: BusinessesService,
    private readonly periods: PeriodsService,
  ) {}

  async list(userId: string, businessId: string) {
    await this.businesses.getAccessibleBusiness(userId, businessId);

    return this.prisma.invoice.findMany({
      where: {
        businessId,
      },
      include: {
        customer: true,
        items: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async create(userId: string, businessId: string, dto: CreateInvoiceDto) {
    await this.businesses.getAccessibleBusiness(userId, businessId);

    if (!dto.items?.length) {
      throw new BadRequestException('At least one invoice item is required');
    }

    const invoiceDate = dto.invoiceDate ? new Date(dto.invoiceDate) : new Date();
    const period = await this.periods.ensurePostingAllowed(userId, businessId, invoiceDate);

    const customer = dto.customerName
      ? await this.findOrCreateCustomer(businessId, dto.customerName)
      : null;

    const subtotal = dto.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    const total = subtotal;

    const count = await this.prisma.invoice.count({
      where: {
        businessId,
      },
    });

    const invoiceNumber = `INV-${String(count + 1).padStart(5, '0')}`;

    const invoice = await this.prisma.invoice.create({
      data: {
        businessId,
        customerId: customer?.id,
        invoiceNumber,
        invoiceDate,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        subtotal,
        totalAmount: total,
        notes: dto.notes,
        items: {
          create: dto.items.map((item) => ({
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            lineTotal: item.quantity * item.unitPrice,
          })),
        },
      },
      include: {
        customer: true,
        items: true,
      },
    });

    const ar = await this.prisma.account.findUnique({
      where: {
        businessId_code: {
          businessId,
          code: '1100',
        },
      },
    });

    const sales = await this.prisma.account.findUnique({
      where: {
        businessId_code: {
          businessId,
          code: '4000',
        },
      },
    });

    if (ar && sales) {
      await this.prisma.journalEntry.create({
        data: {
          businessId,
          accountingPeriodId: period.id,
          entryDate: invoice.invoiceDate,
          sourceType: 'invoice',
          sourceId: invoice.id,
          narration: `Invoice ${invoice.invoiceNumber}`,
          createdById: userId,
          lines: {
            create: [
              {
                accountId: ar.id,
                debit: total,
                credit: 0,
                partyType: 'customer',
                partyId: customer?.id,
              },
              {
                accountId: sales.id,
                debit: 0,
                credit: total,
              },
            ],
          },
        },
      });
    }

    return {
      ...invoice,
      accountingPeriod: {
        id: period.id,
        label: period.label,
        status: period.status,
      },
    };
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
}
