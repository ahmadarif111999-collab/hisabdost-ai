import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AccountType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateBusinessDto } from './dto/create-business.dto';

const SHARED_FIRM_NAME = 'ProBiz AI Firm';

export const DEFAULT_ACCOUNTS: Array<{
  code: string;
  name: string;
  type: AccountType;
  description?: string;
  requiresReview?: boolean;
}> = [
  { code: '1000', name: 'Cash in Hand', type: 'ASSET', description: 'Physical cash held by the business.' },
  { code: '1010', name: 'Bank Account', type: 'ASSET', description: 'Main bank account. Add named bank heads later if needed.' },
  { code: '1020', name: 'JazzCash / Easypaisa / Wallet', type: 'ASSET', description: 'Digital wallet collections and payments.' },
  { code: '1100', name: 'Accounts Receivable / Customers', type: 'ASSET', description: 'Amounts customers owe to the business.' },
  { code: '1200', name: 'Inventory / Stock', type: 'ASSET', description: 'Stock value placeholder; full inventory module is future phase.' },
  { code: '1300', name: 'Advance to Supplier', type: 'ASSET', description: 'Advance payments made to vendors.' },
  { code: '1400', name: 'Security Deposit', type: 'ASSET', description: 'Rent or utility deposits.' },
  { code: '1500', name: 'Office Equipment', type: 'ASSET' },
  { code: '1600', name: 'Furniture & Fixtures', type: 'ASSET' },
  { code: '1700', name: 'Input Sales Tax', type: 'ASSET', requiresReview: true },
  { code: '1710', name: 'Withholding Tax Deducted', type: 'ASSET', requiresReview: true },
  { code: '1720', name: 'Advance Income Tax', type: 'ASSET', requiresReview: true },

  { code: '2000', name: 'Accounts Payable / Suppliers', type: 'LIABILITY', description: 'Amounts owed to vendors/suppliers.' },
  { code: '2100', name: 'Customer Advances', type: 'LIABILITY', description: 'Advance money received from customers.' },
  { code: '2200', name: 'Sales Tax Payable', type: 'LIABILITY', requiresReview: true },
  { code: '2210', name: 'Withholding Tax Payable', type: 'LIABILITY', requiresReview: true },
  { code: '2220', name: 'Salary Payable', type: 'LIABILITY', requiresReview: true },
  { code: '2300', name: 'Loan Payable', type: 'LIABILITY' },

  { code: '3000', name: 'Owner Capital', type: 'EQUITY' },
  { code: '3100', name: 'Owner Drawings', type: 'EQUITY', description: 'Cash or bank withdrawals by owner.' },
  { code: '3200', name: 'Retained Earnings', type: 'EQUITY' },

  { code: '4000', name: 'Sales - Goods', type: 'INCOME' },
  { code: '4100', name: 'Sales - Services', type: 'INCOME' },
  { code: '4200', name: 'Commission Income', type: 'INCOME' },
  { code: '4300', name: 'Other Income', type: 'INCOME' },
  { code: '4900', name: 'Sales Returns / Discounts', type: 'INCOME' },

  { code: '5000', name: 'Purchases', type: 'EXPENSE', description: 'Goods/stock bought for resale.' },
  { code: '5010', name: 'Purchase Returns', type: 'EXPENSE' },
  { code: '5020', name: 'Cost of Goods Sold', type: 'EXPENSE', description: 'Future inventory/closing-stock adjustments.' },
  { code: '5030', name: 'Packaging Cost', type: 'EXPENSE' },
  { code: '5040', name: 'Delivery / Rider Cost', type: 'EXPENSE' },
  { code: '5100', name: 'Rent Expense', type: 'EXPENSE' },
  { code: '5200', name: 'Salary Expense', type: 'EXPENSE', requiresReview: true },
  { code: '5310', name: 'Electricity Expense', type: 'EXPENSE' },
  { code: '5320', name: 'Gas Expense', type: 'EXPENSE' },
  { code: '5330', name: 'Internet / Phone Expense', type: 'EXPENSE' },
  { code: '5400', name: 'Transport Expense', type: 'EXPENSE' },
  { code: '5410', name: 'Fuel Expense', type: 'EXPENSE' },
  { code: '5500', name: 'Repair & Maintenance', type: 'EXPENSE' },
  { code: '5600', name: 'Office Expense', type: 'EXPENSE' },
  { code: '5610', name: 'Printing & Stationery', type: 'EXPENSE' },
  { code: '5700', name: 'Marketing Expense', type: 'EXPENSE' },
  { code: '5800', name: 'Software Subscription', type: 'EXPENSE' },
  { code: '5900', name: 'Bank Charges', type: 'EXPENSE' },
  { code: '6000', name: 'Professional Fee', type: 'EXPENSE' },
  { code: '6010', name: 'Legal / Tax Consultant Fee', type: 'EXPENSE', requiresReview: true },
  { code: '6100', name: 'Entertainment / Tea / Refreshment', type: 'EXPENSE' },
  { code: '6200', name: 'Cleaning Expense', type: 'EXPENSE' },
  { code: '6300', name: 'Donation / Charity', type: 'EXPENSE', requiresReview: true },
  { code: '6400', name: 'Income Tax Paid', type: 'EXPENSE', requiresReview: true },
  { code: '6999', name: 'Miscellaneous Expense', type: 'EXPENSE' },
];

