import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser, RequestUser } from '../../common/auth/current-user.decorator';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { AccountantsService } from './accountants.service';
import { InviteAccountantDto } from './dto/invite-accountant.dto';

@Controller('accountants/businesses/:businessId')
@UseGuards(JwtAuthGuard)
export class AccountantsController {
  constructor(private readonly accountants: AccountantsService) {}

  @Get()
  list(@CurrentUser() user: RequestUser, @Param('businessId') businessId: string) {
    return this.accountants.list(user.sub, businessId);
  }

  @Post('invite')
  invite(@CurrentUser() user: RequestUser, @Param('businessId') businessId: string, @Body() dto: InviteAccountantDto) {
    return this.accountants.invite(user.sub, businessId, dto);
  }
}
