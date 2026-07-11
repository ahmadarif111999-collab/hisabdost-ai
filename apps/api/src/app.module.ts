import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './modules/auth/auth.module';
import { PrismaModule } from './prisma/prisma.module';
import { BusinessesModule } from './modules/businesses/businesses.module';
import { AccountingModule } from './modules/accounting/accounting.module';
import { AiModule } from './modules/ai/ai.module';
import { InvoicesModule } from './modules/invoices/invoices.module';
import { ComplianceModule } from './modules/compliance/compliance.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { AccountantsModule } from './modules/accountants/accountants.module';
import { FirmModule } from './modules/firm/firm.module';
import { PeriodsModule } from './modules/periods/periods.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    BusinessesModule,
    AccountingModule,
    AiModule,
    InvoicesModule,
    ComplianceModule,
    DocumentsModule,
    AccountantsModule,
    FirmModule,
    PeriodsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
