import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ReferenceNumbersService } from './reference-numbers.service';

type AnyRecord = Record<string, any>;
type ReferenceSeed = { id: string; date: Date | string };

type ReportSection = {
  title?: string;
  columns?: string[];
  rows?: AnyRecord[];
  totals?: AnyRecord;
  [key: string]: any;
};

@Injectable()
export class ReferencePresentationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly references: ReferenceNumbersService,
  ) {}

  async decorateReportPreview(
    businessId: string,
    dto: AnyRecord,
    preview: AnyRecord,
  ) {
    const reportType = String(
      dto?.reportType || dto?.type || preview?.reportType || '',
    ).toLowerCase();

    let result = this.clone(preview);

    if (reportType === 'expenses' || reportType === 'expense') {
      result = await this.replaceExpenseOrPurchaseSection(
        businessId,
        dto,
        result,
        'expense',
      );
    } else if (reportType === 'purchases' || reportType === 'purchase') {
      result = await this.replaceExpenseOrPurchaseSection(
        businessId,
        dto,
        result,
        'purchase',
      );
    } else if (
      reportType === 'general-ledger' ||
      reportType === 'general_ledger' ||
      reportType === 'gl'
    ) {
      result = await this.decorateGeneralLedger(
        businessId,
        dto,
        result,
      );
    } else if (reportType === 'sales' || reportType === 'invoices') {
      result = await this.decorateSales(businessId, dto, result);
    } else if (
      reportType === 'cash-bank' ||
      reportType === 'cash_bank' ||
      reportType === 'payments'
    ) {
      result = await this.appendPaymentRegister(
        businessId,
        dto,
        result,
      );
    } else if (
      reportType === 'missing-documents' ||
      reportType === 'missing_documents'
    ) {
      result = await this.decorateMissingDocuments(
        businessId,
        dto,
        result,
      );
    }

    return this.sanitizeForExport(result);
  }

  async decorateReportRequestPayload(payload: any) {
    const clone = this.clone(payload);
    const requests: AnyRecord[] = [];
    this.collectObjects(
      clone,
      (record) =>
        Boolean(
          record?.id &&
            record?.businessId &&
            record?.reportType &&
            record?.status,
        ),
      requests,
    );

    if (!requests.length) {
      return clone;
    }

    const grouped = this.groupBy(requests, (request) => request.businessId);
    const referenceByRequestId: Record<string, string> = {};

    for (const [businessId, businessRequests] of grouped.entries()) {
      const map = await this.references.ensureMany(
        businessId,
        'report_request',
        businessRequests.map((request) => ({
          id: request.id,
          date:
            request.requestedAt ||
            request.createdAt ||
            request.updatedAt ||
            new Date(),
        })),
      );
      Object.assign(referenceByRequestId, map);
    }

    const userMap = await this.loadUsers(
      requests.flatMap((request) => [
        request.requestedById,
        request.decidedById,
        request.approvedById,
        request.createdById,
      ]),
    );

    for (const request of requests) {
      const requestNo = referenceByRequestId[request.id];
      const metadata = this.jsonObject(request.filtersJson);
      const requestedBy =
        this.cleanPerson(request.requestedBy) ||
        this.cleanPerson(userMap.get(request.requestedById));
      const decidedBy =
        this.cleanPerson(request.decidedBy) ||
        this.cleanPerson(userMap.get(request.decidedById));

      request.requestNo = requestNo;
      request.referenceNo = requestNo;
      request.displayNumber = requestNo;
      request.reportRequestNo = requestNo;
      request.requestedBy = requestedBy;
      request.decidedBy = decidedBy;
      request.requestedByName = this.personLabel(requestedBy);
      request.decidedByName = this.personLabel(decidedBy);
      request.exportNo =
        metadata.completedExportReference ||
        metadata.exportReference ||
        request.exportNo ||
        null;
      request.completedFilename =
        metadata.completedFilename || request.completedFilename || null;
      request.completedAt =
        metadata.completedAt || request.completedAt || null;

      delete request.requestedById;
      delete request.decidedById;
      delete request.approvedById;
      delete request.createdById;
    }

    this.appendReferenceToMessages(clone, referenceByRequestId);
    return clone;
  }

  async markApprovedRequestExported(
    businessId: string,
    requestId: string,
    result: AnyRecord,
  ) {
    const delegate = (this.prisma as any).reportExportRequest;
    const request = await delegate.findFirst({
      where: {
        id: requestId,
        businessId,
      },
    });

    if (!request) {
      return result;
    }

    const requestNo = await this.references.attachReference(
      businessId,
      'report_request',
      request.id,
      request.requestedAt || request.createdAt || new Date(),
    );
    const exportNo =
      result.exportNo || result.referenceNo || result.displayNumber || null;
    const metadata = {
      ...this.jsonObject(request.filtersJson),
      completedExportReference: exportNo,
      completedFilename: result.filename || null,
      completedAt: new Date().toISOString(),
    };

    await delegate.update({
      where: { id: request.id },
      data: { filtersJson: metadata },
    });

    return {
      ...result,
      requestNo,
      reportRequestNo: requestNo,
      exportNo,
      referenceNo: exportNo,
      displayNumber: exportNo,
      message: exportNo
        ? `${requestNo} completed successfully as ${exportNo}.`
        : `${requestNo} completed successfully.`,
    };
  }

  async decorateDocumentPayload(
    businessId: string,
    payload: any,
  ) {
    const clone = this.clone(payload);
    const documents: AnyRecord[] = [];
    this.collectObjects(
      clone,
      (record) =>
        Boolean(
          record?.id &&
            (record?.originalFilename ||
              record?.filename ||
              record?.storageKey ||
              record?.mimeType),
        ),
      documents,
    );

    if (!documents.length) {
      return clone;
    }

    const documentReferences = await this.references.ensureMany(
      businessId,
      'document',
      documents.map((document) => ({
        id: document.id,
        date: document.createdAt || document.uploadedAt || new Date(),
      })),
    );
    const linkedIds = documents
      .map((document) => this.linkedAccountingId(document))
      .filter((id): id is string => Boolean(id));
    const expenses = linkedIds.length
      ? await (this.prisma as any).expense.findMany({
          where: {
            businessId,
            id: { in: Array.from(new Set(linkedIds)) },
          },
        })
      : [];
    const expenseMap = new Map<string, AnyRecord>(
      expenses.map((expense: AnyRecord) => [expense.id, expense]),
    );
    const journalEntries = linkedIds.length
      ? await (this.prisma as any).journalEntry.findMany({
          where: {
            businessId,
            sourceId: { in: Array.from(new Set(linkedIds)) },
          },
        })
      : [];
    const journalBySource = new Map<string, AnyRecord>(
      journalEntries.map((entry: AnyRecord) => [entry.sourceId, entry]),
    );
    const journalReferences = await this.references.ensureMany(
      businessId,
      'journal',
      journalEntries.map((entry: AnyRecord) => ({
        id: entry.id,
        date: entry.entryDate || entry.createdAt,
      })),
    );
    const expenseReferences = await this.references.ensureMany(
      businessId,
      'expense',
      expenses
        .filter((expense: AnyRecord) =>
          this.sourceTypeForExpense(expense, journalBySource).includes(
            'expense',
          ),
        )
        .map((expense: AnyRecord) => ({
          id: expense.id,
          date: expense.expenseDate || expense.createdAt,
        })),
    );
    const purchaseReferences = await this.references.ensureMany(
      businessId,
      'purchase',
      expenses
        .filter((expense: AnyRecord) =>
          this.sourceTypeForExpense(expense, journalBySource).includes(
            'purchase',
          ),
        )
        .map((expense: AnyRecord) => ({
          id: expense.id,
          date: expense.expenseDate || expense.createdAt,
        })),
    );
    const users = await this.loadUsers(
      documents.flatMap((document) => [
        document.uploadedById,
        document.createdById,
        document.resolvedById,
        document.approvedById,
      ]),
    );

    for (const document of documents) {
      const linkedId = this.linkedAccountingId(document);
      const linkedExpense = linkedId ? expenseMap.get(linkedId) : undefined;
      const linkedJournal = linkedId
        ? journalBySource.get(linkedId)
        : undefined;
      const linkedReferenceNo = linkedId
        ? purchaseReferences[linkedId] || expenseReferences[linkedId] || null
        : null;
      const uploadedBy =
        this.cleanPerson(document.uploadedBy) ||
        this.cleanPerson(users.get(document.uploadedById));
      const resolvedBy =
        this.cleanPerson(document.resolvedBy) ||
        this.cleanPerson(users.get(document.resolvedById));

      const originalFilename =
        document.originalFilename || document.filename || 'Document';
      const documentNo = documentReferences[document.id];
      document.documentNo = documentNo;
      document.referenceNo = documentNo;
      document.displayNumber = documentNo;
      document.displayFilename = `${documentNo} — ${originalFilename}`;
      if (document.originalFilename) {
        document.originalFilename = document.displayFilename;
      } else if (document.filename) {
        document.filename = document.displayFilename;
      }
      document.uploadedBy = uploadedBy;
      document.uploadedByName = this.personLabel(uploadedBy);
      document.resolvedBy = resolvedBy;
      document.resolvedByName = this.personLabel(resolvedBy);
      document.linkedReferenceNo = linkedReferenceNo;
      document.linkedJournalReferenceNo = linkedJournal
        ? journalReferences[linkedJournal.id]
        : null;
      document.linkedRecordType = linkedReferenceNo?.startsWith('PUR-')
        ? 'Purchase'
        : linkedReferenceNo?.startsWith('EXP-')
          ? 'Expense'
          : linkedExpense
            ? 'Accounting record'
            : null;

      delete document.uploadedById;
      delete document.createdById;
      delete document.resolvedById;
      delete document.approvedById;
    }

    return clone;
  }

  async decorateExportHistoryPayload(payload: any) {
    const clone = this.clone(payload);
    const exports: AnyRecord[] = [];
    this.collectObjects(
      clone,
      (record) =>
        Boolean(
          record?.id &&
            record?.businessId &&
            record?.filename &&
            record?.reportType &&
            !record?.requestedAt,
        ),
      exports,
    );

    const grouped = this.groupBy(exports, (record) => record.businessId);
    const referenceById: Record<string, string> = {};
    for (const [businessId, records] of grouped.entries()) {
      Object.assign(
        referenceById,
        await this.references.ensureMany(
          businessId,
          'report_export',
          records.map((record) => ({
            id: record.id,
            date: record.createdAt || record.exportedAt || new Date(),
          })),
        ),
      );
    }

    const users = await this.loadUsers(
      exports.flatMap((record) => [
        record.userId,
        record.requestedById,
        record.createdById,
        record.exportedById,
      ]),
    );

    for (const record of exports) {
      const exportNo = referenceById[record.id];
      const actorId =
        record.exportedById ||
        record.userId ||
        record.createdById ||
        record.requestedById;
      const actor = this.cleanPerson(users.get(actorId));
      record.exportNo = exportNo;
      record.referenceNo = exportNo;
      record.displayNumber = exportNo;
      record.exportedBy = actor;
      record.exportedByName = this.personLabel(actor);
      delete record.userId;
      delete record.requestedById;
      delete record.createdById;
      delete record.exportedById;
    }

    return clone;
  }

  async createExportRecord(
    userId: string,
    businessId: string,
    reportType: string,
    format: string,
    filename: string,
    filters: AnyRecord,
  ) {
    const data = this.modelCreateData('ReportExportLog', {
      businessId,
      userId,
      requestedById: userId,
      createdById: userId,
      exportedById: userId,
      reportType,
      format,
      filename,
      filtersJson: filters,
      filters,
      generatedAt: new Date(),
      exportedAt: new Date(),
    });

    return (this.prisma as any).reportExportLog.create({ data });
  }

  async updateExportRecord(
    exportId: string,
    filename: string,
    filters: AnyRecord,
  ) {
    const data = this.modelUpdateData('ReportExportLog', {
      filename,
      filtersJson: filters,
      filters,
    });

    return (this.prisma as any).reportExportLog.update({
      where: { id: exportId },
      data,
    });
  }

  async exportDecoratedCsv(
    userId: string,
    businessId: string,
    dto: AnyRecord,
    preview: AnyRecord,
  ) {
    const reportType = String(dto?.reportType || dto?.type || 'report');
    const provisionalFilename = `pending-${this.fileSlug(reportType)}.csv`;
    const exportRecord = await this.createExportRecord(
      userId,
      businessId,
      reportType,
      'csv',
      provisionalFilename,
      dto,
    );
    const exportNo = await this.references.attachReference(
      businessId,
      'report_export',
      exportRecord.id,
      exportRecord.createdAt || new Date(),
    );
    const filename = `${exportNo}-${this.fileSlug(reportType)}-${this.dateStamp()}.csv`;
    const csv = this.previewToCsv(preview, exportNo);

    await this.updateExportRecord(exportRecord.id, filename, {
      ...dto,
      exportReference: exportNo,
    });

    return {
      exportNo,
      referenceNo: exportNo,
      displayNumber: exportNo,
      filename,
      mimeType: 'text/csv; charset=utf-8',
      content: csv,
      base64: Buffer.from(csv, 'utf8').toString('base64'),
      message: `${exportNo} generated successfully.`,
    };
  }

  sanitizeForExport<T>(value: T): T {
    if (Array.isArray(value)) {
      return value.map((item) => this.sanitizeForExport(item)) as T;
    }

    if (!value || typeof value !== 'object' || value instanceof Date) {
      return value;
    }

    const output: AnyRecord = {};
    for (const [key, child] of Object.entries(value as AnyRecord)) {
      if (this.isInternalIdKey(key)) {
        continue;
      }

      if (key === 'columns' && Array.isArray(child)) {
        output[key] = child.filter(
          (column) =>
            typeof column !== 'string' ||
            !this.isInternalIdKey(column),
        );
        continue;
      }

      output[key] = this.sanitizeForExport(child);
    }

    return output as T;
  }

  private async replaceExpenseOrPurchaseSection(
    businessId: string,
    dto: AnyRecord,
    preview: AnyRecord,
    kind: 'expense' | 'purchase',
  ) {
    const { start, end } = this.dateRange(dto);
    const allEntries: AnyRecord[] = await (this.prisma as any).journalEntry.findMany({
      where: { businessId, sourceType: kind },
    });
    const entries = allEntries
      .filter((entry) => this.inRange(entry.entryDate || entry.createdAt, start, end))
      .sort((left, right) => this.compareDates(left.entryDate, right.entryDate));
    const sourceIds = entries
      .map((entry) => entry.sourceId)
      .filter((id): id is string => Boolean(id));
    const expenses: AnyRecord[] = sourceIds.length
      ? await (this.prisma as any).expense.findMany({
          where: {
            businessId,
            id: { in: Array.from(new Set(sourceIds)) },
          },
        })
      : [];
    const expenseMap = new Map<string, AnyRecord>(
      expenses.map((expense) => [expense.id, expense]),
    );
    const vendors = await this.loadBusinessNames('vendor', businessId);
    const accounts = await this.loadBusinessNames('account', businessId);
    const documents: AnyRecord[] = await (this.prisma as any).document.findMany({
      where: { businessId },
    });
    const users = await this.loadUsers(
      expenses.flatMap((expense) => [
        expense.createdById,
        expense.approvedById,
        expense.updatedById,
      ]),
    );
    const entityReferences = await this.references.ensureMany(
      businessId,
      kind,
      expenses.map((expense) => ({
        id: expense.id,
        date: expense.expenseDate || expense.createdAt,
      })),
    );
    const journalReferences = await this.references.ensureMany(
      businessId,
      'journal',
      entries.map((entry) => ({
        id: entry.id,
        date: entry.entryDate || entry.createdAt,
      })),
    );
    const linkedDocuments = new Map<string, AnyRecord>();
    for (const expense of expenses) {
      const document = this.findLinkedDocument(documents, expense);
      if (document) {
        linkedDocuments.set(expense.id, document);
      }
    }
    const documentReferences = await this.references.ensureMany(
      businessId,
      'document',
      Array.from(linkedDocuments.values()).map((document) => ({
        id: document.id,
        date: document.createdAt || document.uploadedAt,
      })),
    );

    const rows = entries.map((entry) => {
      const expense = expenseMap.get(entry.sourceId) || {};
      const document = linkedDocuments.get(expense.id);
      const vendorId = expense.vendorId || expense.supplierId;
      const accountId = expense.expenseAccountId || expense.accountId;
      const createdBy = this.cleanPerson(users.get(expense.createdById));
      const approvedBy = this.cleanPerson(users.get(expense.approvedById));
      const documentStatus = document
        ? document.status || 'Attached'
        : expense.documentStatus || 'Missing';

      return {
        Reference: entityReferences[expense.id] || 'Not assigned',
        'Journal Reference': journalReferences[entry.id] || 'Not assigned',
        Date: this.dateText(
          expense.expenseDate || entry.entryDate || expense.createdAt,
        ),
        'Supplier / Vendor':
          vendors.get(vendorId) ||
          expense.vendorName ||
          expense.supplierName ||
          'Not specified',
        Account:
          accounts.get(accountId) || expense.accountName || 'Not specified',
        Description:
          expense.description || entry.description || 'No description',
        'Payment Method':
          expense.paymentMethod || expense.method || 'Not specified',
        Amount: this.numberValue(
          expense.totalAmount ??
            expense.amount ??
            expense.netAmount ??
            expense.grossAmount,
        ),
        Tax: this.numberValue(
          expense.taxAmount ?? expense.salesTaxAmount ?? expense.tax,
        ),
        'Document Status': documentStatus,
        'Receipt Attached': document ? 'Yes' : 'No',
        'Document Reference': document
          ? documentReferences[document.id] || 'Not assigned'
          : 'Missing',
        'Created By': this.personLabel(createdBy) || 'Unknown user',
        'Approved By': this.personLabel(approvedBy) || 'Not approved',
        Status: expense.status || entry.status || 'Posted',
      };
    });
    const title = kind === 'expense' ? 'Expense Register' : 'Purchase Register';
    const section: ReportSection = {
      title,
      columns: rows.length ? Object.keys(rows[0]) : this.registerColumns(),
      rows,
      totals: {
        Count: rows.length,
        Amount: rows.reduce((sum, row) => sum + this.numberValue(row.Amount), 0),
        Tax: rows.reduce((sum, row) => sum + this.numberValue(row.Tax), 0),
      },
    };

    return {
      ...preview,
      title: preview?.title || title,
      sections: [section],
    };
  }

  private async decorateGeneralLedger(
    businessId: string,
    dto: AnyRecord,
    preview: AnyRecord,
  ) {
    const { start, end } = this.dateRange(dto);
    const entries: AnyRecord[] = (
      await (this.prisma as any).journalEntry.findMany({
        where: { businessId },
      })
    )
      .filter((entry: AnyRecord) =>
        this.inRange(entry.entryDate || entry.createdAt, start, end),
      )
      .sort((left: AnyRecord, right: AnyRecord) =>
        this.compareDates(left.entryDate, right.entryDate),
      );
    const journalReferences = await this.references.ensureMany(
      businessId,
      'journal',
      entries.map((entry) => ({
        id: entry.id,
        date: entry.entryDate || entry.createdAt,
      })),
    );
    const sourceReferences = await this.sourceReferences(
      businessId,
      entries,
    );
    const users = await this.loadUsers(
      entries.flatMap((entry) => [entry.createdById, entry.approvedById]),
    );
    const lineDelegate =
      (this.prisma as any).journalLine ||
      (this.prisma as any).journalEntryLine;
    const journalLines: AnyRecord[] =
      lineDelegate && entries.length
        ? await lineDelegate.findMany({
            where: {
              journalEntryId: { in: entries.map((entry) => entry.id) },
            },
          })
        : [];
    const selectedAccountId =
      dto?.accountId || dto?.ledgerAccountId || null;
    const entryQueue = entries.flatMap((entry) => {
      const matchingLines = journalLines.filter(
        (line) =>
          line.journalEntryId === entry.id &&
          (!selectedAccountId || line.accountId === selectedAccountId),
      );
      const repeat = Math.max(matchingLines.length, 1);
      return Array.from({ length: repeat }, () => ({
        entry,
        journalNo: journalReferences[entry.id],
        sourceNo: sourceReferences.get(entry.id) || null,
      }));
    });
    let index = 0;
    const sections: ReportSection[] = (preview?.sections || []).map(
      (section: ReportSection) => {
        const rows = (section.rows || []).map((row: AnyRecord) => {
          const hasTransaction =
            row.entryNo ||
            row.journalEntryNo ||
            row.referenceNo ||
            row.debit ||
            row.credit;
          if (!hasTransaction || index >= entryQueue.length) {
            return this.sanitizeForExport(row);
          }

          const current = entryQueue[index++];
          const createdBy = this.cleanPerson(
            users.get(current.entry.createdById),
          );
          const approvedBy = this.cleanPerson(
            users.get(current.entry.approvedById),
          );
          const clean = this.sanitizeForExport(row);

          return {
            ...clean,
            entryNo: current.journalNo,
            journalEntryNo: current.journalNo,
            referenceNo: current.journalNo,
            sourceReference: current.sourceNo,
            createdBy: this.personLabel(createdBy) || 'Unknown user',
            approvedBy: this.personLabel(approvedBy) || 'Not approved',
          };
        });
        const columns = Array.from(
          new Set([
            ...(section.columns || []),
            'sourceReference',
            'createdBy',
            'approvedBy',
          ]),
        );

        return {
          ...section,
          columns,
          rows,
        };
      },
    );

    return { ...preview, sections };
  }

  private async decorateSales(
    businessId: string,
    dto: AnyRecord,
    preview: AnyRecord,
  ) {
    const { start, end } = this.dateRange(dto);
    const invoices: AnyRecord[] = (
      await (this.prisma as any).invoice.findMany({ where: { businessId } })
    )
      .filter((invoice: AnyRecord) =>
        this.inRange(invoice.invoiceDate || invoice.createdAt, start, end),
      )
      .sort((left: AnyRecord, right: AnyRecord) =>
        this.compareDates(left.invoiceDate, right.invoiceDate),
      );
    const invoiceReferences = await this.references.ensureMany(
      businessId,
      'invoice',
      invoices.map((invoice) => ({
        id: invoice.id,
        date: invoice.invoiceDate || invoice.createdAt,
      })),
    );
    let index = 0;
    const sections = (preview?.sections || []).map((section: ReportSection) => ({
      ...section,
      columns: Array.from(
        new Set(['Invoice Reference', ...(section.columns || [])]),
      ),
      rows: (section.rows || []).map((row: AnyRecord) => {
        const invoice = invoices[index++];
        if (!invoice) {
          return this.sanitizeForExport(row);
        }

        return {
          'Invoice Reference': invoiceReferences[invoice.id],
          ...this.sanitizeForExport(row),
        };
      }),
    }));

    return { ...preview, sections };
  }

  private async appendPaymentRegister(
    businessId: string,
    dto: AnyRecord,
    preview: AnyRecord,
  ) {
    const { start, end } = this.dateRange(dto);
    const payments: AnyRecord[] = (
      await (this.prisma as any).payment.findMany({ where: { businessId } })
    )
      .filter((payment: AnyRecord) =>
        this.inRange(payment.paymentDate || payment.createdAt, start, end),
      )
      .sort((left: AnyRecord, right: AnyRecord) =>
        this.compareDates(left.paymentDate, right.paymentDate),
      );
    const paymentReferences = await this.references.ensureMany(
      businessId,
      'payment',
      payments.map((payment) => ({
        id: payment.id,
        date: payment.paymentDate || payment.createdAt,
      })),
    );
    const entries: AnyRecord[] = payments.length
      ? await (this.prisma as any).journalEntry.findMany({
          where: {
            businessId,
            sourceId: { in: payments.map((payment) => payment.id) },
          },
        })
      : [];
    const journalReferences = await this.references.ensureMany(
      businessId,
      'journal',
      entries.map((entry) => ({
        id: entry.id,
        date: entry.entryDate || entry.createdAt,
      })),
    );
    const journalBySource = new Map<string, AnyRecord>(
      entries.map((entry) => [entry.sourceId, entry]),
    );
    const customers = await this.loadBusinessNames('customer', businessId);
    const vendors = await this.loadBusinessNames('vendor', businessId);
    const accounts = await this.loadBusinessNames('account', businessId);
    const users = await this.loadUsers(
      payments.flatMap((payment) => [
        payment.createdById,
        payment.approvedById,
      ]),
    );
    const rows = payments.map((payment) => {
      const journal = journalBySource.get(payment.id);
      const createdBy = this.cleanPerson(users.get(payment.createdById));
      const party =
        customers.get(payment.customerId) ||
        vendors.get(payment.vendorId || payment.supplierId) ||
        payment.partyName ||
        payment.customerName ||
        payment.vendorName ||
        'Not specified';
      const accountId =
        payment.accountId || payment.bankAccountId || payment.cashAccountId;

      return {
        Reference: paymentReferences[payment.id],
        Direction:
          payment.direction === 'received' ? 'Received' : 'Paid',
        'Journal Reference': journal
          ? journalReferences[journal.id]
          : 'Not assigned',
        Date: this.dateText(payment.paymentDate || payment.createdAt),
        Party: party,
        Account: accounts.get(accountId) || 'Not specified',
        Method: payment.paymentMethod || payment.method || 'Not specified',
        Amount: this.numberValue(payment.amount || payment.totalAmount),
        'External Bank / Cheque Reference':
          payment.externalReference ||
          payment.transactionReference ||
          payment.chequeNumber ||
          payment.reference ||
          'Not provided',
        Description:
          payment.description || payment.narration || 'No description',
        'Created By': this.personLabel(createdBy) || 'Unknown user',
        Status: payment.status || 'Posted',
      };
    });
    const paymentSection: ReportSection = {
      title: 'Payment Register',
      columns: rows.length
        ? Object.keys(rows[0])
        : [
            'Reference',
            'Direction',
            'Journal Reference',
            'Date',
            'Party',
            'Account',
            'Method',
            'Amount',
            'External Bank / Cheque Reference',
            'Description',
            'Created By',
            'Status',
          ],
      rows,
      totals: {
        Received: rows
          .filter((row) => row.Direction === 'Received')
          .reduce((sum, row) => sum + this.numberValue(row.Amount), 0),
        Paid: rows
          .filter((row) => row.Direction === 'Paid')
          .reduce((sum, row) => sum + this.numberValue(row.Amount), 0),
      },
    };

    return {
      ...preview,
      sections: [...(preview?.sections || []), paymentSection],
    };
  }

  private async decorateMissingDocuments(
    businessId: string,
    dto: AnyRecord,
    preview: AnyRecord,
  ) {
    const expensePreview = await this.replaceExpenseOrPurchaseSection(
      businessId,
      dto,
      preview,
      'expense',
    );
    const purchasePreview = await this.replaceExpenseOrPurchaseSection(
      businessId,
      dto,
      preview,
      'purchase',
    );
    const sections = [
      ...(expensePreview.sections || []),
      ...(purchasePreview.sections || []),
    ].map((section: ReportSection) => ({
      ...section,
      rows: (section.rows || []).filter(
        (row: AnyRecord) => row['Receipt Attached'] !== 'Yes',
      ),
    }));

    return {
      ...preview,
      title: preview?.title || 'Missing Documents',
      sections,
    };
  }

  private async sourceReferences(
    businessId: string,
    entries: AnyRecord[],
  ) {
    const output = new Map<string, string>();
    const grouped = new Map<string, AnyRecord[]>();

    for (const entry of entries) {
      if (!entry.sourceId || !entry.sourceType) {
        continue;
      }
      const list = grouped.get(entry.sourceType) || [];
      list.push(entry);
      grouped.set(entry.sourceType, list);
    }

    for (const [sourceType, sourceEntries] of grouped.entries()) {
      const entityType = this.referenceEntityForSource(sourceType);
      if (!entityType) {
        continue;
      }
      const delegateName = entityType === 'payment' ? 'payment' : 'expense';
      const records: AnyRecord[] = await (this.prisma as any)[
        delegateName
      ].findMany({
        where: {
          businessId,
          id: { in: sourceEntries.map((entry) => entry.sourceId) },
        },
      });
      const recordMap = new Map<string, AnyRecord>(
        records.map((record) => [record.id, record]),
      );
      const references = await this.references.ensureMany(
        businessId,
        entityType,
        records.map((record) => ({
          id: record.id,
          date:
            record.paymentDate || record.expenseDate || record.createdAt,
        })),
      );

      for (const entry of sourceEntries) {
        if (recordMap.has(entry.sourceId)) {
          output.set(entry.id, references[entry.sourceId]);
        }
      }
    }

    return output;
  }

  private referenceEntityForSource(sourceType: string) {
    const normalized = String(sourceType).toLowerCase();
    if (normalized === 'purchase') return 'purchase';
    if (normalized === 'expense') return 'expense';
    if (
      normalized === 'customer_payment' ||
      normalized === 'supplier_payment' ||
      normalized === 'payment'
    ) {
      return 'payment';
    }
    return null;
  }

  private async loadUsers(ids: unknown[]) {
    const cleanIds = Array.from(
      new Set(ids.filter(
        (id): id is string => typeof id === 'string' && id.length > 0,
      )),
    );
    if (!cleanIds.length) {
      return new Map<string, AnyRecord>();
    }

    const users: AnyRecord[] = await (this.prisma as any).user.findMany({
      where: { id: { in: cleanIds } },
    });
    return new Map(users.map((user) => [user.id, user]));
  }

  private async loadBusinessNames(
    delegateName: 'vendor' | 'customer' | 'account',
    businessId: string,
  ) {
    const delegate = (this.prisma as any)[delegateName];
    if (!delegate) {
      return new Map<string, string>();
    }

    const records: AnyRecord[] = await delegate.findMany({
      where: { businessId },
    });
    return new Map(
      records.map((record) => [
        record.id,
        record.name ||
          record.displayName ||
          record.accountName ||
          record.legalName ||
          record.email ||
          'Unnamed',
      ]),
    );
  }

  private findLinkedDocument(
    documents: AnyRecord[],
    expense: AnyRecord,
  ) {
    const explicitDocumentId =
      expense.documentId ||
      expense.receiptDocumentId ||
      expense.attachmentDocumentId;
    if (explicitDocumentId) {
      const explicit = documents.find(
        (document) => document.id === explicitDocumentId,
      );
      if (explicit) return explicit;
    }

    return documents.find((document) => {
      const linkedValues = [
        document.expenseId,
        document.purchaseId,
        document.linkedExpenseId,
        document.linkedPurchaseId,
        document.linkedEntityId,
        document.sourceId,
      ];
      return linkedValues.includes(expense.id);
    });
  }

  private linkedAccountingId(document: AnyRecord) {
    return (
      document.expenseId ||
      document.purchaseId ||
      document.linkedExpenseId ||
      document.linkedPurchaseId ||
      document.linkedEntityId ||
      document.sourceId ||
      document.expense?.id ||
      document.purchase?.id ||
      null
    );
  }

  private sourceTypeForExpense(
    expense: AnyRecord,
    journalBySource: Map<string, AnyRecord>,
  ) {
    return String(
      journalBySource.get(expense.id)?.sourceType ||
        expense.type ||
        expense.expenseType ||
        'expense',
    ).toLowerCase();
  }

  private appendReferenceToMessages(
    payload: any,
    references: Record<string, string>,
  ) {
    if (!payload || typeof payload !== 'object') return;

    if (payload.request?.id && references[payload.request.id]) {
      const requestNo = references[payload.request.id];
      payload.message = payload.message
        ? `${payload.message} (${requestNo})`
        : `${requestNo} updated successfully.`;
    }

    if (payload.id && references[payload.id] && payload.message) {
      payload.message = `${payload.message} (${references[payload.id]})`;
    }
  }

  private collectObjects(
    value: any,
    predicate: (record: AnyRecord) => boolean,
    output: AnyRecord[],
    seen = new Set<any>(),
  ) {
    if (!value || typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);

    if (!Array.isArray(value) && predicate(value)) {
      output.push(value);
    }

    for (const child of Array.isArray(value)
      ? value
      : Object.values(value)) {
      this.collectObjects(child, predicate, output, seen);
    }
  }

  private modelCreateData(modelName: string, values: AnyRecord) {
    const dmmfModel = (Prisma as any).dmmf?.datamodel?.models?.find(
      (item: AnyRecord) => item.name === modelName,
    );
    const runtimeModel = (this.prisma as any)._runtimeDataModel?.models?.[
      modelName
    ];
    const fields: AnyRecord[] =
      dmmfModel?.fields ||
      (runtimeModel?.fields
        ? Array.isArray(runtimeModel.fields)
          ? runtimeModel.fields
          : Object.values(runtimeModel.fields)
        : []);

    if (!fields.length) {
      throw new Error(
        `Prisma metadata for ${modelName} is unavailable; the export log was not created.`,
      );
    }

    const data: AnyRecord = {};
    for (const field of fields) {
      if (
        field.kind &&
        field.kind !== 'scalar' &&
        field.kind !== 'enum'
      ) {
        continue;
      }
      if (field.name in values && values[field.name] !== undefined) {
        data[field.name] = this.jsonSafe(values[field.name]);
      }
    }
    return data;
  }

  private modelUpdateData(modelName: string, values: AnyRecord) {
    return this.modelCreateData(modelName, values);
  }

  private jsonSafe(value: any) {
    if (value instanceof Date) return value;
    if (!value || typeof value !== 'object') return value;
    return JSON.parse(JSON.stringify(value));
  }

  private previewToCsv(preview: AnyRecord, exportNo: string) {
    const lines: string[] = [];
    lines.push(this.csvRow(['Export Reference', exportNo]));
    lines.push(this.csvRow(['Title', preview?.title || 'Report']));
    lines.push(
      this.csvRow([
        'Generated At',
        preview?.generatedAt || new Date().toISOString(),
      ]),
    );
    lines.push('');

    for (const section of preview?.sections || []) {
      lines.push(this.csvRow([section.title || 'Section']));
      const columns =
        section.columns ||
        (section.rows?.[0] ? Object.keys(section.rows[0]) : []);
      lines.push(this.csvRow(columns));
      for (const row of section.rows || []) {
        lines.push(
          this.csvRow(columns.map((column: string) => row[column] ?? '')),
        );
      }
      if (section.totals) {
        lines.push('');
        lines.push(this.csvRow(['Totals']));
        for (const [key, value] of Object.entries(section.totals)) {
          lines.push(this.csvRow([key, value]));
        }
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  private csvRow(values: unknown[]) {
    return values
      .map((value) => {
        const text = value == null ? '' : String(value);
        return `"${text.replace(/"/g, '""')}"`;
      })
      .join(',');
  }

  private cleanPerson(value: AnyRecord | null | undefined) {
    if (!value) return null;
    return {
      name: value.name || null,
      email: value.email || null,
    };
  }

  private personLabel(value: AnyRecord | null | undefined) {
    return value?.name || value?.email || '';
  }

  private jsonObject(value: any): AnyRecord {
    if (!value) return {};
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === 'object' ? parsed : {};
      } catch {
        return {};
      }
    }
    return typeof value === 'object' && !Array.isArray(value) ? value : {};
  }

  private groupBy<T>(items: T[], key: (item: T) => string) {
    const groups = new Map<string, T[]>();
    for (const item of items) {
      const groupKey = key(item);
      const group = groups.get(groupKey) || [];
      group.push(item);
      groups.set(groupKey, group);
    }
    return groups;
  }

  private dateRange(dto: AnyRecord) {
    return {
      start: this.optionalDate(
        dto?.startDate || dto?.fromDate || dto?.dateFrom,
      ),
      end: this.optionalDate(dto?.endDate || dto?.toDate || dto?.dateTo, true),
    };
  }

  private optionalDate(value: unknown, endOfDay = false) {
    if (!value) return null;
    const date = new Date(String(value));
    if (Number.isNaN(date.getTime())) return null;
    if (endOfDay) date.setUTCHours(23, 59, 59, 999);
    return date;
  }

  private inRange(
    value: unknown,
    start: Date | null,
    end: Date | null,
  ) {
    if (!start && !end) return true;
    const date = new Date(String(value));
    if (Number.isNaN(date.getTime())) return false;
    if (start && date < start) return false;
    if (end && date > end) return false;
    return true;
  }

  private compareDates(left: unknown, right: unknown) {
    return new Date(String(left)).getTime() - new Date(String(right)).getTime();
  }

  private dateText(value: unknown) {
    const date = new Date(String(value));
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Karachi',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  }

  private dateStamp() {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Karachi',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .format(new Date())
      .replace(/\//g, '-');
  }

  private numberValue(value: unknown) {
    const number = Number(value || 0);
    return Number.isFinite(number) ? number : 0;
  }

  private fileSlug(value: string) {
    return String(value || 'report')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'report';
  }

  private isInternalIdKey(key: string) {
    return (
      key === 'id' ||
      key === 'businessId' ||
      key.endsWith('Id') ||
      key.endsWith('_id')
    );
  }

  private registerColumns() {
    return [
      'Reference',
      'Journal Reference',
      'Date',
      'Supplier / Vendor',
      'Account',
      'Description',
      'Payment Method',
      'Amount',
      'Tax',
      'Document Status',
      'Receipt Attached',
      'Document Reference',
      'Created By',
      'Approved By',
      'Status',
    ];
  }

  private clone<T>(value: T): T {
    if (value == null) return value;
    return JSON.parse(JSON.stringify(value)) as T;
  }
}
