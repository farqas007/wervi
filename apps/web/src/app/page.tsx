const SUBSYSTEMS = [
  {
    slug: 'jobs',
    title: 'Jobs',
    description: 'Post a brief, publish it, and let qualified talent find you.',
  },
  {
    slug: 'proposals',
    title: 'Proposals',
    description:
      'Freelancers pitch with pricing, timeline, and a tailored approach.',
  },
  {
    slug: 'contracts',
    title: 'Contracts',
    description:
      'Accept a proposal and lock the scope, rate, and terms in one place.',
  },
  {
    slug: 'milestones',
    title: 'Milestones',
    description:
      'Split work into funded milestones with delivery and revision cycles.',
  },
  {
    slug: 'messaging',
    title: 'Messaging',
    description: 'Project-scoped conversations that stay attached to the work.',
  },
  {
    slug: 'payments',
    title: 'Payments',
    description:
      'Escrow-backed payouts in local currency, minus a clear platform fee.',
  },
] as const;

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-16 px-6 py-20">
      <header className="flex flex-col gap-6">
        <p className="text-sm font-semibold tracking-widest text-brand-600 uppercase">
          WERVI
        </p>
        <h1 className="max-w-3xl text-5xl font-bold tracking-tight text-balance">
          Hire freelance talent, anywhere in the world.
        </h1>
        <p className="max-w-2xl text-lg text-slate-600 text-pretty">
          WERVI is a global marketplace for independent work. Post a job,
          compare proposals, and hire with escrow-protected milestone payments.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <span
            aria-disabled="true"
            className="rounded-lg bg-slate-200 px-5 py-3 font-medium text-slate-500"
          >
            Browse jobs
          </span>
          <span
            aria-disabled="true"
            className="rounded-lg border border-slate-200 px-5 py-3 font-medium text-slate-400"
          >
            Sign in
          </span>
          <span className="text-sm text-slate-500">
            Accounts and job listings arrive in Phase 3 and Phase 5.
          </span>
        </div>
      </header>

      <section
        aria-labelledby="subsystems-heading"
        className="flex flex-col gap-6"
      >
        <h2 id="subsystems-heading" className="text-2xl font-semibold">
          How WERVI works
        </h2>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SUBSYSTEMS.map((item) => (
            <li
              key={item.slug}
              className="rounded-xl border border-slate-200 p-5 transition hover:border-brand-300"
            >
              <h3 className="font-semibold">{item.title}</h3>
              <p className="mt-2 text-sm text-slate-600">{item.description}</p>
            </li>
          ))}
        </ul>
      </section>

      <footer className="mt-auto border-t border-slate-200 pt-8 text-sm text-slate-500">
        <p>Foundation build — subsystems are being delivered incrementally.</p>
      </footer>
    </main>
  );
}
