import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { BusinessesModule } from '../businesses/businesses.module';
import { AccountingController } from './accounting.controller';
import { AccountingViewsController } from './accounting-views.controller';
import { AccountingService } from './accounting.service';
import { AccountingViewsService } from './accounting-views.service';

@Module({
  imports: [AuthModule, PrismaModule, BusinessesModule],
  controllers: [AccountingController, AccountingViewsController],
  providers: [AccountingService, AccountingViewsService],
  exports: [AccountingService],
})
export class AccountingModule {}
