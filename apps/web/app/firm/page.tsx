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
  pendingAccountHeadRequests?: number;
  pendingReportRequests?: number;
  missingDocuments: number;
};

const emptyClientForm = {
  name: '',
  businessType: 'Retail',
  entityType: 'SOLE_PROPRIETOR',
  city: '',
  ntn: '',
  strn: '',
  clientOwnerEmail: '',
};

export default function FirmPage() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [form, setForm] = useState(emptyClientForm);
  const [memberEmail, setMemberEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const [creatingClient, setCreatingClient] = useState(false);
  const [invitingMember, setInvitingMember] = useState(false);
  const [archivingClientId, setArchivingClientId] = useState<string | null>(null);

  async function load() {
    setError('');

    try {
      const dashboard = await api('/firm/dashboard');
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

    if (creatingClient) return;

    setMessage('');
    setError('');
    setCreatingClient(true);

    try {
      const client = await api('/firm/clients', {
        method: 'POST',
        body: JSON.stringify(form),
      });

      setBusinessId(client.id);
      setForm(emptyClientForm);
      setMessage(`${client.name} client company created.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create client');
    } finally {
      setCreatingClient(false);
    }
  }

  async function inviteFirmMember(e: FormEvent) {
    e.preventDefault();

    if (invitingMember) return;

    setMessage('');
    setError('');
    setInvitingMember(true);

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
    } finally {
      setInvitingMember(false);
    }
  }

  async function archiveClient(client: Client) {
    if (archivingClientId) return;

    const ok = window.confirm(
      `Archive ${client.name}? This will remove it from the active client list, but its accounting records will stay safely stored.`,
    );

    if (!ok) return;

    setMessage('');
    setError('');
    setArchivingClientId(client.id);

    try {
      await api(`/firm/clients/${client.id}/archive`, {
        method: 'PATCH',
      });

      if (localStorage.getItem('pakbooks_business_id') === client.id) {
        localStorage.removeItem('pakbooks_business_id');
        window.dispatchEvent(new Event('pakbooks-business-changed'));
      }

      setMessage(`${client.name} has been archived.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not archive client');
    } finally {
      setArchivingClientId(null);
    }
  }

  function openClient(client: Client) {
    setBusinessId(client.id);
    setMessage(`${client.name} selected. You can now open client books from the sidebar.`);
  }

  if (loading) {
    return (
      <AppShell>
        <div className="mx-auto max-w-7xl px-4 py-10">
          <Card>
            <p className="text-sm text-slate-600">Loading firm workspace...</p>
          </Card>
        </div>
      </AppShell>
    );
  }

  const clientLimitReached = data ? data.clientSlotsUsed >= data.clientSlotLimit : false;

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-8">
        <div className="flex flex-col justify-between gap-4 rounded-3xl bg-slate-950 p-6 text-white shadow-sm md:flex-row md:items-center">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-emerald-300">
              Firm command center
            </p>
            <h1 className="mt-2 text-3xl font-bold">
              {data?.firm.name || 'ProBiz Consultants'}
            </h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-300">
              Manage client companies, partner access, missing documents, AI approvals, and monthly
              accounting workflows from one shared firm workspace.
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-slate-300">Current plan</p>
            <p className="mt-1 text-lg font-semibold">{data?.firm.planName || 'Partner Beta'}</p>
          </div>
        </div>

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {message && (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {message}
          </div>
        )}

        {data && (
          <>
            <div className="grid gap-4 md:grid-cols-4">
              <Metric
                label="Client slots"
                value={`${data.clientSlotsUsed}/${data.clientSlotLimit}`}
                detail="Active client companies"
              />
              <Metric
                label="Firm users"
                value={`${data.members.length}/${data.firm.firmUserLimit}`}
                detail="Partners connected"
              />
              <Metric
                label="AI approvals"
                value={String(data.pendingAiActions || 0)}
                detail="Pending accountant review"
              />
              <Metric
                label="Missing docs"
                value={String(data.missingDocuments || 0)}
                detail="Expenses without receipts"
              />
            </div>

            <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
              <Card>
                <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
                  <div>
                    <h2 className="text-xl font-bold text-slate-900">Client companies</h2>
                    <p className="text-sm text-slate-500">
                      Add real beta clients here. Each client keeps separate books.
                    </p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                    {data.clients.length} active
                  </span>
                </div>

                <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-4 py-3">Client</th>
                        <th className="px-4 py-3">Type</th>
                        <th className="px-4 py-3">Next action</th>
                        <th className="px-4 py-3 text-right">Actions</th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-slate-100">
                      {data.clients.map((client) => (
                        <tr key={client.id} className="bg-white">
                          <td className="px-4 py-3">
                            <p className="font-semibold text-slate-900">{client.name}</p>
                            <p className="text-xs text-slate-500">{client.city || 'City not set'}</p>
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            {client.businessType || '-'}
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            {client.nextDeadline
                              ? `${client.nextDeadline.title} (${new Date(
                                  client.nextDeadline.dueDate,
                                ).toLocaleDateString('en-PK')})`
                              : 'Monthly close'}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => openClient(client)}
                                className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700"
                              >
                                Open
                              </button>

                              <button
                                type="button"
                                onClick={() => archiveClient(client)}
                                disabled={archivingClientId === client.id}
                                className="rounded-xl border border-red-200 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {archivingClientId === client.id ? 'Archiving...' : 'Archive'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}

                      {!data.clients.length && (
                        <tr>
                          <td colSpan={4} className="px-4 py-8 text-center text-sm text-slate-500">
                            No clients yet. Add your first test client from the form on the right.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>

              <Card>
                <h2 className="text-xl font-bold text-slate-900">Add client company</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Create a separate company workspace for each SME client.
                </p>

                <form onSubmit={addClient} className="mt-5 space-y-3">
                  <Input
                    placeholder="Client business name"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    required
                    disabled={creatingClient}
                  />

                  <Select
                    value={form.businessType}
                    onChange={(e) => setForm({ ...form, businessType: e.target.value })}
                    disabled={creatingClient}
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
                    disabled={creatingClient}
                  >
                    <option value="INDIVIDUAL">Individual</option>
                    <option value="SOLE_PROPRIETOR">Sole Proprietor</option>
                    <option value="AOP">AOP</option>
                    <option value="PVT_LTD">Private Limited</option>
                  </Select>

                  <Input
                    placeholder="City"
                    value={form.city}
                    onChange={(e) => setForm({ ...form, city: e.target.value })}
                    disabled={creatingClient}
                  />

                  <Input
                    placeholder="NTN"
                    value={form.ntn}
                    onChange={(e) => setForm({ ...form, ntn: e.target.value })}
                    disabled={creatingClient}
                  />

                  <Input
                    placeholder="STRN"
                    value={form.strn}
                    onChange={(e) => setForm({ ...form, strn: e.target.value })}
                    disabled={creatingClient}
                  />

                  <Input
                    placeholder="Client owner email optional"
                    value={form.clientOwnerEmail}
                    onChange={(e) => setForm({ ...form, clientOwnerEmail: e.target.value })}
                    disabled={creatingClient}
                  />

                  <Button
                    type="submit"
                    disabled={creatingClient || clientLimitReached}
                    className="w-full disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {creatingClient
                      ? 'Creating...'
                      : clientLimitReached
                        ? 'Client limit reached'
                        : 'Create Client'}
                  </Button>
                </form>
              </Card>
            </div>

            <Card>
              <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
                <div>
                  <h2 className="text-xl font-bold text-slate-900">Firm users</h2>
                  <p className="text-sm text-slate-500">
                    Connected partners inside this shared firm workspace.
                  </p>
                </div>

                <form onSubmit={inviteFirmMember} className="flex w-full gap-2 md:w-auto">
                  <Input
                    type="email"
                    placeholder="partner@email.com"
                    value={memberEmail}
                    onChange={(e) => setMemberEmail(e.target.value)}
                    required
                    disabled={invitingMember}
                  />

                  <Button
                    type="submit"
                    disabled={invitingMember}
                    className="disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {invitingMember ? 'Inviting...' : 'Invite'}
                  </Button>
                </form>
              </div>

              <div className="mt-5 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {data.members.map((member) => (
                  <div key={member.id} className="rounded-2xl border border-slate-200 p-4">
                    <p className="font-semibold text-slate-900">{member.user.name}</p>
                    <p className="text-sm text-slate-500">{member.user.email}</p>
                    <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-emerald-700">
                      {member.role.replaceAll('_', ' ')}
                    </p>
                  </div>
                ))}
              </div>
            </Card>

            <div className="flex justify-end">
              <Link
                href="/dashboard"
                className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Go to selected client dashboard
              </Link>
            </div>
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
    <Card>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-bold text-slate-900">{value}</p>
      <p className="mt-1 text-sm text-slate-500">{detail}</p>
    </Card>
  );
}
