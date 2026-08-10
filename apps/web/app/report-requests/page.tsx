'use client';

import Link from 'next/link';

import {
  useEffect,
  useMemo,
  useState,
} from 'react';

import { AppShell } from '@/components/AppShell';

import {
  Card,
  Input,
} from '@/components/Card';

import {
  api,
  downloadBase64File,
  getBusinessId,
} from '@/lib/api';

type Person = {
  name?:
    | string
    | null;

  email?:
    | string
    | null;
};

type Business = {
  id: string;

  name: string;
};

type ExportRequest = {
  id: string;

  businessId: string;

  reportType: string;

  format: string;

  status: string;

  reason?:
    | string
    | null;

  decisionNote?:
    | string
    | null;

  dateFrom?:
    | string
    | null;

  dateTo?:
    | string
    | null;

  createdAt: string;

  updatedAt: string;

  business?: Business;

  requestedBy?:
    | Person
    | null;

  decidedBy?:
    | Person
    | null;

  requestedByName?:
    | string
    | null;

  decidedByName?:
    | string
    | null;

  requestNo?: string;

  referenceNo?: string;

  reportRequestNo?: string;

  exportNo?:
    | string
    | null;

  completedFilename?:
    | string
    | null;

  completedAt?:
    | string
    | null;
};

type RequestListResponse = {
  isFirmUser: boolean;

  clientRole?:
    | string
    | null;

  canExportDirectly: boolean;

  canRequestExport: boolean;

  requests:
    ExportRequest[];
};

type DecisionResponse = {
  message?: string;

  requestNo?: string;

  referenceNo?: string;

  request?:
    ExportRequest;
};

type ExportResponse = {
  requestNo?: string;

  reportRequestNo?: string;

  exportNo?: string;

  referenceNo?: string;

  filename: string;

  mimeType: string;

  contentBase64: string;

  message?: string;
};

const statusOptions = [
  'all',
  'pending',
  'approved',
  'rejected',
  'exporting',
  'exported',
];

function reportLabel(
  value: string,
) {
  return String(
    value || 'report',
  )
    .replace(
      /[_-]+/g,
      ' ',
    )
    .replace(
      /\b\w/g,
      (letter) =>
        letter.toUpperCase(),
    );
}

function formatDate(
  value?:
    | string
    | null,

  includeTime = false,
) {
  if (!value) {
    return '-';
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return '-';
  }

  const options:
    Intl.DateTimeFormatOptions =
    {
      timeZone:
        'Asia/Karachi',

      day: '2-digit',

      month: 'short',

      year: 'numeric',
    };

  if (includeTime) {
    options.hour =
      '2-digit';

    options.minute =
      '2-digit';
  }

  return new Intl.DateTimeFormat(
    'en-PK',
    options,
  ).format(date);
}

function statusClasses(
  status: string,
) {
  switch (status) {
    case 'approved':
      return 'border-blue-200 bg-blue-50 text-blue-700';

    case 'rejected':
      return 'border-red-200 bg-red-50 text-red-700';

    case 'exported':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700';

    case 'exporting':
      return 'border-violet-200 bg-violet-50 text-violet-700';

    default:
      return 'border-amber-200 bg-amber-50 text-amber-800';
  }
}

function personLabel(
  person?:
    | Person
    | null,

  fallback?:
    | string
    | null,
) {
  return (
    person?.name ||
    person?.email ||
    fallback ||
    'Unknown user'
  );
}

function requestReference(
  request: ExportRequest,
) {
  return (
    request.requestNo ||
    request.referenceNo ||
    request.reportRequestNo ||
    'RPT reference pending'
  );
}

function normalizeFirmResponse(
  value:
    | ExportRequest[]
    | {
        requests?:
          ExportRequest[];
      },
) {
  if (
    Array.isArray(
      value,
    )
  ) {
    return value;
  }

  return (
    value?.requests ||
    []
  );
}

