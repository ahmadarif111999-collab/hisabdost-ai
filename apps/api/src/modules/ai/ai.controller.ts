import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser, RequestUser } from '../../common/auth/current-user.decorator';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { AiService } from './ai.service';
import { AnalyzeReportDto, SuggestAccountHeadDto } from './dto/ai.dto';
import { ParseTransactionDto } from './dto/parse-transaction.dto';

@Controller('ai/businesses/:businessId')
@UseGuards(JwtAuthGuard)
export class AiController {
  constructor(private readonly ai: AiService) {}

  @Post('parse-transaction')
  parse(@CurrentUser() user: RequestUser, @Param('businessId') businessId: string, @Body() dto: ParseTransactionDto) {
    return this.ai.parseTransaction(user.sub, businessId, dto.message);
  }

  @Post('suggest-account-head')
  suggestAccountHead(@CurrentUser() user: RequestUser, @Param('businessId') businessId: string, @Body() dto: SuggestAccountHeadDto) {
    return this.ai.suggestAccountHead(user.sub, businessId, dto.prompt);
  }

  @Get('actions')
  actions(@CurrentUser() user: RequestUser, @Param('businessId') businessId: string) {
    return this.ai.actions(user.sub, businessId);
  }

  @Post('actions/:actionId/approve')
  approveAction(@CurrentUser() user: RequestUser, @Param('businessId') businessId: string, @Param('actionId') actionId: string) {
    return this.ai.approveAction(user.sub, businessId, actionId);
  }

  @Post('analyze-report')
  analyzeReport(@CurrentUser() user: RequestUser, @Param('businessId') businessId: string, @Body() dto: AnalyzeReportDto) {
    return this.ai.analyzeReport(user.sub, businessId, dto.reportType || 'monthly_review');
  }

  @Get('missing-document-summary')
  missingDocumentSummary(@CurrentUser() user: RequestUser, @Param('businessId') businessId: string) {
    return this.ai.missingDocumentSummary(user.sub, businessId);
  }

  @Get('monthly-review')
  monthlyReview(@CurrentUser() user: RequestUser, @Param('businessId') businessId: string) {
    return this.ai.analyzeReport(user.sub, businessId, 'monthly_client_review');
  }
}
