import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentType, OcrStatus, Prisma } from '@prisma/client';
import { put, del } from '@vercel/blob';
import { randomUUID } from 'crypto';
import { mkdir, writeFile, unlink } from 'fs/promises';
import { extname, resolve, join } from 'path';
import { AccountingService } from '../accounting/accounting.service';
import { BusinessesService } from '../businesses/businesses.service';
import { OcrService } from '../ocr/ocr.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ReferenceNumbersService } from '../reference-numbers/reference-numbers.service';
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
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly businesses: BusinessesService,
    private readonly config: ConfigService,
    private readonly ocr: OcrService,
    private readonly accounting: AccountingService,
    private readonly references: ReferenceNumbersService,
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

    return this.withStoredUpload(businessId, file, (fileUrl) => this.prisma.$transaction(async (tx) => {
      const document = await tx.document.create({
        data: this.uploadDocumentData(userId, businessId, file, documentType, fileUrl),
        include: { ocrJobs: true },
      });
      const documentNo = await this.createDocumentReference(tx, document);
      await tx.auditLog.create({
        data: {
          organizationId: business.organizationId,
          businessId,
          userId,
          action: 'DOCUMENT_UPLOADED',
          entityType: 'Document',
          entityId: document.id,
          afterJson: {
            documentReference: documentNo,
            originalFilename: document.originalFilename,
            documentType: document.documentType,
            ocrStatus: document.ocrStatus,
          },
        },
      });
      return { ...document, documentNo };
    }));
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

    const document = await this.withStoredUpload(businessId, file, (fileUrl) => this.prisma.$transaction(async (tx) => {
      const created = await tx.document.create({
        data: {
          ...this.uploadDocumentData(
            userId,
            businessId,
            file,
            documentType,
            fileUrl,
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

      const documentNo = await this.createDocumentReference(tx, created);
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
            documentReference: documentNo,
            originalFilename: created.originalFilename,
            resolutionType: 'uploaded_document',
          },
        },
      });

      return { ...created, documentNo };
    }));

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
        ? `${document.documentNo} attached; OCR could not be completed.`
        : `${document.documentNo} attached and the missing-document issue was resolved.`,
      documentNo: document.documentNo,
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

    if (this.isManualResolutionDocument(document)) {
      throw new BadRequestException('A manual resolution is not an uploaded receipt.');
    }

    if (document.linkedEntityId) {
      throw new BadRequestException(
        'This document is already linked to another accounting record.',
      );
    }

    const linkedEntityType =
      expense.kind === 'purchase' ? 'purchase' : 'expense';

    const documentNo = await this.references.attachReference(
      businessId, 'document', document.id, document.createdAt,
    );
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
            documentReference: documentNo,
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
        `${documentNo} linked and the missing-document issue was resolved.`,
      documentNo,
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

      const documentNo = await this.createDocumentReference(tx, resolutionRecord);
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
            documentReference: documentNo,
            resolutionType: 'manual_without_attachment',
            note: resolutionNote,
            resolvedAt: resolvedAt.toISOString(),
          },
        },
      });

      return { ...resolutionRecord, documentNo };
    });

    return {
      message:
        `${document.documentNo}: missing-document issue resolved with an audit note. No receipt attached.`,
      documentNo: document.documentNo,
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

    await this.references.attachReference(
      businessId, 'document', document.id, document.createdAt,
    );
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

    const documentNo = await this.references.attachReference(
      businessId, 'document', document.id, document.createdAt,
    );
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

    const [updatedDocument] = await this.prisma.$transaction([
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
            documentReference: documentNo,
            linkedEntityType,
            linkedEntityId,
            amount,
          },
        },
      }),
    ]);

    return {
      ...result,
      document: updatedDocument,
      documentNo,
      message: `${documentNo} approved and ${linkedEntityType} recorded`,
    };
  }

  private async createDocumentReference(
    tx: Prisma.TransactionClient,
    document: { id: string; businessId: string; createdAt: Date },
  ) {
    const referenceNo = await this.references.nextReferenceNo(
      document.businessId, 'document', document.createdAt, tx,
    );
    await tx.businessReference.create({
      data: {
        businessId: document.businessId,
        entityType: 'document',
        entityId: document.id,
        referenceNo,
        referenceDate: document.createdAt,
      },
    });
    return referenceNo;
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

  // Keep the original bytes private and durable before creating a database record.
  // On local development without Blob credentials, retain filesystem storage.
  private async withStoredUpload<T>(
    businessId: string,
    file: Express.Multer.File,
    persist: (fileUrl: string) => Promise<T>,
  ): Promise<T> {
    const token = this.config.get<string>('BLOB_READ_WRITE_TOKEN');
    const useBlob = process.env.VERCEL === '1' || Boolean(token);
    const extension = extname(file.originalname).toLowerCase();
    const safeExtension = /^\.[a-z0-9]{1,10}$/.test(extension) ? extension : '';
    const filename = `${randomUUID()}${safeExtension}`;
    let fileUrl: string;
    let blobPath: string | undefined;

    try {
      if (useBlob) {
        if (!token) {
          throw new Error('Private Blob credential is not configured');
        }
        const blob = await put(`documents/${businessId}/${filename}`, file.buffer, {
          access: 'private',
          token,
          addRandomSuffix: false,
          contentType: file.mimetype || 'application/octet-stream',
        });
        blobPath = blob.pathname;
        fileUrl = `blob-private://${blob.pathname}`;
      } else {
        const directory = resolve(this.config.get<string>('UPLOAD_DIR') || 'uploads');
        await mkdir(directory, { recursive: true });
        fileUrl = join(directory, filename);
        await writeFile(fileUrl, file.buffer, { flag: 'wx' });
      }
    } catch (error) {
      this.logUploadFailure('storage', error);
      throw new ServiceUnavailableException('Document storage is unavailable. Check the API storage configuration.');
    }

    try {
      return await persist(fileUrl);
    } catch (error) {
      this.logUploadFailure('database', error);
      // A transaction can fail ambiguously (for example, a lost connection at
      // commit). Never delete evidence if we cannot check its database record.
      try {
        const saved = await this.prisma.document.findFirst({
          where: { businessId, fileUrl },
          select: { id: true },
        });
        if (!saved) {
          if (blobPath && token) await del(blobPath, { token });
          else await unlink(fileUrl);
        }
      } catch (cleanupError) {
        this.logUploadFailure('cleanup', cleanupError);
      }
      throw error;
    }
  }

  private logUploadFailure(stage: string, error: unknown) {
    // Avoid logging credentials, file contents, filenames, or SQL parameters.
    const value = error as { name?: unknown; code?: unknown } | null;
    const safe = (field: unknown) => typeof field === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(field) ? field : 'unknown';
    this.logger.error(`Document upload ${stage} failed: ${safe(value?.name)} (${safe(value?.code)})`);
  }

  private uploadDocumentData(
    userId: string,
    businessId: string,
    file: Express.Multer.File,
    documentType: DocumentType,
    fileUrl: string,
  ) {
    return {
      businessId,
      uploadedById: userId,
      originalFilename: file.originalname,
      fileType: file.mimetype,
      fileUrl,
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
    if (!file || !Buffer.isBuffer(file.buffer) || file.buffer.length === 0) {
      throw new BadRequestException(
        'Select a non-empty document to upload.',
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
