'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getBusinessId } from '@/lib/api';

export function ClientRequired({ children, title = 'No client company selected' }: { children: React.ReactNode; title?: string }) {
  const [businessId, setBusinessId] = useState<string | null>(null);

  useEffect(() => {
    const load = () => setBusinessId(getBusinessId());
    load();
    window.addEventListener('pakbooks-business-changed', load);
    return () => window.removeEventListener('pakbooks-business-changed', load);
  }, []);

  if (!businessId) {
    return (
      <div className="rounded-[2rem] border border-amber-200 bg-amber-50 p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-3xl bg-amber-100 text-2xl">🏢</div>
        <h2 className="text-2xl font-bold text-slate-900">{title}</h2>
        <p className="mx-auto mt-2 max-w-xl text-slate-600">
          Accounting pages need a selected client company. Add your first real client from the firm dashboard or select a client from the switcher.
        </p>
        <div className="mt-5 flex justify-center gap-3">
          <Link href="/firm" className="rounded-2xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700">Go to Firm Dashboard</Link>
          <Link href="/firm" className="rounded-2xl border bg-white px-4 py-2 text-sm font-semibold hover:bg-slate-50">+ Add Client Company</Link>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
