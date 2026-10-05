import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env['NEXT_PUBLIC_SITE_URL'] ?? 'http://localhost:3000',
  ),
  title: {
    default: 'WERVI — Hire freelance talent, anywhere',
    template: '%s | WERVI',
  },
  description:
    'WERVI is a global freelancer marketplace. Post a job, receive proposals, and hire vetted independent talent with milestone-based escrow protection.',
  openGraph: {
    type: 'website',
    siteName: 'WERVI',
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans">{children}</body>
    </html>
  );
}
