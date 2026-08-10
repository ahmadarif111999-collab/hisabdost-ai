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

type ExtractedReceipt = {
  vendorName?: string;

  invoiceNumber?: string;

  date?: string;

  totalAmount?: number;

  taxAmount?: number;

  suggestedCategory?: string;

  paymentMethod?: string;

  duplicateRisk?: string;

  confidence?: number;

  requiresAccountantReview?: boolean;

  notes?: string;
};

type OcrJob = {
  id: string;

  provider: string;

  status: string;

  rawText?: string;

  extractedJson?: ExtractedReceipt;

  confidenceScore?:
    | string
    | number;

  errorMessage?: string;
};

type DocumentRecord = {
  id: string;

  originalFilename: string;

  displayFilename?: string;

  documentType: string;

  fileType?:
    | string
    | null;

  fileUrl?: string;

  ocrStatus: string;

  createdAt: string;

  linkedEntityType?: string;

  linkedEntityId?: string;

  manualJson?:
    | Record<
        string,
        any
      >
    | null;

  ocrJobs?: OcrJob[];

  documentNo?: string;

  referenceNo?: string;

  displayNumber?: string;

  uploadedByName?: string;

  resolvedByName?: string;

  linkedReferenceNo?:
    | string
    | null;

  linkedJournalReferenceNo?:
    | string
    | null;

  linkedRecordType?:
    | string
    | null;
};

type ReferenceResolution = {
  referenceNo: string;

  entityType: string;

  referenceDate: string;

  internalEntityId: string;

  linkedReferenceNo?:
    | string
    | null;

  linkedEntityType?:
    | string
    | null;

  linkedJournalReferenceNo?:
    | string
    | null;
};

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

function formatDate(
  value?:
    | string
    | null,
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
  ).format(date);
}

function money(
  value?: number,
) {
  return `Rs. ${Number(
    value || 0,
  ).toLocaleString(
    'en-PK',
    {
      minimumFractionDigits:
        0,

      maximumFractionDigits:
        2,
    },
  )}`;
}

function cleanFilename(
  document:
    DocumentRecord,

  referenceNo:
    string,
) {
  const source =
    document.displayFilename ||
    document.originalFilename ||
    'Document';

  const prefix =
    `${referenceNo} — `;

  return source.startsWith(
    prefix,
  )
    ? source.slice(
        prefix.length,
      )
    : source;
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

  return null;
}

function manualResolution(
  document:
    DocumentRecord | null,
) {
  if (
    !document?.manualJson ||
    typeof document.manualJson !==
      'object'
  ) {
    return null;
  }

  const resolutionType =
    String(
      document.manualJson
        .resolutionType ||
        '',
    );

  if (
    document.fileType !==
      'application/x-hisabdost-manual-resolution' &&
    resolutionType !==
      'missing_document_resolution'
  ) {
    return null;
  }

  return {
    note: String(
      document.manualJson.note ||
        '',
    ),

    resolvedAt:
      String(
        document.manualJson
          .resolvedAt ||
          '',
      ),
  };
}

