import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { SignUpForm } from '@/components/auth/sign-up-form';
import { getServerSession } from '@/lib/server-auth';

export const metadata: Metadata = {
  title: 'Create an account',
};

export default async function SignUpPage() {
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
        <h1 className="text-3xl font-bold tracking-tight">
          Create your account
        </h1>
        <p className="text-slate-600">
          Join WERVI to hire talent or market your services.
        </p>
      </header>
      <SignUpForm />
      <footer className="text-center text-sm text-slate-500">
        By creating an account you agree to WERVI&apos;s terms.
      </footer>
    </main>
  );
}
