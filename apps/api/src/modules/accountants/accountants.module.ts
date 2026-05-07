import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { BusinessesModule } from '../businesses/businesses.module';
import { AccountantsController } from './accountants.controller';
import { AccountantsService } from './accountants.service';

@Module({
  imports: [AuthModule, PrismaModule, BusinessesModule],
  controllers: [AccountantsController],
  providers: [AccountantsService],
})
export class AccountantsModule {}
