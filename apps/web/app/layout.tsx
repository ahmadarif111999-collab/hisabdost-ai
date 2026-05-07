import type { Metadata } from 'next';
import { Suspense } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'HisabDost AI',
  description: 'Pakistan-focused AI bookkeeping and compliance assistant',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Suspense
          fallback={
            <div className="min-h-screen bg-slate-50 p-6 text-sm text-slate-600">
              Loading HisabDost AI...
            </div>
          }
        >
          {children}
        </Suspense>
      </body>
    </html>
  );
}
