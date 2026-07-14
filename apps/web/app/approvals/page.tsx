'use client';

import { useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { Card } from '@/components/Card';
import { api, getBusinessId } from '@/lib/api';

type Client = {
  id: string;
  name: string;
};

type AiAction = {
  id: string;
  businessId: string;
  actionType: string;
  prompt?: string | null;
  proposedPayloadJson?: unknown;
  confidenceScore?: string | number;
  status: string;
  requiresConfirmation?: boolean;
  requiresAccountantReview?: boolean;
  resultJson?: unknown;
  createdAt: string;
  updatedAt?: string;
};

type ActionRow = AiAction & {
  businessName: string;
};

type StatusFilter = 'all' | 'pending' | 'approved' | 'rejected';

const statusOptions: StatusFilter[] = ['all', 'pending', 'approved', 'rejected'];

export default function ApprovalsPage() {
  const [actions, setActions] = useState<ActionRow[]>([]);
  const [mode, setMode] = useState<'firm' | 'client'>('client');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    setError('');

    try {
      try {
        const clients = await api<Client[]>('/firm/clients');
        const results = await Promise.allSettled(
          clients.map(async (client) => {
            const clientActions = await api<AiAction[]>(`/ai/businesses/${client.id}/actions`);
            return clientActions.map((action) => ({
              ...action,
              businessName: client.name,
            }));
          }),
        );

        setMode('firm');
        setActions(
          results.flatMap((result) =>
            result.status === 'fulfilled' ? result.value : [],
          ),
        );
        return;
      } catch {
        // Client users cannot load the firm-wide client list.
      }

      const businessId = getBusinessId();

      if (!businessId) {
        setMode('client');
        setActions([]);
        setError('Select a client company before viewing AI approvals.');
        return;
      }

      const clientActions = await api<AiAction[]>(`/ai/businesses/${businessId}/actions`);
      setMode('client');
      setActions(
        clientActions.map((action) => ({
          ...action,
          businessName: 'Selected client',
        })),
      );
    } catch (loadError) {
      setActions([]);
      setError(loadError instanceof Error ? loadError.message : 'Could not load approvals');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const queryStatus = new URLSearchParams(window.location.search).get('status');

    if (queryStatus && statusOptions.includes(queryStatus as StatusFilter)) {
      setStatus(queryStatus as StatusFilter);
    }

    void load();
    window.addEventListener('pakbooks-business-changed', load);

    return () => {
      window.removeEventListener('pakbooks-business-changed', load);
    };
  }, []);

  const filteredActions = useMemo(() => {
    const ordered = [...actions].sort(
      (left, right) =>
        new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
    );

    if (status === 'all') {
      return ordered;
    }

    return ordered.filter(
      (action) => String(action.status || '').toLowerCase() === status,
    );
  }, [actions, status]);

  const pendingCount = actions.filter(
    (action) => String(action.status || '').toLowerCase() === 'pending',
  ).length;

  function changeStatus(nextStatus: StatusFilter) {
    setStatus(nextStatus);
    const url = nextStatus === 'all' ? '/approvals' : `/approvals?status=${nextStatus}`;
    window.history.replaceState({}, '', url);
  }

  async function approve(action: ActionRow) {
    if (busyId || String(action.status).toLowerCase() !== 'pending') {
      return;
    }

    setBusyId(action.id);
    setMessage('');
    setError('');

    try {
      await api(`/ai/businesses/${action.businessId}/actions/${action.id}/approve`, {
        method: 'POST',
      });
      setMessage('AI action approved and processed.');
      await load();
    } catch (approveError) {
      setError(
        approveError instanceof Error ? approveError.message : 'Could not approve AI action',
      );
    } finally {
      setBusyId('');
    }
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-8">
        <div className="flex flex-col justify-between gap-4 rounded-3xl bg-slate-950 p-6 text-white shadow-sm md:flex-row md:items-center">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-emerald-300">
              Review queue
            </p>
            <h1 className="mt-2 text-3xl font-bold">AI Approvals</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-300">
              {mode === 'firm'
                ? 'Review AI-generated accounting actions across all active firm clients.'
                : 'Review AI-generated actions for the selected client company.'}
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/10 px-5 py-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-300">
              Pending review
            </p>
            <p className="mt-1 text-3xl font-bold">{pendingCount}</p>
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

        <Card>
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
            <div>
              <h2 className="text-xl font-bold text-slate-900">Approval queue</h2>
              <p className="mt-1 text-sm text-slate-500">
                {filteredActions.length} action{filteredActions.length === 1 ? '' : 's'} shown
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {statusOptions.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => changeStatus(option)}
                  className={`rounded-xl px-3 py-2 text-xs font-semibold capitalize ${
                    status === option
                      ? 'bg-slate-900 text-white'
                      : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>
        </Card>

        {loading ? (
          <Card>
            <p className="text-sm text-slate-600">Loading AI approvals...</p>
          </Card>
        ) : filteredActions.length ? (
          <div className="space-y-4">
            {filteredActions.map((action) => (
              <Card key={action.id}>
                <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-start">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-bold text-slate-900">
                        {humanize(action.actionType)}
                      </h3>
                      <StatusBadge status={action.status} />
                      {action.requiresAccountantReview && (
                        <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700">
                          Accountant review
                        </span>
                      )}
                    </div>

                    <div className="mt-3 grid gap-3 text-sm text-slate-600 md:grid-cols-3">
                      <Info label="Client" value={action.businessName} />
                      <Info label="Created" value={formatDate(action.createdAt)} />
                      <Info
                        label="Confidence"
                        value={formatConfidence(action.confidenceScore)}
                      />
                    </div>

                    {action.prompt && (
                      <p className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
                        <span className="font-semibold text-slate-800">Prompt:</span>{' '}
                        {action.prompt}
                      </p>
                    )}

                    <div className="mt-4 rounded-2xl border border-slate-200 p-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                        Proposed accounting action
                      </p>
                      <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">
                        {payloadSummary(action.proposedPayloadJson)}
                      </p>
                    </div>
                  </div>

                  <div className="w-full lg:w-64">
                    {String(action.status).toLowerCase() === 'pending' ? (
                      <button
                        type="button"
                        onClick={() => void approve(action)}
                        disabled={Boolean(busyId)}
                        className="w-full rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {busyId === action.id ? 'Approving...' : 'Approve action'}
                      </button>
                    ) : (
                      <p className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-center text-sm font-semibold text-slate-600">
                        This action is {String(action.status).toLowerCase()}.
                      </p>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <div className="py-10 text-center">
              <h3 className="text-lg font-bold text-slate-900">No approvals found</h3>
              <p className="mt-2 text-sm text-slate-500">
                There are no AI actions matching the selected status filter.
              </p>
            </div>
          </Card>
        )}
      </div>
    </AppShell>
  );
}

function humanize(value: string) {
  return String(value || 'AI action')
    .replaceAll('_', ' ')
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDate(value?: string | null) {
  if (!value) {
    return '-';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '-';
  }

  return new Intl.DateTimeFormat('en-PK', {
    timeZone: 'Asia/Karachi',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function formatConfidence(value?: string | number) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return '-';
  }

  return `${Math.round(number * 100)}%`;
}

function payloadSummary(value: unknown) {
  if (!value) {
    return 'No payload details available.';
  }

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value !== 'object' || Array.isArray(value)) {
    return String(value);
  }

  const payload = value as Record<string, unknown>;
  const preferredKeys = [
    'name',
    'type',
    'description',
    'explanation',
    'amount',
    'accountCode',
    'paymentMethod',
    'customerName',
    'vendorName',
  ];

  const lines = preferredKeys
    .filter((key) => payload[key] !== undefined && payload[key] !== null && payload[key] !== '')
    .map((key) => `${humanize(key)}: ${String(payload[key])}`);

  if (lines.length) {
    return lines.join('\n');
  }

  try {
    return JSON.stringify(payload, null, 2).slice(0, 2000);
  } catch {
    return 'Payload details could not be displayed.';
  }
}

function StatusBadge({ status }: { status: string }) {
  const normalized = String(status || 'pending').toLowerCase();
  const classes =
    normalized === 'approved'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
      : normalized === 'rejected'
        ? 'border-red-200 bg-red-50 text-red-700'
        : 'border-amber-200 bg-amber-50 text-amber-700';

  return (
    <span className={`rounded-full border px-2.5 py-1 text-xs font-bold uppercase ${classes}`}>
      {normalized}
    </span>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 font-semibold text-slate-800">{value}</p>
    </div>
  );
}
