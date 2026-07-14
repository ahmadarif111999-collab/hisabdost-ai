import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentType, OcrStatus } from '@prisma/client';
import { AccountingService } from '../accounting/accounting.service';
import { BusinessesService } from '../businesses/businesses.service';
import { OcrService } from '../ocr/ocr.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ApproveReceiptDto,
  ManualReceiptDto,
} from './dto/approve-receipt.dto';

type ExtractedReceiptJson = {
  totalAmount?: number;
  date?: string;
  suggestedCategory?: string;
  vendorName?: string;
  paymentMethod?: 'cash' | 'bank' | 'card' | 'wallet' | 'unknown';
  invoiceNumber?: string;
  requiresAccountantReview?: boolean;
  duplicateRisk?: 'low' | 'medium' | 'high';
  confidence?: number;
  notes?: string;
};

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly businesses: BusinessesService,
    private readonly config: ConfigService,
    private readonly ocr: OcrService,
    private readonly accounting: AccountingService,
  ) {}

  async list(userId: string, businessId: string) {
    await this.businesses.getAccessibleBusiness(userId, businessId);

    return this.prisma.document.findMany({
      where: { businessId },
      orderBy: { createdAt: 'desc' },
      include: {
        ocrJobs: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });
  }

  async createFromUpload(
    userId: string,
    businessId: string,
    file: Express.Multer.File,
    documentType: DocumentType = 'OTHER',
  ) {
    const business = await this.businesses.getAccessibleBusiness(
      userId,
      businessId,
    );

    this.assertFile(file);

    const document = await this.prisma.document.create({
      data: this.uploadDocumentData(
        userId,
        businessId,
        file,
        documentType,
      ),
      include: { ocrJobs: true },
    });

    await this.prisma.auditLog.create({
      data: {
        organizationId: business.organizationId,
        businessId,
        userId,
        action: 'DOCUMENT_UPLOADED',
        entityType: 'Document',
        entityId: document.id,
        afterJson: {
          originalFilename: document.originalFilename,
          documentType: document.documentType,
          ocrStatus: document.ocrStatus,
        },
      },
    });

    return document;
  }

  async attachUploadToExpense(
    userId: string,
    businessId: string,
    expenseId: string,
    file: Express.Multer.File,
    documentType: DocumentType = 'RECEIPT',
    processOcr = false,
  ) {
    const business = await this.businesses.getAccessibleBusiness(
      userId,
      businessId,
    );

    this.assertFile(file);

    const expense = await this.ensureAccessibleExpense(
      businessId,
      expenseId,
    );

    if (expense.documentId) {
      throw new BadRequestException(
        'This expense already has a supporting document attached.',
      );
    }

    const linkedEntityType =
      expense.kind === 'purchase' ? 'purchase' : 'expense';

    const document = await this.prisma.$transaction(async (tx) => {
      const created = await tx.document.create({
        data: {
          ...this.uploadDocumentData(
            userId,
            businessId,
            file,
            documentType,
          ),
          linkedEntityType,
          linkedEntityId: expense.id,
        },
        include: { ocrJobs: true },
      });

      const linked = await tx.expense.updateMany({
        where: {
          id: expense.id,
          businessId,
          documentId: null,
        },
        data: {
          documentId: created.id,
        },
      });

      if (linked.count !== 1) {
        throw new BadRequestException(
          'This missing-document issue has already been resolved.',
        );
      }

      await tx.auditLog.create({
        data: {
          organizationId: business.organizationId,
          businessId,
          userId,
          action: 'EXPENSE_DOCUMENT_ATTACHED',
          entityType: 'Expense',
          entityId: expense.id,
          beforeJson: {
            documentId: null,
          },
          afterJson: {
            documentId: created.id,
            originalFilename: created.originalFilename,
            resolutionType: 'uploaded_document',
          },
        },
      });

      return created;
    });

    let ocrResult: unknown = null;
    let ocrError: string | null = null;

    if (
      processOcr &&
      (document.documentType === 'RECEIPT' ||
        document.documentType === 'INVOICE')
    ) {
      try {
        ocrResult = await this.ocr.processDocument(document.id);
      } catch (error) {
        ocrError =
          error instanceof Error
            ? error.message
            : 'OCR processing failed after the document was attached.';
      }
    }

    return {
      message: ocrError
        ? 'Document attached and the missing-document issue was resolved, but OCR could not be completed.'
        : 'Document attached and the missing-document issue was resolved.',
      document,
      expenseId: expense.id,
      ocrResult,
      ocrError,
    };
  }

  async linkExistingDocumentToExpense(
    userId: string,
    businessId: string,
    expenseId: string,
    documentId: string,
  ) {
    const business = await this.businesses.getAccessibleBusiness(
      userId,
      businessId,
    );

    const expense = await this.ensureAccessibleExpense(
      businessId,
      expenseId,
    );

    if (expense.documentId) {
      throw new BadRequestException(
        'This expense already has a supporting document attached.',
      );
    }

    const document = await this.prisma.document.findFirst({
      where: {
        id: documentId,
        businessId,
      },
    });

    if (!document) {
      throw new NotFoundException('Document not found');
    }

    if (document.linkedEntityId) {
      throw new BadRequestException(
        'This document is already linked to another accounting record.',
      );
    }

    const linkedEntityType =
      expense.kind === 'purchase' ? 'purchase' : 'expense';

    const result = await this.prisma.$transaction(async (tx) => {
      const linkedExpense = await tx.expense.updateMany({
        where: {
          id: expense.id,
          businessId,
          documentId: null,
        },
        data: {
          documentId: document.id,
        },
      });

      if (linkedExpense.count !== 1) {
        throw new BadRequestException(
          'This missing-document issue has already been resolved.',
        );
      }

      const linkedDocument = await tx.document.updateMany({
        where: {
          id: document.id,
          businessId,
          linkedEntityId: null,
        },
        data: {
          linkedEntityType,
          linkedEntityId: expense.id,
        },
      });

      if (linkedDocument.count !== 1) {
        throw new BadRequestException(
          'This document was linked by another user. Refresh and try again.',
        );
      }

      await tx.auditLog.create({
        data: {
          organizationId: business.organizationId,
          businessId,
          userId,
          action: 'EXISTING_DOCUMENT_LINKED_TO_EXPENSE',
          entityType: 'Expense',
          entityId: expense.id,
          beforeJson: {
            documentId: null,
          },
          afterJson: {
            documentId: document.id,
            originalFilename: document.originalFilename,
            resolutionType: 'existing_document',
          },
        },
      });

      return tx.document.findUnique({
        where: { id: document.id },
        include: {
          ocrJobs: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      });
    });

    return {
      message:
        'Existing document linked and the missing-document issue was resolved.',
      document: result,
      expenseId: expense.id,
    };
  }

  async resolveExpenseWithoutDocument(
    userId: string,
    businessId: string,
    expenseId: string,
    note?: string,
  ) {
    const business = await this.businesses.getAccessibleBusiness(
      userId,
      businessId,
    );

    const expense = await this.ensureAccessibleExpense(
      businessId,
      expenseId,
    );

    const isFirmUser = await this.businesses.isFirmUserForBusiness(
      userId,
      businessId,
    );

    if (!isFirmUser) {
      throw new ForbiddenException(
        'Only a firm user can resolve a missing-document issue without an attachment.',
      );
    }

    if (expense.documentId) {
      throw new BadRequestException(
        'This missing-document issue has already been resolved.',
      );
    }

    const resolutionNote = String(note || '').trim();

    if (resolutionNote.length < 5) {
      throw new BadRequestException(
        'Enter a short reason explaining why no document is available.',
      );
    }

    const resolvedAt = new Date();
    const linkedEntityType =
      expense.kind === 'purchase' ? 'purchase' : 'expense';

    const document = await this.prisma.$transaction(async (tx) => {
      const resolutionRecord = await tx.document.create({
        data: {
          businessId,
          uploadedById: userId,
          fileUrl: `manual-resolution://expenses/${expense.id}`,
          fileType: 'application/x-hisabdost-manual-resolution',
          originalFilename: `Manual resolution for ${linkedEntityType}`,
          documentType: 'OTHER',
          linkedEntityType,
          linkedEntityId: expense.id,
          ocrStatus: 'NOT_REQUIRED',
          manualJson: {
            resolutionType: 'manual_without_attachment',
            note: resolutionNote,
            resolvedAt: resolvedAt.toISOString(),
            resolvedById: userId,
          },
        },
      });

      const resolved = await tx.expense.updateMany({
        where: {
          id: expense.id,
          businessId,
          documentId: null,
        },
        data: {
          documentId: resolutionRecord.id,
        },
      });

      if (resolved.count !== 1) {
        throw new BadRequestException(
          'This missing-document issue has already been resolved.',
        );
      }

      await tx.auditLog.create({
        data: {
          organizationId: business.organizationId,
          businessId,
          userId,
          action:
            'EXPENSE_DOCUMENT_ISSUE_RESOLVED_WITHOUT_ATTACHMENT',
          entityType: 'Expense',
          entityId: expense.id,
          beforeJson: {
            documentId: null,
          },
          afterJson: {
            documentId: resolutionRecord.id,
            resolutionType: 'manual_without_attachment',
            note: resolutionNote,
            resolvedAt: resolvedAt.toISOString(),
          },
        },
      });

      return resolutionRecord;
    });

    return {
      message:
        'Missing-document issue marked resolved with an audit note.',
      document,
      expenseId: expense.id,
    };
  }

  async processOcr(
    userId: string,
    businessId: string,
    documentId: string,
  ) {
    const document = await this.ensureAccessibleDocument(
      userId,
      businessId,
      documentId,
    );

    if (this.isManualResolutionDocument(document)) {
      throw new BadRequestException(
        'Manual resolution records do not contain a file for OCR.',
      );
    }

    return this.ocr.processDocument(documentId);
  }

  async getOcr(
    userId: string,
    businessId: string,
    documentId: string,
  ) {
    await this.ensureAccessibleDocument(
      userId,
      businessId,
      documentId,
    );

    const job = await this.ocr.getLatestJob(documentId);

    if (!job) {
      throw new NotFoundException(
        'No OCR job found for this document',
      );
    }

    return job;
  }

  async saveManualReceiptFields(
    userId: string,
    businessId: string,
    documentId: string,
    dto: ManualReceiptDto,
  ) {
    const document = await this.ensureAccessibleDocument(
      userId,
      businessId,
      documentId,
    );

    if (this.isManualResolutionDocument(document)) {
      throw new BadRequestException(
        'A manual resolution record cannot be converted into a receipt.',
      );
    }

    return this.prisma.document.update({
      where: { id: documentId },
      data: {
        manualJson: dto as object,
      },
      include: {
        ocrJobs: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });
  }

  async approveReceiptAsExpense(
    userId: string,
    businessId: string,
    documentId: string,
    dto: ApproveReceiptDto,
  ) {
    const business = await this.businesses.getAccessibleBusiness(
      userId,
      businessId,
    );

    const document = await this.ensureAccessibleDocument(
      userId,
      businessId,
      documentId,
    );

    if (this.isManualResolutionDocument(document)) {
      throw new BadRequestException(
        'A manual resolution record cannot be posted as an expense.',
      );
    }

    if (document.linkedEntityId) {
      throw new BadRequestException(
        'This document is already linked to an accounting record.',
      );
    }

    const latest = await this.ocr.getLatestJob(documentId);

    const extracted = (
      latest?.extractedJson ||
      document.manualJson ||
      {}
    ) as unknown as ExtractedReceiptJson;

    if (
      latest?.status === OcrStatus.COMPLETED &&
      extracted.duplicateRisk === 'high'
    ) {
      throw new BadRequestException(
        'Possible duplicate receipt detected. Please review before posting.',
      );
    }

    const amount =
      dto.amount ?? extracted.totalAmount;

    if (!amount || amount <= 0) {
      throw new BadRequestException(
        'Amount is missing. Enter amount manually before approval.',
      );
    }

    const paymentMethod =
      dto.paymentMethod ??
      this.mapReceiptPaymentMethod(
        extracted.paymentMethod,
      );

    const base = {
      amount,
      date: dto.date ?? extracted.date,
      vendorName:
        dto.vendorName ?? extracted.vendorName,
      paymentMethod,
      accountCode: dto.accountCode,
      documentId,
      description:
        dto.description ??
        [
          extracted.vendorName
            ? `Receipt from ${extracted.vendorName}`
            : 'Receipt entry',
          extracted.invoiceNumber
            ? `Invoice #${extracted.invoiceNumber}`
            : undefined,
        ]
          .filter(Boolean)
          .join(' - '),
    };

    const result: any =
      dto.kind === 'purchase'
        ? await this.accounting.createPurchase(
            userId,
            businessId,
            {
              ...base,
              paymentMethod,
              accountCode: dto.accountCode,
            },
          )
        : await this.accounting.createExpense(
            userId,
            businessId,
            {
              ...base,
              category:
                dto.category ??
                extracted.suggestedCategory ??
                'office',
              paymentMethod,
            },
          );

    const linkedEntityType =
      dto.kind === 'purchase'
        ? 'purchase'
        : 'expense';

    const linkedEntityId =
      dto.kind === 'purchase'
        ? result.purchase.id
        : result.expense.id;

    await this.prisma.$transaction([
      this.prisma.document.update({
        where: { id: document.id },
        data: {
          linkedEntityType,
          linkedEntityId,
          manualJson: {
            ...((document.manualJson as object) || {}),
            ...dto,
          } as object,
        },
      }),
      this.prisma.auditLog.create({
        data: {
          organizationId: business.organizationId,
          businessId,
          userId,
          action: 'RECEIPT_APPROVED_AND_POSTED',
          entityType: 'Document',
          entityId: document.id,
          afterJson: {
            linkedEntityType,
            linkedEntityId,
            amount,
          },
        },
      }),
    ]);

    return {
      ...result,
      message:
        dto.kind === 'purchase'
          ? 'Receipt approved and purchase recorded'
          : 'Receipt approved and expense recorded',
    };
  }

  private async ensureAccessibleDocument(
    userId: string,
    businessId: string,
    documentId: string,
  ) {
    await this.businesses.getAccessibleBusiness(
      userId,
      businessId,
    );

    const document =
      await this.prisma.document.findFirst({
        where: {
          id: documentId,
          businessId,
        },
      });

    if (!document) {
      throw new NotFoundException(
        'Document not found',
      );
    }

    return document;
  }

  private async ensureAccessibleExpense(
    businessId: string,
    expenseId: string,
  ) {
    const expense =
      await this.prisma.expense.findFirst({
        where: {
          id: expenseId,
          businessId,
        },
      });

    if (!expense) {
      throw new NotFoundException(
        'Expense or purchase record not found',
      );
    }

    return expense;
  }

  private uploadDocumentData(
    userId: string,
    businessId: string,
    file: Express.Multer.File,
    documentType: DocumentType,
  ) {
    return {
      businessId,
      uploadedById: userId,
      originalFilename: file.originalname,
      fileType: file.mimetype,
      fileUrl: `/${
        this.config.get('UPLOAD_DIR') ||
        'uploads'
      }/${file.filename}`,
      documentType,
      ocrStatus:
        documentType === 'RECEIPT' ||
        documentType === 'INVOICE'
          ? ('PENDING' as const)
          : ('NOT_REQUIRED' as const),
    };
  }

  private assertFile(
    file?: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException(
        'Select a document to upload.',
      );
    }
  }

  private isManualResolutionDocument(
    document: {
      fileType: string | null;
    },
  ) {
    return (
      document.fileType ===
      'application/x-hisabdost-manual-resolution'
    );
  }

  private mapReceiptPaymentMethod(
    method?: string,
  ): 'cash' | 'bank' | 'wallet' | 'payable' {
    if (
      method === 'bank' ||
      method === 'card'
    ) {
      return 'bank';
    }

    if (method === 'wallet') {
      return 'wallet';
    }

    if (method === 'cash') {
      return 'cash';
    }

    return 'cash';
  }
}
