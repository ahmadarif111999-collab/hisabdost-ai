'use client';

import { FormEvent, useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { Button, Card, Input, Select } from '@/components/Card';
import { api, getBusinessId, setBusinessId } from '@/lib/api';

type ExtractedReceipt = {
  vendorName?: string;
  invoiceNumber?: string;
  date?: string;
  totalAmount?: number;
  taxAmount?: number;
  suggestedCategory?: string;
  paymentMethod?: string;
  duplicateRisk?: 'low' | 'medium' | 'high';
  confidence?: number;
  requiresAccountantReview?: boolean;
  notes?: string;
  provider?: string;
  model?: string;
};

type OcrJob = {
  id: string;
  provider: string;
  status: string;
  rawText?: string;
  extractedJson?: ExtractedReceipt;
  confidenceScore?: string | number;
  errorMessage?: string;
};

type Document = {
  id: string;
  originalFilename: string;
  documentType: string;
  ocrStatus: string;
  createdAt: string;
  linkedEntityType?: string;
  linkedEntityId?: string;
  manualJson?: Record<string, unknown>;
  ocrJobs?: OcrJob[];
};

type Client = {
  id: string;
  name: string;
};

type MissingDocumentItem = {
  id: string;
  expenseDate: string;
  kind: string;
  amount: string | number;
  description?: string | null;
  documentId?: string | null;
  businessId?: string;
  businessName?: string;
};

type MissingDocumentsResponse = {
  count: number;
  items: MissingDocumentItem[];
};

type ViewMode = 'documents' | 'missing';

type ManualFields = {
  amount: string;
  category: string;
  vendorName: string;
  date: string;
  paymentMethod: string;
  kind: string;
  description: string;
};

const emptyManual: ManualFields = {
  amount: '',
  category: '',
  vendorName: '',
  date: '',
  paymentMethod: 'cash',
  kind: 'expense',
  description: '',
};

export default function DocumentsPage() {
  const [file, setFile] = useState<File | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [missingItems, setMissingItems] = useState<MissingDocumentItem[]>([]);
  const [selected, setSelected] = useState<Document | null>(null);
  const [view, setView] = useState<ViewMode>('documents');
  const [firmScope, setFirmScope] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [manual, setManual] = useState<ManualFields>(emptyManual);

  async function load() {
    const params = new URLSearchParams(window.location.search);
    const requestedView: ViewMode = params.get('missing') === 'true' ? 'missing' : 'documents';
    const requestedFirmScope = params.get('scope') === 'firm';
    const businessId = getBusinessId();

    setView(requestedView);
    setFirmScope(requestedFirmScope);
    setLoading(true);
    setError('');

    if (requestedView === 'missing' && requestedFirmScope) {
      try {
        const clients = await api<Client[]>('/firm/clients');
        const results = await Promise.allSettled(
          clients.map(async (client) => {
            const missing = await api<MissingDocumentsResponse>(
              `/accounting/businesses/${client.id}/reports/missing-documents`,
            );

            return (missing.items || []).map((item) => ({
              ...item,
              businessId: client.id,
              businessName: client.name,
            }));
          }),
        );

        setMissingItems(
          results
            .flatMap((result) =>
              result.status === 'fulfilled' ? result.value : [],
            )
            .sort(
              (a, b) =>
                new Date(b.expenseDate).getTime() - new Date(a.expenseDate).getTime(),
            ),
        );
        setDocuments([]);
        setSelected(null);
        setLoading(false);
        return;
      } catch {
        // Client users cannot load the firm-wide client list.
        setFirmScope(false);
      }
    }

    if (!businessId) {
      setDocuments([]);
      setMissingItems([]);
      setSelected(null);
      setError('Select a client company before viewing documents.');
      setLoading(false);
      return;
    }

    try {
      const [documentResult, missingResult] = await Promise.all([
        api<Document[]>(`/documents/businesses/${businessId}`),
        api<MissingDocumentsResponse>(
          `/accounting/businesses/${businessId}/reports/missing-documents`,
        ),
      ]);

      setDocuments(documentResult);
      setMissingItems(
        (missingResult.items || []).map((item) => ({
          ...item,
          businessId,
          businessName: 'Selected client',
        })),
      );
      setSelected((current) => {
        if (!current) {
          return null;
        }

        return documentResult.find((document) => document.id === current.id) || null;
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load documents');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    window.addEventListener('pakbooks-business-changed', load);

    return () => {
      window.removeEventListener('pakbooks-business-changed', load);
    };
  }, []);

  function selectView(nextView: ViewMode) {
    const keepFirmScope = nextView === 'missing' && firmScope;
    const params = new URLSearchParams();

    if (nextView === 'missing') {
      params.set('missing', 'true');
    }

    if (keepFirmScope) {
      params.set('scope', 'firm');
    }

    const query = params.toString();
    window.history.replaceState({}, '', query ? `/documents?${query}` : '/documents');
    setView(nextView);
    setFirmScope(keepFirmScope);
    void load();
  }

  function openClient(item: MissingDocumentItem) {
    if (!item.businessId) {
      return;
    }

    setBusinessId(item.businessId);
    window.dispatchEvent(new Event('pakbooks-business-changed'));
    window.location.href = '/documents?missing=true';
  }

  function fillManualFrom(document: Document | null) {
    const extracted =
      document?.ocrJobs?.[0]?.extractedJson ||
      (document?.manualJson as ExtractedReceipt | undefined) ||
      {};

    setManual({
      amount: extracted.totalAmount ? String(extracted.totalAmount) : '',
      category: extracted.suggestedCategory || '',
      vendorName: extracted.vendorName || '',
      date: extracted.date || '',
      paymentMethod:
        extracted.paymentMethod === 'wallet'
          ? 'wallet'
          : extracted.paymentMethod === 'bank'
            ? 'bank'
            : 'cash',
      kind: 'expense',
      description: extracted.vendorName ? `Receipt from ${extracted.vendorName}` : '',
    });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();

    const businessId = getBusinessId();

    if (!businessId || !file || busy) {
      return;
    }

    setBusy(true);
    setMessage('');
    setError('');

    try {
      const body = new FormData();
      body.append('file', file);

      await api(`/documents/businesses/${businessId}/upload?documentType=RECEIPT&process=true`, {
        method: 'POST',
        body,
      });

      setMessage(
        'Receipt uploaded. OCR/AI tried to read it, but you can manually correct fields before posting.',
      );
      setFile(null);
      await load();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Could not upload receipt');
    } finally {
      setBusy(false);
    }
  }

  async function processOcr(document: Document) {
    const businessId = getBusinessId();

    if (!businessId || busy) {
      return;
    }

    setBusy(true);
    setMessage('');
    setError('');

    try {
      await api(`/documents/businesses/${businessId}/${document.id}/process-ocr`, {
        method: 'POST',
      });
      setMessage('OCR/AI extraction completed.');
      await load();
    } catch (processError) {
      setError(processError instanceof Error ? processError.message : 'Could not process OCR');
    } finally {
      setBusy(false);
    }
  }

  async function saveManual(document: Document) {
    const businessId = getBusinessId();

    if (!businessId || busy) {
      return;
    }

    setBusy(true);
    setMessage('');
    setError('');

    try {
      await api(`/documents/businesses/${businessId}/${document.id}/manual-fields`, {
        method: 'POST',
        body: JSON.stringify({
          ...manual,
          amount: manual.amount ? Number(manual.amount) : undefined,
        }),
      });
      setMessage('Manual fields saved with the receipt.');
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save fields');
    } finally {
      setBusy(false);
    }
  }

  async function approve(document: Document) {
    const businessId = getBusinessId();

    if (!businessId || busy) {
      return;
    }

    setBusy(true);
    setMessage('');
    setError('');

    try {
      await api(`/documents/businesses/${businessId}/${document.id}/approve-as-expense`, {
        method: 'POST',
        body: JSON.stringify({
          ...manual,
          amount: manual.amount ? Number(manual.amount) : undefined,
        }),
      });

      setMessage(
        manual.kind === 'purchase'
          ? 'Receipt approved and purchase recorded.'
          : 'Receipt approved and expense recorded.',
      );
      setManual(emptyManual);
      await load();
    } catch (approveError) {
      setError(approveError instanceof Error ? approveError.message : 'Could not approve receipt');
    } finally {
      setBusy(false);
    }
  }

  const active = selected || documents[0] || null;
  const latest = active?.ocrJobs?.[0];
  const extracted = latest?.extractedJson;

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-8">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">
              {firmScope ? 'Firm-wide workflow' : 'Selected client'}
            </p>
            <h1 className="mt-1 text-3xl font-bold">Documents</h1>
            <p className="mt-1 text-slate-600">
              Review missing receipts or upload documents for OCR and accountant approval.
            </p>
          </div>

          <div className="flex gap-2 rounded-2xl border border-slate-200 bg-white p-1">
            <button
              type="button"
              onClick={() => selectView('documents')}
              className={`rounded-xl px-4 py-2 text-sm font-semibold ${
                view === 'documents'
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              Document vault
            </button>
            <button
              type="button"
              onClick={() => selectView('missing')}
              className={`rounded-xl px-4 py-2 text-sm font-semibold ${
                view === 'missing'
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              Missing receipts ({missingItems.length})
            </button>
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

        {loading ? (
          <Card>
            <p className="text-sm text-slate-600">Loading documents...</p>
          </Card>
        ) : view === 'missing' ? (
          <MissingDocumentsView
            items={missingItems}
            firmScope={firmScope}
            onOpenClient={openClient}
            onUpload={() => selectView('documents')}
          />
        ) : (
          <>
            <Card>
              <form onSubmit={submit} className="flex flex-col gap-3 md:flex-row md:items-center">
                <input
                  type="file"
                  accept="image/*,.pdf"
                  onChange={(event) => setFile(event.target.files?.[0] || null)}
                  className="min-w-0 flex-1 rounded-2xl border p-4"
                  disabled={busy}
                />
                <Button
                  type="submit"
                  disabled={busy || !file}
                  className="disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {busy ? 'Processing...' : 'Upload Receipt + Process OCR'}
                </Button>
              </form>
            </Card>

            <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
              <Card>
                <h2 className="text-xl font-bold text-slate-900">Uploaded documents</h2>
                <div className="mt-4 space-y-2">
                  {documents.map((document) => (
                    <button
                      key={document.id}
                      type="button"
                      onClick={() => {
                        setSelected(document);
                        fillManualFrom(document);
                      }}
                      className={`w-full rounded-2xl border p-3 text-left text-sm ${
                        active?.id === document.id
                          ? 'border-brand-500 bg-brand-50'
                          : 'border-slate-200 bg-white hover:bg-slate-50'
                      }`}
                    >
                      <p className="font-semibold text-slate-900">
                        {document.originalFilename}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {document.documentType} — OCR: {document.ocrStatus}
                        {document.linkedEntityType ? ' — posted' : ''}
                      </p>
                    </button>
                  ))}

                  {!documents.length && (
                    <p className="rounded-2xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">
                      No documents yet.
                    </p>
                  )}
                </div>
              </Card>

              <Card>
                {!active ? (
                  <p className="text-sm text-slate-500">
                    Upload a receipt to see OCR extraction here.
                  </p>
                ) : (
                  <div>
                    <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
                      <div>
                        <h2 className="text-xl font-bold text-slate-900">
                          {active.originalFilename}
                        </h2>
                        <p className="mt-1 text-sm text-slate-500">
                          OCR status: {active.ocrStatus}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void processOcr(active)}
                        disabled={busy}
                        className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Re-run OCR
                      </button>
                    </div>

                    {latest?.errorMessage && (
                      <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                        {latest.errorMessage}
                      </p>
                    )}

                    {extracted && (
                      <div className="mt-5 grid gap-3 sm:grid-cols-2">
                        <Info label="Vendor" value={extracted.vendorName || '-'} />
                        <Info label="Invoice no." value={extracted.invoiceNumber || '-'} />
                        <Info label="Date" value={extracted.date || '-'} />
                        <Info
                          label="Total"
                          value={
                            extracted.totalAmount
                              ? `Rs. ${Number(extracted.totalAmount).toLocaleString('en-PK')}`
                              : '-'
                          }
                        />
                        <Info
                          label="Category"
                          value={extracted.suggestedCategory || '-'}
                        />
                        <Info
                          label="Confidence"
                          value={
                            extracted.confidence !== undefined
                              ? `${Math.round(Number(extracted.confidence) * 100)}%`
                              : latest?.confidenceScore
                                ? `${Math.round(Number(latest.confidenceScore) * 100)}%`
                                : '-'
                          }
                        />
                      </div>
                    )}

                    {extracted?.duplicateRisk === 'high' && (
                      <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                        Possible duplicate receipt. Review before posting.
                      </p>
                    )}

                    {extracted?.requiresAccountantReview && (
                      <p className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700">
                        Tax or compliance-sensitive receipt. Accountant review recommended.
                      </p>
                    )}

                    {latest?.rawText && (
                      <details className="mt-4 rounded-2xl border border-slate-200 p-4">
                        <summary className="cursor-pointer text-sm font-semibold text-slate-700">
                          View OCR raw text
                        </summary>
                        <pre className="mt-3 whitespace-pre-wrap text-xs text-slate-600">
                          {latest.rawText}
                        </pre>
                      </details>
                    )}

                    {!active.linkedEntityType && (
                      <div className="mt-6 border-t border-slate-200 pt-5">
                        <h3 className="font-bold text-slate-900">
                          Manual correction + approval
                        </h3>
                        <p className="mt-1 text-sm text-slate-500">
                          Use this when handwriting or OCR is unclear. The image stays
                          attached as proof.
                        </p>

                        <div className="mt-4 grid gap-3 sm:grid-cols-2">
                          <Input
                            value={manual.vendorName}
                            onChange={(event) =>
                              setManual({ ...manual, vendorName: event.target.value })
                            }
                            placeholder="Vendor or supplier name"
                            disabled={busy}
                          />
                          <Input
                            value={manual.amount}
                            onChange={(event) =>
                              setManual({ ...manual, amount: event.target.value })
                            }
                            placeholder="Amount e.g. 18450"
                            type="number"
                            disabled={busy}
                          />
                          <Input
                            value={manual.date}
                            onChange={(event) =>
                              setManual({ ...manual, date: event.target.value })
                            }
                            type="date"
                            disabled={busy}
                          />
                          <Input
                            value={manual.category}
                            onChange={(event) =>
                              setManual({ ...manual, category: event.target.value })
                            }
                            placeholder="Category e.g. electricity"
                            disabled={busy}
                          />
                          <Select
                            value={manual.paymentMethod}
                            onChange={(event) =>
                              setManual({ ...manual, paymentMethod: event.target.value })
                            }
                            disabled={busy}
                          >
                            <option value="cash">Cash</option>
                            <option value="bank">Bank</option>
                            <option value="wallet">Wallet</option>
                            <option value="payable">Payable</option>
                          </Select>
                          <Select
                            value={manual.kind}
                            onChange={(event) =>
                              setManual({ ...manual, kind: event.target.value })
                            }
                            disabled={busy}
                          >
                            <option value="expense">Expense</option>
                            <option value="purchase">Purchase / Stock</option>
                          </Select>
                        </div>

                        <textarea
                          value={manual.description}
                          onChange={(event) =>
                            setManual({ ...manual, description: event.target.value })
                          }
                          placeholder="Description optional"
                          rows={3}
                          disabled={busy}
                          className="mt-3 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-brand-500 disabled:opacity-60"
                        />

                        <div className="mt-4 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => void saveManual(active)}
                            disabled={busy}
                            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            Save Fields
                          </button>
                          <button
                            type="button"
                            onClick={() => void approve(active)}
                            disabled={busy}
                            className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            Approve & Record
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </Card>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}

function MissingDocumentsView({
  items,
  firmScope,
  onOpenClient,
  onUpload,
}: {
  items: MissingDocumentItem[];
  firmScope: boolean;
  onOpenClient: (item: MissingDocumentItem) => void;
  onUpload: () => void;
}) {
  return (
    <Card>
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Expenses without receipts</h2>
          <p className="mt-1 text-sm text-slate-500">
            This filtered list is opened directly by the Missing Documents dashboard card.
          </p>
        </div>
        <button
          type="button"
          onClick={onUpload}
          className="rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-700"
        >
          Upload receipt
        </button>
      </div>

      <div className="mt-5 space-y-3">
        {items.length ? (
          items.map((item) => (
            <div
              key={`${item.businessId || 'client'}-${item.id}`}
              className="flex flex-col justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50/50 p-4 md:flex-row md:items-center"
            >
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-bold text-slate-900">
                    {item.description || item.kind || 'Expense'}
                  </p>
                  <span className="rounded-full border border-amber-200 bg-white px-2.5 py-1 text-xs font-bold uppercase text-amber-700">
                    Receipt missing
                  </span>
                </div>
                {firmScope && item.businessName && (
                  <p className="mt-1 text-sm font-semibold text-emerald-700">
                    {item.businessName}
                  </p>
                )}
                <p className="mt-1 text-sm text-slate-500">
                  {formatDate(item.expenseDate)} •{' '}
                  {String(item.kind || 'expense').replaceAll('_', ' ')}
                </p>
              </div>

              <div className="flex flex-col items-start gap-2 md:items-end">
                <p className="text-lg font-bold text-slate-900">
                  Rs. {Number(item.amount || 0).toLocaleString('en-PK')}
                </p>
                {firmScope && item.businessId && (
                  <button
                    type="button"
                    onClick={() => onOpenClient(item)}
                    className="rounded-xl border border-amber-200 bg-white px-3 py-2 text-xs font-semibold text-amber-800 hover:bg-amber-100"
                  >
                    Open client documents
                  </button>
                )}
              </div>
            </div>
          ))
        ) : (
          <div className="rounded-2xl border border-dashed border-emerald-300 bg-emerald-50 px-4 py-10 text-center">
            <p className="font-semibold text-emerald-800">No missing receipts found</p>
            <p className="mt-1 text-sm text-emerald-700">
              All recorded expenses currently have supporting documents.
            </p>
          </div>
        )}
      </div>
    </Card>
  );
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
  }).format(date);
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-800">{value}</p>
    </div>
  );
}
