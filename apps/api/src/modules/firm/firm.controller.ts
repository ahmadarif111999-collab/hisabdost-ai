import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { CurrentUser, RequestUser } from '../../common/auth/current-user.decorator';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import {
  ApproveAccountHeadRequestDto,
  CreateAccountTemplateDto,
  CreateClientBusinessDto,
  InviteClientUserDto,
  InviteFirmMemberDto,
  RejectRequestDto,
} from './dto/firm.dto';
import { FirmService } from './firm.service';

@Controller('firm')
@UseGuards(JwtAuthGuard)
export class FirmController {
  constructor(private readonly firm: FirmService) {}

  @Get('dashboard')
  dashboard(@CurrentUser() user: RequestUser) {
    return this.firm.dashboard(user.sub);
  }

  @Get('clients')
  clients(@CurrentUser() user: RequestUser) {
    return this.firm.clients(user.sub);
  }

  @Post('clients')
  createClient(@CurrentUser() user: RequestUser, @Body() dto: CreateClientBusinessDto) {
    return this.firm.createClient(user.sub, dto);
  }

  @Patch('clients/:businessId/archive')
  archiveClient(@CurrentUser() user: RequestUser, @Param('businessId') businessId: string) {
    return this.firm.archiveClient(user.sub, businessId);
  }

  @Post('members/invite')
  inviteFirmMember(@CurrentUser() user: RequestUser, @Body() dto: InviteFirmMemberDto) {
    return this.firm.inviteFirmMember(user.sub, dto);
  }

  @Post('clients/:businessId/users/invite')
  inviteClientUser(
    @CurrentUser() user: RequestUser,
    @Param('businessId') businessId: string,
    @Body() dto: InviteClientUserDto,
  ) {
    return this.firm.inviteClientUser(user.sub, businessId, dto);
  }

  @Get('account-library')
  accountLibrary(@CurrentUser() user: RequestUser) {
    return this.firm.accountLibrary(user.sub);
  }

  @Post('account-library')
  createAccountTemplate(@CurrentUser() user: RequestUser, @Body() dto: CreateAccountTemplateDto) {
    return this.firm.createAccountTemplate(user.sub, dto);
  }

  @Post('clients/:businessId/accounts/import-defaults')
  importDefaultAccounts(@CurrentUser() user: RequestUser, @Param('businessId') businessId: string) {
    return this.firm.importDefaultAccounts(user.sub, businessId);
  }

  @Get('account-head-requests')
  accountHeadRequests(@CurrentUser() user: RequestUser) {
    return this.firm.accountHeadRequests(user.sub);
  }

  @Post('account-head-requests/:requestId/approve')
  approveAccountHeadRequest(
    @CurrentUser() user: RequestUser,
    @Param('requestId') requestId: string,
    @Body() dto: ApproveAccountHeadRequestDto,
  ) {
    return this.firm.approveAccountHeadRequest(user.sub, requestId, dto);
  }

  @Post('account-head-requests/:requestId/reject')
  rejectAccountHeadRequest(
    @CurrentUser() user: RequestUser,
    @Param('requestId') requestId: string,
    @Body() dto: RejectRequestDto,
  ) {
    return this.firm.rejectAccountHeadRequest(user.sub, requestId, dto);
  }

  @Get('report-export-requests')
  reportExportRequests(@CurrentUser() user: RequestUser) {
    return this.firm.reportExportRequests(user.sub);
  }

  @Post('report-export-requests/:requestId/approve')
  approveReportExportRequest(
    @CurrentUser() user: RequestUser,
    @Param('requestId') requestId: string,
    @Body() dto: RejectRequestDto,
  ) {
    return this.firm.decideReportExportRequest(user.sub, requestId, 'approved', dto.decisionNote);
  }

  @Post('report-export-requests/:requestId/reject')
  rejectReportExportRequest(
    @CurrentUser() user: RequestUser,
    @Param('requestId') requestId: string,
    @Body() dto: RejectRequestDto,
  ) {
    return this.firm.decideReportExportRequest(user.sub, requestId, 'rejected', dto.decisionNote);
  }
}
