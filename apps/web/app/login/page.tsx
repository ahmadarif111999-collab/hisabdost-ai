'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, getToken, setToken } from '@/lib/api';

type AuthResponse = {
  token: string;
  user: {
    id: string;
    name: string;
    email: string;
  };
  firm?: {
    id: string;
    name: string;
    role: string;
  } | null;
};

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    const token = getToken();

    if (token) {
      router.replace('/firm');
      return;
    }

    setCheckingSession(false);
  }, [router]);

  async function submit(e: FormEvent) {
    e.preventDefault();

    if (loading) return;

    setLoading(true);
    setError('');

    try {
      const res = await api<AuthResponse>('/auth/login', {
        method: 'POST',
        skipAuth: true,
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
        }),
      });

      setToken(res.token);
      router.replace('/firm');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  if (checkingSession) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <p className="text-sm font-semibold text-slate-700">Checking your session...</p>
          <p className="mt-1 text-xs text-slate-500">Please wait.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-10 text-slate-900">
      <div className="mx-auto grid min-h-[calc(100vh-5rem)] max-w-6xl items-center gap-8 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="text-white">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-emerald-300">
            Internal partner beta
          </p>

          <h1 className="mt-5 text-4xl font-bold tracking-tight md:text-5xl">
            HisabDost AI for firm-controlled accounting.
          </h1>

          <p className="mt-5 max-w-2xl text-base leading-7 text-slate-300">
            A simple accounting command center for Pakistani SMEs, managed by ProBiz Consultants
            with approvals, client books, reports, ledgers, and safe AI assistance.
          </p>

          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            <Feature
              title="One shared firm"
              text="All five partners work inside ProBiz Consultants instead of separate personal firms."
            />
            <Feature
              title="Client books"
              text="Each client company keeps separate accounting records under the same firm workspace."
            />
            <Feature
              title="Beta safety"
              text="Use dummy data only until production security, backups, and reporting are complete."
            />
            <Feature
              title="Pakistan focused"
              text="Built for local accounting, tax heads, approvals, and firm-managed workflows."
            />
          </div>
        </section>

        <section className="rounded-[2rem] bg-white p-6 shadow-2xl md:p-8">
          <div className="mb-6">
            <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">
              Partner login
            </p>
            <h2 className="mt-2 text-2xl font-bold text-slate-900">HisabDost AI</h2>
            <p className="mt-2 text-sm text-slate-500">
              Enter the email and password shared by the firm. Demo login has been removed.
            </p>
          </div>

          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-700">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
                disabled={loading}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-slate-50"
                placeholder="partner@email.com"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-700">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
                disabled={loading}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-slate-50"
                placeholder="Enter password"
              />
            </div>

            {error && (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? 'Signing in...' : 'Login'}
            </button>
          </form>

          <div className="mt-5 rounded-2xl bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-800">
            Use dummy data only during beta testing.
          </div>
        </section>
      </div>
    </main>
  );
}

function Feature({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
      <p className="font-semibold text-white">{title}</p>
      <p className="mt-1 text-sm leading-6 text-slate-300">{text}</p>
    </div>
  );
}
