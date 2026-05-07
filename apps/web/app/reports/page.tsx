'use client';

import { FormEvent, useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { ClientRequired } from '@/components/ClientRequired';
import { Button, Card, Input, Select } from '@/components/Card';
import { api, downloadBase64File, getBusinessId, money } from '@/lib/api';

type Account = { id: string; code: string; name: string; type: string };
type PL = { rows: { code: string; account: string; type: string; amount: number }[]; totalIncome: number; totalExpenses: number; netProfit: number };
type Trial = { rows: { code: string; account: string; type: string; debit: number; credit: number; balance: number }[]; totalDebit: number; totalCredit: number };
type Analysis = { summary: string; keyFindings: string[]; risks: string[]; suggestions: string[]; accountantNotes: string[]; safetyNote: string };

type ExportResponse = { filename: string; mimeType: string; contentBase64: string; warning?: string };

const reportTypes = [
  ['profit-loss', 'Profit & Loss'],
  ['balance-sheet', 'Balance Sheet'],
  ['trial-balance', 'Trial Balance'],
  ['general-ledger', 'General Ledger'],
  ['debtors', 'Debtors Report'],
  ['creditors', 'Creditors Report'],
  ['sales', 'Sales Report'],
  ['purchases', 'Purchase Report'],
  ['expenses', 'Expense Report'],
  ['cash-bank', 'Cash & Bank Report'],
  ['tax-summary', 'Tax Summary'],
  ['missing-documents', 'Missing Documents'],
  ['account-usage', 'Account Head Usage'],
  ['monthly-closing', 'Monthly Closing'],
];

export default function ReportsPage() {
  const [pl, setPl] = useState<PL | null>(null);
  const [trial, setTrial] = useState<Trial | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [preview, setPreview] = useState<any>(null);
  const [message, setMessage] = useState('');
  const [filters, setFilters] = useState({ reportType: 'profit-loss', format: 'excel', from: '', to: '', accountCodes: [] as string[] });

  async function load() {
    const businessId = getBusinessId();
    if (!businessId) return;
    setAccounts(await api<Account[]>(`/accounting/businesses/${businessId}/accounts`));
    setPl(await api<PL>(`/accounting/businesses/${businessId}/reports/profit-loss`));
    setTrial(await api<Trial>(`/accounting/businesses/${businessId}/reports/trial-balance`));
  }

  useEffect(() => { load(); }, []);

  async function analyze() {
    const businessId = getBusinessId();
    if (!businessId) return;
    setAnalysis(await api<Analysis>(`/ai/businesses/${businessId}/analyze-report`, { method: 'POST', body: JSON.stringify({ reportType: filters.reportType }) }));
  }

  async function previewReport(e: FormEvent) {
    e.preventDefault();
    const businessId = getBusinessId();
    if (!businessId) return;
    const data = await api<any>(`/accounting/businesses/${businessId}/reports/preview`, { method: 'POST', body: JSON.stringify(filters) });
    setPreview(data);
    setMessage('Report preview generated with selected filters.');
  }

  async function exportReport() {
    const businessId = getBusinessId();
    if (!businessId) return;
    try {
      const result = await api<ExportResponse>(`/accounting/businesses/${businessId}/reports/export`, { method: 'POST', body: JSON.stringify(filters) });
      downloadBase64File(result.filename, result.mimeType, result.contentBase64);
      setMessage(result.warning || 'Report exported.');
    } catch (error) {
      setMessage((error as Error).message + ' Use Request Export Approval if you are a client user.');
    }
  }

  async function requestExport() {
    const businessId = getBusinessId();
    if (!businessId) return;
    await api(`/accounting/businesses/${businessId}/reports/request-export`, { method: 'POST', body: JSON.stringify({ ...filters, reason: 'Client requested report from Report Builder.' }) });
    setMessage('Report export request sent to firm for approval.');
  }

  function toggleAccount(code: string) {
    setFilters((f) => ({ ...f, accountCodes: f.accountCodes.includes(code) ? f.accountCodes.filter((x) => x !== code) : [...f.accountCodes, code] }));
  }

  return (
    <AppShell>
      <ClientRequired>
        <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <h1 className="text-3xl font-bold">Report Builder</h1>
            <p className="text-slate-600">Filter by period, heads, report type, and export only when permission allows.</p>
          </div>
          <Button onClick={analyze}>Ask AI to Analyze</Button>
        </div>

        {message && <p className="mb-4 rounded-2xl bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p>}

        <div className="grid gap-4 xl:grid-cols-[420px_1fr]">
          <Card>
            <h2 className="mb-4 text-xl font-bold">Filters & Export</h2>
            <form onSubmit={previewReport} className="space-y-3">
              <Select value={filters.reportType} onChange={(e) => setFilters({ ...filters, reportType: e.target.value })}>
                {reportTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </Select>
              <div className="grid grid-cols-2 gap-3">
                <Input type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} />
                <Input type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} />
              </div>
              <div className="rounded-2xl border bg-slate-50 p-3">
                <p className="mb-2 text-sm font-semibold">Specific heads</p>
                <div className="max-h-52 space-y-1 overflow-auto text-sm">
                  {accounts.map((a) => (
                    <label key={a.id} className="flex items-center gap-2 rounded-xl px-2 py-1 hover:bg-white">
                      <input type="checkbox" checked={filters.accountCodes.includes(a.code)} onChange={() => toggleAccount(a.code)} />
                      <span>{a.code} — {a.name}</span>
                    </label>
                  ))}
                </div>
              </div>
              <Select value={filters.format} onChange={(e) => setFilters({ ...filters, format: e.target.value })}>
                <option value="excel">Excel-compatible CSV</option>
                <option value="pdf">PDF-ready HTML</option>
                <option value="word">Word-readable DOC</option>
                <option value="json">JSON backup</option>
              </Select>
              <div className="grid grid-cols-2 gap-2">
                <Button type="submit">Preview</Button>
                <Button type="button" onClick={exportReport} className="bg-slate-900 hover:bg-slate-800">Export</Button>
              </div>
              <button type="button" onClick={requestExport} className="w-full rounded-2xl border bg-white px-4 py-3 text-sm font-semibold hover:bg-slate-50">Request Export Approval</button>
            </form>
          </Card>

          <div className="space-y-4">
            {analysis && <Card className="border-emerald-100 bg-emerald-50/80">
              <h2 className="mb-2 text-xl font-bold">AI Report Analysis</h2>
              <p className="mb-3 whitespace-pre-line">{analysis.summary}</p>
              <div className="grid gap-4 md:grid-cols-3">
                <List title="Key findings" items={analysis.keyFindings} />
                <List title="Risks" items={analysis.risks} />
                <List title="Suggestions" items={analysis.suggestions} />
              </div>
              <p className="mt-3 text-xs text-slate-500">{analysis.safetyNote}</p>
            </Card>}

            {preview && <Card>
              <h2 className="mb-3 text-xl font-bold">Preview: {preview.reportType}</h2>
              <pre className="max-h-[420px] overflow-auto rounded-2xl bg-slate-950 p-4 text-xs text-slate-100">{JSON.stringify(preview, null, 2)}</pre>
            </Card>}

            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <h2 className="mb-4 text-xl font-bold">Profit & Loss</h2>
                {!pl && <p>Loading...</p>}
                {pl && <>
                  <div className="mb-4 grid gap-3 md:grid-cols-3">
                    <div className="rounded-2xl bg-slate-50 p-4"><p className="text-sm text-slate-500">Income</p><b>{money(pl.totalIncome)}</b></div>
                    <div className="rounded-2xl bg-slate-50 p-4"><p className="text-sm text-slate-500">Expenses</p><b>{money(pl.totalExpenses)}</b></div>
                    <div className="rounded-2xl bg-emerald-50 p-4"><p className="text-sm text-slate-500">Net profit</p><b>{money(pl.netProfit)}</b></div>
                  </div>
                  <MiniTable rows={pl.rows.map((r) => [r.code, r.account, r.type, money(r.amount)])} headers={['Code', 'Account', 'Type', 'Amount']} />
                </>}
              </Card>
              <Card>
                <h2 className="mb-4 text-xl font-bold">Trial Balance</h2>
                {!trial && <p>Loading...</p>}
                {trial && <>
                  <div className="mb-4 grid gap-3 md:grid-cols-2">
                    <div className="rounded-2xl bg-slate-50 p-4"><p className="text-sm text-slate-500">Total debit</p><b>{money(trial.totalDebit)}</b></div>
                    <div className="rounded-2xl bg-slate-50 p-4"><p className="text-sm text-slate-500">Total credit</p><b>{money(trial.totalCredit)}</b></div>
                  </div>
                  <MiniTable rows={trial.rows.map((r) => [r.code, r.account, r.type, money(r.balance)])} headers={['Code', 'Account', 'Type', 'Balance']} />
                </>}
              </Card>
            </div>
          </div>
        </div>
      </ClientRequired>
    </AppShell>
  );
}

function List({ title, items }: { title: string; items: string[] }) {
  return <div><b>{title}</b><ul className="mt-2 list-disc pl-5 text-sm">{items?.map((item, i) => <li key={i}>{item}</li>)}</ul></div>;
}

function MiniTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return <div className="max-h-96 overflow-auto rounded-2xl border"><table className="w-full text-left text-sm"><thead className="bg-slate-50"><tr>{headers.map((h) => <th key={h} className="p-3">{h}</th>)}</tr></thead><tbody>{rows.map((row, i) => <tr key={i} className="border-t">{row.map((cell, j) => <td key={j} className="p-3">{cell}</td>)}</tr>)}</tbody></table></div>;
}
