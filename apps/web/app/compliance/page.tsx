'use client';

import { FormEvent, useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { ClientRequired } from '@/components/ClientRequired';
import { Button, Card, Input } from '@/components/Card';
import { api, getBusinessId } from '@/lib/api';

type Event = { id: string; title: string; authority: string; dueDate: string; status: string; notes?: string };

export default function CompliancePage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [title, setTitle] = useState('Sales tax return review');
  const [authority, setAuthority] = useState('FBR');
  const [dueDate, setDueDate] = useState('');

  async function load() {
    const businessId = getBusinessId();
    if (!businessId) return;
    setEvents(await api<Event[]>(`/compliance/businesses/${businessId}/events`));
  }

  useEffect(() => { load(); }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const businessId = getBusinessId();
    if (!businessId) return;
    await api(`/compliance/businesses/${businessId}/events`, { method: 'POST', body: JSON.stringify({ title, authority, dueDate }) });
    await load();
  }

  return (
    <AppShell>
      <ClientRequired>
      <h1 className="mb-2 text-3xl font-bold">Compliance Calendar</h1>
      <p className="mb-6 text-slate-600">FBR/SECP reminders are configurable and should be reviewed by accountant/CA.</p>
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-bold">Add reminder</h2>
          <form onSubmit={submit} className="grid gap-3">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" />
            <Input value={authority} onChange={(e) => setAuthority(e.target.value)} placeholder="Authority e.g. FBR" />
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} required />
            <Button>Add Reminder</Button>
          </form>
        </Card>
        <Card>
          <h2 className="mb-3 font-bold">Upcoming</h2>
          <div className="space-y-2">
            {events.map((event) => (
              <div key={event.id} className="rounded-2xl border p-3 text-sm">
                <b>{event.title}</b><br />{event.authority} — {new Date(event.dueDate).toLocaleDateString()} — {event.status}
              </div>
            ))}
            {!events.length && <p className="text-slate-500">No compliance reminders yet.</p>}
          </div>
        </Card>
      </div>
      </ClientRequired>
    </AppShell>
  );
}
