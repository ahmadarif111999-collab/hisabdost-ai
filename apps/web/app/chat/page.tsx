'use client';

import { FormEvent, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { ClientRequired } from '@/components/ClientRequired';
import { Button, Card, Input } from '@/components/Card';
import { api, getBusinessId } from '@/lib/api';

type ParsedAction = { type: string; amount?: number; paymentMethod?: string; category?: string; accountCode?: string; description?: string; customerName?: string; vendorName?: string; partyName?: string; confidence?: number; requiresAccountantReview?: boolean; missingFields?: string[] };
type ParseResponse = { safeReply: string; actions: ParsedAction[]; safetyNote: string; provider?: string; model?: string };

export default function ChatPage() {
  const [message, setMessage] = useState('Bhai today sale 45000 aur rent expense 8000 add kar do');
  const [response, setResponse] = useState<ParseResponse | null>(null);
  const [status, setStatus] = useState('');

  async function parse(e: FormEvent) {
    e.preventDefault();
    const businessId = getBusinessId();
    if (!businessId) return setStatus('Please add/select a client company first.');
    const res = await api<ParseResponse>(`/ai/businesses/${businessId}/parse-transaction`, { method: 'POST', body: JSON.stringify({ message }) });
    setResponse(res);
    setStatus('');
  }

  async function confirmActions() {
    const businessId = getBusinessId();
    if (!businessId || !response) return;
    for (const action of response.actions) {
      if (action.type === 'create_sale') await api(`/accounting/businesses/${businessId}/sales`, { method: 'POST', body: JSON.stringify(action) });
      if (action.type === 'create_purchase') await api(`/accounting/businesses/${businessId}/purchases`, { method: 'POST', body: JSON.stringify(action) });
      if (action.type === 'create_expense') await api(`/accounting/businesses/${businessId}/expenses`, { method: 'POST', body: JSON.stringify(action) });
      if (action.type === 'receive_payment') await api(`/accounting/businesses/${businessId}/payments/receive`, { method: 'POST', body: JSON.stringify({ ...action, partyName: action.partyName || action.customerName }) });
      if (action.type === 'pay_supplier') await api(`/accounting/businesses/${businessId}/payments/pay-supplier`, { method: 'POST', body: JSON.stringify({ ...action, partyName: action.partyName || action.vendorName }) });
      if (action.type === 'create_invoice' && action.amount) {
        await api(`/invoices/businesses/${businessId}`, {
          method: 'POST',
          body: JSON.stringify({ customerName: action.customerName, invoiceDate: action.date, notes: action.description, items: [{ description: action.category || 'Service', quantity: 1, unitPrice: action.amount }] }),
        });
      }
    }
    setStatus('Confirmed entries recorded.');
    setResponse(null);
  }

  return (
    <AppShell>
      <ClientRequired>
      <h1 className="mb-2 text-3xl font-bold">AI Assistant</h1>
      <p className="mb-6 text-slate-600">Roman Urdu, Urdu, ya English mein hisab likhein. AI suggests; you approve.</p>
      <div className="grid gap-4 md:grid-cols-[1fr_360px]">
        <Card>
          <form onSubmit={parse} className="space-y-4">
            <Input value={message} onChange={(e) => setMessage(e.target.value)} placeholder="e.g. Aaj cash sale 45000 add karo" />
            <Button>Understand Message</Button>
          </form>
          {response && (
            <div className="mt-6 rounded-3xl bg-slate-50 p-4">
              <p className="whitespace-pre-line font-medium">{response.safeReply}</p>
              <p className="mt-2 text-xs text-slate-500">Provider: {response.provider || 'mock'} {response.model ? `· ${response.model}` : ''}</p>
              <div className="mt-4 space-y-2">
                {response.actions.map((action, i) => (
                  <div key={i} className="rounded-2xl border bg-white p-3 text-sm">
                    <b>{action.type}</b> — Rs. {action.amount?.toLocaleString('en-PK')} — {action.paymentMethod} {action.category ? `— ${action.category}` : ''}
                    <div className="mt-1 text-xs text-slate-500">Confidence: {Math.round((action.confidence || 0) * 100)}% {action.requiresAccountantReview ? '· Accountant review recommended' : ''}</div>
                  </div>
                ))}
              </div>
              <Button onClick={confirmActions} className="mt-4">Confirm & Record</Button>
            </div>
          )}
          {status && <p className="mt-4 rounded-xl bg-brand-50 p-3 text-brand-700">{status}</p>}
        </Card>
        <Card>
          <h2 className="font-bold">Try these</h2>
          <div className="mt-3 space-y-2 text-sm text-slate-600">
            <p>“Aaj cash sale 45000”</p>
            <p>“Supplier se stock 70000 payable pe liya”</p>
            <p>“Kal rent 80000 bank se pay kia”</p>
            <p>“Ahmed ne 25000 payment cash di”</p>
            <p>“Supplier Khan ko 12000 bank se pay kia”</p>
          </div>
          <p className="mt-4 rounded-2xl bg-amber-50 p-3 text-xs text-amber-800">Use Accounts page for AI account head creation, and Reports page for AI report analysis. Tax/compliance-sensitive work should be reviewed by accountant/CA.</p>
        </Card>
      </div>
      </ClientRequired>
    </AppShell>
  );
}
