import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser, RequestUser } from '../../common/auth/current-user.decorator';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { ComplianceService } from './compliance.service';
import { CreateComplianceEventDto } from './dto/create-compliance-event.dto';

@Controller('compliance/businesses/:businessId')
@UseGuards(JwtAuthGuard)
export class ComplianceController {
  constructor(private readonly compliance: ComplianceService) {}

  @Get('events')
  list(@CurrentUser() user: RequestUser, @Param('businessId') businessId: string) {
    return this.compliance.list(user.sub, businessId);
  }

  @Post('events')
  create(@CurrentUser() user: RequestUser, @Param('businessId') businessId: string, @Body() dto: CreateComplianceEventDto) {
    return this.compliance.create(user.sub, businessId, dto);
  }
}
