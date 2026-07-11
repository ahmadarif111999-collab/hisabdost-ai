'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getToken } from '@/lib/api';

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    const token = getToken();

    if (token) {
      router.replace('/firm');
    } else {
      router.replace('/login');
    }
  }, [router]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <p className="text-sm font-semibold text-slate-700">Opening HisabDost AI...</p>
        <p className="mt-1 text-xs text-slate-500">Please wait.</p>
      </div>
    </main>
  );
}
