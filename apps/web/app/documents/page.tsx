'use client';

import { FormEvent, useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { ClientRequired } from '@/components/ClientRequired';
import { Button, Card, Input, Select } from '@/components/Card';
import { api, getBusinessId } from '@/lib/api';

type ExtractedReceipt = { vendorName?: string; invoiceNumber?: string; date?: string; totalAmount?: number; taxAmount?: number; suggestedCategory?: string; paymentMethod?: string; duplicateRisk?: 'low' | 'medium' | 'high'; confidence?: number; requiresAccountantReview?: boolean; notes?: string; provider?: string; model?: string };
type OcrJob = { id: string; provider: string; status: string; rawText?: string; extractedJson?: ExtractedReceipt; confidenceScore?: string | number; errorMessage?: string };
type Document = { id: string; originalFilename: string; documentType: string; ocrStatus: string; createdAt: string; linkedEntityType?: string; linkedEntityId?: string; manualJson?: any; ocrJobs?: OcrJob[] };

export default function DocumentsPage() {
  const [file, setFile] = useState<File | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [selected, setSelected] = useState<Document | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [manual, setManual] = useState({ amount: '', category: '', vendorName: '', date: '', paymentMethod: 'cash', kind: 'expense', description: '' });

  async function load() {
    const businessId = getBusinessId();
    if (!businessId) return;
    const docs = await api<Document[]>(`/documents/businesses/${businessId}`);
    setDocuments(docs);
    if (selected) setSelected(docs.find((doc) => doc.id === selected.id) || null);
  }

  useEffect(() => { load(); }, []);

  function fillManualFrom(doc: Document | null) {
    const extracted = doc?.ocrJobs?.[0]?.extractedJson || doc?.manualJson || {};
    setManual({
      amount: extracted.totalAmount ? String(extracted.totalAmount) : '',
      category: extracted.suggestedCategory || '',
      vendorName: extracted.vendorName || '',
      date: extracted.date || '',
      paymentMethod: extracted.paymentMethod === 'wallet' ? 'wallet' : extracted.paymentMethod === 'bank' ? 'bank' : 'cash',
      kind: 'expense',
      description: extracted.vendorName ? `Receipt from ${extracted.vendorName}` : '',
    });
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const businessId = getBusinessId();
    if (!businessId || !file) return;
    setBusy(true); setMessage('');
    try {
      const body = new FormData();
      body.append('file', file);
      await api(`/documents/businesses/${businessId}/upload?documentType=RECEIPT&process=true`, { method: 'POST', body });
      setMessage('Receipt uploaded. OCR/AI tried to read it, but you can manually correct fields before posting.');
      setFile(null);
      await load();
    } catch (error) { setMessage((error as Error).message); } finally { setBusy(false); }
  }

  async function processOcr(doc: Document) {
    const businessId = getBusinessId();
    if (!businessId) return;
    setBusy(true); setMessage('');
    try { await api(`/documents/businesses/${businessId}/${doc.id}/process-ocr`, { method: 'POST' }); setMessage('OCR/AI extraction completed.'); await load(); }
    catch (error) { setMessage((error as Error).message); } finally { setBusy(false); }
  }

  async function saveManual(doc: Document) {
    const businessId = getBusinessId();
    if (!businessId) return;
    await api(`/documents/businesses/${businessId}/${doc.id}/manual-fields`, { method: 'POST', body: JSON.stringify({ ...manual, amount: manual.amount ? Number(manual.amount) : undefined }) });
    setMessage('Manual fields saved with the receipt.');
    await load();
  }

  async function approve(doc: Document) {
    const businessId = getBusinessId();
    if (!businessId) return;
    setBusy(true); setMessage('');
    try {
      await api(`/documents/businesses/${businessId}/${doc.id}/approve-as-expense`, { method: 'POST', body: JSON.stringify({ ...manual, amount: manual.amount ? Number(manual.amount) : undefined }) });
      setMessage(manual.kind === 'purchase' ? 'Receipt approved and purchase recorded.' : 'Receipt approved and expense recorded.');
      setManual({ amount: '', category: '', vendorName: '', date: '', paymentMethod: 'cash', kind: 'expense', description: '' });
      await load();
    } catch (error) { setMessage((error as Error).message); } finally { setBusy(false); }
  }

  const active = selected || documents[0] || null;
  const latest = active?.ocrJobs?.[0];
  const extracted = latest?.extractedJson;

  return (
    <AppShell>
      <ClientRequired>
      <h1 className="mb-2 text-3xl font-bold">Document Vault + OCR</h1>
      <p className="mb-6 text-slate-600">Bad handwriting? Upload image, then manually type vendor/amount/category before posting.</p>
      <div className="grid gap-4 lg:grid-cols-[420px_1fr]">
        <div className="space-y-4">
          <Card>
            <form onSubmit={submit} className="grid gap-4">
              <input type="file" accept="image/*,.pdf,.txt,.csv" onChange={(e) => setFile(e.target.files?.[0] || null)} className="rounded-2xl border p-4" />
              <Button disabled={!file || busy}>{busy ? 'Processing...' : 'Upload Receipt + Process OCR'}</Button>
            </form>
            {message && <p className="mt-4 rounded-xl bg-brand-50 p-3 text-sm text-brand-700">{message}</p>}
          </Card>

          <Card>
            <h2 className="mb-3 font-bold">Uploaded documents</h2>
            <div className="space-y-2">
              {documents.map((doc) => (
                <button key={doc.id} onClick={() => { setSelected(doc); fillManualFrom(doc); }} className={`w-full rounded-2xl border p-3 text-left text-sm ${active?.id === doc.id ? 'border-brand-500 bg-brand-50' : 'bg-white'}`}>
                  <b>{doc.originalFilename}</b><br />{doc.documentType} — OCR: {doc.ocrStatus}
                  {doc.linkedEntityType && <span className="ml-2 rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">posted</span>}
                </button>
              ))}
              {!documents.length && <p className="text-slate-500">No documents yet.</p>}
            </div>
          </Card>
        </div>

        <Card>
          {!active && <p className="text-slate-500">Upload a receipt to see OCR extraction here.</p>}
          {active && <div>
            <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
              <div><h2 className="text-xl font-bold">{active.originalFilename}</h2><p className="text-sm text-slate-500">OCR status: {active.ocrStatus}</p></div>
              <Button onClick={() => processOcr(active)} disabled={busy}>Re-run OCR</Button>
            </div>

            {latest?.errorMessage && <p className="mt-4 rounded-2xl bg-red-50 p-3 text-sm text-red-700">{latest.errorMessage}</p>}
            {extracted && <div className="mt-6 grid gap-4 md:grid-cols-2">
              <Info label="Vendor" value={extracted.vendorName || 'Needs review'} />
              <Info label="Invoice #" value={extracted.invoiceNumber || 'Not found'} />
              <Info label="Date" value={extracted.date || 'Needs review'} />
              <Info label="Total" value={extracted.totalAmount ? `Rs. ${extracted.totalAmount.toLocaleString('en-PK')}` : 'Needs review'} />
              <Info label="Tax" value={extracted.taxAmount ? `Rs. ${extracted.taxAmount.toLocaleString('en-PK')}` : 'Not found / not clear'} />
              <Info label="Category" value={extracted.suggestedCategory || 'office'} />
              <Info label="Payment" value={extracted.paymentMethod || 'unknown'} />
              <Info label="Confidence" value={`${Math.round((extracted.confidence || Number(latest.confidenceScore) || 0) * 100)}%`} />
            </div>}

            {extracted?.duplicateRisk === 'high' && <p className="mt-4 rounded-2xl bg-red-50 p-3 text-sm text-red-700">Possible duplicate receipt. Review before posting.</p>}
            {extracted?.requiresAccountantReview && <p className="mt-4 rounded-2xl bg-amber-50 p-3 text-sm text-amber-800">Tax/compliance-sensitive receipt. Accountant review recommended.</p>}

            {latest?.rawText && <details className="mt-4 rounded-2xl border p-4 text-sm"><summary className="cursor-pointer font-semibold">View OCR raw text</summary><pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap text-xs text-slate-600">{latest.rawText}</pre></details>}

            {!active.linkedEntityType && <div className="mt-6 rounded-3xl bg-slate-50 p-4">
              <h3 className="font-bold">Manual correction + approval</h3>
              <p className="mb-3 text-sm text-slate-600">Use this when handwriting/OCR is unclear. Image stays attached as proof.</p>
              <div className="grid gap-3 md:grid-cols-2">
                <Input value={manual.vendorName} onChange={(e) => setManual({ ...manual, vendorName: e.target.value })} placeholder="Vendor/supplier name" />
                <Input value={manual.amount} onChange={(e) => setManual({ ...manual, amount: e.target.value })} placeholder="Amount e.g. 18450" />
                <Input type="date" value={manual.date} onChange={(e) => setManual({ ...manual, date: e.target.value })} />
                <Input value={manual.category} onChange={(e) => setManual({ ...manual, category: e.target.value })} placeholder="Category e.g. electricity" />
                <Select value={manual.paymentMethod} onChange={(e) => setManual({ ...manual, paymentMethod: e.target.value })}><option value="cash">Cash</option><option value="bank">Bank</option><option value="wallet">Wallet</option><option value="payable">Payable</option></Select>
                <Select value={manual.kind} onChange={(e) => setManual({ ...manual, kind: e.target.value })}><option value="expense">Expense</option><option value="purchase">Purchase / Stock</option></Select>
              </div>
              <Input className="mt-3" value={manual.description} onChange={(e) => setManual({ ...manual, description: e.target.value })} placeholder="Description optional" />
              <div className="mt-4 flex gap-2"><Button onClick={() => saveManual(active)} disabled={busy}>Save Fields</Button><Button onClick={() => approve(active)} disabled={busy}>Approve & Record</Button></div>
            </div>}
          </div>}
        </Card>
      </div>
      </ClientRequired>
    </AppShell>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border bg-white p-3"><p className="text-xs uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 font-semibold">{value}</p></div>;
}
