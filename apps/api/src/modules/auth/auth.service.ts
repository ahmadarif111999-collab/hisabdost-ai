import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service';
import { LoginDto, RegisterDto } from './dto/auth.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase() } });
    if (existing) throw new BadRequestException('Email is already registered');

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: {
        name: dto.name,
        email: dto.email.toLowerCase(),
        phone: dto.phone,
        passwordHash,
        memberships: {
          create: {
            role: 'FIRM_OWNER',
            organization: {
              create: {
                name: `${dto.name}'s Accounting Firm`,
                type: 'ACCOUNTANT_FIRM',
                planName: 'Firm Starter',
                clientSlotLimit: 10,
                firmUserLimit: 5,
              },
            },
          },
        },
      },
      include: { memberships: { include: { organization: true } } },
    });

    return this.authPayload(user);
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
      include: { memberships: { include: { organization: true } } },
    });
    if (!user) throw new UnauthorizedException('Invalid email or password');

    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Invalid email or password');

    return this.authPayload(user);
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { memberships: { include: { organization: true } } },
    });
    if (!user) throw new UnauthorizedException();
    const { passwordHash: _, ...safeUser } = user;
    return safeUser;
  }

  private async authPayload(user: { id: string; email: string; name: string }) {
    const token = await this.jwt.signAsync({ sub: user.id, email: user.email, name: user.name });
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
