'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  api,
  clearBusinessId,
  clearToken,
  getBusinessId,
  getToken,
  setBusinessId,
} from '@/lib/api';

type Business = {
  id: string;
  name: string;
  businessType?: string;
  city?: string;
  organization?: {
    type: string;
  };
};

const navGroups = [
  {
    title: 'Firm',
    items: [
      ['Firm Dashboard', '/firm'],
      ['Account Library', '/account-library'],
    ],
  },
  {
    title: 'Client Books',
    items: [
      ['Dashboard', '/dashboard'],
      ['Periods', '/periods'],
      ['Transactions', '/transactions'],
      ['Cash & Bank', '/cash-bank'],
      ['Accounts', '/accounts'],
      ['Ledgers', '/ledgers'],
      ['Journals', '/journals'],
    ],
  },
  {
    title: 'Documents & Reports',
    items: [
      ['Invoices', '/invoices'],
      ['Documents', '/documents'],
      ['Reports', '/reports'],
      ['AI Assistant', '/chat'],
      ['Compliance', '/compliance'],
      ['Users', '/accountant'],
    ],
  },
];

const pageLabels: Record<string, string> = {
  '/firm': 'Firm Dashboard',
  '/account-library': 'Account Library',
  '/dashboard': 'Client Dashboard',
  '/periods': 'Accounting Periods',
  '/transactions': 'Transactions',
  '/cash-bank': 'Cash & Bank',
  '/accounts': 'Accounts',
  '/ledgers': 'Ledgers',
  '/journals': 'Journals',
  '/invoices': 'Invoices',
  '/documents': 'Documents',
  '/reports': 'Reports',
  '/chat': 'AI Assistant',
  '/compliance': 'Compliance',
  '/accountant': 'Users',
};

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [selected, setSelected] = useState('');
  const [authChecked, setAuthChecked] = useState(false);

  const selectedBusiness = businesses.find((business) => business.id === selected);

  const pageTitle = useMemo(() => {
    return pageLabels[pathname] || 'HisabDost AI';
  }, [pathname]);

  const showBackToFirm = pathname !== '/firm';

  async function loadBusinesses() {
    try {
      const list = await api<Business[]>('/businesses');
      setBusinesses(list);

      const current = getBusinessId();
      const next = current && list.some((business) => business.id === current) ? current : '';

      setSelected(next);

      if (!next && current) {
        clearBusinessId();
      }
    } catch {
      // api() handles 401 by clearing token and redirecting.
    }
  }

  useEffect(() => {
    const token = getToken();

    if (!token) {
      router.replace('/login');
      return;
    }

    setAuthChecked(true);
    loadBusinesses();

    window.addEventListener('pakbooks-business-changed', loadBusinesses);

    return () => {
      window.removeEventListener('pakbooks-business-changed', loadBusinesses);
    };
  }, [router]);

  function switchClient(id: string) {
    setSelected(id);

    if (id) {
      setBusinessId(id);
    } else {
      clearBusinessId();
    }

    router.refresh();
  }

  function logout() {
    clearToken();
    router.replace('/login');
  }

  if (!authChecked) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <p className="text-sm font-semibold text-slate-700">Opening workspace...</p>
          <p className="mt-1 text-xs text-slate-500">Please wait.</p>
        </div>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-72 border-r border-slate-200 bg-slate-950 text-white lg:block">
        <div className="flex h-full flex-col p-5">
          <div>
            <Link href="/firm" className="block">
              <p className="text-xl font-bold">HisabDost AI</p>
              <p className="mt-1 text-xs text-slate-400">Firm-controlled accounting SaaS</p>
            </Link>
          </div>

          <div className="mt-6 rounded-2xl border border-white/10 bg-white/10 p-3">
            <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-300">
              Selected client
            </label>

            <select
              value={selected}
              onChange={(e) => switchClient(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white outline-none"
            >
              <option value="">No client selected</option>
              {businesses.map((business) => (
                <option key={business.id} value={business.id}>
                  {business.name}
                </option>
              ))}
            </select>

            {!businesses.length && (
              <p className="mt-2 text-xs text-slate-400">
                0 / 10 client slots used. Add a client first.
              </p>
            )}

            {selectedBusiness && (
              <p className="mt-2 text-xs text-slate-400">
                {selectedBusiness.businessType || 'Business'}
                {selectedBusiness.city ? ` • ${selectedBusiness.city}` : ''}
              </p>
            )}
          </div>

          <nav className="mt-6 flex-1 space-y-6 overflow-y-auto pr-1">
            {navGroups.map((group) => (
              <div key={group.title}>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {group.title}
                </p>

                <div className="space-y-1">
                  {group.items.map(([label, href]) => (
                    <NavLink key={href} href={href} label={label} pathname={pathname} />
                  ))}
                </div>
              </div>
            ))}
          </nav>

          <button
            type="button"
            onClick={logout}
            className="mt-6 w-full rounded-2xl border border-white/10 px-3 py-2 text-sm text-slate-200 hover:bg-white/10"
          >
            Logout
          </button>
        </div>
      </aside>

      <div className="lg:pl-72">
        <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur lg:px-8">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <Link href="/firm" className="font-semibold text-emerald-700 hover:text-emerald-800">
                  Firm Dashboard
                </Link>

                {pathname !== '/firm' && (
                  <>
                    <span>/</span>
                    <span>{pageTitle}</span>
                  </>
                )}
              </div>

              <h1 className="mt-1 text-xl font-bold text-slate-900">{pageTitle}</h1>

              {selectedBusiness && pathname !== '/firm' && (
                <p className="mt-1 text-xs text-slate-500">
                  Selected client: {selectedBusiness.name}
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {showBackToFirm && (
                <Link
                  href="/firm"
                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  ← Back to Firm Dashboard
                </Link>
              )}

              <button
                type="button"
                onClick={logout}
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 lg:hidden"
              >
                Logout
              </button>
            </div>
          </div>

          <div className="mt-3 grid gap-3 lg:hidden">
            <select
              value={selected}
              onChange={(e) => switchClient(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none"
            >
              <option value="">No client selected</option>
              {businesses.map((business) => (
                <option key={business.id} value={business.id}>
                  {business.name}
                </option>
              ))}
            </select>

            <div className="flex gap-2 overflow-x-auto pb-1">
              {navGroups.flatMap((group) =>
                group.items.map(([label, href]) => (
                  <Link
                    key={href}
                    href={href}
                    className={`whitespace-nowrap rounded-xl border px-3 py-2 text-xs font-semibold ${
                      pathname === href
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                        : 'border-slate-200 bg-white text-slate-700'
                    }`}
                  >
                    {label}
                  </Link>
                )),
              )}
            </div>
          </div>
        </header>

        <main>{children}</main>
      </div>
    </div>
  );
}

function NavLink({ href, label, pathname }: { href: string; label: string; pathname: string }) {
  const active = pathname === href;

  return (
    <Link
      href={href}
      className={`block rounded-2xl px-3 py-2 text-sm font-semibold transition ${
        active
          ? 'bg-emerald-500 text-white shadow-sm'
          : 'text-slate-300 hover:bg-white/10 hover:text-white'
      }`}
    >
      {label}
    </Link>
  );
}