export default function DocumentReferencePage() {
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
    document,
    setDocument,
  ] =
    useState<
      DocumentRecord | null
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
            'Select a client company before opening a document reference.',
          );

          setLoading(
            false,
          );
        }

        return;
      }

      if (
        !/^DOC-\d{4}-\d{6}$/.test(
          referenceNo,
        )
      ) {
        if (!cancelled) {
          setError(
            'The document reference is invalid.',
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
        const [
          resolved,
          documents,
        ] =
          await Promise.all([
            api<ReferenceResolution>(
              `/references/businesses/${businessId}/resolve/${encodeURIComponent(
                referenceNo,
              )}`,
            ),

            api<
              DocumentRecord[]
            >(
              `/documents/businesses/${businessId}`,
            ),
          ]);

        if (
          resolved.entityType !==
          'document'
        ) {
          throw new Error(
            `${referenceNo} is not a document reference.`,
          );
        }

        const matched =
          documents.find(
            (
              item,
            ) =>
              item.referenceNo ===
                referenceNo ||
              item.documentNo ===
                referenceNo ||
              item.displayNumber ===
                referenceNo ||
              item.id ===
                resolved.internalEntityId,
          );

        if (!matched) {
          throw new Error(
            `Document ${referenceNo} could not be loaded.`,
          );
        }

        if (!cancelled) {
          setResolution(
            resolved,
          );

          setDocument(
            matched,
          );
        }
      } catch (
        loadError
      ) {
        if (!cancelled) {
          setDocument(
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

  const manual =
    manualResolution(
      document,
    );

  const latestOcr =
    document?.ocrJobs?.[0];

  const extracted =
    latestOcr?.extractedJson;

  const linkedReference =
    document?.linkedReferenceNo ||
    resolution?.linkedReferenceNo ||
    null;

  const linkedJournalReference =
    document?.linkedJournalReferenceNo ||
    resolution?.linkedJournalReferenceNo ||
    null;

  const sourceRoute =
    relatedRoute(
      linkedReference,
    );

  return (
    <AppShell>
      <ClientRequired title="Select a client to open this document reference">
        <div className="mx-auto max-w-6xl space-y-6 px-4 py-8">
          <section className="flex flex-col justify-between gap-4 rounded-3xl bg-slate-950 p-6 text-white shadow-sm md:flex-row md:items-start">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-emerald-300">
                Document
                audit trail
              </p>

              <h1 className="mt-2 font-mono text-2xl font-bold sm:text-3xl">
                {referenceNo ||
                  'Document reference'}
              </h1>

              <p className="mt-2 max-w-2xl text-sm text-slate-300">
                Exact
                Document
                Vault
                drill-down
                using the
                permanent DOC
                reference.
                Internal
                database IDs
                are never
                displayed.
              </p>
            </div>

            <Link
              href="/documents"
              className="rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-center text-sm font-semibold text-white hover:bg-white/15"
            >
              ← Back to
              Document
              Vault
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
          ) : document ? (
            <>
              <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Metric
                  label="Document reference"
                  value={
                    referenceNo
                  }
                  mono
                />

                <Metric
                  label="Type"
                  value={
                    document.documentType ||
                    '-'
                  }
                />

                <Metric
                  label="OCR status"
                  value={
                    document.ocrStatus ||
                    '-'
                  }
                />

                <Metric
                  label="Created"
                  value={formatDate(
                    document.createdAt,
                  )}
                />
              </section>

              <Card>
                <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Document
                    </p>

                    <h2 className="mt-2 break-words text-xl font-bold text-slate-900">
                      {cleanFilename(
                        document,
                        referenceNo,
                      )}
                    </h2>

                    <p className="mt-2 text-sm text-slate-500">
                      Uploaded by{' '}
                      {document.uploadedByName ||
                        'Unknown user'}

                      {document.resolvedByName
                        ? ` • Resolved by ${document.resolvedByName}`
                        : ''}
                    </p>
                  </div>

                  {manual ? (
                    <span className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-bold text-violet-700">
                      Manual
                      resolution
                      record
                    </span>
                  ) : (
                    <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700">
                      Supporting
                      document
                    </span>
                  )}
                </div>
              </Card>

              {linkedReference ||
              linkedJournalReference ? (
                <Card>
                  <h2 className="text-xl font-bold text-slate-900">
                    Accounting
                    links
                  </h2>

                  <p className="mt-1 text-sm text-slate-500">
                    Follow the
                    readable
                    references
                    without
                    exposing
                    database IDs.
                  </p>

                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    {linkedReference ? (
                      <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
                        <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">
                          Linked
                          transaction
                        </p>

                        <p className="mt-2 font-mono text-sm font-bold text-blue-900">
                          {
                            linkedReference
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

                    {linkedJournalReference ? (
                      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600">
                          Linked
                          journal
                        </p>

                        <p className="mt-2 font-mono text-sm font-bold text-emerald-900">
                          {
                            linkedJournalReference
                          }
                        </p>

                        <Link
                          href={`/journals?reference=${encodeURIComponent(
                            linkedJournalReference,
                          )}`}
                          className="mt-3 inline-flex text-sm font-semibold text-emerald-700 hover:underline"
                        >
                          Open exact
                          journal →
                        </Link>
                      </div>
                    ) : null}
                  </div>
                </Card>
              ) : null}

              {manual ? (
                <Card>
                  <h2 className="text-xl font-bold text-slate-900">
                    Manual
                    resolution
                  </h2>

                  <p className="mt-1 text-sm text-slate-500">
                    This is an
                    audited
                    resolution
                    record, not
                    an attached
                    receipt.
                  </p>

                  <div className="mt-4 rounded-2xl border border-violet-200 bg-violet-50 p-4">
                    <p className="whitespace-pre-wrap text-sm font-semibold text-violet-950">
                      {manual.note ||
                        'No resolution note available.'}
                    </p>

                    <p className="mt-3 text-xs text-violet-700">
                      Resolved{' '}
                      {formatDate(
                        manual.resolvedAt,
                      )}
                    </p>
                  </div>
                </Card>
              ) : (
                <Card>
                  <h2 className="text-xl font-bold text-slate-900">
                    OCR /
                    extracted
                    details
                  </h2>

                  {latestOcr ? (
                    <div className="mt-4 space-y-4">
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        <Info
                          label="Provider"
                          value={
                            latestOcr.provider ||
                            '-'
                          }
                        />

                        <Info
                          label="OCR job"
                          value={
                            latestOcr.status ||
                            '-'
                          }
                        />

                        <Info
                          label="Confidence"
                          value={
                            latestOcr.confidenceScore !==
                            undefined
                              ? String(
                                  latestOcr.confidenceScore,
                                )
                              : extracted?.confidence !==
                                  undefined
                                ? String(
                                    extracted.confidence,
                                  )
                                : '-'
                          }
                        />

                        <Info
                          label="Review"
                          value={
                            extracted?.requiresAccountantReview
                              ? 'Required'
                              : 'Normal'
                          }
                        />
                      </div>

                      {extracted ? (
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                          <Info
                            label="Vendor"
                            value={
                              extracted.vendorName ||
                              '-'
                            }
                          />

                          <Info
                            label="Invoice"
                            value={
                              extracted.invoiceNumber ||
                              '-'
                            }
                          />

                          <Info
                            label="Date"
                            value={
                              extracted.date ||
                              '-'
                            }
                          />

                          <Info
                            label="Amount"
                            value={
                              extracted.totalAmount !==
                              undefined
                                ? money(
                                    extracted.totalAmount,
                                  )
                                : '-'
                            }
                          />

                          <Info
                            label="Tax"
                            value={
                              extracted.taxAmount !==
                              undefined
                                ? money(
                                    extracted.taxAmount,
                                  )
                                : '-'
                            }
                          />

                          <Info
                            label="Payment method"
                            value={
                              extracted.paymentMethod ||
                              '-'
                            }
                          />
                        </div>
                      ) : null}

                      {latestOcr.rawText ? (
                        <div className="rounded-2xl bg-slate-50 p-4">
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            OCR text
                          </p>

                          <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">
                            {
                              latestOcr.rawText
                            }
                          </p>
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <p className="mt-4 text-sm text-slate-500">
                      No OCR job
                      is available
                      for this
                      document.
                    </p>
                  )}
                </Card>
              )}
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
        className={`mt-2 break-words text-lg font-bold text-slate-900 ${
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

function Info({
  label,
  value,
}: {
  label: string;

  value: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </p>

      <p className="mt-2 break-words text-sm font-semibold text-slate-900">
        {value}
      </p>
    </div>
  );
}
