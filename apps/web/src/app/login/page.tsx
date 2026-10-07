import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { SignInForm } from '@/components/auth/sign-in-form';
import { getServerSession } from '@/lib/server-auth';

export const metadata: Metadata = {
  title: 'Sign in',
};

export default async function LoginPage() {
  const session = await getServerSession();
  if (session) {
    redirect('/');
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-8 px-6 py-20">
      <header className="flex flex-col gap-2">
        <p className="text-sm font-semibold tracking-widest text-brand-600 uppercase">
          WERVI
        </p>
        <h1 className="text-3xl font-bold tracking-tight">Welcome back</h1>
        <p className="text-slate-600">Sign in to your account to continue.</p>
      </header>
      <SignInForm />
      <footer className="text-center text-sm text-slate-500">
        By signing in you agree to WERVI&apos;s terms.
      </footer>
    </main>
  );
}
