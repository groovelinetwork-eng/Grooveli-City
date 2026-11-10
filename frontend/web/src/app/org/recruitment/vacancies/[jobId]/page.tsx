'use client';

import { use } from 'react';
import { useRouter } from 'next/navigation';
import { useDemoStore } from '@/lib/store/store';
import { useActiveOrg } from '@/lib/store/selectors';
import { OrgGate } from '@/components/shell/org-guard';
import { EmptyState, LinkButton, PageHeader } from '@/components/ui/primitives';
import { VacancyEditor, blankVacancy } from '@/components/recruitment/recruitment-components';

/** Handles both /vacancies/new and /vacancies/[jobId]. */
export default function VacancyEditorPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = use(params);
  const router = useRouter();
  const { organization } = useActiveOrg();
  const existing = useDemoStore((s) => s.jobs.find((j) => j.id === jobId));
  const isNew = jobId === 'new';
  return (
    <OrgGate permission="recruitment.manage" module="recruitment">
      {organization ? (
        isNew || (existing && existing.organizationId === organization.id) ? (
          <>
            <PageHeader title={isNew ? 'New vacancy' : `Edit: ${existing!.title}`} description="Vacancies are synthetic in demo mode; publishing makes them visible on the public board and your HQ." />
            <VacancyEditor
              key={jobId}
              initial={isNew ? blankVacancy(organization.id, organization.district) : existing!}
              onSaved={() => router.push('/org/recruitment')}
            />
          </>
        ) : (
          <EmptyState title="Vacancy not found in this organisation" action={<LinkButton href="/org/recruitment">Back to vacancies</LinkButton>} />
        )
      ) : null}
    </OrgGate>
  );
}
