import { BadRequestException, Injectable } from '@nestjs/common';
import { BusinessesService } from '../businesses/businesses.service';
import { PrismaService } from '../../prisma/prisma.service';
import { InviteAccountantDto } from './dto/invite-accountant.dto';

@Injectable()
export class AccountantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly businesses: BusinessesService,
  ) {}

  async list(userId: string, businessId: string) {
    const business = await this.businesses.getAccessibleBusiness(userId, businessId);
    return this.prisma.organizationMember.findMany({
      where: { organizationId: business.organizationId, role: 'ACCOUNTANT', status: 'active' },
      include: { user: { select: { id: true, name: true, email: true, phone: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async invite(userId: string, businessId: string, dto: InviteAccountantDto) {
    const business = await this.businesses.getAccessibleBusiness(userId, businessId);
    const accountant = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase() } });
    if (!accountant) {
      throw new BadRequestException('For this MVP, the accountant must create an account first using this email. Then invite again.');
    }

    await this.prisma.organizationMember.upsert({
      where: { organizationId_userId: { organizationId: business.organizationId, userId: accountant.id } },
      update: { role: 'ACCOUNTANT', status: 'active' },
      create: { organizationId: business.organizationId, userId: accountant.id, role: 'ACCOUNTANT', status: 'active' },
    });

    const link = await this.prisma.accountantClientLink.upsert({
      where: { businessId_accountantUserId: { businessId, accountantUserId: accountant.id } },
      update: { status: 'active', accessLevel: dto.accessLevel || 'reviewer' },
      create: { businessId, accountantUserId: accountant.id, accessLevel: dto.accessLevel || 'reviewer' },
    });

    return {
      message: 'Accountant access granted',
      link,
      accountant: { id: accountant.id, name: accountant.name, email: accountant.email },
    };
  }
}
