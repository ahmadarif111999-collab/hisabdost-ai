import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser, RequestUser } from '../../common/auth/current-user.decorator';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { BusinessesService } from './businesses.service';
import { CreateBusinessDto } from './dto/create-business.dto';

@Controller('businesses')
@UseGuards(JwtAuthGuard)
export class BusinessesController {
  constructor(private readonly businesses: BusinessesService) {}

  @Get()
  list(@CurrentUser() user: RequestUser) {
    return this.businesses.list(user.sub);
  }

  @Post()
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateBusinessDto) {
    return this.businesses.create(user.sub, dto);
  }

  @Get(':businessId')
  get(@CurrentUser() user: RequestUser, @Param('businessId') businessId: string) {
    return this.businesses.getAccessibleBusiness(user.sub, businessId);
  }
}
