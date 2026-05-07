import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AccountType } from '@prisma/client';
import { BusinessesService } from '../businesses/businesses.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ApproveAccountHeadRequestDto,
  CreateAccountTemplateDto,
  CreateClientBusinessDto,
  InviteClientUserDto,
  InviteFirmMemberDto,
  RejectRequestDto,
} from './dto/firm.dto';

@Injectable()
export class FirmService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly businesses: BusinessesService,
  ) {}

  async dashboard(userId: string) {
    const membership = await this.businesses.ensureFirmUser(userId);
    await this.businesses.ensureFirmAccountLibrary(membership.organizationId);
    const [clients, members, pendingAiActions, missingDocuments, pendingAccountHeadRequests, pendingReportRequests] = await Promise.all([
      this.prisma.business.findMany({
        where: { organizationId: membership.organizationId, status: 'active' },
        orderBy: { createdAt: 'desc' },
        include: { complianceEvents: { orderBy: { dueDate: 'asc' }, take: 1 } },
      }),
      this.prisma.organizationMember.findMany({
        where: { organizationId: membership.organizationId, status: 'active' },
        include: { user: { select: { id: true, name: true, email: true, phone: true } } },
      }),
      this.prisma.aiActionQueue.count({
        where: { business: { organizationId: membership.organizationId }, status: 'pending' },
      }),
      this.prisma.expense.count({
        where: { business: { organizationId: membership.organizationId }, documentId: null },
      }),
      this.prisma.accountHeadRequest.count({
        where: { business: { organizationId: membership.organizationId }, status: 'pending' },
      }),
      this.prisma.reportExportRequest.count({
        where: { organizationId: membership.organizationId, status: 'pending' },
      }),
    ]);

    return {
      firm: membership.organization,
      clientSlotsUsed: clients.length,
      clientSlotLimit: membership.organization.clientSlotLimit,
      clients,
      members,
      pendingAiActions,
      pendingAccountHeadRequests,
      pendingReportRequests,
      missingDocuments,
    };
  }

  async clients(userId: string) {
    const membership = await this.businesses.ensureFirmUser(userId);
    const clients = await this.prisma.business.findMany({
      where: { organizationId: membership.organizationId, status: 'active' },
      orderBy: { createdAt: 'desc' },
      include: {
        members: { include: { user: { select: { id: true, name: true, email: true, phone: true } } } },
        complianceEvents: { orderBy: { dueDate: 'asc' }, take: 1 },
        reportPermission: true,
      },
    });

    return clients.map((client) => ({
      ...client,
      nextDeadline: client.complianceEvents[0] || null,
    }));
  }

  async createClient(userId: string, dto: CreateClientBusinessDto) {
    const business = await this.businesses.createClientBusiness(userId, dto);
    if (dto.clientOwnerEmail) {
      const user = await this.prisma.user.findUnique({ where: { email: dto.clientOwnerEmail.toLowerCase() } });
      if (user) {
        await this.prisma.businessMember.upsert({
          where: { businessId_userId: { businessId: business.id, userId: user.id } },
          update: { role: 'CLIENT_OWNER', status: 'active' },
          create: { businessId: business.id, userId: user.id, role: 'CLIENT_OWNER' },
        });
      }
    }
    return business;
  }

  async inviteFirmMember(userId: string, dto: InviteFirmMemberDto) {
    const membership = await this.businesses.ensureFirmUser(userId);
    const target = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase() } });
    if (!target) throw new NotFoundException('Firm member must register first with this email.');

    const count = await this.prisma.organizationMember.count({ where: { organizationId: membership.organizationId, status: 'active' } });
    if (count >= membership.organization.firmUserLimit) {
      throw new BadRequestException(`Firm user limit reached (${count}/${membership.organization.firmUserLimit}).`);
    }

    return this.prisma.organizationMember.upsert({
      where: { organizationId_userId: { organizationId: membership.organizationId, userId: target.id } },
      update: { role: dto.role || 'FIRM_PARTNER', status: 'active' },
      create: { organizationId: membership.organizationId, userId: target.id, role: dto.role || 'FIRM_PARTNER' },
      include: { user: { select: { id: true, name: true, email: true, phone: true } } },
    });
  }

  async inviteClientUser(userId: string, businessId: string, dto: InviteClientUserDto) {
    return this.businesses.inviteClientUser(userId, businessId, dto.email, dto.role || 'CLIENT_OWNER');
  }

  async accountLibrary(userId: string) {
    return this.businesses.getFirmAccountLibrary(userId);
  }

  async createAccountTemplate(userId: string, dto: CreateAccountTemplateDto) {
    const membership = await this.businesses.ensureFirmUser(userId);
    await this.businesses.ensureFirmAccountLibrary(membership.organizationId);
    const template = await this.prisma.accountTemplate.upsert({
      where: { organizationId_code: { organizationId: membership.organizationId, code: dto.code } },
      update: {
        name: dto.name,
        type: dto.type as AccountType,
        description: dto.description,
        category: dto.category,
        isTaxSensitive: this.isTaxSensitive(dto.name),
        isActive: true,
      },
      create: {
        organizationId: membership.organizationId,
        code: dto.code,
        name: dto.name,
        type: dto.type as AccountType,
        description: dto.description,
        category: dto.category,
        isTaxSensitive: this.isTaxSensitive(dto.name),
        sortOrder: 999,
      },
    });
    await this.prisma.auditLog.create({
      data: {
        organizationId: membership.organizationId,
        userId,
        action: 'FIRM_ACCOUNT_TEMPLATE_UPSERTED',
        entityType: 'AccountTemplate',
        entityId: template.id,
        afterJson: template,
      },
    });
    return { message: 'Firm account library updated', template };
  }

  async importDefaultAccounts(userId: string, businessId: string) {
    const { business, firmMembership } = await this.businesses.getUserAccessForBusiness(userId, businessId);
    if (!firmMembership) throw new BadRequestException('Firm access required to import default accounts.');
    const accounts = await this.businesses.copyFirmAccountsToClient(business.organizationId, businessId);
    await this.prisma.auditLog.create({
      data: {
        organizationId: business.organizationId,
        businessId,
        userId,
        action: 'FIRM_DEFAULT_ACCOUNTS_IMPORTED',
        entityType: 'Business',
        entityId: businessId,
        afterJson: { count: accounts.length },
      },
    });
    return { message: 'Firm default accounts imported/repaired for client', accountsCount: accounts.length };
  }

  async accountHeadRequests(userId: string) {
    const membership = await this.businesses.ensureFirmUser(userId);
    return this.prisma.accountHeadRequest.findMany({
      where: { business: { organizationId: membership.organizationId } },
      orderBy: { createdAt: 'desc' },
      include: {
        business: { select: { id: true, name: true } },
        requestedBy: { select: { id: true, name: true, email: true } },
        decidedBy: { select: { id: true, name: true, email: true } },
      },
    });
  }

  async approveAccountHeadRequest(userId: string, requestId: string, dto: ApproveAccountHeadRequestDto) {
    const membership = await this.businesses.ensureFirmUser(userId);
    const request = await this.prisma.accountHeadRequest.findFirst({
      where: { id: requestId, business: { organizationId: membership.organizationId } },
    });
    if (!request) throw new NotFoundException('Account head request not found');
    if (request.status !== 'pending') throw new BadRequestException('Only pending requests can be approved');

    const code = dto.code || request.suggestedCode || await this.nextAccountCode(request.businessId, dto.type || request.suggestedType);
    const name = dto.name || request.suggestedName;
    const type = (dto.type || request.suggestedType) as AccountType;

    const account = await this.prisma.account.upsert({
      where: { businessId_code: { businessId: request.businessId, code } },
      update: { name, type, requiresReview: this.isTaxSensitive(name), description: request.reason },
      create: {
        businessId: request.businessId,
        code,
        name,
        type,
        description: request.reason,
        isSystem: false,
        requiresReview: this.isTaxSensitive(name),
      },
    });

    const updated = await this.prisma.accountHeadRequest.update({
      where: { id: requestId },
      data: {
        status: 'approved',
        decidedById: userId,
        decisionNote: dto.decisionNote,
        approvedAccountId: account.id,
      },
      include: { business: { select: { id: true, name: true } } },
    });

    await this.prisma.auditLog.create({
      data: {
        organizationId: membership.organizationId,
        businessId: request.businessId,
        userId,
        action: 'ACCOUNT_HEAD_REQUEST_APPROVED',
        entityType: 'AccountHeadRequest',
        entityId: requestId,
        afterJson: { request: updated, account },
      },
    });

    return { message: 'Account head approved and created', request: updated, account };
  }

  async rejectAccountHeadRequest(userId: string, requestId: string, dto: RejectRequestDto) {
    const membership = await this.businesses.ensureFirmUser(userId);
    const request = await this.prisma.accountHeadRequest.findFirst({
      where: { id: requestId, business: { organizationId: membership.organizationId } },
    });
    if (!request) throw new NotFoundException('Account head request not found');
    const updated = await this.prisma.accountHeadRequest.update({
      where: { id: requestId },
      data: { status: 'rejected', decidedById: userId, decisionNote: dto.decisionNote },
    });
    await this.prisma.auditLog.create({
      data: {
        organizationId: membership.organizationId,
        businessId: request.businessId,
        userId,
        action: 'ACCOUNT_HEAD_REQUEST_REJECTED',
        entityType: 'AccountHeadRequest',
        entityId: requestId,
        afterJson: updated,
      },
    });
    return { message: 'Account head request rejected', request: updated };
  }

  async reportExportRequests(userId: string) {
    const membership = await this.businesses.ensureFirmUser(userId);
    return this.prisma.reportExportRequest.findMany({
      where: { organizationId: membership.organizationId },
      orderBy: { createdAt: 'desc' },
      include: {
        business: { select: { id: true, name: true } },
        requestedBy: { select: { id: true, name: true, email: true } },
        decidedBy: { select: { id: true, name: true, email: true } },
      },
    });
  }

  async decideReportExportRequest(userId: string, requestId: string, status: 'approved' | 'rejected', decisionNote?: string) {
    const membership = await this.businesses.ensureFirmUser(userId);
    const request = await this.prisma.reportExportRequest.findFirst({ where: { id: requestId, organizationId: membership.organizationId } });
    if (!request) throw new NotFoundException('Report export request not found');
    const updated = await this.prisma.reportExportRequest.update({
      where: { id: requestId },
      data: { status, decidedById: userId, decisionNote },
    });
    await this.prisma.auditLog.create({
      data: {
        organizationId: membership.organizationId,
        businessId: request.businessId,
        userId,
        action: `REPORT_EXPORT_REQUEST_${status.toUpperCase()}`,
        entityType: 'ReportExportRequest',
        entityId: requestId,
        afterJson: updated,
      },
    });
    return { message: `Report request ${status}`, request: updated };
  }

  private isTaxSensitive(name: string) {
    const text = name.toLowerCase();
    return ['tax', 'withholding', 'salary', 'loan', 'advance income', 'sales tax'].some((word) => text.includes(word));
  }

  private async nextAccountCode(businessId: string, type: AccountType) {
    const bases: Record<AccountType, number> = { ASSET: 1000, LIABILITY: 2000, EQUITY: 3000, INCOME: 4000, EXPENSE: 5000 };
    const accounts = await this.prisma.account.findMany({ where: { businessId, type }, select: { code: true } });
    const used = new Set(accounts.map((a) => Number(a.code)).filter(Boolean));
    let code = bases[type] + 900;
    while (used.has(code)) code += 10;
    return String(code);
  }
}
