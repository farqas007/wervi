import Link from 'next/link';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import JobForm from '@/components/jobs/job-form';
import { fetchCategories, fetchSkills } from '@/lib/profiles';
import { getServerSession } from '@/lib/server-auth';

export const metadata: Metadata = {
  title: 'Post a job',
  description: 'Describe the work and reach freelancers worldwide.',
};

export default async function NewJobPage() {
  const session = await getServerSession();

  if (!session) {
    redirect('/login');
  }

  if (!session.user.roles.includes('client')) {
    return (
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-8">
        <h1 className="text-3xl font-semibold tracking-tight">Post a job</h1>
        <p className="text-sm text-slate-600">
          Only client accounts can post jobs. Your account does not have the
          client role yet.
        </p>
        <div>
          <Link
            href="/"
            className="text-sm font-medium text-brand-700 hover:underline"
          >
            Back home
          </Link>
        </div>
      </div>
    );
  }

  const [categories, skills] = await Promise.all([
    fetchCategories(),
    fetchSkills(),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold tracking-tight">Post a job</h1>
        <p className="text-sm text-slate-600">
          Save a draft to review later, or publish straight away to appear in
          browse results.
        </p>
      </div>
      <JobForm categories={categories.items} skills={skills.items} />
    </div>
  );
}
