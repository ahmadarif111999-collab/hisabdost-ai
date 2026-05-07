import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentType, OcrStatus } from '@prisma/client';
import { AccountingService } from '../accounting/accounting.service';
import { BusinessesService } from '../businesses/businesses.service';
import { OcrService } from '../ocr/ocr.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ApproveReceiptDto, ManualReceiptDto } from './dto/approve-receipt.dto';

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
      include: { ocrJobs: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });
  }

  async createFromUpload(userId: string, businessId: string, file: Express.Multer.File, documentType: DocumentType = 'OTHER') {
    await this.businesses.getAccessibleBusiness(userId, businessId);
    return this.prisma.document.create({
      data: {
        businessId,
        uploadedById: userId,
        originalFilename: file.originalname,
        fileType: file.mimetype,
        fileUrl: `/${this.config.get('UPLOAD_DIR') || 'uploads'}/${file.filename}`,
        documentType,
        ocrStatus: documentType === 'RECEIPT' || documentType === 'INVOICE' ? 'PENDING' : 'NOT_REQUIRED',
      },
      include: { ocrJobs: true },
    });
  }

  async processOcr(userId: string, businessId: string, documentId: string) {
    await this.ensureAccessibleDocument(userId, businessId, documentId);
    return this.ocr.processDocument(documentId);
  }

  async getOcr(userId: string, businessId: string, documentId: string) {
    await this.ensureAccessibleDocument(userId, businessId, documentId);
    const job = await this.ocr.getLatestJob(documentId);
    if (!job) throw new NotFoundException('No OCR job found for this document');
    return job;
  }

  async saveManualReceiptFields(userId: string, businessId: string, documentId: string, dto: ManualReceiptDto) {
    await this.ensureAccessibleDocument(userId, businessId, documentId);
    return this.prisma.document.update({
      where: { id: documentId },
      data: { manualJson: dto as object },
      include: { ocrJobs: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });
  }

  async approveReceiptAsExpense(userId: string, businessId: string, documentId: string, dto: ApproveReceiptDto) {
    const document = await this.ensureAccessibleDocument(userId, businessId, documentId);
    const latest = await this.ocr.getLatestJob(documentId);
    const extracted = (latest?.extractedJson || document.manualJson || {}) as unknown as ExtractedReceiptJson;

    if (latest?.status === OcrStatus.COMPLETED && extracted.duplicateRisk === 'high') {
      throw new BadRequestException('Possible duplicate receipt detected. Please review before posting.');
    }

    const amount = dto.amount ?? extracted.totalAmount;
    if (!amount || amount <= 0) throw new BadRequestException('Amount is missing. Enter amount manually before approval.');

    const paymentMethod = dto.paymentMethod ?? this.mapReceiptPaymentMethod(extracted.paymentMethod);
    const base = {
      amount,
      date: dto.date ?? extracted.date,
      vendorName: dto.vendorName ?? extracted.vendorName,
      paymentMethod,
      accountCode: dto.accountCode,
      documentId,
      description:
        dto.description ??
        [
          extracted.vendorName ? `Receipt from ${extracted.vendorName}` : 'Receipt entry',
          extracted.invoiceNumber ? `Invoice #${extracted.invoiceNumber}` : undefined,
        ]
          .filter(Boolean)
          .join(' - '),
    };

    const result: any = dto.kind === 'purchase'
      ? await this.accounting.createPurchase(userId, businessId, { ...base, paymentMethod, accountCode: dto.accountCode })
      : await this.accounting.createExpense(userId, businessId, {
          ...base,
          category: dto.category ?? extracted.suggestedCategory ?? 'office',
          paymentMethod,
        });

    await this.prisma.document.update({
      where: { id: document.id },
      data: {
        linkedEntityType: dto.kind === 'purchase' ? 'purchase' : 'expense',
        linkedEntityId: dto.kind === 'purchase' ? result.purchase.id : result.expense.id,
        manualJson: { ...((document.manualJson as object) || {}), ...dto } as object,
      },
    });

    return { ...result, message: dto.kind === 'purchase' ? 'Receipt approved and purchase recorded' : 'Receipt approved and expense recorded' };
  }

  private async ensureAccessibleDocument(userId: string, businessId: string, documentId: string) {
    await this.businesses.getAccessibleBusiness(userId, businessId);
    const document = await this.prisma.document.findFirst({ where: { id: documentId, businessId } });
    if (!document) throw new NotFoundException('Document not found');
    return document;
  }

  private mapReceiptPaymentMethod(method?: string): 'cash' | 'bank' | 'wallet' | 'payable' {
    if (method === 'bank' || method === 'card') return 'bank';
    if (method === 'wallet') return 'wallet';
    if (method === 'cash') return 'cash';
    return 'cash';
  }
}
