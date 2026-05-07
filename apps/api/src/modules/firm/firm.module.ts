import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { BusinessesModule } from '../businesses/businesses.module';
import { FirmController } from './firm.controller';
import { FirmService } from './firm.service';

@Module({
  imports: [AuthModule, PrismaModule, BusinessesModule],
  controllers: [FirmController],
  providers: [FirmService],
})
export class FirmModule {}
