'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, setToken } from '@/lib/api';
import { Button, Card, Input } from '@/components/Card';

type AuthResponse = {
  token: string;
  user: {
    id: string;
    name: string;
    email: string;
  };
};

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await api<AuthResponse>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          email: email.trim(),
          password,
        }),
      });

      setToken(res.token);
      router.push('/firm');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#dff7ed,_transparent_34%),linear-gradient(135deg,_#f8fffb,_#f6f7fb)] px-4 py-10">
      <div className="mx-auto grid min-h-[calc(100vh-5rem)] max-w-6xl items-center gap-10 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="hidden lg:block">
          <div className="mb-6 inline-flex rounded-full border border-emerald-200 bg-white/80 px-4 py-2 text-sm font-medium text-emerald-800 shadow-sm">
            Partner beta workspace
          </div>

          <h1 className="max-w-2xl text-5xl font-bold tracking-tight text-slate-950">
            HisabDost AI for firm-controlled accounting.
          </h1>

          <p className="mt-5 max-w-xl text-lg leading-8 text-slate-600">
            A simple accounting command center for Pakistani SMEs, managed by
            your firm with approvals, client books, reports, ledgers, and safe AI
            assistance.
          </p>

          <div className="mt-8 grid max-w-2xl gap-4 sm:grid-cols-2">
            <Feature title="Firm controlled" text="Partners work inside one shared firm workspace." />
            <Feature title="Client safe" text="Each client company keeps separate books and reports." />
            <Feature title="AI assisted" text="AI suggests entries and analysis, but approval stays with the firm." />
            <Feature title="Beta ready" text="Use dummy data first while workflows are being tested." />
          </div>
        </section>

        <section className="mx-auto w-full max-w-md">
          <div className="mb-6 text-center">
            <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-3xl bg-emerald-600 text-2xl font-bold text-white shadow-lg shadow-emerald-200">
              ح
            </div>
            <h2 className="text-3xl font-bold text-slate-950">HisabDost AI</h2>
            <p className="mt-2 text-slate-600">Pakistan ka simple AI accounting assistant</p>
          </div>

          <Card>
            <div className="mb-5 rounded-2xl bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-900">Internal partner login</p>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                Use the email and password shared by the firm. Demo credentials
                are no longer shown or pre-filled.
              </p>
            </div>

            <form onSubmit={submit} className="space-y-3" autoComplete="off">
              <Input
                placeholder="Email address"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="off"
                required
              />

              <Input
                placeholder="Password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="off"
                required
              />

              {error && (
                <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">
                  {error}
                </p>
              )}

              <Button disabled={loading} className="w-full">
                {loading ? 'Signing in...' : 'Login'}
              </Button>
            </form>

            <p className="mt-4 text-center text-xs text-slate-500">
              For beta testing, please use dummy accounting data only.
            </p>
          </Card>
        </section>
      </div>
    </main>
  );
}

function Feature({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-2xl border border-white bg-white/80 p-4 shadow-sm">
      <p className="font-semibold text-slate-950">{title}</p>
      <p className="mt-1 text-sm leading-6 text-slate-600">{text}</p>
    </div>
  );
}
