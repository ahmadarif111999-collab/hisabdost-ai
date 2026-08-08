'use client';

import {
  type ComponentType,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import * as AppShellModule from '../../components/AppShell';
import * as ClientRequiredModule from '../../components/ClientRequired';
import * as ApiModule from '../../lib/api';

const AppShell = ((AppShellModule as any).default ||
  (AppShellModule as any).AppShell) as ComponentType<{
  children: ReactNode;
}>;
const ClientRequired = ((ClientRequiredModule as any).default ||
  (ClientRequiredModule as any).ClientRequired) as ComponentType<{
  children: ReactNode;
}>;
const apiFetch = ((ApiModule as any).apiFetch ||
  (ApiModule as any).default) as (
  path: string,
  options?: RequestInit,
) => Promise<any>;

type RequestStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'exporting'
  | 'exported'
  | string;

type Person = {
  name?: string | null;
  email?: string | null;
};

type ReportRequest = {
  id: string;
  businessId: string;
  requestNo?: string;
  referenceNo?: string;
  reportRequestNo?: string;
  exportNo?: string | null;
  completedFilename?: string | null;
  completedAt?: string | null;
  reportType: string;
  status: RequestStatus;
  requestedAt?: string;
  createdAt?: string;
  decidedAt?: string | null;
  decisionNote?: string | null;
  requestedBy?: Person | null;
  decidedBy?: Person | null;
  requestedByName?: string | null;
  decidedByName?: string | null;
  business?: {
    name?: string | null;
    legalName?: string | null;
  } | null;
  filtersJson?: Record<string, any> | string | null;
  format?: string | null;
};

type AccessMode = 'firm' | 'client';

const STATUS_OPTIONS = [
  'all',
  'pending',
  'approved',
  'exporting',
  'exported',
  'rejected',
] as const;

function resolveBusinessId() {
  if (typeof window === 'undefined') return '';
  const directKeys = [
    'activeBusinessId',
    'selectedBusinessId',
    'businessId',
    'activeClientId',
  ];
  for (const key of directKeys) {
    const value = window.localStorage.getItem(key);
    if (value) return value;
  }
  for (const key of ['activeBusiness', 'selectedBusiness', 'activeClient']) {
    const value = window.localStorage.getItem(key);
    if (!value) continue;
    try {
      const parsed = JSON.parse(value);
      if (parsed?.id) return String(parsed.id);
      if (parsed?.businessId) return String(parsed.businessId);
    } catch {
      // Ignore invalid legacy values.
    }
  }
  return '';
}

function normalizeRequests(response: any): ReportRequest[] {
  const records = Array.isArray(response)
    ? response
    : response?.requests ||
      response?.items ||
      response?.data?.requests ||
      response?.data?.items ||
      response?.data ||
      [];
  return Array.isArray(records)
    ? records.filter((record) => record?.id && record?.businessId)
    : [];
}

function normalizedError(error: unknown) {
  if (error instanceof Error) return error.message;
  return 'The request could not be completed.';
}

function humanize(value: string) {
  return String(value || '')
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function pakistanDateTime(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Karachi',
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(date);
}

function personLabel(person?: Person | null, fallback?: string | null) {
  return person?.name || person?.email || fallback || 'Unknown user';
}

function jsonObject(value: ReportRequest['filtersJson']) {
  let parsed: Record<string, any> = {};
  if (!value) return parsed;
  if (typeof value === 'string') {
    try {
      const candidate = JSON.parse(value);
      parsed =
        candidate && typeof candidate === 'object' ? candidate : {};
    } catch {
      return {};
    }
  } else {
    parsed = value;
  }

  const nested =
    parsed.filters &&
    typeof parsed.filters === 'object' &&
    !Array.isArray(parsed.filters)
      ? parsed.filters
      : {};
  return { ...nested, ...parsed };
}

function triggerDownload(base64: string, filename: string, mimeType: string) {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  const blob = new Blob([bytes], { type: mimeType });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.URL.revokeObjectURL(url);
}

function statusClass(status: string) {
  switch (status) {
    case 'approved':
      return 'border-blue-200 bg-blue-50 text-blue-800';
    case 'exporting':
      return 'border-amber-200 bg-amber-50 text-amber-800';
    case 'exported':
      return 'border-emerald-200 bg-emerald-50 text-emerald-800';
    case 'rejected':
      return 'border-red-200 bg-red-50 text-red-800';
    default:
      return 'border-slate-200 bg-slate-50 text-slate-700';
  }
}

export default function ReportRequestsPage() {
  const [businessId, setBusinessId] = useState('');
  const [mode, setMode] = useState<AccessMode>('client');
  const [requests, setRequests] = useState<ReportRequest[]>([]);
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_OPTIONS)[number]>(
    'all',
  );
  const [search, setSearch] = useState('');
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const updateBusiness = (event?: Event) => {
      const custom = event as CustomEvent<any> | undefined;
      const eventBusinessId =
        custom?.detail?.businessId || custom?.detail?.id || '';
      setBusinessId(String(eventBusinessId || resolveBusinessId()));
    };
    updateBusiness();
    window.addEventListener('storage', updateBusiness);
    window.addEventListener('businessChanged', updateBusiness);
    window.addEventListener('activeBusinessChanged', updateBusiness);
    window.addEventListener('clientChanged', updateBusiness);
    return () => {
      window.removeEventListener('storage', updateBusiness);
      window.removeEventListener('businessChanged', updateBusiness);
      window.removeEventListener('activeBusinessChanged', updateBusiness);
      window.removeEventListener('clientChanged', updateBusiness);
    };
  }, []);

  const loadRequests = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      try {
        const firmResponse = await apiFetch('/firm/report-export-requests');
        setRequests(normalizeRequests(firmResponse));
        setMode('firm');
      } catch (firmError) {
        if (!businessId) throw firmError;
        const clientResponse = await apiFetch(
          `/accounting/businesses/${businessId}/reporting/export-requests`,
        );
        setRequests(normalizeRequests(clientResponse));
        setMode('client');
      }
    } catch (requestError) {
      setRequests([]);
      setError(normalizedError(requestError));
    } finally {
      setLoading(false);
    }
  }, [businessId]);

  useEffect(() => {
    void loadRequests();
  }, [loadRequests]);

  const decide = useCallback(
    async (request: ReportRequest, decision: 'approved' | 'rejected') => {
      setWorkingId(request.id);
      setError('');
      setMessage('');
      try {
        const result = await apiFetch(
          `/accounting/businesses/${request.businessId}/reporting/export-requests/${request.id}/decision`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              decision,
              decisionNote: notes[request.id]?.trim() || undefined,
            }),
          },
        );
        const requestNo =
          result?.requestNo ||
          result?.referenceNo ||
          result?.request?.requestNo ||
          request.requestNo ||
          request.referenceNo;
        setMessage(
          result?.message ||
            `${requestNo || 'Report request'} ${decision}.`,
        );
        await loadRequests();
      } catch (requestError) {
        setError(normalizedError(requestError));
      } finally {
        setWorkingId('');
      }
    },
    [loadRequests, notes],
  );

  const download = useCallback(
    async (request: ReportRequest) => {
      setWorkingId(request.id);
      setError('');
      setMessage('');
      try {
        const result = await apiFetch(
          `/accounting/businesses/${request.businessId}/xlsx/approved-request/${request.id}`,
          { method: 'POST' },
        );
        const base64 =
          result?.base64 || result?.contentBase64 || result?.fileBase64;
        if (!base64 || !result?.filename) {
          throw new Error('The approved export response did not include a file.');
        }
        triggerDownload(
          base64,
          result.filename,
          result.mimeType ||
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        );
        setMessage(
          result?.message ||
            `${result?.requestNo || request.requestNo || 'Request'} completed as ${
              result?.exportNo || result?.referenceNo || 'an EX export'
            }.`,
        );
        await loadRequests();
      } catch (requestError) {
        setError(normalizedError(requestError));
      } finally {
        setWorkingId('');
      }
    },
    [loadRequests],
  );

  const filteredRequests = useMemo(() => {
    const query = search.trim().toLowerCase();
    return requests.filter((request) => {
      if (statusFilter !== 'all' && request.status !== statusFilter) {
        return false;
      }
      if (!query) return true;
      const filters = jsonObject(request.filtersJson);
      const values = [
        request.requestNo,
        request.referenceNo,
        request.reportRequestNo,
        request.exportNo,
        request.reportType,
        request.status,
        request.business?.name,
        request.business?.legalName,
        personLabel(request.requestedBy, request.requestedByName),
        personLabel(request.decidedBy, request.decidedByName),
        filters.startDate,
        filters.endDate,
        filters.accountName,
      ];
      return values.some((value) =>
        String(value || '').toLowerCase().includes(query),
      );
    });
  }, [requests, search, statusFilter]);

  const metrics = useMemo(() => {
    return {
      total: requests.length,
      pending: requests.filter((request) => request.status === 'pending').length,
      approved: requests.filter((request) => request.status === 'approved').length,
      exported: requests.filter((request) => request.status === 'exported').length,
      rejected: requests.filter((request) => request.status === 'rejected').length,
    };
  }, [requests]);

  return (
    <AppShell>
      <ClientRequired>
        <main className="mx-auto w-full max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  {mode === 'firm' ? 'Firm approval queue' : 'Client requests'}
                </p>
                <h1 className="mt-1 text-2xl font-bold text-slate-950">
                  Report export requests
                </h1>
                <p className="mt-2 max-w-3xl text-sm text-slate-600">
                  Each approval request keeps its permanent RPT reference. A
                  completed workbook receives a separate permanent EX reference.
                </p>
              </div>
              <button
                type="button"
                onClick={loadRequests}
                disabled={loading}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 disabled:opacity-50"
              >
                {loading ? 'Refreshing…' : 'Refresh'}
              </button>
            </div>
          </section>

          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {Object.entries(metrics).map(([label, value]) => (
              <button
                key={label}
                type="button"
                onClick={() =>
                  setStatusFilter(
                    label === 'total'
                      ? 'all'
                      : (label as (typeof STATUS_OPTIONS)[number]),
                  )
                }
                className="rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-slate-300"
              >
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {humanize(label)}
                </p>
                <p className="mt-2 text-2xl font-bold text-slate-950">
                  {Number(value).toLocaleString('en-US')}
                </p>
              </button>
            ))}
          </section>

          <section className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-[220px_1fr]">
            <select
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(
                  event.target.value as (typeof STATUS_OPTIONS)[number],
                )
              }
              className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none ring-blue-500 focus:ring-2"
            >
              {STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {status === 'all' ? 'All statuses' : humanize(status)}
                </option>
              ))}
            </select>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search RPT, EX, report, client, or requester…"
              className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none ring-blue-500 focus:ring-2"
            />
          </section>

          {error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {error}
            </div>
          ) : null}
          {message ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              {message}
            </div>
          ) : null}

          {loading ? (
            <section className="rounded-2xl border border-slate-200 bg-white px-6 py-14 text-center text-sm text-slate-500 shadow-sm">
              Loading report requests…
            </section>
          ) : filteredRequests.length ? (
            <section className="space-y-4">
              {filteredRequests.map((request) => {
                const filters = jsonObject(request.filtersJson);
                const requestNo =
                  request.requestNo ||
                  request.referenceNo ||
                  request.reportRequestNo ||
                  'RPT reference pending';
                const canDecide = mode === 'firm' && request.status === 'pending';
                const canDownload = ['approved', 'exported'].includes(
                  request.status,
                );
                const busy = workingId === request.id;

                return (
                  <article
                    key={request.id}
                    className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-lg bg-slate-950 px-2.5 py-1 font-mono text-sm font-semibold text-white">
                            {requestNo}
                          </span>
                          <span
                            className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClass(
                              request.status,
                            )}`}
                          >
                            {humanize(request.status)}
                          </span>
                          {request.exportNo ? (
                            <span className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 font-mono text-sm font-semibold text-emerald-800">
                              {request.exportNo}
                            </span>
                          ) : null}
                        </div>
                        <h2 className="mt-3 text-lg font-bold text-slate-950">
                          {humanize(request.reportType)}
                        </h2>
                        <p className="mt-1 text-sm text-slate-600">
                          {request.business?.name ||
                            request.business?.legalName ||
                            'Selected client'}
                        </p>
                      </div>
                      <div className="text-sm text-slate-600 lg:text-right">
                        <p>
                          Requested by{' '}
                          <span className="font-semibold text-slate-900">
                            {personLabel(
                              request.requestedBy,
                              request.requestedByName,
                            )}
                          </span>
                        </p>
                        <p className="mt-1">
                          {pakistanDateTime(
                            request.requestedAt || request.createdAt,
                          )}{' '}
                          PKT
                        </p>
                      </div>
                    </div>

                    <dl className="mt-5 grid gap-3 rounded-xl bg-slate-50 p-4 sm:grid-cols-2 lg:grid-cols-4">
                      <div>
                        <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Start date
                        </dt>
                        <dd className="mt-1 text-sm font-medium text-slate-900">
                          {filters.startDate || filters.fromDate || 'Not specified'}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          End / as-of date
                        </dt>
                        <dd className="mt-1 text-sm font-medium text-slate-900">
                          {filters.endDate ||
                            filters.toDate ||
                            filters.asOfDate ||
                            'Not specified'}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Format
                        </dt>
                        <dd className="mt-1 text-sm font-medium text-slate-900">
                          {(request.format || 'XLSX').toUpperCase()}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Decision / completion
                        </dt>
                        <dd className="mt-1 text-sm font-medium text-slate-900">
                          {request.completedAt
                            ? `${pakistanDateTime(request.completedAt)} PKT`
                            : request.decidedAt
                              ? `${pakistanDateTime(request.decidedAt)} PKT`
                              : 'Pending'}
                        </dd>
                      </div>
                    </dl>

                    {request.decisionNote ? (
                      <div className="mt-4 rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-700">
                        <span className="font-semibold text-slate-900">
                          Decision note:
                        </span>{' '}
                        {request.decisionNote}
                        {request.decidedBy || request.decidedByName ? (
                          <span className="text-slate-500">
                            {' '}
                            —{' '}
                            {personLabel(
                              request.decidedBy,
                              request.decidedByName,
                            )}
                          </span>
                        ) : null}
                      </div>
                    ) : null}

                    {canDecide ? (
                      <div className="mt-4 space-y-3">
                        <label className="block">
                          <span className="text-sm font-semibold text-slate-800">
                            Decision note (optional)
                          </span>
                          <textarea
                            value={notes[request.id] || ''}
                            onChange={(event) =>
                              setNotes((current) => ({
                                ...current,
                                [request.id]: event.target.value,
                              }))
                            }
                            rows={2}
                            placeholder="Add an approval or rejection note for the audit trail."
                            className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none ring-blue-500 focus:ring-2"
                          />
                        </label>
                        <div className="flex flex-wrap gap-3">
                          <button
                            type="button"
                            onClick={() => decide(request, 'approved')}
                            disabled={busy}
                            className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                          >
                            {busy ? 'Working…' : `Approve ${requestNo}`}
                          </button>
                          <button
                            type="button"
                            onClick={() => decide(request, 'rejected')}
                            disabled={busy}
                            className="rounded-xl bg-red-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                          >
                            {busy ? 'Working…' : `Reject ${requestNo}`}
                          </button>
                        </div>
                      </div>
                    ) : null}

                    {canDownload ? (
                      <div className="mt-4 flex flex-wrap items-center gap-3">
                        <button
                          type="button"
                          onClick={() => download(request)}
                          disabled={busy || request.status === 'exporting'}
                          className="rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                        >
                          {busy
                            ? 'Preparing export…'
                            : request.exportNo
                              ? `Download ${request.exportNo}`
                              : `Generate approved export for ${requestNo}`}
                        </button>
                        {request.completedFilename ? (
                          <span className="break-all text-xs text-slate-500">
                            {request.completedFilename}
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </section>
          ) : (
            <section className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center text-sm text-slate-500">
              No report requests match the selected filters.
            </section>
          )}
        </main>
      </ClientRequired>
    </AppShell>
  );
}
