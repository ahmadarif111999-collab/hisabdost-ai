import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BusinessesModule } from '../businesses/businesses.module';
import { PeriodsModule } from '../periods/periods.module';
import { ReferenceNumbersModule } from '../reference-numbers/reference-numbers.module';
import { PrismaModule } from '../../prisma/prisma.module';

import { AccountingController } from './accounting.controller';
import { AccountingViewsController } from './accounting-views.controller';
import { AccountingReportingController } from './accounting-reporting.controller';
import { FinancialStatementsController } from './financial-statements.controller';
import { XlsxExportController } from './xlsx-export.controller';

import { AccountingService } from './accounting.service';
import { AccountingViewsService } from './accounting-views.service';
import { AccountingReportingService } from './accounting-reporting.service';
import { FinancialStatementsService } from './financial-statements.service';
import { XlsxExportService } from './xlsx-export.service';
import { ReportApprovalService } from './report-approval.service';

@Module({
  imports: [
    AuthModule,
    PrismaModule,
    BusinessesModule,
    PeriodsModule,
    ReferenceNumbersModule,
  ],
  controllers: [
    AccountingController,
    AccountingViewsController,
    AccountingReportingController,
    FinancialStatementsController,
    XlsxExportController,
  ],
  providers: [
    AccountingService,
    AccountingViewsService,
    AccountingReportingService,
    FinancialStatementsService,
    XlsxExportService,
    ReportApprovalService,
  ],
  exports: [AccountingService],
})
export class AccountingModule {}
