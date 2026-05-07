export type PaymentMethod = 'cash' | 'bank' | 'wallet' | 'credit' | 'payable';

export type AiParsedAction = {
  type: 'create_sale' | 'create_purchase' | 'create_expense' | 'create_invoice' | 'receive_payment' | 'pay_supplier' | 'ask_report' | 'unknown';
  amount?: number;
  date?: string;
  paymentMethod?: PaymentMethod;
  category?: string;
  accountCode?: string;
  partyName?: string;
  customerName?: string;
  vendorName?: string;
  description?: string;
  confidence: number;
  missingFields: string[];
  requiresAccountantReview?: boolean;
};

export type AiParseResponse = {
  originalMessage: string;
  language: 'english' | 'urdu' | 'roman_urdu' | 'mixed';
  actions: AiParsedAction[];
  requiresConfirmation: boolean;
  safeReply: string;
};
