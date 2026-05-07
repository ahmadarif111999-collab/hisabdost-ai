import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { AccountingModule } from '../accounting/accounting.module';
import { BusinessesModule } from '../businesses/businesses.module';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { LlmClientService } from './providers/llm-client.service';
import { RuleFallbackParserService } from './providers/rule-fallback-parser.service';

@Module({
  imports: [AuthModule, PrismaModule, BusinessesModule, AccountingModule],
  controllers: [AiController],
  providers: [AiService, LlmClientService, RuleFallbackParserService],
  exports: [AiService, LlmClientService, RuleFallbackParserService],
})
export class AiModule {}
