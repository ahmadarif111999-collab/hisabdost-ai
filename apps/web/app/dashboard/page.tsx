'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { ClientRequired } from '@/components/ClientRequired';
import { Button, Card } from '@/components/Card';
import { api, getBusinessId, money, setBusinessId } from '@/lib/api';

type Business = { id: string; name: string; city?: string };
type Dashboard = { sales: number; purchases: number; expenses: number; profit: number; cash: number; bank: number; wallet: number; receivables: number; payables: number; missingDocs: number };

export default function DashboardPage() {
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [businessId, setSelectedBusinessId] = useState<string | null>(null);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const list = await api<Business[]>('/businesses');
        setBusinesses(list);
        const selected = getBusinessId() || list[0]?.id;
        if (!selected) return;
        setBusinessId(selected);
        setSelectedBusinessId(selected);
        const data = await api<Dashboard>(`/accounting/businesses/${selected}/dashboard`);
        setDashboard(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load dashboard');
      }
    }
    load();
  }, []);

  async function switchBusiness(id: string) {
    setBusinessId(id);
    setSelectedBusinessId(id);
    setDashboard(await api<Dashboard>(`/accounting/businesses/${id}/dashboard`));
  }

  return (
    <AppShell>
      <ClientRequired>
      <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="text-3xl font-bold">Client Dashboard</h1>
          <p className="text-slate-600">Sales, purchases, cash, receivables, payables, and missing documents.</p>
        </div>
        {businesses.length ? (
          <select className="rounded-2xl border bg-white px-4 py-3" value={businessId || ''} onChange={(e) => switchBusiness(e.target.value)}>
            {businesses.map((business) => <option key={business.id} value={business.id}>{business.name}</option>)}
          </select>
        ) : (
          <Link href="/firm"><Button>Add first client company</Button></Link>
        )}
      </div>

      {error && <Card className="mb-4 bg-red-50 text-red-700">{error}</Card>}
      {!businesses.length && <Card>No client company yet. Go to Firm Dashboard and add your first real client. Starter plan allows 10 client slots.</Card>}

      {dashboard && (
        <>
          <div className="grid gap-4 md:grid-cols-5">
            <Metric label="This month sales" value={money(dashboard.sales)} />
            <Metric label="Purchases" value={money(dashboard.purchases)} />
            <Metric label="Expenses" value={money(dashboard.expenses)} />
            <Metric label="Estimated profit" value={money(dashboard.profit)} highlight />
            <Metric label="Missing receipts" value={String(dashboard.missingDocs)} />
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-5">
            <Metric label="Cash" value={money(dashboard.cash)} />
            <Metric label="Bank" value={money(dashboard.bank)} />
            <Metric label="Wallet" value={money(dashboard.wallet)} />
            <Metric label="Receivables" value={money(dashboard.receivables)} />
            <Metric label="Payables" value={money(Math.abs(dashboard.payables))} />
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-6">
            <Link href="/transactions" className="rounded-3xl bg-brand-600 p-5 text-center font-semibold text-white">Add Sale</Link>
            <Link href="/transactions" className="rounded-3xl bg-white p-5 text-center font-semibold shadow-sm">Add Purchase</Link>
            <Link href="/transactions" className="rounded-3xl bg-white p-5 text-center font-semibold shadow-sm">Add Expense</Link>
            <Link href="/documents" className="rounded-3xl bg-white p-5 text-center font-semibold shadow-sm">Upload Receipt</Link>
            <Link href="/chat" className="rounded-3xl bg-white p-5 text-center font-semibold shadow-sm">Ask AI</Link>
            <Link href="/reports" className="rounded-3xl bg-white p-5 text-center font-semibold shadow-sm">Reports</Link>
          </div>
        </>
      )}
      </ClientRequired>
    </AppShell>
  );
}

function Metric({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <Card className={highlight ? 'border-brand-100 bg-brand-50' : ''}>
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-bold">{value}</p>
    </Card>
  );
}
