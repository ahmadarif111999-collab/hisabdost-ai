import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { DocumentType } from '@prisma/client';
import { diskStorage } from 'multer';
import {
  existsSync,
  mkdirSync,
} from 'fs';
import { extname } from 'path';
import {
  CurrentUser,
  RequestUser,
} from '../../common/auth/current-user.decorator';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import {
  ApproveReceiptDto,
  ManualReceiptDto,
} from './dto/approve-receipt.dto';
import { DocumentsService } from './documents.service';

const documentUploadOptions = {
  storage: diskStorage({
    destination: (
      _request,
      _file,
      callback,
    ) => {
      const directory =
        process.env.UPLOAD_DIR ||
        'uploads';

      if (!existsSync(directory)) {
        mkdirSync(directory, {
          recursive: true,
        });
      }

      callback(null, directory);
    },
    filename: (
      _request,
      file,
      callback,
    ) => {
      const uniqueName = `${Date.now()}-${Math.round(
        Math.random() * 1e9,
      )}${extname(file.originalname)}`;

      callback(null, uniqueName);
    },
  }),
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
};

@Controller(
  'documents/businesses/:businessId',
)
@UseGuards(JwtAuthGuard)
export class DocumentsController {
  constructor(
    private readonly documents:
      DocumentsService,
  ) {}

  @Get()
  list(
    @CurrentUser() user: RequestUser,
    @Param('businessId')
    businessId: string,
  ) {
    return this.documents.list(
      user.sub,
      businessId,
    );
  }

  @Post('upload')
  @UseInterceptors(
    FileInterceptor(
      'file',
      documentUploadOptions,
    ),
  )
  async upload(
    @CurrentUser() user: RequestUser,
    @Param('businessId')
    businessId: string,
    @UploadedFile()
    file: Express.Multer.File,
    @Query('documentType')
    documentType?: DocumentType,
    @Query('process')
    process?: string,
  ) {
    const document =
      await this.documents.createFromUpload(
        user.sub,
        businessId,
        file,
        documentType || 'OTHER',
      );

    if (
      process === 'true' &&
      (document.documentType ===
        'RECEIPT' ||
        document.documentType ===
          'INVOICE')
    ) {
      const ocrResult =
        await this.documents.processOcr(
          user.sub,
          businessId,
          document.id,
        );

      return {
        document,
        ocrResult,
      };
    }

    return document;
  }

  @Post(
    'expenses/:expenseId/attach',
  )
  @UseInterceptors(
    FileInterceptor(
      'file',
      documentUploadOptions,
    ),
  )
  attachToExpense(
    @CurrentUser() user: RequestUser,
    @Param('businessId')
    businessId: string,
    @Param('expenseId')
    expenseId: string,
    @UploadedFile()
    file: Express.Multer.File,
    @Query('documentType')
    documentType?: DocumentType,
    @Query('process')
    process?: string,
  ) {
    return this.documents.attachUploadToExpense(
      user.sub,
      businessId,
      expenseId,
      file,
      documentType || 'RECEIPT',
      process === 'true',
    );
  }

  @Post(
    'expenses/:expenseId/link-document/:documentId',
  )
  linkExistingDocumentToExpense(
    @CurrentUser() user: RequestUser,
    @Param('businessId')
    businessId: string,
    @Param('expenseId')
    expenseId: string,
    @Param('documentId')
    documentId: string,
  ) {
    return this.documents.linkExistingDocumentToExpense(
      user.sub,
      businessId,
      expenseId,
      documentId,
    );
  }

  @Post(
    'expenses/:expenseId/resolve',
  )
  resolveWithoutDocument(
    @CurrentUser() user: RequestUser,
    @Param('businessId')
    businessId: string,
    @Param('expenseId')
    expenseId: string,
    @Body()
    dto: {
      note?: string;
    },
  ) {
    return this.documents.resolveExpenseWithoutDocument(
      user.sub,
      businessId,
      expenseId,
      dto.note,
    );
  }

  @Post(
    ':documentId/process-ocr',
  )
  processOcr(
    @CurrentUser() user: RequestUser,
    @Param('businessId')
    businessId: string,
    @Param('documentId')
    documentId: string,
  ) {
    return this.documents.processOcr(
      user.sub,
      businessId,
      documentId,
    );
  }

  @Get(':documentId/ocr')
  getOcr(
    @CurrentUser() user: RequestUser,
    @Param('businessId')
    businessId: string,
    @Param('documentId')
    documentId: string,
  ) {
    return this.documents.getOcr(
      user.sub,
      businessId,
      documentId,
    );
  }

  @Post(
    ':documentId/manual-fields',
  )
  saveManualFields(
    @CurrentUser() user: RequestUser,
    @Param('businessId')
    businessId: string,
    @Param('documentId')
    documentId: string,
    @Body()
    dto: ManualReceiptDto,
  ) {
    return this.documents.saveManualReceiptFields(
      user.sub,
      businessId,
      documentId,
      dto,
    );
  }

  @Post(
    ':documentId/approve-as-expense',
  )
  approveAsExpense(
    @CurrentUser() user: RequestUser,
    @Param('businessId')
    businessId: string,
    @Param('documentId')
    documentId: string,
    @Body()
    dto: ApproveReceiptDto,
  ) {
    return this.documents.approveReceiptAsExpense(
      user.sub,
      businessId,
      documentId,
      dto,
    );
  }
}
