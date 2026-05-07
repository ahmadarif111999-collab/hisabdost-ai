import { Injectable } from '@nestjs/common';
import { ParsedTransactionAction, ParseTransactionResult, ReceiptExtractionResult } from '../types';

@Injectable()
export class RuleFallbackParserService {
  parseTransaction(message: string): ParseTransactionResult {
    const text = message.toLowerCase();
    const amounts = this.extractAmounts(text);
    const actions: ParsedTransactionAction[] = [];
    const paymentMethod = this.detectPaymentMethod(text);

    const saleWords = ['sale', 'sales', 'income', 'revenue', 'bikri', 'farokht', 'sell', 'earning'];
    const purchaseWords = ['purchase', 'purchases', 'stock', 'maal', 'samaan', 'khareed', 'kharida', 'inventory'];
    const expenseWords = ['expense', 'kharcha', 'kharc', 'rent', 'kiraya', 'bill', 'salary', 'fuel', 'delivery', 'paid'];
    const invoiceWords = ['invoice', 'bill bana', 'bill banado', 'invoice banao'];

    const hasInvoice = invoiceWords.some((word) => text.includes(word));
    const hasSale = saleWords.some((word) => text.includes(word));
    const hasPurchase = purchaseWords.some((word) => text.includes(word));
    const hasExpense = expenseWords.some((word) => text.includes(word));

    if (hasInvoice && amounts[0]) {
      actions.push({
        type: 'create_invoice',
        amount: amounts[0],
        paymentMethod: 'credit',
        category: 'service_income',
        customerName: this.extractPartyName(message),
        description: message,
        confidence: 0.62,
        missingFields: this.extractPartyName(message) ? [] : ['customerName'],
        requiresAccountantReview: false,
      });
    } else if (hasSale && amounts[0]) {
      actions.push({
        type: 'create_sale',
        amount: amounts[0],
        paymentMethod: paymentMethod === 'payable' ? 'cash' : paymentMethod,
        description: message,
        confidence: 0.74,
        missingFields: [],
        requiresAccountantReview: false,
      });
    }

    if (hasPurchase) {
      const amount = (hasSale || hasInvoice) && amounts.length > 1 ? amounts[1] : amounts[0];
      if (amount) {
        actions.push({
          type: 'create_purchase',
          amount,
          paymentMethod: paymentMethod === 'credit' ? 'payable' : paymentMethod,
          category: 'purchases',
          description: message,
          confidence: 0.72,
          missingFields: [],
          requiresAccountantReview: false,
        });
      }
    }

    if (hasExpense) {
      const amount = (hasSale || hasInvoice || hasPurchase) && amounts.length > 1 ? amounts[1] : amounts[0];
      if (amount) {
        actions.push({
          type: 'create_expense',
          amount,
          paymentMethod: paymentMethod === 'credit' ? 'payable' : paymentMethod,
          category: this.detectCategory(text),
          description: message,
          confidence: 0.72,
          missingFields: [],
          requiresAccountantReview: text.includes('tax') || text.includes('withholding') || text.includes('sales tax'),
        });
      }
    }

    if (actions.length === 0) {
      actions.push({
        type: 'unknown',
        confidence: 0.2,
        missingFields: ['amount', 'transaction type'],
        description: message,
        requiresAccountantReview: false,
      });
    }

    return {
      originalMessage: message,
      language: this.detectLanguage(message),
      provider: 'mock',
      model: 'rule-fallback',
      actions,
      requiresConfirmation: true,
      safeReply: this.buildReply(actions),
      safetyNote: 'AI suggestions should be reviewed before posting. Tax/compliance-sensitive entries should be reviewed by an accountant/CA.',
    };
  }

