'use client';

import { useState } from 'react';
import { useActiveOrg } from '@/lib/store/selectors';
import { useEmployeeName, useOrgEmployees } from '@/lib/store/org-hooks';
import { getService } from '@/lib/services';
import { useAction } from '@/lib/hooks/use-action';
import { OrgGate } from '@/components/shell/org-guard';
import { Button, Card, PageHeader } from '@/components/ui/primitives';
import { SelectField, TextField } from '@/components/ui/form';
import { DataTable } from '@/components/ui/widgets';

function Structure() {
  const { organization, workspace } = useActiveOrg();
  const employees = useOrgEmployees();
  const empName = useEmployeeName();
  const orgId = organization!.id;
  const [dep, setDep] = useState({ name: '', responsibilities: '', locationId: '' });
  const [loc, setLoc] = useState({ name: '', city: '', address: '', headcountCapacity: 20 });
  const addDep = useAction(() => getService().organizations.addDepartment(orgId, { name: dep.name, responsibilities: dep.responsibilities, headEmployeeId: null, locationId: dep.locationId || null }), { success: 'Department added' });
  const addLoc = useAction(() => getService().organizations.addLocation(orgId, loc), { success: 'Location added' });
  return (
    <>
      <PageHeader title="Departments & locations" description="Organisation structure used across recruitment, HR and your virtual HQ." />
      <div className="grid-2">
        <Card title="Departments">
          <DataTable
            caption="Departments"
            rows={workspace!.departments}
            rowKey={(d) => d.id}
            columns={[
              { key: 'n', header: 'Department', render: (d) => d.name, sortValue: (d) => d.name },
              { key: 'h', header: 'Head', render: (d) => empName(d.headEmployeeId) },
              { key: 'c', header: 'People', numeric: true, render: (d) => employees.filter((e) => e.departmentId === d.id).length },
              { key: 'r', header: 'Responsibilities', render: (d) => d.responsibilities || '—' },
            ]}
          />
          <form
            className="stack"
            style={{ marginTop: 12 }}
            onSubmit={async (e) => {
              e.preventDefault();
              if (await addDep.run()) setDep({ name: '', responsibilities: '', locationId: '' });
            }}
          >
            <h3>Add department</h3>
            <TextField label="Name" value={dep.name} onChange={(e) => setDep({ ...dep, name: e.target.value })} />
            <TextField label="Responsibilities" value={dep.responsibilities} onChange={(e) => setDep({ ...dep, responsibilities: e.target.value })} />
            <SelectField label="Location" value={dep.locationId} onChange={(e) => setDep({ ...dep, locationId: e.target.value })} options={[{ value: '', label: '—' }, ...workspace!.locations.map((l) => ({ value: l.id, label: l.name }))]} />
            <div>
              <Button type="submit" variant="primary" pending={addDep.pending}>Add department</Button>
            </div>
          </form>
        </Card>
        <Card title="Locations">
          <DataTable
            caption="Locations"
            rows={workspace!.locations}
            rowKey={(l) => l.id}
            columns={[
              { key: 'n', header: 'Location', render: (l) => l.name },
              { key: 'c', header: 'City', render: (l) => l.city },
              { key: 'a', header: 'Address', render: (l) => l.address || '—' },
              { key: 'p', header: 'People', numeric: true, render: (l) => employees.filter((e) => e.locationId === l.id).length },
            ]}
          />
          <form
            className="stack"
            style={{ marginTop: 12 }}
            onSubmit={async (e) => {
              e.preventDefault();
              if (await addLoc.run()) setLoc({ name: '', city: '', address: '', headcountCapacity: 20 });
            }}
          >
            <h3>Add location</h3>
            <div className="grid-2">
              <TextField label="Name" value={loc.name} onChange={(e) => setLoc({ ...loc, name: e.target.value })} />
              <TextField label="City" value={loc.city} onChange={(e) => setLoc({ ...loc, city: e.target.value })} />
            </div>
            <TextField label="Address" value={loc.address} onChange={(e) => setLoc({ ...loc, address: e.target.value })} />
            <div>
              <Button type="submit" variant="primary" pending={addLoc.pending}>Add location</Button>
            </div>
          </form>
        </Card>
      </div>
    </>
  );
}

export default function StructurePage() {
  return (
    <OrgGate permission="org.settings.manage">
      <Structure />
    </OrgGate>
  );
}
