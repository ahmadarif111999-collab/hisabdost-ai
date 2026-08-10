import {
  Controller,
  Get,
  Param,
  UseGuards,
} from '@nestjs/common';

import {
  CurrentUser,
  RequestUser,
} from '../../common/auth/current-user.decorator';

import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';

import { ReportExportHistoryService } from './report-export-history.service';

@Controller(
  'accounting/businesses/:businessId/reporting/report-exports',
)
@UseGuards(JwtAuthGuard)
export class ReportExportHistoryController {
  constructor(
    private readonly history:
      ReportExportHistoryService,
  ) {}

  @Get()
  list(
    @CurrentUser()
    user: RequestUser,

    @Param('businessId')
    businessId: string,
  ) {
    return this.history.list(
      user.sub,
      businessId,
    );
  }
}
