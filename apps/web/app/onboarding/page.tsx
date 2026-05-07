'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { Button, Card, Input, Select } from '@/components/Card';
import { api, setBusinessId } from '@/lib/api';

export default function OnboardingPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    name: '',
    businessType: 'Retail',
    entityType: 'SOLE_PROPRIETOR',
    city: '',
    ntn: '',
    strn: '',
    isSalesTaxRegistered: false,
    isSecpRegistered: false,
  });
  const [error, setError] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      const business = await api<{ id: string }>('/businesses', { method: 'POST', body: JSON.stringify(form) });
      setBusinessId(business.id);
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create business');
    }
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl">
        <h1 className="mb-2 text-3xl font-bold">Add client company</h1>
        <p className="mb-6 text-slate-600">Client profile se reports aur compliance reminders better banenge.</p>
        <Card>
          <form onSubmit={submit} className="grid gap-4">
            <Input placeholder="Business name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            <Input placeholder="City" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
            <Select value={form.businessType} onChange={(e) => setForm({ ...form, businessType: e.target.value })}>
              <option>Retail</option>
              <option>Restaurant/Cafe</option>
              <option>Freelancer</option>
              <option>Agency</option>
              <option>Import/Export</option>
              <option>Services</option>
            </Select>
            <Select value={form.entityType} onChange={(e) => setForm({ ...form, entityType: e.target.value })}>
              <option value="INDIVIDUAL">Individual</option>
              <option value="SOLE_PROPRIETOR">Sole Proprietor</option>
              <option value="AOP">AOP</option>
              <option value="PVT_LTD">Private Limited</option>
            </Select>
            <Input placeholder="NTN optional" value={form.ntn} onChange={(e) => setForm({ ...form, ntn: e.target.value })} />
            <Input placeholder="STRN optional" value={form.strn} onChange={(e) => setForm({ ...form, strn: e.target.value })} />
            <label className="flex items-center gap-2 rounded-2xl border p-3">
              <input type="checkbox" checked={form.isSalesTaxRegistered} onChange={(e) => setForm({ ...form, isSalesTaxRegistered: e.target.checked })} />
              Sales tax registered
            </label>
            <label className="flex items-center gap-2 rounded-2xl border p-3">
              <input type="checkbox" checked={form.isSecpRegistered} onChange={(e) => setForm({ ...form, isSecpRegistered: e.target.checked })} />
              SECP registered company
            </label>
            {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
            <Button>Create client company</Button>
          </form>
        </Card>
      </div>
    </AppShell>
  );
}
