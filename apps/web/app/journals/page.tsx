'use client';

import { FormEvent, useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { ClientRequired } from '@/components/ClientRequired';
import { Button, Card, Input, Select } from '@/components/Card';
import { api, getBusinessId } from '@/lib/api';

type Account = { id: string; code: string; name: string; type: string };

type Line = { accountId: string; debit: string; credit: string; description: string };

export default function JournalsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [narration, setNarration] = useState('Opening/correction entry');
  const [lines, setLines] = useState<Line[]>([
    { accountId: '', debit: '', credit: '', description: '' },
    { accountId: '', debit: '', credit: '', description: '' },
  ]);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const businessId = getBusinessId();
    if (businessId) api<Account[]>(`/accounting/businesses/${businessId}/accounts`).then(setAccounts);
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const businessId = getBusinessId();
    if (!businessId) return;
    await api(`/accounting/businesses/${businessId}/journals`, {
      method: 'POST',
      body: JSON.stringify({
        narration,
        lines: lines.map((l) => ({ accountId: l.accountId, debit: Number(l.debit || 0), credit: Number(l.credit || 0), description: l.description })),
      }),
    });
    setMessage('Manual journal posted.');
  }

  function updateLine(index: number, patch: Partial<Line>) {
    setLines(lines.map((line, i) => i === index ? { ...line, ...patch } : line));
  }

  return (
    <AppShell>
      <ClientRequired>
      <h1 className="mb-2 text-3xl font-bold">Manual Journal Entry</h1>
      <p className="mb-6 text-slate-600">For accountant/firm users: opening balances, corrections, accruals, and adjustments.</p>
      <Card>
        <form onSubmit={submit} className="space-y-4">
          <Input value={narration} onChange={(e) => setNarration(e.target.value)} placeholder="Narration" required />
          {lines.map((line, i) => (
            <div key={i} className="grid gap-3 rounded-2xl border p-3 md:grid-cols-[2fr_1fr_1fr_2fr]">
              <Select value={line.accountId} onChange={(e) => updateLine(i, { accountId: e.target.value })} required>
                <option value="">Select account</option>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
              </Select>
              <Input type="number" placeholder="Debit" value={line.debit} onChange={(e) => updateLine(i, { debit: e.target.value })} />
              <Input type="number" placeholder="Credit" value={line.credit} onChange={(e) => updateLine(i, { credit: e.target.value })} />
              <Input placeholder="Line description" value={line.description} onChange={(e) => updateLine(i, { description: e.target.value })} />
            </div>
          ))}
          <div className="flex gap-2"><Button type="button" onClick={() => setLines([...lines, { accountId: '', debit: '', credit: '', description: '' }])}>+ Add Line</Button><Button>Post Journal</Button></div>
        </form>
        {message && <p className="mt-4 rounded-xl bg-brand-50 p-3 text-brand-700">{message}</p>}
      </Card>
      </ClientRequired>
    </AppShell>
  );
}
