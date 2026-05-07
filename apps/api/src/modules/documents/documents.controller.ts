import { Body, Controller, Get, Param, Post, Query, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { DocumentType } from '@prisma/client';
import { diskStorage } from 'multer';
import { existsSync, mkdirSync } from 'fs';
import { extname } from 'path';
import { CurrentUser, RequestUser } from '../../common/auth/current-user.decorator';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { ApproveReceiptDto, ManualReceiptDto } from './dto/approve-receipt.dto';
import { DocumentsService } from './documents.service';

@Controller('documents/businesses/:businessId')
@UseGuards(JwtAuthGuard)
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Get()
  list(@CurrentUser() user: RequestUser, @Param('businessId') businessId: string) {
    return this.documents.list(user.sub, businessId);
  }

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          const dir = process.env.UPLOAD_DIR || 'uploads';
          if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
          cb(null, dir);
        },
        filename: (_req, file, cb) => {
          const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}${extname(file.originalname)}`;
          cb(null, unique);
        },
      }),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  async upload(
    @CurrentUser() user: RequestUser,
    @Param('businessId') businessId: string,
    @UploadedFile() file: Express.Multer.File,
    @Query('documentType') documentType?: DocumentType,
    @Query('process') process?: string,
  ) {
    const document = await this.documents.createFromUpload(user.sub, businessId, file, documentType || 'OTHER');
    if (process === 'true' && (document.documentType === 'RECEIPT' || document.documentType === 'INVOICE')) {
      const ocrResult = await this.documents.processOcr(user.sub, businessId, document.id);
      return { document, ocrResult };
    }
    return document;
  }

  @Post(':documentId/process-ocr')
  processOcr(@CurrentUser() user: RequestUser, @Param('businessId') businessId: string, @Param('documentId') documentId: string) {
    return this.documents.processOcr(user.sub, businessId, documentId);
  }

  @Get(':documentId/ocr')
  getOcr(@CurrentUser() user: RequestUser, @Param('businessId') businessId: string, @Param('documentId') documentId: string) {
    return this.documents.getOcr(user.sub, businessId, documentId);
  }


  @Post(':documentId/manual-fields')
  saveManualFields(
    @CurrentUser() user: RequestUser,
    @Param('businessId') businessId: string,
    @Param('documentId') documentId: string,
    @Body() dto: ManualReceiptDto,
  ) {
    return this.documents.saveManualReceiptFields(user.sub, businessId, documentId, dto);
  }

  @Post(':documentId/approve-as-expense')
  approveAsExpense(
    @CurrentUser() user: RequestUser,
    @Param('businessId') businessId: string,
    @Param('documentId') documentId: string,
    @Body() dto: ApproveReceiptDto,
  ) {
    return this.documents.approveReceiptAsExpense(user.sub, businessId, documentId, dto);
  }
}
