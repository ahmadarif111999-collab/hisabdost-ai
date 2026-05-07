import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OcrStatus } from '@prisma/client';
import { execFile } from 'child_process';
import { readFile } from 'fs/promises';
import { extname, isAbsolute, join } from 'path';
import { promisify } from 'util';
import { PrismaService } from '../../prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import { ReceiptExtractionResult } from '../ai/types';

const execFileAsync = promisify(execFile);

type GoogleVisionResponse = {
  responses?: Array<{ fullTextAnnotation?: { text?: string }; textAnnotations?: Array<{ description?: string }> }>;
  error?: { message?: string };
};

@Injectable()
export class OcrService {
  private readonly logger = new Logger(OcrService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly ai: AiService,
  ) {}

  async getLatestJob(documentId: string) {
    return this.prisma.ocrJob.findFirst({ where: { documentId }, orderBy: { createdAt: 'desc' } });
  }

  async processDocument(documentId: string) {
    const document = await this.prisma.document.findUnique({ where: { id: documentId } });
    if (!document) throw new NotFoundException('Document not found');

    const provider = this.config.get<string>('OCR_PROVIDER') || (this.config.get<string>('GOOGLE_VISION_API_KEY') ? 'google-vision' : 'mock');
    const job = await this.prisma.ocrJob.create({
      data: { documentId, provider, status: OcrStatus.PROCESSING },
    });

    await this.prisma.document.update({ where: { id: documentId }, data: { ocrStatus: OcrStatus.PROCESSING } });

    try {
      const rawText = await this.extractText(document.fileUrl, document.fileType || '', provider);
      const extracted = await this.ai.parseReceiptText(rawText);
      const extractedWithDuplicate = await this.withDuplicateSignal(document.businessId, documentId, extracted);

      const updatedJob = await this.prisma.ocrJob.update({
        where: { id: job.id },
        data: {
          rawText,
          extractedJson: extractedWithDuplicate as object,
          confidenceScore: extractedWithDuplicate.confidence,
          status: OcrStatus.COMPLETED,
        },
      });
      await this.prisma.document.update({ where: { id: documentId }, data: { ocrStatus: OcrStatus.COMPLETED } });

      return { document: { ...document, ocrStatus: OcrStatus.COMPLETED }, ocrJob: updatedJob, extracted: extractedWithDuplicate };
    } catch (error) {
      const message = (error as Error).message;
      this.logger.warn(`OCR failed for ${documentId}: ${message}`);
      await this.prisma.ocrJob.update({ where: { id: job.id }, data: { status: OcrStatus.FAILED, errorMessage: message } });
      await this.prisma.document.update({ where: { id: documentId }, data: { ocrStatus: OcrStatus.FAILED } });
      throw error;
    }
  }

  private async extractText(fileUrl: string, mimeType: string, provider: string) {
    const localPath = this.resolveLocalPath(fileUrl);
    const lowerProvider = provider.toLowerCase();

    if (mimeType.startsWith('text/') || ['.txt', '.csv'].includes(extname(localPath).toLowerCase())) {
      return readFile(localPath, 'utf8');
    }

    if (lowerProvider === 'google-vision') return this.extractWithGoogleVision(localPath);
    if (lowerProvider === 'tesseract') return this.extractWithTesseract(localPath);

    return [
      'OCR provider is not configured.',
      `File: ${fileUrl}`,
      'Set OCR_PROVIDER=google-vision with GOOGLE_VISION_API_KEY, or OCR_PROVIDER=tesseract with the tesseract CLI installed.',
    ].join('\n');
  }

  private resolveLocalPath(fileUrl: string) {
    const normalized = fileUrl.replace(/^\//, '');
    if (isAbsolute(fileUrl)) return fileUrl;
    return join(process.cwd(), normalized);
  }

  private async extractWithTesseract(localPath: string) {
    const bin = this.config.get<string>('TESSERACT_BIN') || 'tesseract';
    const { stdout } = await execFileAsync(bin, [localPath, 'stdout', '-l', this.config.get<string>('TESSERACT_LANG') || 'eng+urd'], {
      timeout: 60_000,
      maxBuffer: 10 * 1024 * 1024,
    });
    return stdout;
  }

  private async extractWithGoogleVision(localPath: string) {
    const apiKey = this.config.get<string>('GOOGLE_VISION_API_KEY');
    if (!apiKey) throw new Error('GOOGLE_VISION_API_KEY is missing');

    const bytes = await readFile(localPath);
    const res = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: [
          {
            image: { content: bytes.toString('base64') },
            features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
            imageContext: { languageHints: ['en', 'ur'] },
          },
        ],
      }),
    });

    const payload = (await res.json().catch(() => null)) as GoogleVisionResponse | null;
    if (!res.ok) throw new Error(`Google Vision error: ${payload?.error?.message || res.statusText}`);
    const first = payload?.responses?.[0];
    return first?.fullTextAnnotation?.text || first?.textAnnotations?.[0]?.description || '';
  }

  private async withDuplicateSignal(businessId: string, documentId: string, extracted: ReceiptExtractionResult & { provider?: string; model?: string }) {
    if (!extracted.invoiceNumber && !extracted.totalAmount) return extracted;

    const existing = await this.prisma.ocrJob.findMany({
      where: {
        documentId: { not: documentId },
        status: OcrStatus.COMPLETED,
        document: { businessId },
      },
      take: 50,
      orderBy: { createdAt: 'desc' },
    });

    const duplicate = existing.some((job) => {
      const json = job.extractedJson as Record<string, unknown> | null;
      if (!json) return false;
      const sameInvoice = extracted.invoiceNumber && json.invoiceNumber === extracted.invoiceNumber;
      const sameAmount = extracted.totalAmount && Number(json.totalAmount) === Number(extracted.totalAmount);
      const sameVendor = extracted.vendorName && String(json.vendorName || '').toLowerCase() === extracted.vendorName.toLowerCase();
      return Boolean(sameInvoice || (sameAmount && sameVendor));
    });

    return { ...extracted, duplicateRisk: duplicate ? 'high' : extracted.duplicateRisk || 'low' };
  }
}
