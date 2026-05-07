import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service';
import { LoginDto, RegisterDto } from './dto/auth.dto';

const TARGET_FIRM = {
  name: 'ProBiz Consultants',
  type: 'ACCOUNTANT_FIRM' as const,
  planName: 'Firm Starter',
  clientSlotLimit: 10,
  firmUserLimit: 5,
};

const PARTNER_EMAILS = [
  'ahmadarif111999@gmail.com',
  'yjavaid01@gmail.com',
  'maysumzaidi2001@gmail.com',
  'asfandsajjid@gmail.com',
  'ali.awan9167@gmail.com',
];

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const email = dto.email.toLowerCase().trim();

    if (!this.isBetaPartner(email)) {
      throw new BadRequestException(
        'This beta is limited to invited ProBiz Consultants partners. Please ask the firm admin for access.',
      );
    }

    const existing = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existing) {
      throw new BadRequestException('Email is already registered. Please login instead.');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.user.create({
      data: {
        name: dto.name,
        email,
        phone: dto.phone,
        passwordHash,
        preferredLanguage: 'roman_urdu',
      },
    });

    await this.ensurePartnerFirmMembership(user.id, email);

    return this.authPayload(user);
  }

  async login(dto: LoginDto) {
    const email = dto.email.toLowerCase().trim();

    if (!this.isBetaPartner(email)) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const user = await this.prisma.user.findUnique({
      where: { email },
      include: {
        memberships: {
          include: {
            organization: true,
          },
        },
      },
    });

    if (!user) throw new UnauthorizedException('Invalid email or password');

    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Invalid email or password');

    await this.ensurePartnerFirmMembership(user.id, email);

    return this.authPayload(user);
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        memberships: {
          where: {
            status: 'active',
          },
          include: {
            organization: true,
          },
        },
      },
    });

    if (!user) throw new UnauthorizedException();

    const { passwordHash: _, ...safeUser } = user;
    return safeUser;
  }

  private isBetaPartner(email: string) {
    return PARTNER_EMAILS.includes(email.toLowerCase().trim());
  }

  private async getOrCreateTargetFirm() {
    const existingFirm = await this.prisma.organization.findFirst({
      where: {
        name: TARGET_FIRM.name,
        type: TARGET_FIRM.type,
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
          name: TARGET_FIRM.name,
          type: TARGET_FIRM.type,
          planName: TARGET_FIRM.planName,
          clientSlotLimit: TARGET_FIRM.clientSlotLimit,
          firmUserLimit: TARGET_FIRM.firmUserLimit,
        },
      });
    }

    return this.prisma.organization.create({
      data: TARGET_FIRM,
    });
  }

  private async ensurePartnerFirmMembership(userId: string, email: string) {
    if (!this.isBetaPartner(email)) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const firm = await this.getOrCreateTargetFirm();

    await this.prisma.organizationMember.upsert({
      where: {
        organizationId_userId: {
          organizationId: firm.id,
          userId,
        },
      },
      update: {
        role: 'FIRM_PARTNER',
        status: 'active',
      },
      create: {
        organizationId: firm.id,
        userId,
        role: 'FIRM_PARTNER',
        status: 'active',
      },
    });

    /**
     * Stop old generated firms like "Ahmed's Accounting Firm"
     * from being selected as the current active firm.
     */
    await this.prisma.organizationMember.updateMany({
      where: {
        userId,
        organizationId: {
          not: firm.id,
        },
        status: 'active',
        organization: {
          type: 'ACCOUNTANT_FIRM',
        },
      },
      data: {
        status: 'inactive',
      },
    });

    return firm;
  }

  private async authPayload(user: { id: string; email: string; name: string }) {
    const token = await this.jwt.signAsync({
      sub: user.id,
      email: user.email,
      name: user.name,
    });

    const firmMembership = await this.prisma.organizationMember.findFirst({
      where: {
        userId: user.id,
        status: 'active',
        organization: {
          name: TARGET_FIRM.name,
          type: TARGET_FIRM.type,
        },
      },
      include: {
        organization: true,
      },
    });

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
      firm: firmMembership?.organization
        ? {
            id: firmMembership.organization.id,
            name: firmMembership.organization.name,
            type: firmMembership.organization.type,
            planName: firmMembership.organization.planName,
            clientSlotLimit: firmMembership.organization.clientSlotLimit,
            firmUserLimit: firmMembership.organization.firmUserLimit,
            role: firmMembership.role,
          }
        : null,
    };
  }
}
