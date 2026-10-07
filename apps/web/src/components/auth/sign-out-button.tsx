'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { signOut } from '@/lib/auth';

interface SignOutButtonProps {
  className?: string;
}

export function SignOutButton({ className }: SignOutButtonProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const onClick = async () => {
    if (busy) {
      return;
    }
    setBusy(true);
    try {
      await signOut();
    } catch {
      // Best-effort: the API treats logout as idempotent; refresh regardless.
    } finally {
      setBusy(false);
      router.push('/');
      router.refresh();
    }
  };

  return (
    <button
      type="button"
      onClick={() => void onClick()}
      disabled={busy}
      className={
        className ??
        'rounded-lg border border-slate-200 px-5 py-3 font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-60'
      }
    >
      {busy ? 'Signing out…' : 'Sign out'}
    </button>
  );
}
