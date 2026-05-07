'use client';

import { FormEvent, useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { ClientRequired } from '@/components/ClientRequired';
import { Button, Card, Input } from '@/components/Card';
import { api, getBusinessId } from '@/lib/api';

type Invoice = { id: string; invoiceNumber: string; totalAmount: string; customer?: { name: string } | null; createdAt: string };

export default function InvoicesPage() {
  const [customerName, setCustomerName] = useState('Ahmed Traders');
  const [description, setDescription] = useState('Website service');
  const [amount, setAmount] = useState('120000');
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [message, setMessage] = useState('');

  async function load() {
    const businessId = getBusinessId();
    if (!businessId) return;
    setInvoices(await api<Invoice[]>(`/invoices/businesses/${businessId}`));
  }

  useEffect(() => { load(); }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const businessId = getBusinessId();
    if (!businessId) return setMessage('Please create/select a business first.');
    await api(`/invoices/businesses/${businessId}`, {
      method: 'POST',
      body: JSON.stringify({ customerName, items: [{ description, quantity: 1, unitPrice: Number(amount) }] }),
    });
    setMessage('Invoice created and receivable recorded.');
    await load();
  }

  return (
    <AppShell>
      <ClientRequired>
      <h1 className="mb-2 text-3xl font-bold">Invoices</h1>
      <p className="mb-6 text-slate-600">Simple invoice builder for SMEs and freelancers.</p>
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <form onSubmit={submit} className="grid gap-4">
            <Input placeholder="Customer name" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
            <Input placeholder="Item/service" value={description} onChange={(e) => setDescription(e.target.value)} />
            <Input type="number" placeholder="Amount" value={amount} onChange={(e) => setAmount(e.target.value)} />
            <Button>Create Invoice</Button>
          </form>
          {message && <p className="mt-4 rounded-xl bg-brand-50 p-3 text-brand-700">{message}</p>}
        </Card>
        <Card>
          <h2 className="mb-3 font-bold">Recent invoices</h2>
          <div className="space-y-2">
            {invoices.map((invoice) => (
              <div key={invoice.id} className="rounded-2xl border p-3 text-sm">
                <b>{invoice.invoiceNumber}</b> — {invoice.customer?.name || 'Walk-in'} — Rs. {Number(invoice.totalAmount).toLocaleString('en-PK')}
              </div>
            ))}
            {!invoices.length && <p className="text-slate-500">No invoices yet.</p>}
          </div>
        </Card>
      </div>
      </ClientRequired>
    </AppShell>
  );
}
