'use client';

import { FormEvent, useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { Button, Card, Input, Select } from '@/components/Card';
import { api, getBusinessId } from '@/lib/api';

type Template = { id: string; code: string; name: string; type: string; description?: string; isTaxSensitive: boolean };
type Request = { id: string; requestedName: string; suggestedName: string; suggestedCode?: string; suggestedType: string; status: string; reason?: string; business: { name: string }; requestedBy?: { name: string; email: string } };

export default function AccountLibraryPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [requests, setRequests] = useState<Request[]>([]);
  const [message, setMessage] = useState('');
  const [form, setForm] = useState({ code: '', name: '', type: 'EXPENSE', description: '', category: '' });

  async function load() {
    setTemplates(await api<Template[]>('/firm/account-library'));
    setRequests(await api<Request[]>('/firm/account-head-requests'));
  }

  useEffect(() => { load(); }, []);

  async function saveTemplate(e: FormEvent) {
    e.preventDefault();
    await api('/firm/account-library', { method: 'POST', body: JSON.stringify(form) });
    setForm({ code: '', name: '', type: 'EXPENSE', description: '', category: '' });
    setMessage('Firm account library updated. New clients will receive this head by default.');
    await load();
  }

  async function approve(id: string) {
    await api(`/firm/account-head-requests/${id}/approve`, { method: 'POST', body: JSON.stringify({}) });
    setMessage('Account head request approved.');
    await load();
  }

  async function reject(id: string) {
    await api(`/firm/account-head-requests/${id}/reject`, { method: 'POST', body: JSON.stringify({ decisionNote: 'Rejected by firm review.' }) });
    setMessage('Account head request rejected.');
    await load();
  }

  async function importDefaults() {
    const businessId = getBusinessId();
    if (!businessId) return setMessage('Select a client first.');
    await api(`/firm/clients/${businessId}/accounts/import-defaults`, { method: 'POST' });
    setMessage('Default firm accounts imported/repaired for selected client.');
  }

  return (
    <AppShell>
      <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="text-3xl font-bold">Firm Account Library</h1>
          <p className="text-slate-600">General heads are controlled at firm level. Client-specific heads require firm approval.</p>
        </div>
        <Button onClick={importDefaults}>Import defaults to selected client</Button>
      </div>

      {message && <p className="mb-4 rounded-2xl bg-emerald-50 p-3 text-emerald-700">{message}</p>}

      <div className="grid gap-4 xl:grid-cols-[1fr_420px]">
        <Card>
          <h2 className="mb-4 text-xl font-bold">Default firm accounts</h2>
          <div className="max-h-[560px] overflow-auto rounded-2xl border">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50"><tr><th className="p-3">Code</th><th>Head</th><th>Type</th><th>Review</th></tr></thead>
              <tbody>
                {templates.map((t) => (
                  <tr key={t.id} className="border-t">
                    <td className="p-3 font-mono">{t.code}</td>
                    <td><b>{t.name}</b><br /><span className="text-xs text-slate-500">{t.description}</span></td>
                    <td>{t.type}</td>
                    <td>{t.isTaxSensitive ? <span className="rounded-full bg-amber-100 px-2 py-1 text-xs text-amber-700">Tax/review</span> : <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs text-emerald-700">Normal</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="space-y-4">
          <Card>
            <h2 className="mb-3 font-bold">Add firm default head</h2>
            <form onSubmit={saveTemplate} className="grid gap-3">
              <Input placeholder="Code, e.g. 5710" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} required />
              <Input placeholder="Head name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                <option>ASSET</option><option>LIABILITY</option><option>EQUITY</option><option>INCOME</option><option>EXPENSE</option>
              </Select>
              <Input placeholder="Category optional" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
              <Input placeholder="Description optional" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              <Button>Save to firm library</Button>
            </form>
          </Card>

          <Card>
            <h2 className="mb-3 font-bold">Pending client account requests</h2>
            <div className="space-y-3">
              {requests.filter((r) => r.status === 'pending').map((r) => (
                <div key={r.id} className="rounded-2xl border bg-slate-50 p-3 text-sm">
                  <p><b>{r.suggestedName}</b> <span className="text-slate-500">({r.suggestedType})</span></p>
                  <p className="text-xs text-slate-500">Client: {r.business.name} • Requested by {r.requestedBy?.name || 'Client user'}</p>
                  <p className="mt-2 text-xs">{r.reason}</p>
                  <div className="mt-3 flex gap-2">
                    <button onClick={() => approve(r.id)} className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white">Approve</button>
                    <button onClick={() => reject(r.id)} className="rounded-xl border bg-white px-3 py-2 text-xs font-semibold">Reject</button>
                  </div>
                </div>
              ))}
              {!requests.filter((r) => r.status === 'pending').length && <p className="text-sm text-slate-500">No pending account-head requests.</p>}
            </div>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
