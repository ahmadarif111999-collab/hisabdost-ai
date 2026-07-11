import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { BusinessesModule } from '../businesses/businesses.module';
import { AccountingController } from './accounting.controller';
import { AccountingViewsController } from './accounting-views.controller';
import { AccountingReportingController } from './accounting-reporting.controller';
import { AccountingService } from './accounting.service';
import { AccountingViewsService } from './accounting-views.service';
import { AccountingReportingService } from './accounting-reporting.service';

@Module({
  imports: [AuthModule, PrismaModule, BusinessesModule],
  controllers: [AccountingController, AccountingViewsController, AccountingReportingController],
  providers: [AccountingService, AccountingViewsService, AccountingReportingService],
  exports: [AccountingService],
})
export class AccountingModule {}
