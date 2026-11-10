'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { formatDate } from '@grooveli/frontend-domain';
import { useOrgEmployees } from '@/lib/store/org-hooks';
import { OrgGate } from '@/components/shell/org-guard';
import { Badge, MockNotice, PageHeader } from '@/components/ui/primitives';
import { SelectField } from '@/components/ui/form';
import { DataTable } from '@/components/ui/widgets';

function Documents() {
  const employees = useOrgEmployees();
  const [kind, setKind] = useState('');
  const docs = useMemo(
    () => employees.flatMap((e) => e.documents.map((d) => ({ ...d, employeeId: e.id, employee: e.name }))).filter((d) => !kind || d.kind === kind),
    [employees, kind],
  );
  const missingId = employees.filter((e) => !e.documents.some((d) => d.kind === 'id'));
  return (
    <>
      <PageHeader title="Employee documents" description="Contracts, IDs, certificates and policy acknowledgements across the organisation." />
      <div className="stack">
        <MockNotice title="Metadata only">No files are stored. Upload documents from an employee&apos;s record; only file names and sizes are kept.</MockNotice>
        {missingId.length ? (
          <p className="small">
            <Badge tone="warning">{missingId.length} missing ID verification</Badge>{' '}
            {missingId.slice(0, 5).map((e, i) => (
              <span key={e.id}>
                {i ? ', ' : ''}
                <Link href={`/org/people/${e.id}`}>{e.name}</Link>
              </span>
            ))}
          </p>
        ) : null}
        <SelectField
          label="Type"
          value={kind}
          onChange={(e) => setKind(e.target.value)}
          options={[{ value: '', label: 'All' }, ...['contract', 'id', 'certificate', 'policy-ack', 'other'].map((k) => ({ value: k, label: k }))]}
        />
        <DataTable
          caption="Documents"
          rows={docs}
          rowKey={(d) => d.id}
          columns={[
            { key: 'n', header: 'Document', render: (d) => `📄 ${d.name}`, sortValue: (d) => d.name },
            { key: 'e', header: 'Employee', render: (d) => <Link href={`/org/people/${d.employeeId}`}>{d.employee}</Link>, sortValue: (d) => d.employee },
            { key: 'k', header: 'Type', render: (d) => <Badge>{d.kind}</Badge> },
            { key: 'a', header: 'Added', render: (d) => formatDate(d.addedOn), sortValue: (d) => d.addedOn },
            { key: 's', header: 'Size', numeric: true, render: (d) => `${d.sizeKb} KB` },
          ]}
        />
      </div>
    </>
  );
}

export default function DocumentsPage() {
  return (
    <OrgGate permission="hr.records.manage" module="hr">
      <Documents />
    </OrgGate>
  );
}
