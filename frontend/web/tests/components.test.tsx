import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, renderHook, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/org',
  useSearchParams: () => new URLSearchParams(),
}));

import { useDemoStore } from '@/lib/store/store';
import { createInitialState } from '@/lib/store/state';
import { mockService } from '@/lib/services/mock';
import { useOrgNav } from '@/components/shell/org-nav';
import { OrgGate } from '@/components/shell/org-guard';
import { Wizard } from '@/components/wizard';
import { DataTable, Tabs } from '@/components/ui/widgets';
import { ToastProvider } from '@/components/ui/toast';
import { ChoiceChips } from '@/components/ui/form';

beforeEach(() => {
  useDemoStore.setState(createInitialState(), true);
});

const flatten = (nav: ReturnType<typeof useOrgNav>) => nav.flatMap((s) => s.items);

describe('role- and tier-aware navigation', () => {
  it('hides payroll from recruiters and recruitment from payroll officers', async () => {
    await mockService.auth.signInDemo('recruiter');
    let items = flatten(renderHook(() => useOrgNav()).result.current);
    expect(items.find((i) => i.href === '/org/payroll')?.hidden ?? true).toBe(true);
    expect(items.find((i) => i.href === '/org/recruitment/sourcing')?.hidden).toBe(false);
    await mockService.auth.signInDemo('payroll-officer');
    items = flatten(renderHook(() => useOrgNav()).result.current);
    expect(items.find((i) => i.href === '/org/recruitment')?.hidden ?? true).toBe(true);
    expect(items.find((i) => i.href === '/org/payroll/run')?.hidden).toBe(false);
  });

  it('locks modules not included in the mock plan', async () => {
    await mockService.auth.signInDemo('org-admin');
    await mockService.auth.switchOrganization('amberline-health'); // starter plan
    const items = flatten(renderHook(() => useOrgNav()).result.current);
    expect(items.find((i) => i.href === '/org/payroll')?.locked).toMatch(/starter/);
    expect(items.find((i) => i.href === '/org/people')?.locked).toBeNull();
  });
});

describe('OrgGate', () => {
  it('explains missing permissions instead of rendering the page', async () => {
    await mockService.auth.signInDemo('employee');
    render(
      <OrgGate permission="payroll.prepare" module="payroll">
        <p>secret payroll</p>
      </OrgGate>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(/Prepare payroll previews/);
    expect(screen.queryByText('secret payroll')).not.toBeInTheDocument();
  });

  it('explains plan gates', async () => {
    await mockService.auth.signInDemo('org-admin');
    await mockService.auth.switchOrganization('amberline-health');
    render(
      <OrgGate permission="payroll.view" module="payroll">
        <p>payroll</p>
      </OrgGate>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(/isn.t enabled/);
  });

  it('renders children when allowed', async () => {
    await mockService.auth.signInDemo('payroll-officer');
    render(
      <OrgGate permission="payroll.prepare" module="payroll">
        <p>payroll run</p>
      </OrgGate>,
    );
    expect(screen.getByText('payroll run')).toBeInTheDocument();
  });
});

describe('Wizard', () => {
  it('blocks advancing until validation passes and supports optional steps', async () => {
    const onFinish = vi.fn();
    let valid = false;
    render(
      <Wizard
        label="Test"
        finishLabel="Finish"
        onFinish={onFinish}
        steps={[
          { id: 'a', title: 'Name', content: <p>step a</p>, validate: () => (valid ? null : 'Enter a name.') },
          { id: 'b', title: 'Extras', content: <p>step b</p>, optional: true },
          { id: 'c', title: 'Done', content: <p>step c</p> },
        ]}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a name.');
    valid = true;
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByText('step b')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Skip' }));
    await userEvent.click(screen.getByRole('button', { name: 'Finish' }));
    expect(onFinish).toHaveBeenCalledOnce();
  });
});

describe('accessible widgets', () => {
  it('Tabs support arrow-key navigation', async () => {
    render(
      <Tabs
        label="Demo"
        tabs={[
          { id: 'one', label: 'One', content: <p>first</p> },
          { id: 'two', label: 'Two', content: <p>second</p> },
        ]}
      />,
    );
    screen.getByRole('tab', { name: 'One' }).focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Two' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('second');
  });

  it('DataTable sorts and exposes aria-sort', async () => {
    render(
      <DataTable
        caption="People"
        rows={[{ n: 'Bo', a: 3 }, { n: 'Al', a: 1 }]}
        rowKey={(r) => r.n}
        columns={[
          { key: 'n', header: 'Name', render: (r) => r.n, sortValue: (r) => r.n },
          { key: 'a', header: 'Age', render: (r) => r.a, sortValue: (r) => r.a, numeric: true },
        ]}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /Name/ }));
    const rows = within(screen.getByRole('table')).getAllByRole('row');
    expect(rows[1]).toHaveTextContent('Al');
    expect(screen.getByRole('columnheader', { name: /Name/ })).toHaveAttribute('aria-sort', 'ascending');
  });

  it('ChoiceChips are real radio/checkbox inputs', async () => {
    const onChange = vi.fn();
    render(
      <ToastProvider>
        <ChoiceChips legend="Mode" multiple value={['remote']} onChange={onChange} options={[{ value: 'remote', label: 'Remote' }, { value: 'hybrid', label: 'Hybrid' }]} />
      </ToastProvider>,
    );
    expect(screen.getByRole('group', { name: 'Mode' })).toBeInTheDocument();
    await act(async () => userEvent.click(screen.getByRole('checkbox', { name: 'Hybrid' })));
    expect(onChange).toHaveBeenCalledWith(['remote', 'hybrid']);
  });
});
