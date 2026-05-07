'use client';

import { FormEvent, useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { ClientRequired } from '@/components/ClientRequired';
import { Button, Card, Input, Select } from '@/components/Card';
import { api, getBusinessId } from '@/lib/api';

type TxType = 'sale' | 'purchase' | 'expense' | 'receive' | 'pay_supplier';
type Account = { id: string; code: string; name: string; type: string };

export default function TransactionsPage() {
  const [type, setType] = useState<TxType>('sale');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [accountCode, setAccountCode] = useState('');
  const [partyName, setPartyName] = useState('');
  const [description, setDescription] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const businessId = getBusinessId();
    if (!businessId) return;
    api<Account[]>(`/accounting/businesses/${businessId}/accounts`).then(setAccounts).catch(() => {});
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const businessId = getBusinessId();
    if (!businessId) return setMessage('Please add/select a client company first.');
    const body: any = { amount: Number(amount), paymentMethod, accountCode: accountCode || undefined, description };
    let path = '';
    if (type === 'sale') {
      path = 'sales';
      body.customerName = partyName || undefined;
    }
    if (type === 'purchase') {
      path = 'purchases';
      body.vendorName = partyName || undefined;
    }
    if (type === 'expense') {
      path = 'expenses';
      body.vendorName = partyName || undefined;
      body.category = description;
    }
    if (type === 'receive') {
      path = 'payments/receive';
      body.partyName = partyName || undefined;
    }
    if (type === 'pay_supplier') {
      path = 'payments/pay-supplier';
      body.partyName = partyName || undefined;
    }
    await api(`/accounting/businesses/${businessId}/${path}`, { method: 'POST', body: JSON.stringify(body) });
    setAmount(''); setPartyName(''); setDescription(''); setAccountCode('');
    setMessage('Transaction recorded.');
  }

  const accountOptions = accounts.filter((a) => {
    if (type === 'sale') return a.type === 'INCOME';
    if (type === 'purchase') return a.code === '5000' || a.code === '1200' || a.name.toLowerCase().includes('purchase');
    if (type === 'expense') return a.type === 'EXPENSE';
    return false;
  });

  return (
    <AppShell>
      <ClientRequired>
      <h1 className="mb-2 text-3xl font-bold">Transactions</h1>
      <p className="mb-6 text-slate-600">Record sales, purchases, expenses, customer recovery, and supplier payments.</p>
      <Card className="max-w-3xl">
        <div className="mb-4 grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1 md:grid-cols-5">
          <Tab label="Sale" active={type === 'sale'} onClick={() => { setType('sale'); setPaymentMethod('cash'); }} />
          <Tab label="Purchase" active={type === 'purchase'} onClick={() => { setType('purchase'); setPaymentMethod('cash'); }} />
          <Tab label="Expense" active={type === 'expense'} onClick={() => { setType('expense'); setPaymentMethod('cash'); }} />
          <Tab label="Receive" active={type === 'receive'} onClick={() => { setType('receive'); setPaymentMethod('cash'); }} />
          <Tab label="Pay Supplier" active={type === 'pay_supplier'} onClick={() => { setType('pay_supplier'); setPaymentMethod('cash'); }} />
        </div>
        <form onSubmit={submit} className="grid gap-4">
          <Input type="number" placeholder="Amount e.g. 45000" value={amount} onChange={(e) => setAmount(e.target.value)} required />
          <Select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
            <option value="cash">Cash</option>
            <option value="bank">Bank</option>
            <option value="wallet">JazzCash / Easypaisa / Wallet</option>
            {type === 'sale' && <option value="credit">Credit / Receivable</option>}
            {(type === 'purchase' || type === 'expense') && <option value="payable">Unpaid / Payable</option>}
          </Select>
          {accountOptions.length > 0 && (
            <Select value={accountCode} onChange={(e) => setAccountCode(e.target.value)}>
              <option value="">Default account head</option>
              {accountOptions.map((a) => <option key={a.id} value={a.code}>{a.code} — {a.name}</option>)}
            </Select>
          )}
          <Input placeholder={type === 'sale' || type === 'receive' ? 'Customer name optional' : 'Supplier/vendor name optional'} value={partyName} onChange={(e) => setPartyName(e.target.value)} />
          <Input placeholder="Description e.g. rent, electricity bill, stock purchase" value={description} onChange={(e) => setDescription(e.target.value)} />
          <Button>Record {type.replace('_', ' ')}</Button>
        </form>
        {message && <p className="mt-4 rounded-xl bg-brand-50 p-3 text-brand-700">{message}</p>}
      </Card>
      </ClientRequired>
    </AppShell>
  );
}

function Tab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return <button type="button" onClick={onClick} className={`rounded-xl py-2 text-sm ${active ? 'bg-white shadow-sm' : ''}`}>{label}</button>;
}
