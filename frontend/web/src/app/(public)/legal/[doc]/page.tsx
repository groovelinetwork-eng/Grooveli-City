import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

const DOCS = {
  terms: { title: 'Terms of use', topics: ['Eligibility and accounts', 'Acceptable use and community conduct', 'Employer obligations', 'Intellectual property', 'Liability and disputes'] },
  privacy: {
    title: 'Privacy notice',
    topics: ['Data we collect (profile, avatar, applications, workplace records)', 'How personality preferences are used (social personalisation only)', 'Employer access to candidate profiles', 'Payroll and HR data handling', 'Retention, deletion and your rights'],
  },
} as const;

export function generateStaticParams() {
  return Object.keys(DOCS).map((doc) => ({ doc }));
}

export async function generateMetadata({ params }: { params: Promise<{ doc: string }> }): Promise<Metadata> {
  const { doc } = await params;
  return { title: DOCS[doc as keyof typeof DOCS]?.title ?? 'Legal' };
}

/** Intentional legal PLACEHOLDER (permitted by the build spec). Requires counsel-approved text. */
export default async function LegalPage({ params }: { params: Promise<{ doc: string }> }) {
  const { doc } = await params;
  const d = DOCS[doc as keyof typeof DOCS];
  if (!d) notFound();
  return (
    <div className="container section stack" style={{ maxWidth: 760 }}>
      <h1>{d.title}</h1>
      <div className="notice" role="note">
        <span aria-hidden="true">📝</span>
        <div>
          <strong>Placeholder.</strong> Legal text has not been written or approved. Jurisdiction, data retention and processing terms are open
          business decisions. Do not rely on this page.
        </div>
      </div>
      <p className="muted">The approved document is expected to cover:</p>
      <ul style={{ paddingLeft: 20 }}>
        {d.topics.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
    </div>
  );
}
