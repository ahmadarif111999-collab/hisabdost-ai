import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AccountType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateBusinessDto } from './dto/create-business.dto';

const PROBIZ_FIRM = {
  name: 'ProBiz Consultants',
  type: 'ACCOUNTANT_FIRM' as const,
  planName: 'Partner Beta',
  clientSlotLimit: 10,
  firmUserLimit: 5,
};

const PROBIZ_PARTNERS = [
  'ahmadarif111999@gmail.com',
  'yjavaid01@gmail.com',
  'maysumzaidi2001@gmail.com',
  'asfandsajjid@gmail.com',
  'ali.awan9167@gmail.com',
];

const AHMAD_EMAIL = 'ahmadarif111999@gmail.com';

function normalizeEmail(email: string) {
  return email.toLowerCase().trim();
}

function isProBizPartner(email: string) {
  return PROBIZ_PARTNERS.includes(normalizeEmail(email));
}

function canGrantClientAccess(email: string) {
  return normalizeEmail(email) === AHMAD_EMAIL;
}

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
    const firmMembership = await this.getFirmMembership(userId);

    return this.prisma.business.findMany({
      where: {
        status: 'active',
        OR: [
          ...(firmMembership ? [{ organizationId: firmMembership.organizationId }] : []),
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
            planName: true,
            clientSlotLimit: true,
            firmUserLimit: true,
          },
        },
        members: {
          where: {
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
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async create(userId: string, dto: CreateBusinessDto) {
    return this.createClientBusiness(userId, dto);
  }

  async createClientBusiness(userId: string, dto: CreateBusinessDto) {
    const membership = await this.ensureFirmUser(userId);

    const clientCount = await this.prisma.business.count({
      where: {
        organizationId: membership.organizationId,
        status: 'active',
      },
    });

    if (clientCount >= membership.organization.clientSlotLimit) {
      throw new BadRequestException(
        `Client slot limit reached (${clientCount}/${membership.organization.clientSlotLimit}).`,
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
        isSalesTaxRegistered: dto.isSalesTaxRegistered ?? false,
        isWithholdingAgent: dto.isWithholdingAgent ?? false,
        isSecpRegistered: dto.isSecpRegistered ?? false,
        status: 'active',
        accounts: {
          create: DEFAULT_ACCOUNTS.map((account) => ({
            code: account.code,
            name: account.name,
            type: account.type,
            description: account.description,
            isSystem: true,
            isActive: true,
            requiresReview: account.requiresReview ?? false,
          })),
        },
        complianceEvents: {
          create: [
            {
              title: 'Monthly bookkeeping close',
              authority: 'Internal',
              dueDate: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 5),
              notes: 'Review sales, purchases, expenses, receipts, receivables, payables, and send to accountant.',
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
          firm: membership.organization.name,
        },
      },
    });

    return business;
  }

  async archiveClientBusiness(userId: string, businessId: string) {
    const membership = await this.ensureFirmUser(userId);

    const business = await this.prisma.business.findFirst({
      where: {
        id: businessId,
        organizationId: membership.organizationId,
      },
      select: {
        id: true,
        name: true,
        status: true,
        organizationId: true,
      },
    });

    if (!business) {
      throw new NotFoundException('Client company not found in ProBiz Consultants.');
    }

    if (business.status !== 'active') {
      throw new BadRequestException('Client company is already archived.');
    }

    const updated = await this.prisma.business.update({
      where: {
        id: businessId,
      },
      data: {
        status: 'inactive',
      },
      include: {
        organization: {
          select: {
            id: true,
            name: true,
            type: true,
            clientSlotLimit: true,
            firmUserLimit: true,
          },
        },
      },
    });

    await this.prisma.auditLog.create({
      data: {
        organizationId: membership.organizationId,
        businessId,
        userId,
        action: 'CLIENT_BUSINESS_ARCHIVED',
        entityType: 'Business',
        entityId: businessId,
        beforeJson: {
          name: business.name,
          status: business.status,
        },
        afterJson: {
          name: updated.name,
          status: updated.status,
        },
      },
    });

    return {
      message: `${updated.name} has been archived.`,
      business: updated,
    };
  }

  async inviteClientUser(userId: string, businessId: string, email: string, role = 'CLIENT_OWNER') {
    await this.assertCanGrantClientUserAccess(userId, businessId);

    const normalizedEmail = normalizeEmail(email);

    const user = await this.prisma.user.findUnique({
      where: {
        email: normalizedEmail,
      },
    });

    if (!user) {
      throw new NotFoundException('Client user must register first before Ahmad can grant access.');
    }

    const membership = await this.prisma.businessMember.upsert({
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

    const access = await this.getUserAccessForBusiness(userId, businessId);

    await this.prisma.auditLog.create({
      data: {
        organizationId: access.business.organizationId,
        businessId,
        userId,
        action: 'CLIENT_USER_ACCESS_GRANTED',
        entityType: 'BusinessMember',
        entityId: membership.id,
        afterJson: {
          clientUserEmail: normalizedEmail,
          role,
          grantedBy: AHMAD_EMAIL,
        },
      },
    });

    return membership;
  }

  async getAccessibleBusiness(userId: string, businessId: string) {
    const access = await this.getUserAccessForBusiness(userId, businessId);
    return access.business;
  }

  async getUserAccessForBusiness(userId: string, businessId: string) {
    const business = await this.prisma.business.findFirst({
      where: {
        id: businessId,
        status: 'active',
      },
      include: {
        organization: true,
        accounts: {
          where: {
            isActive: true,
          },
          orderBy: {
            code: 'asc',
          },
        },
        members: {
          where: {
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
        },
      },
    });

    if (!business) {
      throw new NotFoundException('Business not found');
    }

    const firmMembership = await this.getFirmMembershipForBusiness(userId, businessId);

    const clientMembership = await this.prisma.businessMember.findFirst({
      where: {
        businessId,
        userId,
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

    if (!firmMembership && !clientMembership) {
      throw new ForbiddenException('Business not accessible');
    }

    return {
      business,
      firmMembership,
      clientMembership,
    };
  }

  async ensureFirmUser(userId: string) {
    const membership = await this.getFirmMembership(userId);

    if (!membership) {
      throw new ForbiddenException('ProBiz Consultants firm access required');
    }

    return membership;
  }

  async getFirmMembership(userId: string) {
    let membership = await this.findProBizFirmMembership(userId);

    if (membership) {
      return membership;
    }

    await this.repairPartnerFirmAccess(userId);

    membership = await this.findProBizFirmMembership(userId);

    return membership;
  }

  async getFirmMembershipForBusiness(userId: string, businessId: string) {
    const firmMembership = await this.getFirmMembership(userId);

    if (!firmMembership) {
      return null;
    }

    const business = await this.prisma.business.findFirst({
      where: {
        id: businessId,
        organizationId: firmMembership.organizationId,
        status: 'active',
      },
      select: {
        id: true,
      },
    });

    if (!business) {
      return null;
    }

    return firmMembership;
  }

  async isFirmUserForBusiness(userId: string, businessId: string) {
    const membership = await this.getFirmMembershipForBusiness(userId, businessId);
    return Boolean(membership);
  }

  async ensureFirmAccountLibrary(userId: string) {
    await this.ensureFirmUser(userId);
    return this.getFirmAccountLibrary(userId);
  }

  async getFirmAccountLibrary(userId: string) {
    const membership = await this.ensureFirmUser(userId);

    return DEFAULT_ACCOUNTS.map((account) => ({
      ...account,
      organizationId: membership.organizationId,
      isSystem: true,
      isActive: true,
      requiresReview: account.requiresReview ?? false,
    }));
  }

  async copyFirmAccountsToClient(userId: string, businessId: string) {
    const access = await this.getUserAccessForBusiness(userId, businessId);

    if (!access.firmMembership) {
      throw new ForbiddenException('Only firm users can copy the firm account library to a client.');
    }

    const accounts = [];

    for (const account of DEFAULT_ACCOUNTS) {
      const saved = await this.prisma.account.upsert({
        where: {
          businessId_code: {
            businessId,
            code: account.code,
          },
        },
        update: {
          name: account.name,
          type: account.type,
          description: account.description,
          isSystem: true,
          isActive: true,
          requiresReview: account.requiresReview ?? false,
        },
        create: {
          businessId,
          code: account.code,
          name: account.name,
          type: account.type,
          description: account.description,
          isSystem: true,
          isActive: true,
          requiresReview: account.requiresReview ?? false,
        },
      });

      accounts.push(saved);
    }

    await this.prisma.auditLog.create({
      data: {
        organizationId: access.business.organizationId,
        businessId,
        userId,
        action: 'FIRM_ACCOUNT_LIBRARY_COPIED_TO_CLIENT',
        entityType: 'Business',
        entityId: businessId,
        afterJson: {
          accountsCopied: accounts.length,
        },
      },
    });

    return accounts;
  }

  private async findProBizFirmMembership(userId: string) {
    return this.prisma.organizationMember.findFirst({
      where: {
        userId,
        status: 'active',
        organization: {
          name: PROBIZ_FIRM.name,
          type: PROBIZ_FIRM.type,
        },
      },
      include: {
        organization: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
          },
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
    });
  }

  private async getOrCreateProBizFirm() {
    const existingFirm = await this.prisma.organization.findFirst({
      where: {
        name: PROBIZ_FIRM.name,
        type: PROBIZ_FIRM.type,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    if (existingFirm) {
      return this.prisma.organization.update({
        where: {
          id: existingFirm.id,
        },
        data: {
          name: PROBIZ_FIRM.name,
          type: PROBIZ_FIRM.type,
          planName: PROBIZ_FIRM.planName,
          clientSlotLimit: PROBIZ_FIRM.clientSlotLimit,
          firmUserLimit: PROBIZ_FIRM.firmUserLimit,
        },
      });
    }

    return this.prisma.organization.create({
      data: {
        name: PROBIZ_FIRM.name,
        type: PROBIZ_FIRM.type,
        planName: PROBIZ_FIRM.planName,
        clientSlotLimit: PROBIZ_FIRM.clientSlotLimit,
        firmUserLimit: PROBIZ_FIRM.firmUserLimit,
      },
    });
  }

  private async repairPartnerFirmAccess(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: {
        id: userId,
      },
      select: {
        id: true,
        email: true,
      },
    });

    if (!user || !isProBizPartner(user.email)) {
      return null;
    }

    const firm = await this.getOrCreateProBizFirm();

    await this.prisma.organizationMember.upsert({
      where: {
        organizationId_userId: {
          organizationId: firm.id,
          userId: user.id,
        },
      },
      update: {
        role: 'FIRM_PARTNER',
        status: 'active',
      },
      create: {
        organizationId: firm.id,
        userId: user.id,
        role: 'FIRM_PARTNER',
        status: 'active',
      },
    });

    await this.prisma.organizationMember.updateMany({
      where: {
        userId: user.id,
        organizationId: {
          not: firm.id,
        },
        status: 'active',
        organization: {
          type: PROBIZ_FIRM.type,
        },
      },
      data: {
        status: 'inactive',
      },
    });

    return firm;
  }

  private async assertCanGrantClientUserAccess(userId: string, businessId: string) {
    const firmMembership = await this.getFirmMembershipForBusiness(userId, businessId);

    if (!firmMembership) {
      throw new ForbiddenException('ProBiz Consultants firm access required.');
    }

    const user = await this.prisma.user.findUnique({
      where: {
        id: userId,
      },
      select: {
        email: true,
      },
    });

    if (!user || !canGrantClientAccess(user.email)) {
      throw new ForbiddenException('Only Ahmad can grant client-user access in this partner beta.');
    }
  }
}