export default function ReportRequestsPage() {
  const [
    requests,
    setRequests,
  ] =
    useState<
      ExportRequest[]
    >([]);

  const [
    mode,
    setMode,
  ] =
    useState<
      'firm' | 'client'
    >('client');

  const [
    clientRole,
    setClientRole,
  ] =
    useState<
      string | null
    >(null);

  const [
    canExportDirectly,
    setCanExportDirectly,
  ] =
    useState(false);

  const [
    canRequestExport,
    setCanRequestExport,
  ] =
    useState(false);

  const [
    status,
    setStatus,
  ] =
    useState('all');

  const [
    search,
    setSearch,
  ] =
    useState('');

  const [
    decisionNotes,
    setDecisionNotes,
  ] =
    useState<
      Record<
        string,
        string
      >
    >({});

  const [
    busyId,
    setBusyId,
  ] =
    useState('');

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    message,
    setMessage,
  ] =
    useState('');

  const [
    error,
    setError,
  ] =
    useState('');

  async function load() {
    setError('');

    setLoading(true);

    try {
      try {
        const firmResponse =
          await api<
            | ExportRequest[]
            | {
                requests?:
                  ExportRequest[];
              }
          >(
            '/firm/report-export-requests',
          );

        setMode('firm');

        setClientRole(
          null,
        );

        setCanExportDirectly(
          true,
        );

        setCanRequestExport(
          false,
        );

        setRequests(
          normalizeFirmResponse(
            firmResponse,
          ),
        );

        return;
      } catch {
        // Client users cannot access
        // the firm-wide queue.
      }

      const businessId =
        getBusinessId();

      if (!businessId) {
        setMode(
          'client',
        );

        setRequests([]);

        setError(
          'Select a client company before viewing report export requests.',
        );

        return;
      }

      const result =
        await api<RequestListResponse>(
          `/accounting/businesses/${businessId}/reporting/export-requests`,
        );

      setMode(
        result.isFirmUser
          ? 'firm'
          : 'client',
      );

      setClientRole(
        result.clientRole ||
          null,
      );

      setCanExportDirectly(
        result.canExportDirectly,
      );

      setCanRequestExport(
        result.canRequestExport,
      );

      setRequests(
        result.requests ||
          [],
      );
    } catch (loadError) {
      setRequests([]);

      setError(
        loadError instanceof
          Error
          ? loadError.message
          : 'Could not load report export requests',
      );
    } finally {
      setLoading(
        false,
      );
    }
  }

  useEffect(() => {
    const queryStatus =
      new URLSearchParams(
        window.location.search,
      ).get(
        'status',
      );

    if (
      queryStatus &&
      statusOptions.includes(
        queryStatus,
      )
    ) {
      setStatus(
        queryStatus,
      );
    }

    void load();

    window.addEventListener(
      'pakbooks-business-changed',
      load,
    );

    return () => {
      window.removeEventListener(
        'pakbooks-business-changed',
        load,
      );
    };
  }, []);

  const filteredRequests =
    useMemo(() => {
      const query =
        search
          .trim()
          .toLowerCase();

      return requests.filter(
        (request) => {
          if (
            status !==
              'all' &&
            request.status !==
              status
          ) {
            return false;
          }

          if (!query) {
            return true;
          }

          return [
            requestReference(
              request,
            ),

            request.exportNo,

            request.reportType,

            request.status,

            request.business
              ?.name,

            request.requestedBy
              ?.name,

            request.requestedBy
              ?.email,

            request.requestedByName,

            request.decidedBy
              ?.name,

            request.decidedBy
              ?.email,

            request.decidedByName,
          ].some(
            (value) =>
              String(
                value || '',
              )
                .toLowerCase()
                .includes(
                  query,
                ),
          );
        },
      );
    }, [
      requests,
      search,
      status,
    ]);

  const pendingCount =
    requests.filter(
      (request) =>
        request.status ===
        'pending',
    ).length;

  const approvedCount =
    requests.filter(
      (request) =>
        request.status ===
        'approved',
    ).length;

  const exportedCount =
    requests.filter(
      (request) =>
        request.status ===
        'exported',
    ).length;

  async function decide(
    request:
      ExportRequest,

    decision:
      | 'approved'
      | 'rejected',
  ) {
    if (busyId) {
      return;
    }

    setBusyId(
      request.id,
    );

    setError('');

    setMessage('');

    try {
      const result =
        await api<DecisionResponse>(
          `/accounting/businesses/${request.businessId}/reporting/export-requests/${request.id}/decision`,
          {
            method: 'POST',

            body:
              JSON.stringify(
                {
                  decision,

                  decisionNote:
                    decisionNotes[
                      request.id
                    ] ||
                    undefined,
                },
              ),
          },
        );

      const reference =
        result.requestNo ||
        result.referenceNo ||
        result.request
          ?.requestNo ||
        result.request
          ?.referenceNo ||
        requestReference(
          request,
        );

      setMessage(
        result.message ||
          `${reference} ${decision}.`,
      );

      setDecisionNotes(
        (current) => ({
          ...current,

          [request.id]:
            '',
        }),
      );

      await load();
    } catch (decisionError) {
      setError(
        decisionError instanceof
          Error
          ? decisionError.message
          : `Could not ${decision} request`,
      );
    } finally {
      setBusyId('');
    }
  }

  async function downloadApproved(
    request:
      ExportRequest,
  ) {
    if (busyId) {
      return;
    }

    setBusyId(
      request.id,
    );

    setError('');

    setMessage('');

    try {
      const result =
        await api<ExportResponse>(
          `/accounting/businesses/${request.businessId}/xlsx/approved-request/${request.id}`,
          {
            method: 'POST',
          },
        );

      downloadBase64File(
        result.filename,
        result.mimeType,
        result.contentBase64,
      );

      setMessage(
        result.message ||
          `${result.requestNo || requestReference(request)} completed as ${
            result.exportNo ||
            result.referenceNo ||
            'an EX export'
          }.`,
      );

      await load();
    } catch (downloadError) {
      setError(
        downloadError instanceof
          Error
          ? downloadError.message
          : 'Could not export approved report',
      );
    } finally {
      setBusyId('');
    }
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-8">
        <section className="flex flex-col justify-between gap-4 rounded-3xl bg-slate-950 p-6 text-white shadow-sm md:flex-row md:items-center">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-emerald-300">
              Report controls
            </p>

            <h1 className="mt-2 text-3xl font-bold">
              Report Export
              Requests
            </h1>

            <p className="mt-2 max-w-3xl text-sm text-slate-300">
              {mode ===
              'firm'
                ? 'Review RPT-numbered requests, record an approval or rejection note, and keep completed EX references in the export trail.'
                : 'Track each RPT request and the EX reference assigned when an approved XLSX is completed.'}
            </p>
          </div>

          <Link
            href="/reports"
            className="rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-center text-sm font-semibold text-white hover:bg-white/15"
          >
            Open Report Builder
          </Link>
        </section>

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

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Metric
            label="All Requests"
            value={
              requests.length
            }
            detail={
              mode === 'firm'
                ? 'Firm-wide export queue'
                : 'Your client requests'
            }
          />

          <Metric
            label="Pending"
            value={
              pendingCount
            }
            detail="Waiting for decision"
          />

          <Metric
            label="Approved"
            value={
              approvedCount
            }
            detail="Ready for one-time export"
          />

          <Metric
            label="Exported"
            value={
              exportedCount
            }
            detail="Completed with EX reference"
          />
        </section>

        <Card>
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                {mode ===
                'firm'
                  ? 'Firm Approval Queue'
                  : 'Client Request History'}
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                {mode ===
                'firm'
                  ? 'Firm users can approve or reject pending report export requests.'
                  : canExportDirectly
                    ? 'Direct export is enabled for your role.'
                    : canRequestExport
                      ? 'Your role can request export approval.'
                      : clientRole
                        ? `Current client role: ${clientRole}`
                        : 'Report export permissions are controlled by the firm.'}
              </p>
            </div>

            <button
              type="button"
              onClick={() =>
                void load()
              }
              disabled={
                loading
              }
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              {loading
                ? 'Refreshing…'
                : 'Refresh'}
            </button>
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
            <Input
              value={
                search
              }
              onChange={(
                event,
              ) =>
                setSearch(
                  event.target
                    .value,
                )
              }
              placeholder="Search RPT, EX, report, client, requester…"
            />

            <div className="flex flex-wrap gap-2">
              {statusOptions.map(
                (
                  option,
                ) => (
                  <button
                    key={
                      option
                    }
                    type="button"
                    onClick={() =>
                      setStatus(
                        option,
                      )
                    }
                    className={`rounded-xl px-3 py-2 text-xs font-semibold capitalize ${
                      status ===
                      option
                        ? 'bg-slate-900 text-white'
                        : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {option}
                  </button>
                ),
              )}
            </div>
          </div>
        </Card>

        {loading ? (
          <Card>
            <p className="text-sm text-slate-600">
              Loading report
              requests…
            </p>
          </Card>
        ) : filteredRequests.length ? (
          <div className="space-y-4">
            {filteredRequests.map(
              (
                request,
              ) => {
                const reference =
                  requestReference(
                    request,
                  );

                return (
                  <Card
                    key={
                      request.id
                    }
                  >
                    <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-lg bg-slate-900 px-2.5 py-1 font-mono text-xs font-bold text-white">
                            {
                              reference
                            }
                          </span>

                          {request.exportNo && (
                            <span className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 font-mono text-xs font-bold text-emerald-700">
                              {
                                request.exportNo
                              }
                            </span>
                          )}

                          <span
                            className={`rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-wide ${statusClasses(
                              request.status,
                            )}`}
                          >
                            {
                              request.status
                            }
                          </span>
                        </div>

                        <h3 className="mt-3 text-lg font-bold text-slate-900">
                          {reportLabel(
                            request.reportType,
                          )}
                        </h3>

                        <div className="mt-3 grid gap-3 text-sm text-slate-600 md:grid-cols-2 xl:grid-cols-4">
                          <Info
                            label="Client"
                            value={
                              request.business
                                ?.name ||
                              'Selected client'
                            }
                          />

                          <Info
                            label="Requested by"
                            value={personLabel(
                              request.requestedBy,
                              request.requestedByName,
                            )}
                          />

                          <Info
                            label="Period"
                            value={`${formatDate(
                              request.dateFrom,
                            )} to ${formatDate(
                              request.dateTo,
                            )}`}
                          />

                          <Info
                            label="Requested"
                            value={formatDate(
                              request.createdAt,
                              true,
                            )}
                          />
                        </div>

                        {request.reason && (
                          <p className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
                            <span className="font-semibold text-slate-800">
                              Reason:
                            </span>{' '}
                            {
                              request.reason
                            }
                          </p>
                        )}

                        {request.decisionNote && (
                          <p className="mt-3 rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-600">
                            <span className="font-semibold text-slate-800">
                              Decision
                              note:
                            </span>{' '}
                            {
                              request.decisionNote
                            }
                          </p>
                        )}

                        {(request.decidedBy ||
                          request.decidedByName) && (
                          <p className="mt-2 text-xs text-slate-400">
                            Decided by{' '}
                            {personLabel(
                              request.decidedBy,
                              request.decidedByName,
                            )}
                          </p>
                        )}

                        {request.completedAt && (
                          <p className="mt-2 text-xs text-slate-400">
                            Completed{' '}
                            {formatDate(
                              request.completedAt,
                              true,
                            )}

                            {request.completedFilename
                              ? ` • ${request.completedFilename}`
                              : ''}
                          </p>
                        )}
                      </div>

                      <div className="w-full space-y-3 lg:w-80">
                        {mode ===
                          'firm' &&
                          request.status ===
                            'pending' && (
                            <>
                              <textarea
                                value={
                                  decisionNotes[
                                    request.id
                                  ] ||
                                  ''
                                }
                                onChange={(
                                  event,
                                ) =>
                                  setDecisionNotes(
                                    (
                                      current,
                                    ) => ({
                                      ...current,

                                      [request.id]:
                                        event
                                          .target
                                          .value,
                                    }),
                                  )
                                }
                                placeholder="Optional decision note"
                                rows={
                                  3
                                }
                                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-emerald-500"
                              />

                              <div className="grid grid-cols-2 gap-2">
                                <button
                                  type="button"
                                  onClick={() =>
                                    decide(
                                      request,
                                      'approved',
                                    )
                                  }
                                  disabled={
                                    busyId ===
                                    request.id
                                  }
                                  className="rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  {busyId ===
                                  request.id
                                    ? 'Saving…'
                                    : 'Approve'}
                                </button>

                                <button
                                  type="button"
                                  onClick={() =>
                                    decide(
                                      request,
                                      'rejected',
                                    )
                                  }
                                  disabled={
                                    busyId ===
                                    request.id
                                  }
                                  className="rounded-2xl border border-red-200 px-4 py-3 text-sm font-bold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  Reject
                                </button>
                              </div>
                            </>
                          )}

                        {mode ===
                          'client' &&
                          request.status ===
                            'approved' && (
                            <button
                              type="button"
                              onClick={() =>
                                downloadApproved(
                                  request,
                                )
                              }
                              disabled={
                                busyId ===
                                request.id
                              }
                              className="w-full rounded-2xl bg-slate-900 px-4 py-3 text-sm font-bold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {busyId ===
                              request.id
                                ? 'Preparing XLSX…'
                                : `Download approved ${reference}`}
                            </button>
                          )}

                        {mode ===
                          'firm' &&
                          request.status ===
                            'approved' && (
                            <p className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-700">
                              {
                                reference
                              }{' '}
                              is approved.
                              Waiting for
                              the requesting
                              client to use
                              the one-time
                              XLSX approval.
                            </p>
                          )}

                        {request.status ===
                          'exporting' && (
                          <p className="rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm font-semibold text-violet-700">
                            XLSX
                            generation is
                            currently in
                            progress.
                          </p>
                        )}

                        {request.status ===
                          'exported' && (
                          <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
                            Export
                            completed

                            {request.exportNo
                              ? ` as ${request.exportNo}`
                              : ''}
                            . The
                            one-time
                            approval has
                            been consumed.
                          </p>
                        )}
                      </div>
                    </div>
                  </Card>
                );
              },
            )}
          </div>
        ) : (
          <Card>
            <div className="py-10 text-center">
              <h3 className="text-lg font-bold text-slate-900">
                No report requests
                found
              </h3>

              <p className="mt-2 text-sm text-slate-500">
                Create a request
                from the Report
                Builder or adjust
                the status/search
                filter.
              </p>
            </div>
          </Card>
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

  value: number;

  detail: string;
}) {
  return (
    <Card>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </p>

      <p className="mt-2 text-3xl font-bold text-slate-900">
        {value}
      </p>

      <p className="mt-1 text-sm text-slate-500">
        {detail}
      </p>
    </Card>
  );
}

function Info({
  label,
  value,
}: {
  label: string;

  value: string;
}) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-slate-400">
        {label}
      </p>

      <p className="mt-1 font-semibold text-slate-800">
        {value}
      </p>
    </div>
  );
}
