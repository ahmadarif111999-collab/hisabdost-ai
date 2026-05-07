import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser, RequestUser } from '../../common/auth/current-user.decorator';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { InvoicesService } from './invoices.service';

@Controller('invoices/businesses/:businessId')
@UseGuards(JwtAuthGuard)
export class InvoicesController {
  constructor(private readonly invoices: InvoicesService) {}

  @Get()
  list(@CurrentUser() user: RequestUser, @Param('businessId') businessId: string) {
    return this.invoices.list(user.sub, businessId);
  }

  @Post()
  create(@CurrentUser() user: RequestUser, @Param('businessId') businessId: string, @Body() dto: CreateInvoiceDto) {
    return this.invoices.create(user.sub, businessId, dto);
  }
}
