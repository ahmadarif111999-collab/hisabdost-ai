import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BusinessesModule } from '../businesses/businesses.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { PaymentActivityService } from './payment-activity.service';
import { ReferenceNumbersController } from './reference-numbers.controller';
import { ReferenceNumbersService } from './reference-numbers.service';

@Module({
  imports: [
    AuthModule,
    PrismaModule,
    BusinessesModule,
  ],
  controllers: [
    ReferenceNumbersController,
  ],
  providers: [
    ReferenceNumbersService,
    PaymentActivityService,
  ],
  exports: [
    ReferenceNumbersService,
  ],
})
export class ReferenceNumbersModule {}
