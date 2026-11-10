'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getService } from '@/lib/services';
import { useAction } from '@/lib/hooks/use-action';
import { config } from '@/lib/config';
import { Button, Card, PageHeader } from '@/components/ui/primitives';
import { Dialog, Tabs } from '@/components/ui/widgets';
import { PrivacySafetySettings } from '@/components/privacy-settings';

export default function SettingsPage() {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const reset = useAction(() => getService().demo.reset(), { success: 'Demo data reset' });
  return (
    <>
      <PageHeader title="Settings & privacy" description="Control your visibility, invitations, messages and safety." />
      <Tabs
        label="Settings sections"
        tabs={[
          { id: 'privacy', label: 'Privacy & safety', content: <PrivacySafetySettings /> },
          {
            id: 'account',
            label: 'Account & data',
            content: (
              <div className="stack">
                <Card title="Session">
                  <p className="small muted">
                    Demo session · data mode: <strong>{config.dataMode}</strong>. Authentication, password changes and account deletion require backend
                    services that don&apos;t exist yet.
                  </p>
                </Card>
                <Card title="Reset demo data">
                  <p className="small muted">Restores every synthetic dataset (jobs, applications, XP, organisations) in this browser.</p>
                  <div style={{ marginTop: 10 }}>
                    <Button variant="danger" onClick={() => setConfirm(true)}>
                      Reset demo data…
                    </Button>
                  </div>
                </Card>
              </div>
            ),
          },
        ]}
      />
      <Dialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Reset all demo data?"
        actions={
          <>
            <Button onClick={() => setConfirm(false)}>Cancel</Button>
            <Button
              variant="danger"
              pending={reset.pending}
              onClick={async () => {
                await reset.run();
                setConfirm(false);
                router.push('/app');
              }}
            >
              Reset
            </Button>
          </>
        }
      >
        <p>This clears your profile edits, applications, XP and every change made by any persona in this browser. It cannot be undone.</p>
      </Dialog>
    </>
  );
}
