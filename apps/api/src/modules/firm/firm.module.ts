import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { BusinessesModule } from '../businesses/businesses.module';
import { ReferenceNumbersModule } from '../reference-numbers/reference-numbers.module';
import { FirmController } from './firm.controller';
import { FirmService } from './firm.service';

@Module({
  imports: [
    AuthModule,
    PrismaModule,
    BusinessesModule,
    ReferenceNumbersModule,
  ],
  controllers: [FirmController],
  providers: [FirmService],
  exports: [FirmService],
})
export class FirmModule {}
