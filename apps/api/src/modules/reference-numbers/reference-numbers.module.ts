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

import { ExpensePurchaseRegistersController } from './expense-purchase-registers.controller';

import { ExpensePurchaseRegistersService } from './expense-purchase-registers.service';

import { HumanReadableReferenceInterceptor } from './human-readable-reference.interceptor';

import { PaymentActivityService } from './payment-activity.service';

import { ReferenceNumbersController } from './reference-numbers.controller';

import { ReferenceNumbersService } from './reference-numbers.service';

import { ReferencePresentationService } from './reference-presentation.service';

import { ReferenceResolutionService } from './reference-resolution.service';

import { ReferenceWorkflowController } from './reference-workflow.controller';

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
  ],

  providers: [
    ReferenceNumbersService,
    ReferencePresentationService,
    ReferenceResolutionService,
    PaymentActivityService,
    ExpensePurchaseRegistersService,

    {
      provide: APP_INTERCEPTOR,
      useClass: HumanReadableReferenceInterceptor,
    },
  ],

  exports: [
    ReferenceNumbersService,
    ReferencePresentationService,
    ReferenceResolutionService,
    PaymentActivityService,
    ExpensePurchaseRegistersService,
  ],
})
export class ReferenceNumbersModule {}
