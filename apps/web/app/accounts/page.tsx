'use client';

import { FormEvent, useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { ClientRequired } from '@/components/ClientRequired';
import { Button, Card, Input, Select } from '@/components/Card';
import { api, getBusinessId } from '@/lib/api';

type Account = { id: string; code: string; name: string; type: string; description?: string; requiresReview?: boolean; isSystem?: boolean };
type AiSuggestion = { actionId: string; suggestion: { name: string; type: string; description?: string; confidence: number; explanation: string; similarExistingAccountName?: string; requiresAccountantReview: boolean } };

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [prompt, setPrompt] = useState('Add head for Daraz commission');
  const [suggestion, setSuggestion] = useState<AiSuggestion | null>(null);
  const [manual, setManual] = useState({ name: '', type: 'EXPENSE', description: '' });
  const [message, setMessage] = useState('');

  async function load() {
    const businessId = getBusinessId();
    if (!businessId) return;
    setAccounts(await api<Account[]>(`/accounting/businesses/${businessId}/accounts`));
  }
  useEffect(() => { load(); }, []);

  async function askAi(e: FormEvent) {
    e.preventDefault();
    const businessId = getBusinessId();
    if (!businessId) return;
    setSuggestion(await api<AiSuggestion>(`/ai/businesses/${businessId}/suggest-account-head`, { method: 'POST', body: JSON.stringify({ prompt }) }));
  }

  async function approveAi() {
    const businessId = getBusinessId();
    if (!businessId || !suggestion) return;
    await api(`/ai/businesses/${businessId}/actions/${suggestion.actionId}/approve`, { method: 'POST' });
    setMessage('AI account head approved and created.');
    setSuggestion(null);
    await load();
  }

  async function createManual(e: FormEvent) {
    e.preventDefault();
    const businessId = getBusinessId();
    if (!businessId) return;
    await api(`/accounting/businesses/${businessId}/accounts`, { method: 'POST', body: JSON.stringify(manual) });
    setManual({ name: '', type: 'EXPENSE', description: '' });
    setMessage('Account head created.');
    await load();
  }

  const grouped = ['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE'].map((type) => ({ type, rows: accounts.filter((a) => a.type === type) }));

  return (
    <AppShell>
      <ClientRequired>
      <h1 className="mb-2 text-3xl font-bold">Chart of Accounts</h1>
      <p className="mb-6 text-slate-600">Pakistan SME heads with AI-assisted custom head creation. AI suggests; accountant/user approves.</p>
      <div className="grid gap-4 lg:grid-cols-[1fr_420px]">
        <Card>
          {grouped.map((group) => (
            <div key={group.type} className="mb-6">
              <h2 className="mb-2 font-bold">{group.type}</h2>
              <div className="overflow-hidden rounded-2xl border">
                <table className="w-full text-left text-sm">
                  <tbody>{group.rows.map((a) => <tr key={a.id} className="border-t first:border-0"><td className="p-3 font-mono">{a.code}</td><td><b>{a.name}</b><br /><span className="text-xs text-slate-500">{a.description}</span></td><td className="p-3 text-right">{a.requiresReview ? 'Review' : a.isSystem ? 'System' : 'Custom'}</td></tr>)}</tbody>
                </table>
              </div>
            </div>
          ))}
        </Card>

        <div className="space-y-4">
          <Card>
            <h2 className="mb-3 font-bold">Ask AI to add a head</h2>
            <form onSubmit={askAi} className="grid gap-3">
              <Input value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="e.g. Add head for owner cash withdrawals" />
              <Button>Suggest Head</Button>
            </form>
            {suggestion && <div className="mt-4 rounded-2xl border bg-slate-50 p-4 text-sm">
              <b>{suggestion.suggestion.name}</b> — {suggestion.suggestion.type}<br />
              <span>{suggestion.suggestion.explanation}</span><br />
              {suggestion.suggestion.similarExistingAccountName && <p className="mt-2 text-amber-700">Similar existing head: {suggestion.suggestion.similarExistingAccountName}</p>}
              {suggestion.suggestion.requiresAccountantReview && <p className="mt-2 text-amber-700">Accountant review recommended.</p>}
              <Button onClick={approveAi} className="mt-3">Approve & Create</Button>
            </div>}
          </Card>

          <Card>
            <h2 className="mb-3 font-bold">Manual head</h2>
            <form onSubmit={createManual} className="grid gap-3">
              <Input placeholder="Head name" value={manual.name} onChange={(e) => setManual({ ...manual, name: e.target.value })} required />
              <Select value={manual.type} onChange={(e) => setManual({ ...manual, type: e.target.value })}>
                <option>ASSET</option><option>LIABILITY</option><option>EQUITY</option><option>INCOME</option><option>EXPENSE</option>
              </Select>
              <Input placeholder="Description optional" value={manual.description} onChange={(e) => setManual({ ...manual, description: e.target.value })} />
              <Button>Create Head</Button>
            </form>
          </Card>
        </div>
      </div>
      {message && <p className="mt-4 rounded-xl bg-brand-50 p-3 text-brand-700">{message}</p>}
      </ClientRequired>
    </AppShell>
  );
}
