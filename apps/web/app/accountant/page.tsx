'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { AppShell } from '@/components/AppShell';
import { ClientRequired } from '@/components/ClientRequired';
import { Button, Card, Input, Select } from '@/components/Card';
import { api, getBusinessId } from '@/lib/api';

export default function AccountantPage() {
  const [clientEmail, setClientEmail] = useState('');
  const [clientRole, setClientRole] = useState('CLIENT_OWNER');
  const [firmEmail, setFirmEmail] = useState('');
  const [message, setMessage] = useState('');

  async function inviteClient(e: FormEvent) {
    e.preventDefault();
    const businessId = getBusinessId();
    if (!businessId) return setMessage('Please select a client company first.');
    await api(`/firm/clients/${businessId}/users/invite`, { method: 'POST', body: JSON.stringify({ email: clientEmail, role: clientRole }) });
    setClientEmail('');
    setMessage('Client user access granted. They will only see this selected company.');
  }

  async function inviteFirm(e: FormEvent) {
    e.preventDefault();
    await api('/firm/members/invite', { method: 'POST', body: JSON.stringify({ email: firmEmail, role: 'FIRM_PARTNER' }) });
    setFirmEmail('');
    setMessage('Firm member access granted. They can work across firm client companies.');
  }

  return (
    <AppShell>
      <ClientRequired>
      <h1 className="mb-2 text-3xl font-bold">Users & Access</h1>
      <p className="mb-6 text-slate-600">Firm users can manage clients. Client users only access their own selected company.</p>
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-bold">Invite client user</h2>
          <p className="mb-3 text-sm text-slate-600">Use this for business owner/cashier/staff of the currently selected client company.</p>
          <form onSubmit={inviteClient} className="grid gap-3">
            <Input type="email" value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} placeholder="client@email.com" required />
            <Select value={clientRole} onChange={(e) => setClientRole(e.target.value)}>
              <option value="CLIENT_OWNER">Client Owner</option>
              <option value="CLIENT_STAFF">Client Staff</option>
              <option value="VIEWER">Viewer</option>
            </Select>
            <Button>Grant Client Access</Button>
          </form>
          <p className="mt-3 rounded-2xl bg-amber-50 p-3 text-xs text-amber-800">MVP note: user must register first with this email. Email invitation sending can be added next.</p>
        </Card>
        <Card>
          <h2 className="mb-3 font-bold">Invite firm partner</h2>
          <p className="mb-3 text-sm text-slate-600">Use this for you, co-partners, and firm bookkeepers who can work across clients.</p>
          <form onSubmit={inviteFirm} className="grid gap-3">
            <Input type="email" value={firmEmail} onChange={(e) => setFirmEmail(e.target.value)} placeholder="partner@email.com" required />
            <Button>Grant Firm Access</Button>
          </form>
          <Link href="/firm" className="mt-4 inline-block text-sm text-brand-700">View firm dashboard</Link>
        </Card>
      </div>
      {message && <p className="mt-4 rounded-xl bg-brand-50 p-3 text-brand-700">{message}</p>}
      </ClientRequired>
    </AppShell>
  );
}
