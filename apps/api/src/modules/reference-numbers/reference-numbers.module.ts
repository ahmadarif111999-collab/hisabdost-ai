import {
  Global,
  Module,
} from '@nestjs/common';

import {
  APP_INTERCEPTOR,
} from '@nestjs/core';

import { PrismaModule } from '../../prisma/prisma.module';

import { AuthModule } from '../auth/auth.module';

import { BusinessesModule } from '../businesses/businesses.module';

import { ExpensePurchaseReferenceService } from './expense-purchase-reference.service';

import { ExpensePurchaseRegistersController } from './expense-purchase-registers.controller';

import { ExpensePurchaseRegistersService } from './expense-purchase-registers.service';

import { HumanReadableReferenceInterceptor } from './human-readable-reference.interceptor';

import { PaymentActivityService } from './payment-activity.service';

import { ReferenceNumbersController } from './reference-numbers.controller';

import { ReferenceNumbersService } from './reference-numbers.service';

import { ReferencePresentationService } from './reference-presentation.service';

import { ReferenceResolutionService } from './reference-resolution.service';

import { ReferenceWorkflowController } from './reference-workflow.controller';

import { ReportExportHistoryController } from './report-export-history.controller';

import { ReportExportHistoryService } from './report-export-history.service';

@Global()
@Module({
  imports: [
    AuthModule,
    PrismaModule,
    BusinessesModule,
  ],

  controllers: [
    ReferenceNumbersController,
    ReferenceWorkflowController,
    ExpensePurchaseRegistersController,
    ReportExportHistoryController,
  ],

  providers: [
    ReferenceNumbersService,
    ReferencePresentationService,
    ReferenceResolutionService,
    PaymentActivityService,
    ExpensePurchaseRegistersService,
    ExpensePurchaseReferenceService,
    ReportExportHistoryService,

    {
      provide:
        APP_INTERCEPTOR,

      useClass:
        HumanReadableReferenceInterceptor,
    },
  ],

  exports: [
    ReferenceNumbersService,
    ReferencePresentationService,
    ReferenceResolutionService,
    PaymentActivityService,
    ExpensePurchaseRegistersService,
    ExpensePurchaseReferenceService,
    ReportExportHistoryService,
  ],
})
export class ReferenceNumbersModule {}