  parseReceiptFromText(ocrText: string): ReceiptExtractionResult {
    const text = ocrText.toLowerCase();
    const amounts = this.extractAmounts(text);
    const totalAmount = amounts.length ? Math.max(...amounts) : undefined;
    const date = this.extractDate(ocrText);
    const invoiceNumber = ocrText.match(/(?:invoice|inv|bill|receipt)\s*(?:no|#|number)?\s*[:\-]?\s*([a-z0-9\-\/]+)/i)?.[1];

    return {
      documentType: totalAmount ? 'expense_receipt' : 'unknown',
      invoiceNumber,
      date,
      totalAmount,
      paymentMethod: this.detectReceiptPaymentMethod(text),
      suggestedCategory: this.detectCategory(text),
      duplicateRisk: 'low',
      missingFields: [
        ...(date ? [] : ['date']),
        ...(totalAmount ? [] : ['totalAmount']),
        'vendorName',
      ],
      confidence: totalAmount ? 0.48 : 0.2,
      requiresAccountantReview: text.includes('tax') || text.includes('gst') || text.includes('sales tax') || text.includes('wht'),
      notes: 'Fallback parser used. Configure a real AI provider for stronger OCR extraction.',
    };
  }

  private extractAmounts(text: string) {
    const normalized = text
      .replace(/,/g, '')
      .replace(/rs\.?/g, '')
      .replace(/pkr/g, '')
      .replace(/rupees/g, '')
      .replace(/hazar|hazaar/g, '000')
      .replace(/k\b/g, '000');
    const matches = normalized.match(/\d+(?:\.\d+)?/g) || [];
    return matches.map(Number).filter((n) => Number.isFinite(n) && n > 0);
  }

  private detectPaymentMethod(text: string): 'cash' | 'bank' | 'wallet' | 'credit' | 'payable' {
    if (text.includes('jazzcash') || text.includes('easypaisa') || text.includes('wallet')) return 'wallet';
    if (text.includes('bank') || text.includes('meezan') || text.includes('hbl') || text.includes('ubl') || text.includes('alfalah')) return 'bank';
    if (text.includes('credit') || text.includes('udhar') || text.includes('receivable')) return 'credit';
    if (text.includes('payable') || text.includes('baad') || text.includes('unpaid')) return 'payable';
    return 'cash';
  }

  private detectReceiptPaymentMethod(text: string): 'cash' | 'bank' | 'card' | 'wallet' | 'unknown' {
    if (text.includes('cash')) return 'cash';
    if (text.includes('card') || text.includes('visa') || text.includes('mastercard')) return 'card';
    if (text.includes('easypaisa') || text.includes('jazzcash')) return 'wallet';
    if (text.includes('bank') || text.includes('transfer')) return 'bank';
    return 'unknown';
  }

  private detectCategory(text: string) {
    if (text.includes('rent') || text.includes('kiraya')) return 'rent';
    if (text.includes('salary') || text.includes('tankhwa')) return 'salaries';
    if (text.includes('electric') || text.includes('utility') || text.includes('bill') || text.includes('wapda') || text.includes('kelectric')) return 'utilities';
    if (text.includes('fuel') || text.includes('delivery') || text.includes('transport') || text.includes('petrol')) return 'transport';
    if (text.includes('marketing') || text.includes('ad')) return 'marketing';
    if (text.includes('tax') || text.includes('fbr')) return 'tax';
    if (text.includes('purchase') || text.includes('stock')) return 'purchases';
    if (text.includes('meal') || text.includes('restaurant') || text.includes('food')) return 'meals';
    return 'office';
  }

  private detectLanguage(message: string): 'english' | 'urdu' | 'roman_urdu' | 'mixed' {
    if (/\p{Script=Arabic}/u.test(message)) return 'urdu';
    const romanWords = ['bhai', 'aaj', 'kal', 'kiraya', 'kharcha', 'bikri', 'add kar', 'kar do', 'kia', 'tha'];
    if (romanWords.some((word) => message.toLowerCase().includes(word))) return 'roman_urdu';
    return 'english';
  }

  private buildReply(actions: ParsedTransactionAction[]) {
    if (actions[0]?.type === 'unknown') return 'Mujhe transaction clear nahi hui. Amount aur sale/expense type bata dein.';
    const lines = actions.map((action, index) => {
      const label = action.type === 'create_sale' ? 'Sale' : action.type === 'create_invoice' ? 'Invoice' : action.type === 'create_purchase' ? 'Purchase' : 'Expense';
      return `${index + 1}. ${label}: Rs. ${action.amount?.toLocaleString('en-PK')} (${action.paymentMethod || 'cash'})`;
    });
    return `Main ye entries samjha hoon:\n${lines.join('\n')}\nConfirm kar dein to record ho jayengi.`;
  }

  private extractDate(text: string) {
    const iso = text.match(/\b(20\d{2})[-\/](\d{1,2})[-\/](\d{1,2})\b/);
    if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;
    const dmy = text.match(/\b(\d{1,2})[-\/](\d{1,2})[-\/](20\d{2})\b/);
    if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
    return undefined;
  }

  private extractPartyName(message: string) {
    const match = message.match(/(?:to|ko)\s+([A-Za-z][A-Za-z\s]{1,40}?)(?:\s+ka|\s+invoice|\s+bill|\s+for|\s+rs|\s+\d)/i);
    return match?.[1]?.trim();
  }
}
