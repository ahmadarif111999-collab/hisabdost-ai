import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { BusinessesModule } from '../businesses/businesses.module';
import { PeriodsModule } from '../periods/periods.module';
import { AccountingController } from './accounting.controller';
import { AccountingViewsController } from './accounting-views.controller';
import { AccountingReportingController } from './accounting-reporting.controller';
import { FinancialStatementsController } from './financial-statements.controller';
import { AccountingService } from './accounting.service';
import { AccountingViewsService } from './accounting-views.service';
import { AccountingReportingService } from './accounting-reporting.service';
import { FinancialStatementsService } from './financial-statements.service';

@Module({
  imports: [AuthModule, PrismaModule, BusinessesModule, PeriodsModule],
  controllers: [
    AccountingController,
    AccountingViewsController,
    AccountingReportingController,
    FinancialStatementsController,
  ],
  providers: [
    AccountingService,
    AccountingViewsService,
    AccountingReportingService,
    FinancialStatementsService,
  ],
  exports: [AccountingService],
})
export class AccountingModule {}
