import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AiModule } from '../ai/ai.module';
import { OcrService } from './ocr.service';

@Module({
  imports: [PrismaModule, AiModule],
  providers: [OcrService],
  exports: [OcrService],
})
export class OcrModule {}
