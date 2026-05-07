'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AppShell } from '@/components/AppShell';
import { ClientRequired } from '@/components/ClientRequired';
import { Card } from '@/components/Card';
import { api, getBusinessId, money } from '@/lib/api';

type Dashboard = { cash: number; bank: number; wallet: number; receivables: number; payables: number };

export default function CashBankPage() {
  const [data, setData] = useState<Dashboard | null>(null);
  useEffect(() => {
    const businessId = getBusinessId();
    if (businessId) api<Dashboard>(`/accounting/businesses/${businessId}/dashboard`).then(setData);
  }, []);
  return (
    <AppShell>
      <ClientRequired>
      <h1 className="mb-2 text-3xl font-bold">Cash & Bank</h1>
      <p className="mb-6 text-slate-600">Simple balances for cash, bank, wallet, receivables and payables.</p>
      {data ? (
        <div className="grid gap-4 md:grid-cols-5">
          <Metric label="Cash in Hand" value={money(data.cash)} code="1000" />
          <Metric label="Bank Account" value={money(data.bank)} code="1010" />
          <Metric label="Wallet" value={money(data.wallet)} code="1020" />
          <Metric label="Receivables" value={money(data.receivables)} code="1100" />
          <Metric label="Payables" value={money(Math.abs(data.payables))} code="2000" />
        </div>
      ) : <Card>Please select a client company first.</Card>}
      </ClientRequired>
    </AppShell>
  );
}

function Metric({ label, value, code }: { label: string; value: string; code: string }) {
  return <Card><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-2xl font-bold">{value}</p><Link href={`/ledgers?account=${code}`} className="mt-3 inline-block text-sm text-brand-700">Open ledger</Link></Card>;
}
