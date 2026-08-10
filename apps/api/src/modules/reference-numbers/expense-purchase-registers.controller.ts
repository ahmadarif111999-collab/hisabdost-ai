import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import {
  CurrentUser,
  RequestUser,
} from '../../common/auth/current-user.decorator';

import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';

import { ExpensePurchaseRegistersService } from './expense-purchase-registers.service';

type RegisterFilters = {
  startDate?: string;
  endDate?: string;
  vendor?: string;
  paymentMethod?: string;
  documentStatus?: string;
  reference?: string;
  search?: string;
};

@Controller(
  'accounting/businesses/:businessId/registers',
)
@UseGuards(JwtAuthGuard)
export class ExpensePurchaseRegistersController {
  constructor(
    private readonly registers:
      ExpensePurchaseRegistersService,
  ) {}

  @Get('expenses')
  listExpenses(
    @CurrentUser()
    user: RequestUser,

    @Param('businessId')
    businessId: string,

    @Query()
    filters: RegisterFilters,
  ) {
    return this.registers.list(
      user.sub,
      businessId,
      'expense',
      filters,
    );
  }

  @Get('purchases')
  listPurchases(
    @CurrentUser()
    user: RequestUser,

    @Param('businessId')
    businessId: string,

    @Query()
    filters: RegisterFilters,
  ) {
    return this.registers.list(
      user.sub,
      businessId,
      'purchase',
      filters,
    );
  }

  @Post('expenses/export')
  exportExpenses(
    @CurrentUser()
    user: RequestUser,

    @Param('businessId')
    businessId: string,

    @Body()
    filters: RegisterFilters,
  ) {
    return this.registers.exportXlsx(
      user.sub,
      businessId,
      'expense',
      filters || {},
    );
  }

  @Post('purchases/export')
  exportPurchases(
    @CurrentUser()
    user: RequestUser,

    @Param('businessId')
    businessId: string,

    @Body()
    filters: RegisterFilters,
  ) {
    return this.registers.exportXlsx(
      user.sub,
      businessId,
      'purchase',
      filters || {},
    );
  }
}
