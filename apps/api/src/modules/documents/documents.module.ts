import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AccountingModule } from '../accounting/accounting.module';
import { AuthModule } from '../auth/auth.module';
import { BusinessesModule } from '../businesses/businesses.module';
import { OcrModule } from '../ocr/ocr.module';
import { ReferenceNumbersModule } from '../reference-numbers/reference-numbers.module';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';

@Module({
  imports: [
    AuthModule,
    PrismaModule,
    AccountingModule,
    BusinessesModule,
    OcrModule,
    ReferenceNumbersModule,
  ],
  controllers: [DocumentsController],
  providers: [DocumentsService],
  exports: [DocumentsService],
})
export class DocumentsModule {}
