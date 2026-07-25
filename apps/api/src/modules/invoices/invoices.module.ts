import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BusinessesModule } from '../businesses/businesses.module';
import { PeriodsModule } from '../periods/periods.module';
import { ReferenceNumbersModule } from '../reference-numbers/reference-numbers.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { InvoicesController } from './invoices.controller';
import { InvoicesService } from './invoices.service';

@Module({
  imports: [
    AuthModule,
    PrismaModule,
    BusinessesModule,
    PeriodsModule,
    ReferenceNumbersModule,
  ],
  controllers: [InvoicesController],
  providers: [InvoicesService],
})
export class InvoicesModule {}