@Injectable()
export class BusinessesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string) {
    return this.prisma.business.findMany({
      where: {
        status: 'active',
        OR: [
          {
            organization: {
              members: {
                some: {
                  userId,
                  status: 'active',
                },
              },
            },
          },
          {
            members: {
              some: {
                userId,
                status: 'active',
              },
            },
          },
        ],
      },
      include: {
        organization: {
          select: {
            id: true,
            name: true,
            type: true,
            clientSlotLimit: true,
          },
        },
        members: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async create(userId: string, dto: CreateBusinessDto) {
    const firmMembership = await this.getFirmMembership(userId);

    if (!firmMembership) {
      throw new ForbiddenException('Only firm users can add client companies in this version.');
    }

    return this.createClientBusiness(userId, dto);
  }

  async createClientBusiness(userId: string, dto: CreateBusinessDto) {
    const membership = await this.getFirmMembership(userId);

    if (!membership) {
      throw new ForbiddenException('No firm organization found for user');
    }

    const clientCount = await this.prisma.business.count({
      where: {
        organizationId: membership.organizationId,
        status: 'active',
      },
    });

    if (clientCount >= membership.organization.clientSlotLimit) {
      throw new BadRequestException(
        `Client slot limit reached (${clientCount}/${membership.organization.clientSlotLimit}). Upgrade plan to add more clients.`,
      );
    }

    const business = await this.prisma.business.create({
      data: {
        organizationId: membership.organizationId,
        name: dto.name,
        legalName: dto.legalName || dto.name,
        businessType: dto.businessType,
        entityType: dto.entityType || 'SOLE_PROPRIETOR',
        city: dto.city,
        ntn: dto.ntn,
        strn: dto.strn,
        isSalesTaxRegistered: dto.isSalesTaxRegistered || false,
        isWithholdingAgent: dto.isWithholdingAgent || false,
        isSecpRegistered: dto.isSecpRegistered || false,
        accounts: {
          create: DEFAULT_ACCOUNTS.map((account) => ({
            ...account,
            isSystem: true,
            requiresReview: account.requiresReview || false,
          })),
        },
        complianceEvents: {
          create: [
            {
              title: 'Monthly bookkeeping close',
              authority: 'Internal',
              dueDate: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 5),
              notes:
                'Review sales, purchases, expenses, receipts, receivables, payables, and send to accountant.',
            },
          ],
        },
      },
      include: {
        accounts: true,
        complianceEvents: true,
        organization: true,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        organizationId: membership.organizationId,
        businessId: business.id,
        userId,
        action: 'CLIENT_BUSINESS_CREATED',
        entityType: 'Business',
        entityId: business.id,
        afterJson: {
          name: business.name,
          slot: clientCount + 1,
          limit: membership.organization.clientSlotLimit,
        },
      },
    });

    return business;
  }

  async inviteClientUser(userId: string, businessId: string, email: string, role = 'CLIENT_OWNER') {
    await this.getAccessibleBusiness(userId, businessId);

    const user = await this.prisma.user.findUnique({
      where: {
        email: email.toLowerCase().trim(),
      },
    });

    if (!user) {
      throw new NotFoundException('User must register before they can be invited as a client user.');
    }

    return this.prisma.businessMember.upsert({
      where: {
        businessId_userId: {
          businessId,
          userId: user.id,
        },
      },
      update: {
        role,
        status: 'active',
      },
      create: {
        businessId,
        userId: user.id,
        role,
        status: 'active',
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
          },
        },
      },
    });
  }

