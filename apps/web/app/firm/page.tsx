'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { AppShell } from '@/components/AppShell';
import { Button, Card, Input, Select } from '@/components/Card';
import { api, setBusinessId } from '@/lib/api';

type Client = {
  id: string;
  name: string;
  city?: string;
  businessType?: string;
  nextDeadline?: {
    title: string;
    dueDate: string;
  } | null;
};

type Member = {
  id: string;
  role: string;
  user: {
    name: string;
    email: string;
  };
};

type Dashboard = {
  firm: {
    name: string;
    planName: string;
    clientSlotLimit: number;
    firmUserLimit: number;
  };
  clientSlotsUsed: number;
  clientSlotLimit: number;
  clients: Client[];
  members: Member[];
  pendingAiActions: number;
  missingDocuments: number;
};

export default function FirmPage() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [form, setForm] = useState({
    name: '',
    businessType: 'Retail',
    entityType: 'SOLE_PROPRIETOR',
    city: '',
    ntn: '',
    strn: '',
    clientOwnerEmail: '',
  });
  const [memberEmail, setMemberEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  async function load() {
    setError('');
    try {
      const dashboard = await api<Dashboard>('/firm/dashboard');
      setData(dashboard);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load firm dashboard');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function addClient(e: FormEvent) {
    e.preventDefault();
    setMessage('');
    setError('');

    try {
      const client = await api<Client>('/firm/clients', {
        method: 'POST',
        body: JSON.stringify(form),
      });

      setBusinessId(client.id);
      setForm({
        name: '',
        businessType: 'Retail',
        entityType: 'SOLE_PROPRIETOR',
        city: '',
        ntn: '',
        strn: '',
        clientOwnerEmail: '',
      });
      setMessage(`${client.name} client company created.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create client');
    }
  }

  async function inviteFirmMember(e: FormEvent) {
    e.preventDefault();
    setMessage('');
    setError('');

    try {
      await api('/firm/members/invite', {
        method: 'POST',
        body: JSON.stringify({
          email: memberEmail.trim(),
          role: 'FIRM_PARTNER',
        }),
      });

      setMemberEmail('');
      setMessage('Firm member access granted.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not invite firm member');
    }
  }

  if (loading) {
    return (
      <AppShell>
        <div className="rounded-3xl border bg-white p-8 shadow-sm">
          <p className="text-sm text-slate-500">Loading firm workspace...</p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <section className="overflow-hidden rounded-[2rem] border border-emerald-100 bg-gradient-to-br from-emerald-900 via-slate-900 to-slate-950 p-6 text-white shadow-sm">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="mb-3 inline-flex rounded-full bg-emerald-400/15 px-3 py-1 text-xs font-medium text-emerald-100">
                Firm command center
              </div>

              <h1 className="text-3xl font-bold tracking-tight">
                {data?.firm.name || 'ProBiz AI Firm'}
              </h1>

              <p className="mt-2 max-w-2xl text-sm leading-6 text-emerald-50/80">
                Manage client companies, partner access, missing documents,
                AI approvals, and monthly accounting workflows from one firm
                workspace.
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/10 px-5 py-4 text-sm backdrop-blur">
              <p className="text-emerald-100">Current plan</p>
              <p className="mt-1 text-lg font-semibold">
                {data?.firm.planName || 'Partner Beta'}
              </p>
            </div>
          </div>
        </section>

        {error && (
          <div className="rounded-2xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {message && (
          <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-sm text-emerald-700">
            {message}
          </div>
        )}

        {data && (
          <>
            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Metric
                label="Client slots"
                value={`${data.clientSlotsUsed} / ${data.clientSlotLimit}`}
                detail="Active client companies"
              />
              <Metric
                label="Firm users"
                value={`${data.members.length} / ${data.firm.firmUserLimit}`}
                detail="Partners connected"
              />
              <Metric
                label="AI approvals"
                value={String(data.pendingAiActions)}
                detail="Pending review"
              />
              <Metric
                label="Missing docs"
                value={String(data.missingDocuments)}
                detail="Receipts still needed"
              />
            </section>

            <section className="grid gap-6 xl:grid-cols-[1fr_420px]">
              <Card>
                <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-xl font-bold text-slate-950">
                      Client companies
                    </h2>
                    <p className="mt-1 text-sm text-slate-500">
                      Add real beta clients here. Each client keeps separate books.
                    </p>
                  </div>

                  <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                    {data.clients.length} active
                  </div>
                </div>

                <div className="overflow-hidden rounded-2xl border border-slate-200">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="p-3">Client</th>
                        <th className="p-3">Type</th>
                        <th className="p-3">Next action</th>
                        <th className="p-3 text-right">Open</th>
                      </tr>
                    </thead>

                    <tbody>
                      {data.clients.map((client) => (
                        <tr key={client.id} className="border-t border-slate-100">
                          <td className="p-3">
                            <p className="font-semibold text-slate-900">
                              {client.name}
                            </p>
                            <p className="text-xs text-slate-500">
                              {client.city || 'City not set'}
                            </p>
                          </td>

                          <td className="p-3 text-slate-600">
                            {client.businessType || '-'}
                          </td>

                          <td className="p-3 text-slate-600">
                            {client.nextDeadline
                              ? `${client.nextDeadline.title} (${new Date(client.nextDeadline.dueDate).toLocaleDateString()})`
                              : 'Monthly close'}
                          </td>

                          <td className="p-3 text-right">
                            <Link
                              href="/dashboard"
                              onClick={() => setBusinessId(client.id)}
                              className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700"
                            >
                              Open
                            </Link>
                          </td>
                        </tr>
                      ))}

                      {!data.clients.length && (
                        <tr>
                          <td colSpan={4} className="p-8 text-center">
                            <p className="font-medium text-slate-700">
                              No clients yet
                            </p>
                            <p className="mt-1 text-sm text-slate-500">
                              Add your first test client from the form on the right.
                            </p>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>

              <div className="space-y-6">
                <Card>
                  <h2 className="mb-1 text-lg font-bold text-slate-950">
                    Add client company
                  </h2>
                  <p className="mb-4 text-sm text-slate-500">
                    Create a separate company workspace for each SME client.
                  </p>

                  <form onSubmit={addClient} className="grid gap-3">
                    <Input
                      placeholder="Client company name"
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      required
                    />

                    <div className="grid gap-3 md:grid-cols-2">
                      <Select
                        value={form.businessType}
                        onChange={(e) => setForm({ ...form, businessType: e.target.value })}
                      >
                        <option>Retail</option>
                        <option>Restaurant/Cafe</option>
                        <option>Freelancer</option>
                        <option>Agency</option>
                        <option>Import/Export</option>
                        <option>Services</option>
                        <option>Medical Store</option>
                        <option>Clothing Shop</option>
                      </Select>

                      <Select
                        value={form.entityType}
                        onChange={(e) => setForm({ ...form, entityType: e.target.value })}
                      >
                        <option value="INDIVIDUAL">Individual</option>
                        <option value="SOLE_PROPRIETOR">Sole Proprietor</option>
                        <option value="AOP">AOP</option>
                        <option value="PVT_LTD">Private Limited</option>
                      </Select>
                    </div>

                    <Input
                      placeholder="City"
                      value={form.city}
                      onChange={(e) => setForm({ ...form, city: e.target.value })}
                    />

                    <Input
                      placeholder="NTN optional"
                      value={form.ntn}
                      onChange={(e) => setForm({ ...form, ntn: e.target.value })}
                    />

                    <Input
                      placeholder="STRN optional"
                      value={form.strn}
                      onChange={(e) => setForm({ ...form, strn: e.target.value })}
                    />

                    <Input
                      placeholder="Client owner email optional"
                      value={form.clientOwnerEmail}
                      onChange={(e) => setForm({ ...form, clientOwnerEmail: e.target.value })}
                    />

                    <Button disabled={data.clientSlotsUsed >= data.clientSlotLimit}>
                      Create Client
                    </Button>
                  </form>
                </Card>

                <Card>
                  <h2 className="mb-1 text-lg font-bold text-slate-950">
                    Firm users
                  </h2>
                  <p className="mb-4 text-sm text-slate-500">
                    Connected partners inside this shared firm workspace.
                  </p>

                  <form onSubmit={inviteFirmMember} className="mb-4 flex gap-2">
                    <Input
                      type="email"
                      placeholder="partner@email.com"
                      value={memberEmail}
                      onChange={(e) => setMemberEmail(e.target.value)}
                      required
                    />
                    <Button>Invite</Button>
                  </form>

                  <div className="space-y-2">
                    {data.members.map((member) => (
                      <div
                        key={member.id}
                        className="rounded-2xl border border-slate-100 bg-slate-50 p-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold text-slate-900">
                              {member.user.name}
                            </p>
                            <p className="text-xs text-slate-500">
                              {member.user.email}
                            </p>
                          </div>

                          <span className="rounded-full bg-emerald-100 px-2 py-1 text-[11px] font-semibold text-emerald-700">
                            {member.role.replaceAll('_', ' ')}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              </div>
            </section>
          </>
        )}
      </div>
    </AppShell>
  );
}

function Metric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-bold tracking-tight text-slate-950">
        {value}
      </p>
      <p className="mt-1 text-xs text-slate-500">{detail}</p>
    </div>
  );
}
