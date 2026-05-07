export type AiProviderName = 'mock' | 'openai' | 'anthropic' | 'gemini';

export type ParsedTransactionAction = {
  type: 'create_sale' | 'create_expense' | 'create_purchase' | 'create_invoice' | 'receive_payment' | 'pay_supplier' | 'unknown';
  amount?: number;
  paymentMethod?: 'cash' | 'bank' | 'wallet' | 'credit' | 'payable';
  category?: string;
  accountCode?: string;
  customerName?: string;
  vendorName?: string;
  partyName?: string;
  date?: string;
  description?: string;
  confidence: number;
  missingFields: string[];
  requiresAccountantReview?: boolean;
};

export type ParseTransactionResult = {
  originalMessage: string;
  language: 'english' | 'urdu' | 'roman_urdu' | 'mixed';
  provider: AiProviderName;
  model?: string;
  actions: ParsedTransactionAction[];
  requiresConfirmation: boolean;
  safeReply: string;
  safetyNote: string;
  rawProviderOutput?: unknown;
};

export type ReceiptExtractionResult = {
  documentType: 'expense_receipt' | 'sales_invoice' | 'purchase_invoice' | 'bank_statement' | 'unknown';
  vendorName?: string;
  customerName?: string;
  vendorNtn?: string;
  vendorStrn?: string;
  invoiceNumber?: string;
  date?: string;
  subtotal?: number;
  taxAmount?: number;
  totalAmount?: number;
  paymentMethod?: 'cash' | 'bank' | 'card' | 'wallet' | 'unknown';
  suggestedCategory?: string;
  duplicateRisk?: 'low' | 'medium' | 'high';
  missingFields: string[];
  confidence: number;
  requiresAccountantReview: boolean;
  notes?: string;
};

export type AccountHeadSuggestion = {
  name: string;
  type: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE';
  description?: string;
  similarExistingAccountCode?: string;
  similarExistingAccountName?: string;
  requiresAccountantReview: boolean;
  confidence: number;
  explanation: string;
};