  async getAccessibleBusiness(userId: string, businessId: string) {
    const business = await this.prisma.business.findFirst({
      where: {
        id: businessId,
        status: 'active',
        OR: [
          {
            organization: {
              members: {
                some: {
                  userId,
                  status: 'active',
                },
              },
            },
          },
          {
            members: {
              some: {
                userId,
                status: 'active',
              },
            },
          },
        ],
      },
      include: {
        accounts: true,
        organization: true,
        members: true,
      },
    });

    if (!business) {
      throw new NotFoundException('Business not found or not accessible');
    }

    return business;
  }

  async ensureFirmUser(userId: string) {
    const membership = await this.getFirmMembership(userId);

    if (!membership) {
      throw new ForbiddenException('Firm access required');
    }

    return membership;
  }

  async isFirmUserForBusiness(userId: string, businessId: string) {
    const business = await this.prisma.business.findFirst({
      where: {
        id: businessId,
        status: 'active',
        organization: {
          members: {
            some: {
              userId,
              status: 'active',
            },
          },
        },
      },
      select: {
        id: true,
      },
    });

    return Boolean(business);
  }

  async getFirmMembershipForBusiness(userId: string, businessId: string) {
    const business = await this.prisma.business.findFirst({
      where: {
        id: businessId,
        status: 'active',
        organization: {
          members: {
            some: {
              userId,
              status: 'active',
            },
          },
        },
      },
      include: {
        organization: {
          include: {
            members: {
              where: {
                userId,
                status: 'active',
              },
            },
          },
        },
      },
    });

    return business?.organization.members[0] ?? null;
  }

  async getFirmMembership(userId: string) {
    const memberships = await this.prisma.organizationMember.findMany({
      where: {
        userId,
        status: 'active',
        organization: {
          type: 'ACCOUNTANT_FIRM',
        },
      },
      include: {
        organization: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (!memberships.length) {
      return null;
    }

    return (
      memberships.find((membership) => membership.organization.name === SHARED_FIRM_NAME) ??
      memberships.find((membership) => membership.organization.name === 'HisabDost Accounting Firm') ??
      memberships[0]
    );
  }
    async ensureFirmAccountLibrary(organizationId: string) {
    return DEFAULT_ACCOUNTS.map((account) => ({
      id: account.code,
      organizationId,
      code: account.code,
      name: account.name,
      type: account.type,
      description: account.description ?? null,
      isSystem: true,
      requiresReview: account.requiresReview ?? false,
    }));
  }

  async getFirmAccountLibrary(userId: string) {
    const membership = await this.ensureFirmUser(userId);

    return this.ensureFirmAccountLibrary(membership.organizationId);
  }

  async getUserAccessForBusiness(userId: string, businessId: string) {
    const business = await this.getAccessibleBusiness(userId, businessId);

    const firmMembership =
      (await this.getFirmMembershipForBusiness(userId, businessId)) ??
      (await this.getFirmMembership(userId));

    if (!firmMembership) {
      throw new ForbiddenException('Firm access required');
    }

    return {
      business,
      firmMembership,
    };
  }
  async copyFirmAccountsToClient(organizationId: string, businessId: string) {
    await this.ensureFirmAccountLibrary(organizationId);

    const existingAccounts = await this.prisma.account.findMany({
      where: {
        businessId,
      },
      orderBy: {
        code: 'asc',
      },
    });

    if (existingAccounts.length) {
      return existingAccounts;
    }

    const createdAccounts = [];

    for (const account of DEFAULT_ACCOUNTS) {
      const created = await this.prisma.account.create({
        data: {
          businessId,
          code: account.code,
          name: account.name,
          type: account.type,
          description: account.description,
          isSystem: true,
          requiresReview: account.requiresReview ?? false,
        },
      });

      createdAccounts.push(created);
    }

    return createdAccounts;
  }
}
