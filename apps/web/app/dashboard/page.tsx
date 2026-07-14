'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { ClientRequired } from '@/components/ClientRequired';
import { Button, Card } from '@/components/Card';
import { api, getBusinessId, money, setBusinessId } from '@/lib/api';

type Business = {
  id: string;
  name: string;
  city?: string;
};

type Dashboard = {
  sales: number;
  purchases: number;
  expenses: number;
  profit: number;
  cash: number;
  bank: number;
  wallet: number;
  receivables: number;
  payables: number;
  missingDocs: number;
};

type InvoiceSummary = {
  status?: string;
};

type AiActionSummary = {
  status?: string;
};

type ReportRequestSummary = {
  status?: string;
};

type ReportRequestResponse = {
  requests?: ReportRequestSummary[];
};

type WorkflowCounts = {
  pendingInvoices: number;
  pendingAiActions: number;
  pendingReportRequests: number;
};

const pendingInvoiceStatuses = new Set(['DRAFT', 'SENT', 'OVERDUE']);

export default function DashboardPage() {
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [businessId, setSelectedBusinessId] = useState<string | null>(null);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [workflow, setWorkflow] = useState<WorkflowCounts>({
    pendingInvoices: 0,
    pendingAiActions: 0,
    pendingReportRequests: 0,
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState(false);

  async function loadBusiness(id: string) {
    setError('');

    const [dashboardResult, invoicesResult, aiActionsResult, reportRequestsResult] =
      await Promise.allSettled([
        api<Dashboard>(`/accounting/businesses/${id}/dashboard`),
        api<InvoiceSummary[]>(`/invoices/businesses/${id}`),
        api<AiActionSummary[]>(`/ai/businesses/${id}/actions`),
        api<ReportRequestResponse>(
          `/accounting/businesses/${id}/reporting/export-requests`,
        ),
      ]);

    if (dashboardResult.status === 'rejected') {
      throw dashboardResult.reason;
    }

    setDashboard(dashboardResult.value);

    const invoices = invoicesResult.status === 'fulfilled' ? invoicesResult.value : [];
    const aiActions = aiActionsResult.status === 'fulfilled' ? aiActionsResult.value : [];
    const reportRequests =
      reportRequestsResult.status === 'fulfilled'
        ? reportRequestsResult.value.requests || []
        : [];

    setWorkflow({
      pendingInvoices: invoices.filter((invoice) =>
        pendingInvoiceStatuses.has(String(invoice.status || '').toUpperCase()),
      ).length,
      pendingAiActions: aiActions.filter(
        (action) => String(action.status || '').toLowerCase() === 'pending',
      ).length,
      pendingReportRequests: reportRequests.filter(
        (request) => String(request.status || '').toLowerCase() === 'pending',
      ).length,
    });
  }

  useEffect(() => {
    async function load() {
      setLoading(true);

      try {
        const list = await api<Business[]>('/businesses');
        setBusinesses(list);

        const selected = getBusinessId() || list[0]?.id;

        if (!selected) {
          return;
        }

        if (!getBusinessId()) {
          setBusinessId(selected);
          window.dispatchEvent(new Event('pakbooks-business-changed'));
        }

        setSelectedBusinessId(selected);
        await loadBusiness(selected);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load dashboard');
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, []);

  async function switchBusiness(id: string) {
    if (switching || !id) {
      return;
    }

    setSwitching(true);
    setError('');

    try {
      setBusinessId(id);
      window.dispatchEvent(new Event('pakbooks-business-changed'));
      setSelectedBusinessId(id);
      await loadBusiness(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to switch client');
    } finally {
      setSwitching(false);
    }
  }

  return (
    <AppShell>
      <ClientRequired>
        <div className="mx-auto max-w-7xl space-y-6 px-4 py-8">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
            <div>
              <h1 className="text-3xl font-bold">Client Dashboard</h1>
              <p className="text-slate-600">
                Sales, purchases, cash, receivables, payables, documents, and pending work.
              </p>
            </div>

            {businesses.length ? (
              <select
                className="rounded-2xl border bg-white px-4 py-3 disabled:cursor-not-allowed disabled:opacity-60"
                value={businessId || ''}
                onChange={(event) => void switchBusiness(event.target.value)}
                disabled={switching}
              >
                {businesses.map((business) => (
                  <option key={business.id} value={business.id}>
                    {business.name}
                  </option>
                ))}
              </select>
            ) : (
              <Link href="/firm">
                <Button>Add first client company</Button>
              </Link>
            )}
          </div>

          {error && <Card className="bg-red-50 text-red-700">{error}</Card>}

          {!businesses.length && !loading && (
            <Card>
              No client company yet. Go to Firm Dashboard and add your first real client.
              Starter plan allows 10 client slots.
            </Card>
          )}

          {loading && (
            <Card>
              <p className="text-sm text-slate-600">Loading client dashboard...</p>
            </Card>
          )}

          {dashboard && !loading && (
            <>
              <div className="grid gap-4 md:grid-cols-5">
                <Metric label="This month sales" value={money(dashboard.sales)} />
                <Metric label="Purchases" value={money(dashboard.purchases)} />
                <Metric label="Expenses" value={money(dashboard.expenses)} />
                <Metric
                  label="Estimated profit"
                  value={money(dashboard.profit)}
                  highlight
                />
                <Metric
                  label="Missing receipts"
                  value={String(dashboard.missingDocs)}
                  href="/documents?missing=true"
                />
              </div>

              <div className="grid gap-4 md:grid-cols-5">
                <Metric label="Cash" value={money(dashboard.cash)} />
                <Metric label="Bank" value={money(dashboard.bank)} />
                <Metric label="Wallet" value={money(dashboard.wallet)} />
                <Metric label="Receivables" value={money(dashboard.receivables)} />
                <Metric label="Payables" value={money(Math.abs(dashboard.payables))} />
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <Metric
                  label="Pending invoices"
                  value={String(workflow.pendingInvoices)}
                  detail="Draft, sent, or overdue"
                  href="/invoices?status=pending"
                />
                <Metric
                  label="AI approvals"
                  value={String(workflow.pendingAiActions)}
                  detail="Suggestions waiting for review"
                  href="/approvals?status=pending"
                />
                <Metric
                  label="Report requests"
                  value={String(workflow.pendingReportRequests)}
                  detail="Exports waiting for approval"
                  href="/report-requests?status=pending"
                />
              </div>

              <div className="grid gap-3 md:grid-cols-6">
                <Link
                  href="/transactions"
                  className="rounded-3xl bg-brand-600 p-5 text-center font-semibold text-white"
                >
                  Add Sale
                </Link>
                <Link
                  href="/transactions"
                  className="rounded-3xl bg-white p-5 text-center font-semibold shadow-sm"
                >
                  Add Purchase
                </Link>
                <Link
                  href="/transactions"
                  className="rounded-3xl bg-white p-5 text-center font-semibold shadow-sm"
                >
                  Add Expense
                </Link>
                <Link
                  href="/documents"
                  className="rounded-3xl bg-white p-5 text-center font-semibold shadow-sm"
                >
                  Upload Receipt
                </Link>
                <Link
                  href="/chat"
                  className="rounded-3xl bg-white p-5 text-center font-semibold shadow-sm"
                >
                  Ask AI
                </Link>
                <Link
                  href="/reports"
                  className="rounded-3xl bg-white p-5 text-center font-semibold shadow-sm"
                >
                  Reports
                </Link>
              </div>
            </>
          )}
        </div>
      </ClientRequired>
    </AppShell>
  );
}

function Metric({
  label,
  value,
  detail,
  highlight,
  href,
}: {
  label: string;
  value: string;
  detail?: string;
  highlight?: boolean;
  href?: string;
}) {
  const content = (
    <Card
      className={`${highlight ? 'border-brand-100 bg-brand-50' : ''} ${
        href
          ? 'h-full transition group-hover:-translate-y-0.5 group-hover:border-emerald-300 group-hover:shadow-md'
          : 'h-full'
      }`}
    >
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-bold">{value}</p>
      {detail && <p className="mt-1 text-xs text-slate-500">{detail}</p>}
      {href && (
        <p className="mt-3 text-xs font-semibold text-emerald-700">Open filtered view →</p>
      )}
    </Card>
  );

  if (!href) {
    return content;
  }

  return (
    <Link href={href} className="group block h-full" aria-label={`Open ${label}`}>
      {content}
    </Link>
  );
}
