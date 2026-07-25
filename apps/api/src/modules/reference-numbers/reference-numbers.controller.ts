import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  CurrentUser,
  RequestUser,
} from '../../common/auth/current-user.decorator';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PaymentActivityService } from './payment-activity.service';

@Controller('references/businesses/:businessId')
@UseGuards(JwtAuthGuard)
export class ReferenceNumbersController {
  constructor(
    private readonly paymentActivity: PaymentActivityService,
  ) {}

  @Get('payments')
  payments(
    @CurrentUser() user: RequestUser,
    @Param('businessId') businessId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('direction') direction?: string,
    @Query('paymentMethod') paymentMethod?: string,
    @Query('limit') limit?: string,
  ) {
    return this.paymentActivity.list(
      user.sub,
      businessId,
      {
        from,
        to,
        direction,
        paymentMethod,
        limit,
      },
    );
  }
}
