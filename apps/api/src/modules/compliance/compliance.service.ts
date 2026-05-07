import { Injectable } from '@nestjs/common';
import { BusinessesService } from '../businesses/businesses.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateComplianceEventDto } from './dto/create-compliance-event.dto';

@Injectable()
export class ComplianceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly businesses: BusinessesService,
  ) {}

  async list(userId: string, businessId: string) {
    await this.businesses.getAccessibleBusiness(userId, businessId);
    return this.prisma.businessComplianceEvent.findMany({
      where: { businessId },
      orderBy: { dueDate: 'asc' },
    });
  }

  async create(userId: string, businessId: string, dto: CreateComplianceEventDto) {
    await this.businesses.getAccessibleBusiness(userId, businessId);
    return this.prisma.businessComplianceEvent.create({
      data: {
        businessId,
        title: dto.title,
        authority: dto.authority,
        dueDate: new Date(dto.dueDate),
        notes: dto.notes,
      },
    });
  }
}
