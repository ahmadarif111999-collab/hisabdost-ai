'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, setToken } from '@/lib/api';
import { Button, Card, Input } from '@/components/Card';

type AuthResponse = { token: string; user: { id: string; name: string; email: string } };

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('demo@pakbooks.ai');
  const [password, setPassword] = useState('password123');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const payload = mode === 'register' ? { name, email, password } : { email, password };
      const res = await api<AuthResponse>(`/auth/${mode}`, { method: 'POST', body: JSON.stringify(payload) });
      setToken(res.token);
      router.push('/firm');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-gradient-to-br from-brand-50 via-white to-slate-100 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-3xl bg-brand-600 text-2xl font-bold text-white">ح</div>
          <h1 className="text-3xl font-bold">HisabDost AI</h1>
          <p className="mt-2 text-slate-600">Pakistan ka simple AI accounting assistant</p>
        </div>
        <Card>
          <div className="mb-4 flex rounded-2xl bg-slate-100 p-1">
            <button onClick={() => setMode('login')} className={`flex-1 rounded-xl py-2 ${mode === 'login' ? 'bg-white shadow-sm' : ''}`}>Login</button>
            <button onClick={() => setMode('register')} className={`flex-1 rounded-xl py-2 ${mode === 'register' ? 'bg-white shadow-sm' : ''}`}>Register</button>
          </div>
          <form onSubmit={submit} className="space-y-3">
            {mode === 'register' && <Input placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} required />}
            <Input placeholder="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <Input placeholder="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
            <Button disabled={loading} className="w-full">{loading ? 'Please wait...' : mode === 'login' ? 'Login' : 'Create account'}</Button>
          </form>
          <p className="mt-4 text-xs text-slate-500">Demo: demo@pakbooks.ai / password123</p>
        </Card>
      </div>
    </main>
  );
}
