'use client';

export default function LedgersPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-6 py-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-medium text-emerald-700">HisabDost AI</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
                Ledgers
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                This page is ready for beta deployment. Ledger details will show
                client-wise account activity, debit/credit movement, balances,
                customer ledgers, supplier ledgers, cash ledger, bank ledger, and
                accountant review notes.
              </p>
            </div>

            <div className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              Build-safe beta page
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold text-slate-900">
              General Ledger
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              View account-wise posted entries with opening balance, debit,
              credit, and closing balance.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold text-slate-900">
              Customer Ledger
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Track customer invoices, receipts, receivables, and outstanding
              balances.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold text-slate-900">
              Supplier Ledger
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Track supplier bills, payments, payables, and pending balances.
            </p>
          </div>
        </section>

        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <h2 className="text-base font-semibold text-amber-900">
            Beta note
          </h2>
          <p className="mt-2 text-sm leading-6 text-amber-800">
            For now, use Sales, Purchases, Expenses, Reports, and AI Assistant
            for partner testing. The full ledger table can be reconnected after
            the online deployment is stable.
          </p>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">
            Planned ledger filters
          </h2>

          <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-700">
              Date range
            </div>
            <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-700">
              Account head
            </div>
            <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-700">
              Customer / supplier
            </div>
            <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-700">
              Posted / draft
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
