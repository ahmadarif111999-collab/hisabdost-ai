'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { AppShell } from '@/components/AppShell';
import { Button, Card, Input, Select } from '@/components/Card';
import { api, money, setBusinessId } from '@/lib/api';

type Client = { id: string; name: string; city?: string; businessType?: string; nextDeadline?: { title: string; dueDate: string } | null };
type Dashboard = {
  firm: { name: string; planName: string; clientSlotLimit: number; firmUserLimit: number };
  clientSlotsUsed: number;
  clientSlotLimit: number;
  clients: Client[];
  members: { id: string; role: string; user: { name: string; email: string } }[];
  pendingAiActions: number;
  pendingAccountHeadRequests: number;
  pendingReportRequests: number;
  missingDocuments: number;
};

export default function FirmPage() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [form, setForm] = useState({ name: '', businessType: 'Retail', entityType: 'SOLE_PROPRIETOR', city: '', ntn: '', strn: '', clientOwnerEmail: '' });
  const [memberEmail, setMemberEmail] = useState('');
  const [message, setMessage] = useState('');

  async function load() {
    setData(await api<Dashboard>('/firm/dashboard'));
  }

  useEffect(() => { load(); }, []);

  async function addClient(e: FormEvent) {
    e.preventDefault();
    const client = await api<Client>('/firm/clients', { method: 'POST', body: JSON.stringify(form) });
    setBusinessId(client.id);
    setForm({ name: '', businessType: 'Retail', entityType: 'SOLE_PROPRIETOR', city: '', ntn: '', strn: '', clientOwnerEmail: '' });
    setMessage(`${client.name} client company created.`);
    await load();
  }

  async function inviteFirmMember(e: FormEvent) {
    e.preventDefault();
    await api('/firm/members/invite', { method: 'POST', body: JSON.stringify({ email: memberEmail, role: 'FIRM_PARTNER' }) });
    setMemberEmail('');
    setMessage('Firm member access granted.');
    await load();
  }

  return (
    <AppShell>
      <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Firm Dashboard</h1>
          <p className="text-slate-600">One firm account controls client books, approvals, exports, account library, and compliance review.</p>
        </div>
        <div className="rounded-3xl border bg-white px-5 py-3 text-sm shadow-sm">
          <b>{data?.firm.name || 'Loading...'}</b><br />{data?.firm.planName || 'Firm Starter'}
        </div>
      </div>

      {data && (
        <>
          <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
            <Metric label="Client slots" value={`${data.clientSlotsUsed} / ${data.clientSlotLimit}`} />
            <Metric label="Missing documents" value={String(data.missingDocuments)} />
            <Metric label="Pending AI approvals" value={String(data.pendingAiActions)} />
            <Metric label="Account head requests" value={String(data.pendingAccountHeadRequests)} />
            <Metric label="Report requests" value={String(data.pendingReportRequests)} />
            <Metric label="Firm users" value={`${data.members.length} / ${data.firm.firmUserLimit}`} />
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_420px]">
            <Card>
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold">Client companies</h2>
                  <p className="text-sm text-slate-500">No fake/sample clients. Add real clients here.</p>
                </div>
              </div>
              <div className="overflow-hidden rounded-2xl border">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50"><tr><th className="p-3">Client</th><th>Type</th><th>Next deadline</th><th className="p-3 text-right">Action</th></tr></thead>
                  <tbody>
                    {data.clients.map((client) => (
                      <tr key={client.id} className="border-t">
                        <td className="p-3"><b>{client.name}</b><br /><span className="text-xs text-slate-500">{client.city || 'City not set'}</span></td>
                        <td>{client.businessType || '-'}</td>
                        <td>{client.nextDeadline ? `${client.nextDeadline.title} (${new Date(client.nextDeadline.dueDate).toLocaleDateString()})` : 'Monthly close'}</td>
                        <td className="p-3 text-right"><Link href="/dashboard" onClick={() => setBusinessId(client.id)} className="rounded-xl bg-brand-600 px-3 py-2 text-white">Open</Link></td>
                      </tr>
                    ))}
                    {!data.clients.length && <tr><td colSpan={4} className="p-6 text-center text-slate-500">No clients yet. Use the form on the right to add your first real client.</td></tr>}
                  </tbody>
                </table>
              </div>
            </Card>

            <div className="space-y-4">
              <Card>
                <h2 className="mb-3 font-bold">+ Add Client Company</h2>
                <form onSubmit={addClient} className="grid gap-3">
                  <Input placeholder="Client company name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
                  <div className="grid gap-3 md:grid-cols-2">
                    <Select value={form.businessType} onChange={(e) => setForm({ ...form, businessType: e.target.value })}>
                      <option>Retail</option><option>Restaurant/Cafe</option><option>Freelancer</option><option>Agency</option><option>Import/Export</option><option>Services</option><option>Medical Store</option><option>Clothing Shop</option>
                    </Select>
                    <Select value={form.entityType} onChange={(e) => setForm({ ...form, entityType: e.target.value })}>
                      <option value="INDIVIDUAL">Individual</option><option value="SOLE_PROPRIETOR">Sole Proprietor</option><option value="AOP">AOP</option><option value="PVT_LTD">Private Limited</option>
                    </Select>
                  </div>
                  <Input placeholder="City" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
                  <Input placeholder="NTN optional" value={form.ntn} onChange={(e) => setForm({ ...form, ntn: e.target.value })} />
                  <Input placeholder="STRN optional" value={form.strn} onChange={(e) => setForm({ ...form, strn: e.target.value })} />
                  <Input placeholder="Client owner email optional" value={form.clientOwnerEmail} onChange={(e) => setForm({ ...form, clientOwnerEmail: e.target.value })} />
                  <Button disabled={!!data && data.clientSlotsUsed >= data.clientSlotLimit}>Create Client</Button>
                </form>
              </Card>

              <Card>
                <h2 className="mb-3 font-bold">Invite firm partner</h2>
                <form onSubmit={inviteFirmMember} className="flex gap-2">
                  <Input type="email" placeholder="partner@email.com" value={memberEmail} onChange={(e) => setMemberEmail(e.target.value)} required />
                  <Button>Invite</Button>
                </form>
                <div className="mt-3 space-y-2 text-sm">
                  {data.members.map((m) => <div key={m.id} className="rounded-xl bg-slate-50 p-2"><b>{m.user.name}</b> — {m.role}<br /><span className="text-xs text-slate-500">{m.user.email}</span></div>)}
                </div>
              </Card>
            </div>
          </div>
        </>
      )}
      {message && <p className="mt-4 rounded-xl bg-brand-50 p-3 text-brand-700">{message}</p>}
    </AppShell>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <Card><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-2xl font-bold">{value}</p></Card>;
}
