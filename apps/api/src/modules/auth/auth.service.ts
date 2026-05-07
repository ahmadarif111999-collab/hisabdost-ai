import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service';
import { LoginDto, RegisterDto } from './dto/auth.dto';

const PROBIZ_FIRM = {
  name: 'ProBiz Consultants',
  type: 'ACCOUNTANT_FIRM' as const,
  planName: 'Partner Beta',
  clientSlotLimit: 10,
  firmUserLimit: 5,
};

const PROBIZ_PARTNER_PASSWORD = 'Probiz01';

const PROBIZ_PARTNERS = [
  {
    name: 'Ahmad Arif',
    email: 'ahmadarif111999@gmail.com',
    role: 'FIRM_PARTNER' as const,
    canGrantClientAccess: true,
  },
  {
    name: 'Yasir Javaid',
    email: 'yjavaid01@gmail.com',
    role: 'FIRM_PARTNER' as const,
    canGrantClientAccess: false,
  },
  {
    name: 'Maysum Zaidi',
    email: 'maysumzaidi2001@gmail.com',
    role: 'FIRM_PARTNER' as const,
    canGrantClientAccess: false,
  },
  {
    name: 'Asfand Sajjad',
    email: 'asfandsajjid@gmail.com',
    role: 'FIRM_PARTNER' as const,
    canGrantClientAccess: false,
  },
  {
    name: 'Ali Awan',
    email: 'ali.awan9167@gmail.com',
    role: 'FIRM_PARTNER' as const,
    canGrantClientAccess: false,
  },
];

function normalizeEmail(email: string) {
  return email.toLowerCase().trim();
}

function getPartnerByEmail(email: string) {
  const normalizedEmail = normalizeEmail(email);
  return PROBIZ_PARTNERS.find((partner) => partner.email === normalizedEmail);
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const email = normalizeEmail(dto.email);
    const existing = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existing) {
      throw new BadRequestException('Email is already registered. Please login instead.');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const partner = getPartnerByEmail(email);

    const user = await this.prisma.user.create({
      data: {
        name: partner?.name || dto.name,
        email,
        phone: dto.phone,
        passwordHash,
        preferredLanguage: 'roman_urdu',
      },
    });

    /**
     * Important:
     * Unknown/client users can register, but they do NOT get their own firm.
     * Known ProBiz partners are attached to the shared ProBiz Consultants firm.
     */
    if (partner) {
      await this.ensurePartnerFirmMembership(user.id, email);
    }

    return this.authPayload(user.id);
  }

  async login(dto: LoginDto) {
    const email = normalizeEmail(dto.email);

    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    let passwordOk = await bcrypt.compare(dto.password, user.passwordHash);

    /**
     * Beta safety:
     * For the 5 whitelisted partners, allow Probiz01 to repair old/stale hashes
     * from earlier broken seed/register attempts.
     */
    const partner = getPartnerByEmail(email);
    if (!passwordOk && partner && dto.password === PROBIZ_PARTNER_PASSWORD) {
      const passwordHash = await bcrypt.hash(PROBIZ_PARTNER_PASSWORD, 10);

      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          name: partner.name,
          passwordHash,
        },
      });

      passwordOk = true;
    }

    if (!passwordOk) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (partner) {
      await this.ensurePartnerFirmMembership(user.id, email);
    }

    return this.authPayload(user.id);
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
        businessMemberships: {
          where: {
            status: 'active',
          },
          include: {
            business: true,
          },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException();
    }

    const partner = getPartnerByEmail(user.email);
    if (partner) {
      await this.ensurePartnerFirmMembership(user.id, user.email);
    }

    const { passwordHash: _, ...safeUser } = user;
    return safeUser;
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

  private async ensurePartnerFirmMembership(userId: string, rawEmail: string) {
    const email = normalizeEmail(rawEmail);
    const partner = getPartnerByEmail(email);

    if (!partner) {
      return null;
    }

    const firm = await this.getOrCreateProBizFirm();

    await this.prisma.organizationMember.upsert({
      where: {
        organizationId_userId: {
          organizationId: firm.id,
          userId,
        },
      },
      update: {
        role: partner.role,
        status: 'active',
      },
      create: {
        organizationId: firm.id,
        userId,
        role: partner.role,
        status: 'active',
      },
    });

    /**
     * Disable old accidental personal firm memberships such as:
     * "Ahmed's Accounting Firm".
     */
    await this.prisma.organizationMember.updateMany({
      where: {
        userId,
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

  private async authPayload(userId: string) {
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

    if (!user) {
      throw new UnauthorizedException();
    }

    const token = await this.jwt.signAsync({
      sub: user.id,
      email: user.email,
      name: user.name,
    });

    const firmMembership = user.memberships.find(
      (membership) =>
        membership.organization.name === PROBIZ_FIRM.name &&
        membership.organization.type === PROBIZ_FIRM.type,
    );

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
      firm: firmMembership
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
