'use client';

import { useState } from 'react';
import { SOCIAL_PROFILES, type PrivacySettings } from '@grooveli/frontend-domain';
import { useDemoStore } from '@/lib/store/store';
import { getService } from '@/lib/services';
import { useAction } from '@/lib/hooks/use-action';
import { Badge, Button, Card, InfoNotice } from '@/components/ui/primitives';
import { Checkbox, SelectField, TextArea } from '@/components/ui/form';
import { Dialog } from '@/components/ui/widgets';

export const REPORT_REASONS = ['Harassment or bullying', 'Spam or scam', 'Impersonation', 'Inappropriate content', 'Fake job or employer', 'Other'];

/** Report flow shared by settings, social profiles and community posts. */
export function ReportDialog({ open, onClose, targetName }: { open: boolean; onClose: () => void; targetName: string }) {
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const [doneId, setDoneId] = useState<string | null>(null);
  const report = useAction((input: { targetName: string; reason: string; details: string }) => getService().social.report(input));
  const close = () => {
    setReason('');
    setDetails('');
    setDoneId(null);
    onClose();
  };
  return (
    <Dialog
      open={open}
      onClose={close}
      title={doneId ? 'Report received' : `Report ${targetName}`}
      actions={
        doneId ? (
          <Button onClick={close}>Close</Button>
        ) : (
          <>
            <Button onClick={close}>Cancel</Button>
            <Button
              variant="danger"
              disabled={!reason}
              pending={report.pending}
              onClick={async () => {
                const r = await report.run({ targetName, reason, details });
                if (r) setDoneId(r.reportId);
              }}
            >
              Submit report
            </Button>
          </>
        )
      }
    >
      {doneId ? (
        <p>
          Reference <code>{doneId}</code>. In this demo, reports are stored locally — no moderation team receives them yet (moderation policy is an open
          decision).
        </p>
      ) : (
        <>
          <SelectField
            label="Reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            options={[{ value: '', label: 'Choose a reason' }, ...REPORT_REASONS.map((r) => ({ value: r, label: r }))]}
            required
          />
          <TextArea label="Details (optional)" value={details} onChange={(e) => setDetails(e.target.value)} maxLength={1000} />
        </>
      )}
    </Dialog>
  );
}

export function PrivacySafetySettings() {
  const privacy = useDemoStore((s) => s.privacy);
  const reports = useDemoStore((s) => s.reports);
  const [draft, setDraft] = useState<PrivacySettings>(privacy);
  const save = useAction((p: Partial<PrivacySettings>) => getService().social.updatePrivacy(p), { success: 'Privacy settings saved' });
  const unblock = useAction((id: string) => getService().social.unblock(id), { success: 'Unblocked' });
  const set = <K extends keyof PrivacySettings>(k: K, v: PrivacySettings[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const audience = [
    { value: 'everyone', label: 'Everyone' },
    { value: 'connections', label: 'Connections only' },
  ];
  return (
    <div className="stack">
      <Card
        title="Privacy & presence"
        actions={
          <Button variant="primary" size="sm" pending={save.pending} disabled={JSON.stringify(draft) === JSON.stringify(privacy)} onClick={() => save.run(draft)}>
            Save
          </Button>
        }
      >
        <div className="grid-2">
          <SelectField
            label="Who can see me in the city"
            value={draft.presenceVisibility}
            onChange={(e) => set('presenceVisibility', e.target.value as PrivacySettings['presenceVisibility'])}
            options={[...audience, { value: 'hidden', label: 'Nobody (explore invisibly)' }]}
            hint="Applies once live presence exists; today other people in the city are simulated."
          />
          <SelectField
            label="Who can invite me to events"
            value={draft.allowInvitations}
            onChange={(e) => set('allowInvitations', e.target.value as PrivacySettings['allowInvitations'])}
            options={[...audience, { value: 'nobody', label: 'Nobody' }]}
          />
          <SelectField
            label="Who can message me"
            value={draft.allowMessages}
            onChange={(e) => set('allowMessages', e.target.value as PrivacySettings['allowMessages'])}
            options={[...audience, { value: 'nobody', label: 'Nobody' }]}
          />
        </div>
        <div className="stack" style={{ marginTop: 12, ['--gap' as string]: '6px' }}>
          <Checkbox label="Show me in event attendee lists" checked={draft.showInEventAttendees} onChange={(e) => set('showInEventAttendees', e.target.checked)} />
          <Checkbox label="Let people find my profile in community search" checked={draft.profileDiscoverable} onChange={(e) => set('profileDiscoverable', e.target.checked)} />
        </div>
      </Card>
      <Card title="Blocked people">
        {privacy.blockedIds.length === 0 ? (
          <p className="small muted">You haven&apos;t blocked anyone.</p>
        ) : (
          <ul className="stack" style={{ listStyle: 'none', padding: 0 }}>
            {privacy.blockedIds.map((id) => (
              <li key={id} className="row-between">
                <span>{SOCIAL_PROFILES.find((p) => p.id === id)?.name ?? id}</span>
                <Button size="sm" onClick={() => unblock.run(id)}>
                  Unblock
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card title="Safety reports">
        <InfoNotice>Report people, posts or employers from their profile or post menu. Reports are stored locally in demo mode.</InfoNotice>
        {reports.length ? (
          <ul className="small" style={{ paddingLeft: 20, marginTop: 8 }}>
            {reports.map((r) => (
              <li key={r.id}>
                {r.targetName} — {r.reason} <Badge>{r.status}</Badge>
              </li>
            ))}
          </ul>
        ) : null}
      </Card>
    </div>
  );
}
