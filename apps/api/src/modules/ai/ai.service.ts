import { Injectable, Logger } from '@nestjs/common';
import { formatISO } from 'date-fns';
import { AccountingService } from '../accounting/accounting.service';
import { BusinessesService } from '../businesses/businesses.service';
import { PrismaService } from '../../prisma/prisma.service';
import { LlmClientService } from './providers/llm-client.service';
import { RuleFallbackParserService } from './providers/rule-fallback-parser.service';
import { buildReceiptParserUserPrompt, receiptParserSystemPrompt } from './prompts/receipt.prompt';
import { buildTransactionParserUserPrompt, transactionParserSystemPrompt } from './prompts/transaction.prompt';
import { AccountHeadSuggestion, ParseTransactionResult, ReceiptExtractionResult } from './types';

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(
    private readonly businesses: BusinessesService,
    private readonly accounting: AccountingService,
    private readonly prisma: PrismaService,
    private readonly llm: LlmClientService,
    private readonly fallback: RuleFallbackParserService,
  ) {}

  async parseTransaction(userId: string, businessId: string, message: string): Promise<ParseTransactionResult> {
    const business = await this.businesses.getAccessibleBusiness(userId, businessId);

    if (this.llm.getProvider() === 'mock') return this.fallback.parseTransaction(message) as ParseTransactionResult;

    try {
      const ai = await this.llm.generateJson<Omit<ParseTransactionResult, 'originalMessage' | 'provider' | 'model' | 'safetyNote'>>({
        system: transactionParserSystemPrompt,
        user: buildTransactionParserUserPrompt({
          businessName: business.name,
          entityType: business.entityType,
          isSalesTaxRegistered: business.isSalesTaxRegistered,
          today: formatISO(new Date(), { representation: 'date' }),
          message,
        }),
        temperature: 0.1,
        maxTokens: 1200,
      });

      return {
        originalMessage: message,
        provider: ai.provider,
        model: ai.model,
        language: ai.data.language || this.fallback.parseTransaction(message).language,
        actions: this.sanitizeActions(ai.data.actions || []),
        requiresConfirmation: true,
        safeReply: ai.data.safeReply || this.buildReply(ai.data.actions || []),
        safetyNote: 'AI suggestions should be reviewed before posting. Tax/compliance-sensitive entries should be reviewed by an accountant/CA.',
        rawProviderOutput: process.env.NODE_ENV === 'production' ? undefined : ai.data,
      };
    } catch (error) {
      this.logger.warn(`AI transaction parser failed; using fallback parser. ${(error as Error).message}`);
      const fallback = this.fallback.parseTransaction(message) as ParseTransactionResult;
      return { ...fallback, safeReply: `${fallback.safeReply}\n\nNote: Real AI provider failed, so fallback parser was used.` };
    }
  }

  async parseReceiptText(ocrText: string): Promise<ReceiptExtractionResult & { provider: string; model?: string }> {
    if (this.llm.getProvider() === 'mock') return { ...this.fallback.parseReceiptFromText(ocrText), provider: 'mock', model: 'rule-fallback' };
    try {
      const ai = await this.llm.generateJson<ReceiptExtractionResult>({
        system: receiptParserSystemPrompt,
        user: buildReceiptParserUserPrompt({ today: formatISO(new Date(), { representation: 'date' }), ocrText }),
        temperature: 0.1,
        maxTokens: 1400,
      });
      return { ...this.sanitizeReceipt(ai.data), provider: ai.provider, model: ai.model };
    } catch (error) {
      this.logger.warn(`AI receipt parser failed; using fallback parser. ${(error as Error).message}`);
      return { ...this.fallback.parseReceiptFromText(ocrText), provider: 'mock', model: 'rule-fallback' };
    }
  }

  async suggestAccountHead(userId: string, businessId: string, prompt: string) {
    await this.businesses.getAccessibleBusiness(userId, businessId);
    const accounts = await this.accounting.accounts(userId, businessId);
    let suggestion: AccountHeadSuggestion;

    if (this.llm.getProvider() === 'mock') {
      suggestion = this.fallbackAccountHeadSuggestion(prompt, accounts);
    } else {
      try {
        const ai = await this.llm.generateJson<AccountHeadSuggestion>({
          system: `You are HisabDost AI. Suggest one Pakistan SME chart-of-accounts head. Return JSON only. Never create duplicate heads. For tax, withholding, salary, loan, owner equity, advances, or sales tax, set requiresAccountantReview=true.`,
          user: `Existing account heads:\n${accounts.map((a) => `${a.code} - ${a.name} (${a.type})`).join('\n')}\n\nUser request: ${prompt}\n\nReturn JSON: {"name":"","type":"ASSET|LIABILITY|EQUITY|INCOME|EXPENSE","description":"","similarExistingAccountCode":"","similarExistingAccountName":"","requiresAccountantReview":false,"confidence":0.8,"explanation":""}`,
          temperature: 0.1,
          maxTokens: 900,
        });
        suggestion = this.sanitizeAccountHeadSuggestion(ai.data, prompt, accounts);
      } catch (error) {
        this.logger.warn(`AI account head suggestion failed; using fallback. ${(error as Error).message}`);
        suggestion = this.fallbackAccountHeadSuggestion(prompt, accounts);
      }
    }

    const action = await this.prisma.aiActionQueue.create({
      data: {
        businessId,
        userId,
        actionType: 'CREATE_ACCOUNT_HEAD',
        prompt,
        proposedPayloadJson: suggestion as object,
        confidenceScore: suggestion.confidence,
        requiresConfirmation: true,
        requiresAccountantReview: suggestion.requiresAccountantReview,
      },
    });

    return { actionId: action.id, suggestion, safetyNote: 'AI has prepared a chart-of-accounts suggestion only. Approve before creating the head.' };
  }

  async actions(userId: string, businessId: string) {
    await this.businesses.getAccessibleBusiness(userId, businessId);
    return this.prisma.aiActionQueue.findMany({ where: { businessId }, orderBy: { createdAt: 'desc' }, take: 100 });
  }

  async approveAction(userId: string, businessId: string, actionId: string) {
    await this.businesses.getAccessibleBusiness(userId, businessId);
    const action = await this.prisma.aiActionQueue.findFirst({ where: { id: actionId, businessId } });
    if (!action) throw new Error('AI action not found');
    if (action.status !== 'pending') return action;

    if (action.actionType === 'CREATE_ACCOUNT_HEAD') {
      const payload = action.proposedPayloadJson as unknown as AccountHeadSuggestion;
      const result = await this.accounting.createAccount(userId, businessId, {
        name: payload.name,
        type: payload.type as any,
        description: payload.description || payload.explanation,
        requiresReview: payload.requiresAccountantReview,
      });
      return this.prisma.aiActionQueue.update({
        where: { id: action.id },
        data: { status: 'approved', resultJson: result as object },
      });
    }

    return this.prisma.aiActionQueue.update({ where: { id: action.id }, data: { status: 'approved' } });
  }

  async analyzeReport(userId: string, businessId: string, reportType = 'monthly_review') {
    const business = await this.businesses.getAccessibleBusiness(userId, businessId);
    const [dashboard, profitLoss, trialBalance, missingDocs] = await Promise.all([
      this.accounting.dashboard(userId, businessId),
      this.accounting.profitLoss(userId, businessId),
      this.accounting.trialBalance(userId, businessId),
      this.accounting.missingDocuments(userId, businessId),
    ]);
    const context = { business: { name: business.name, type: business.businessType, entityType: business.entityType }, dashboard, profitLoss, trialBalance, missingDocs };

    if (this.llm.getProvider() !== 'mock') {
      try {
        const ai = await this.llm.generateJson<{ summary: string; keyFindings: string[]; risks: string[]; suggestions: string[]; accountantNotes: string[] }>({
          system: 'You are HisabDost AI. Analyze Pakistan SME bookkeeping reports in simple practical language. Do not give final tax/legal advice. Return JSON only.',
          user: `Report type: ${reportType}\nAccounting data JSON:\n${JSON.stringify(context).slice(0, 14000)}`,
          temperature: 0.2,
          maxTokens: 1600,
        });
        return { provider: ai.provider, model: ai.model, ...ai.data, safetyNote: 'AI analysis is based on recorded data only and should be reviewed by accountant/CA.' };
      } catch (error) {
        this.logger.warn(`AI report analysis failed; using fallback. ${(error as Error).message}`);
      }
    }

    return this.fallbackReportAnalysis(context);
  }

  async missingDocumentSummary(userId: string, businessId: string) {
    const business = await this.businesses.getAccessibleBusiness(userId, businessId);
    const missing = await this.accounting.missingDocuments(userId, businessId);
    const lines = missing.items.slice(0, 20).map((item, index) => `${index + 1}. ${item.description || item.kind} - Rs. ${Number(item.amount).toLocaleString('en-PK')} (${new Date(item.expenseDate).toLocaleDateString()})`);
    return {
      count: missing.count,
      message: `Assalam o Alaikum,\n\n${business.name} ke bookkeeping review ke liye ye receipts/documents missing hain:\n\n${lines.join('\n') || 'No missing expense receipts found.'}\n\nPlease receipts upload kar dein ya accountant ko send kar dein.`,
      safetyNote: 'This is a document request draft. Review before sending to client.',
    };
  }

  private sanitizeActions(actions: ParseTransactionResult['actions']) {
    if (!Array.isArray(actions) || actions.length === 0) return (this.fallback.parseTransaction('').actions || []) as ParseTransactionResult['actions'];
    const allowed = ['create_sale', 'create_expense', 'create_purchase', 'create_invoice', 'receive_payment', 'pay_supplier', 'unknown'];
    return actions.map((action) => ({
      type: allowed.includes(action.type) ? action.type : 'unknown',
      amount: this.positiveNumberOrUndefined(action.amount),
      paymentMethod: action.paymentMethod,
      category: action.category,
      accountCode: action.accountCode,
      customerName: action.customerName,
      vendorName: action.vendorName,
      partyName: action.partyName,
      date: action.date,
      description: action.description,
      confidence: Math.max(0, Math.min(1, Number(action.confidence || 0.3))),
      missingFields: Array.isArray(action.missingFields) ? action.missingFields : [],
      requiresAccountantReview: Boolean(action.requiresAccountantReview),
    })) as ParseTransactionResult['actions'];
  }

  private sanitizeReceipt(data: ReceiptExtractionResult): ReceiptExtractionResult {
    return {
      documentType: data.documentType || 'unknown',
      vendorName: data.vendorName,
      customerName: data.customerName,
      vendorNtn: data.vendorNtn,
      vendorStrn: data.vendorStrn,
      invoiceNumber: data.invoiceNumber,
      date: data.date,
      subtotal: this.positiveNumberOrUndefined(data.subtotal),
      taxAmount: this.positiveNumberOrUndefined(data.taxAmount),
      totalAmount: this.positiveNumberOrUndefined(data.totalAmount),
      paymentMethod: data.paymentMethod || 'unknown',
      suggestedCategory: data.suggestedCategory || 'office',
      duplicateRisk: data.duplicateRisk || 'low',
      missingFields: Array.isArray(data.missingFields) ? data.missingFields : [],
      confidence: Math.max(0, Math.min(1, Number(data.confidence || 0.3))),
      requiresAccountantReview: Boolean(data.requiresAccountantReview),
      notes: data.notes,
    };
  }

  private sanitizeAccountHeadSuggestion(data: AccountHeadSuggestion, prompt: string, accounts: Awaited<ReturnType<AccountingService['accounts']>>): AccountHeadSuggestion {
    const allowed = ['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE'];
    const fallback = this.fallbackAccountHeadSuggestion(prompt, accounts);
    return {
      name: data.name || fallback.name,
      type: allowed.includes(data.type) ? data.type : fallback.type,
      description: data.description || fallback.description,
      similarExistingAccountCode: data.similarExistingAccountCode,
      similarExistingAccountName: data.similarExistingAccountName,
      requiresAccountantReview: Boolean(data.requiresAccountantReview),
      confidence: Math.max(0, Math.min(1, Number(data.confidence || 0.7))),
      explanation: data.explanation || fallback.explanation,
    };
  }

  private fallbackAccountHeadSuggestion(prompt: string, accounts: Awaited<ReturnType<AccountingService['accounts']>>): AccountHeadSuggestion {
    const text = prompt.toLowerCase();
    const similar = accounts.find((a) => text.includes(a.name.toLowerCase().split(' ')[0]));
    let type: AccountHeadSuggestion['type'] = 'EXPENSE';
    let name = prompt.replace(/add|head|account|for/gi, '').trim();
    if (!name) name = 'Custom Expense';
    if (text.includes('owner') || text.includes('drawing') || text.includes('withdraw')) { type = 'EQUITY'; name = 'Owner Drawings'; }
    else if (text.includes('advance paid') || text.includes('advance to supplier') || text.includes('deposit')) { type = 'ASSET'; name = 'Advance to Supplier'; }
    else if (text.includes('loan') || text.includes('payable')) { type = 'LIABILITY'; name = name.includes('loan') ? 'Loan Payable' : name; }
    else if (text.includes('income') || text.includes('sales') || text.includes('commission received')) { type = 'INCOME'; }
    const taxSensitive = ['tax', 'withholding', 'salary', 'loan', 'advance', 'owner', 'sales tax'].some((word) => text.includes(word));
    return {
      name: this.titleCase(name),
      type,
      description: `AI suggested from prompt: ${prompt}`,
      similarExistingAccountCode: similar?.code,
      similarExistingAccountName: similar?.name,
      requiresAccountantReview: taxSensitive,
      confidence: similar ? 0.55 : 0.75,
      explanation: similar ? `A similar existing head may already fit: ${similar.name}.` : 'Suggested based on common Pakistan SME accounting treatment.',
    };
  }

  private fallbackReportAnalysis(context: any) {
    const dashboard = context.dashboard;
    const gross = dashboard.sales || 0;
    const profit = dashboard.profit || 0;
    const margin = gross ? Math.round((profit / gross) * 100) : 0;
    return {
      provider: 'mock',
      model: 'rule-fallback',
      summary: `Recorded sales are Rs. ${Math.round(gross).toLocaleString('en-PK')} and estimated profit is Rs. ${Math.round(profit).toLocaleString('en-PK')} (${margin}% margin).`,
      keyFindings: [
        `Receivables: Rs. ${Math.round(dashboard.receivables || 0).toLocaleString('en-PK')}`,
        `Payables: Rs. ${Math.round(dashboard.payables || 0).toLocaleString('en-PK')}`,
        `Missing receipt/documents: ${dashboard.missingDocs || 0}`,
      ],
      risks: [dashboard.missingDocs > 0 ? 'Some expenses are missing receipts, so monthly closing is not complete.' : 'No obvious missing receipt issue detected.'],
      suggestions: ['Review receivables recovery.', 'Attach missing receipts before closing the month.', 'Accountant should review tax-sensitive heads before filing.'],
      accountantNotes: ['AI analysis is based only on data currently entered in the system.'],
      safetyNote: 'AI analysis is not tax/legal advice. Accountant/CA review is recommended.',
    };
  }

  private positiveNumberOrUndefined(value?: number) {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  }

  private buildReply(actions: ParseTransactionResult['actions']) {
    if (!actions?.length || actions[0]?.type === 'unknown') return 'Mujhe transaction clear nahi hui. Amount aur sale/purchase/expense type bata dein.';
    const lines = actions.map((action, index) => `${index + 1}. ${action.type}: Rs. ${action.amount?.toLocaleString('en-PK')} (${action.paymentMethod || 'cash'})`);
    return `Main ye entries samjha hoon:\n${lines.join('\n')}\nConfirm kar dein to record ho jayengi.`;
  }

  private titleCase(text: string) {
    return text.replace(/[_-]/g, ' ').replace(/\s+/g, ' ').trim().replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
  }
}
