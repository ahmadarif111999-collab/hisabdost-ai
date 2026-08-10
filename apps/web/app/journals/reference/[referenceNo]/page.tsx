'use client';

import Link from 'next/link';

import {
  useParams,
} from 'next/navigation';

import {
  useEffect,
  useMemo,
  useState,
} from 'react';

import { AppShell } from '@/components/AppShell';

import { ClientRequired } from '@/components/ClientRequired';

import { Card } from '@/components/Card';

import {
  api,
  getBusinessId,
} from '@/lib/api';

type ReferenceResolution = {
  referenceNo: string;

  entityType: string;

  referenceDate: string;

  internalEntityId: string;

  sourceType?:
    | string
    | null;

  linkedReferenceNo?:
    | string
    | null;

  linkedEntityType?:
    | string
    | null;
};

type JournalLine = {
  id: string;

  accountCode: string;

  accountName: string;

  accountType: string;

  debit: number;

  credit: number;

  description?: string;

  partyType?: string;
};

type JournalEntry = {
  id: string;

  entryNo: string;

  entryDate: string;

  entryDateDisplay?: string;

  sourceType: string;

  sourceLabel?: string;

  narration: string;

  rawNarration?: string;

  status: string;

  createdBy: string;

  approvedBy: string;

  isSystemGenerated?: boolean;

  debitTotal: number;

  creditTotal: number;

  lines: JournalLine[];
};

function money(
  value: number,
) {
  return Number(
    value || 0,
  ).toLocaleString(
    'en-PK',
    {
      minimumFractionDigits:
        0,

      maximumFractionDigits:
        2,
    },
  );
}

function formatDate(
  value: string,
) {
  return new Intl.DateTimeFormat(
    'en-PK',
    {
      timeZone:
        'Asia/Karachi',

      dateStyle:
        'medium',

      timeStyle:
        'short',
    },
  ).format(
    new Date(value),
  );
}

function parameterValue(
  value:
    | string
    | string[]
    | undefined,
) {
  const raw =
    Array.isArray(value)
      ? value[0]
      : value;

  try {
    return decodeURIComponent(
      String(
        raw || '',
      ),
    )
      .trim()
      .toUpperCase();
  } catch {
    return String(
      raw || '',
    )
      .trim()
      .toUpperCase();
  }
}

function relatedRoute(
  referenceNo?:
    | string
    | null,
) {
  if (!referenceNo) {
    return null;
  }

  if (
    referenceNo.startsWith(
      'EXP-',
    )
  ) {
    return '/expenses';
  }

  if (
    referenceNo.startsWith(
      'PUR-',
    )
  ) {
    return '/purchases';
  }

  if (
    referenceNo.startsWith(
      'REC-',
    ) ||
    referenceNo.startsWith(
      'PAY-',
    )
  ) {
    return '/cash-bank';
  }

  if (
    referenceNo.startsWith(
      'DOC-',
    )
  ) {
    return '/documents';
  }

  return null;
}

