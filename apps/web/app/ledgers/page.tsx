'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { ClientRequired } from '@/components/ClientRequired';
import { Card, Select } from '@/components/Card';
import { api, getBusinessId, money } from '@/lib/api';

type Account = { id: string; code: string; name: string; type: string };
type Ledger = { account: Account; closingBalance: number; rows: { date: string; narration: string; description?: string; debit: number; credit: number; balance: number; sourceType: string }[] };

export default function LedgersPage() {
  const params = useSearchParams();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selected, setSelected] = useState(params.get('account') || '1000');
  const [ledger, setLedger] = useState<Ledger | null>(null);

  async function load(account = selected) {
    const businessId = getBusinessId();
    if (!businessId) return;
    const accs = await api<Account[]>(`/accounting/businesses/${businessId}/accounts`);
    setAccounts(accs);
    setLedger(await api<Ledger>(`/accounting/businesses/${businessId}/ledgers/${account}`));
  }

  useEffect(() => { load(selected); }, []);

  async function change(code: string) {
    setSelected(code);
    await load(code);
  }

  return (
    <AppShell>
      <ClientRequired>
      <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="text-3xl font-bold">Ledgers</h1>
          <p className="text-slate-600">Simple and accountant view of every account head.</p>
        </div>
        <Select value={selected} onChange={(e) => change(e.target.value)}>
          {accounts.map((a) => <option key={a.id} value={a.code}>{a.code} — {a.name}</option>)}
        </Select>
      </div>
      {ledger ? <Card>
        <div className="mb-4 flex justify-between gap-3">
          <div><h2 className="text-xl font-bold">{ledger.account.code} — {ledger.account.name}</h2><p className="text-sm text-slate-500">{ledger.account.type}</p></div>
          <div className="text-right"><p className="text-sm text-slate-500">Closing balance</p><b>{money(ledger.closingBalance)}</b></div>
        </div>
        <div className="overflow-hidden rounded-2xl border">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50"><tr><th className="p-3">Date</th><th>Narration</th><th className="text-right">Debit</th><th className="text-right">Credit</th><th className="p-3 text-right">Balance</th></tr></thead>
            <tbody>{ledger.rows.map((r, i) => <tr key={i} className="border-t"><td className="p-3">{new Date(r.date).toLocaleDateString()}</td><td>{r.narration}<br /><span className="text-xs text-slate-500">{r.sourceType}</span></td><td className="text-right">{money(r.debit)}</td><td className="text-right">{money(r.credit)}</td><td className="p-3 text-right">{money(r.balance)}</td></tr>)}</tbody>
          </table>
          {!ledger.rows.length && <p className="p-6 text-center text-slate-500">No ledger activity yet.</p>}
        </div>
      </Card> : <Card>Please select a client company first.</Card>}
      </ClientRequired>
    </AppShell>
  );
}
