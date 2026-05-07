import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service';
import { LoginDto, RegisterDto } from './dto/auth.dto';

const SHARED_FIRM_NAME = 'ProBiz AI Firm';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const email = dto.email.toLowerCase().trim();

    const existing = await this.prisma.user.findUnique({
      where: {
        email,
      },
    });

    if (existing) {
      throw new BadRequestException('Email is already registered');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.user.create({
      data: {
        name: dto.name,
        email,
        phone: dto.phone,
        passwordHash,
      },
    });

    const existingFirm =
      (await this.prisma.organization.findFirst({
        where: {
          name: SHARED_FIRM_NAME,
          type: 'ACCOUNTANT_FIRM',
        },
      })) ??
      (await this.prisma.organization.findFirst({
        where: {
          type: 'ACCOUNTANT_FIRM',
        },
        orderBy: {
          createdAt: 'asc',
        },
      }));

    if (existingFirm) {
      await this.prisma.organizationMember.upsert({
        where: {
          organizationId_userId: {
            organizationId: existingFirm.id,
            userId: user.id,
          },
        },
        update: {
          role: 'FIRM_PARTNER',
          status: 'active',
        },
        create: {
          organizationId: existingFirm.id,
          userId: user.id,
          role: 'FIRM_PARTNER',
          status: 'active',
        },
      });
    } else {
      await this.prisma.organization.create({
        data: {
          name: SHARED_FIRM_NAME,
          type: 'ACCOUNTANT_FIRM',
          planName: 'Partner Beta',
          clientSlotLimit: 10,
          firmUserLimit: 5,
          members: {
            create: {
              userId: user.id,
              role: 'FIRM_OWNER',
              status: 'active',
            },
          },
        },
      });
    }

    return this.authPayload(user);
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: {
        email: dto.email.toLowerCase().trim(),
      },
      include: {
        memberships: {
          include: {
            organization: true,
          },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const ok = await bcrypt.compare(dto.password, user.passwordHash);

    if (!ok) {
      throw new UnauthorizedException('Invalid email or password');
    }

    return this.authPayload(user);
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: {
        id: userId,
      },
      include: {
        memberships: {
          include: {
            organization: true,
          },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException();
    }

    const { passwordHash: _, ...safeUser } = user;
    return safeUser;
  }

  private async authPayload(user: { id: string; email: string; name: string }) {
    const token = await this.jwt.signAsync({
      sub: user.id,
      email: user.email,
      name: user.name,
    });

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
    };
  }
}