export default function JournalReferencePage() {
  const params =
    useParams<{
      referenceNo: string;
    }>();

  const referenceNo =
    useMemo(
      () =>
        parameterValue(
          params?.referenceNo,
        ),
      [
        params?.referenceNo,
      ],
    );

  const [
    entry,
    setEntry,
  ] =
    useState<
      JournalEntry | null
    >(null);

  const [
    resolution,
    setResolution,
  ] =
    useState<
      ReferenceResolution | null
    >(null);

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    error,
    setError,
  ] =
    useState('');

  useEffect(() => {
    let cancelled =
      false;

    async function load() {
      const businessId =
        getBusinessId();

      if (!businessId) {
        if (!cancelled) {
          setError(
            'Select a client company before opening a journal reference.',
          );

          setLoading(
            false,
          );
        }

        return;
      }

      if (
        !/^JE-\d{4}-\d{6}$/.test(
          referenceNo,
        )
      ) {
        if (!cancelled) {
          setError(
            'The journal reference is invalid.',
          );

          setLoading(
            false,
          );
        }

        return;
      }

      setLoading(
        true,
      );

      setError('');

      try {
        const resolved =
          await api<ReferenceResolution>(
            `/references/businesses/${businessId}/resolve/${encodeURIComponent(
              referenceNo,
            )}`,
          );

        if (
          resolved.entityType !==
          'journal'
        ) {
          throw new Error(
            `${referenceNo} is not a journal-entry reference.`,
          );
        }

        const detail =
          await api<JournalEntry>(
            `/accounting/businesses/${businessId}/views/journal-entries/${encodeURIComponent(
              resolved.internalEntityId,
            )}`,
          );

        if (!cancelled) {
          setResolution(
            resolved,
          );

          setEntry(
            detail,
          );
        }
      } catch (
        loadError
      ) {
        if (!cancelled) {
          setEntry(
            null,
          );

          setResolution(
            null,
          );

          setError(
            loadError instanceof
              Error
              ? loadError.message
              : `Could not open ${referenceNo}.`,
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(
            false,
          );
        }
      }
    }

    void load();

    const onBusinessChanged =
      () =>
        void load();

    window.addEventListener(
      'pakbooks-business-changed',
      onBusinessChanged,
    );

    return () => {
      cancelled =
        true;

      window.removeEventListener(
        'pakbooks-business-changed',
        onBusinessChanged,
      );
    };
  }, [
    referenceNo,
  ]);

  const sourceRoute =
    relatedRoute(
      resolution?.linkedReferenceNo,
    );

  return (
    <AppShell>
      <ClientRequired title="Select a client to open this journal reference">
        <div className="mx-auto max-w-6xl space-y-6 px-4 py-8">
          <section className="flex flex-col justify-between gap-4 rounded-3xl bg-slate-950 p-6 text-white shadow-sm md:flex-row md:items-start">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-emerald-300">
                Journal
                drill-down
              </p>

              <h1 className="mt-2 font-mono text-2xl font-bold sm:text-3xl">
                {referenceNo ||
                  'Journal reference'}
              </h1>

              <p className="mt-2 max-w-2xl text-sm text-slate-300">
                Permanent
                journal
                reference view
                for audit
                tracing.
                Internal
                database IDs
                are used only
                for routing
                and are not
                displayed.
              </p>
            </div>

            <Link
              href="/journals"
              className="rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-center text-sm font-semibold text-white hover:bg-white/15"
            >
              ← Back to
              Journals
            </Link>
          </section>

          {error ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          {loading ? (
            <Card>
              <p className="py-8 text-center text-sm text-slate-500">
                Opening{' '}
                {referenceNo}
                …
              </p>
            </Card>
          ) : entry ? (
            <>
              <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Metric
                  label="Journal reference"
                  value={
                    entry.entryNo
                  }
                  mono
                />

                <Metric
                  label="Date"
                  value={
                    entry.entryDateDisplay ||
                    formatDate(
                      entry.entryDate,
                    )
                  }
                />

                <Metric
                  label="Debit"
                  value={`Rs. ${money(
                    entry.debitTotal,
                  )}`}
                />

                <Metric
                  label="Credit"
                  value={`Rs. ${money(
                    entry.creditTotal,
                  )}`}
                />
              </section>

              <Card>
                <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      {entry.sourceLabel ||
                        entry.sourceType}
                    </p>

                    <h2 className="mt-2 text-xl font-bold text-slate-900">
                      {
                        entry.narration
                      }
                    </h2>

                    <p className="mt-2 text-sm text-slate-500">
                      Created by{' '}
                      {entry.createdBy ||
                        'System'}{' '}
                      • Approved
                      by{' '}
                      {entry.approvedBy ||
                        '-'}{' '}
                      • Status{' '}
                      {
                        entry.status
                      }
                    </p>
                  </div>

                  {resolution?.linkedReferenceNo ? (
                    <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 lg:min-w-72">
                      <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">
                        Source
                        transaction
                      </p>

                      <p className="mt-2 font-mono text-sm font-bold text-blue-900">
                        {
                          resolution.linkedReferenceNo
                        }
                      </p>

                      {sourceRoute ? (
                        <Link
                          href={
                            sourceRoute
                          }
                          className="mt-3 inline-flex text-sm font-semibold text-blue-700 hover:underline"
                        >
                          Open
                          related
                          register
                          →
                        </Link>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </Card>

              <Card>
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-bold text-slate-900">
                      Debit and
                      credit
                      lines
                    </h2>

                    <p className="mt-1 text-sm text-slate-500">
                      {
                        entry.lines.length
                      }{' '}
                      line
                      {entry.lines.length ===
                      1
                        ? ''
                        : 's'}{' '}
                      in this
                      journal
                      entry.
                    </p>
                  </div>
                </div>

                <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200">
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-4 py-3">
                          Account
                        </th>

                        <th className="px-4 py-3">
                          Description
                        </th>

                        <th className="px-4 py-3 text-right">
                          Debit
                        </th>

                        <th className="px-4 py-3 text-right">
                          Credit
                        </th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-slate-100">
                      {entry.lines.map(
                        (
                          line,
                        ) => (
                          <tr
                            key={
                              line.id
                            }
                            className="bg-white"
                          >
                            <td className="px-4 py-3">
                              <p className="font-semibold text-slate-900">
                                {
                                  line.accountCode
                                }{' '}
                                —{' '}
                                {
                                  line.accountName
                                }
                              </p>

                              <p className="mt-1 text-xs text-slate-400">
                                {
                                  line.accountType
                                }
                              </p>
                            </td>

                            <td className="px-4 py-3 text-slate-600">
                              {line.description ||
                                '-'}
                            </td>

                            <td className="px-4 py-3 text-right font-semibold text-slate-900">
                              {money(
                                line.debit,
                              )}
                            </td>

                            <td className="px-4 py-3 text-right font-semibold text-slate-900">
                              {money(
                                line.credit,
                              )}
                            </td>
                          </tr>
                        ),
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>
            </>
          ) : null}
        </div>
      </ClientRequired>
    </AppShell>
  );
}

function Metric({
  label,
  value,
  mono = false,
}: {
  label: string;

  value: string;

  mono?: boolean;
}) {
  return (
    <Card>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </p>

      <p
        className={`mt-2 text-lg font-bold text-slate-900 ${
          mono
            ? 'font-mono'
            : ''
        }`}
      >
        {value}
      </p>
    </Card>
  );
}
