'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, clearToken, getBusinessId, setBusinessId } from '@/lib/api';

type Business = { id: string; name: string; businessType?: string; city?: string; organization?: { type: string } };

const navGroups = [
  { title: 'Firm', items: [['Firm Dashboard', '/firm'], ['Account Library', '/account-library']] },
  { title: 'Client Books', items: [['Dashboard', '/dashboard'], ['Transactions', '/transactions'], ['Cash & Bank', '/cash-bank'], ['Accounts', '/accounts'], ['Ledgers', '/ledgers'], ['Journals', '/journals']] },
  { title: 'Documents & Reports', items: [['Invoices', '/invoices'], ['Documents', '/documents'], ['Reports', '/reports'], ['AI Assistant', '/chat'], ['Compliance', '/compliance'], ['Users', '/accountant']] },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [selected, setSelected] = useState('');

  async function loadBusinesses() {
    try {
      const list = await api<Business[]>('/businesses');
      setBusinesses(list);
      const current = getBusinessId();
      const next = current && list.some((b) => b.id === current) ? current : '';
      setSelected(next);
      if (!next && current) localStorage.removeItem('pakbooks_business_id');
    } catch {
      // User may be on login or token may be expired.
    }
  }

  useEffect(() => {
    loadBusinesses();
    window.addEventListener('pakbooks-business-changed', loadBusinesses);
    return () => window.removeEventListener('pakbooks-business-changed', loadBusinesses);
  }, []);

  function switchClient(id: string) {
    setSelected(id);
    if (id) setBusinessId(id);
    router.refresh();
  }

  const selectedBusiness = businesses.find((b) => b.id === selected);

  return (
    <div className="min-h-screen">
      <div className="mx-auto flex max-w-[1500px] gap-4 px-3 py-3 md:px-5">
        <aside className="hidden w-72 shrink-0 rounded-[2rem] border border-white/70 bg-slate-950 p-4 text-white shadow-xl shadow-emerald-950/10 lg:block">
          <Link href="/firm" className="mb-6 flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-emerald-500 text-xl font-black">ح</span>
            <div>
              <p className="font-bold">HisabDost AI</p>
              <p className="text-xs text-emerald-100">Firm-controlled accounting SaaS</p>
            </div>
          </Link>
          <div className="rounded-3xl border border-white/10 bg-white/10 p-3">
            <p className="text-xs uppercase tracking-wide text-emerald-100">Selected client</p>
            <select className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white" value={selected} onChange={(e) => switchClient(e.target.value)}>
              <option value="">No client selected</option>
              {businesses.map((business) => <option key={business.id} value={business.id}>{business.name}</option>)}
            </select>
            {!businesses.length && <p className="mt-2 text-xs text-amber-100">0 / 10 client slots used. Add a client first.</p>}
            {selectedBusiness && <p className="mt-2 text-xs text-slate-300">{selectedBusiness.businessType || 'Business'} {selectedBusiness.city ? `• ${selectedBusiness.city}` : ''}</p>}
          </div>
          <nav className="mt-6 space-y-5 text-sm">
            {navGroups.map((group) => (
              <div key={group.title}>
                <p className="mb-2 px-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{group.title}</p>
                <div className="space-y-1">
                  {group.items.map(([label, href]) => (
                    <Link key={href} href={href} className="block rounded-2xl px-3 py-2 text-slate-200 hover:bg-white/10 hover:text-white">
                      {label}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </nav>
          <button
            onClick={() => {
              clearToken();
              router.push('/login');
            }}
            className="mt-8 w-full rounded-2xl border border-white/10 px-3 py-2 text-sm text-slate-200 hover:bg-white/10"
          >
            Logout
          </button>
        </aside>

        <div className="min-w-0 flex-1">
          <header className="sticky top-3 z-10 mb-4 rounded-[2rem] border border-white/70 bg-white/80 px-4 py-3 shadow-sm backdrop-blur lg:hidden">
            <div className="flex items-center justify-between gap-3">
              <Link href="/firm" className="font-bold text-emerald-700">HisabDost AI</Link>
              <button
                onClick={() => {
                  clearToken();
                  router.push('/login');
                }}
                className="rounded-xl border px-3 py-2 text-sm hover:bg-slate-100"
              >Logout</button>
            </div>
            <select className="mt-3 w-full rounded-2xl border bg-white px-3 py-2 text-sm" value={selected} onChange={(e) => switchClient(e.target.value)}>
              <option value="">No client selected</option>
              {businesses.map((business) => <option key={business.id} value={business.id}>{business.name}</option>)}
            </select>
            <nav className="mt-3 flex gap-2 overflow-x-auto text-sm">
              {navGroups.flatMap((g) => g.items).map(([label, href]) => (
                <Link key={href} href={href} className="whitespace-nowrap rounded-full border bg-white px-3 py-2 hover:bg-emerald-50">{label}</Link>
              ))}
            </nav>
          </header>
          <main>{children}</main>
        </div>
      </div>
    </div>
  );
}
