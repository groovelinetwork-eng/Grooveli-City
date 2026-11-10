'use client';

import { useState } from 'react';
import { SOCIAL_PROFILES, getDistrict } from '@grooveli/frontend-domain';
import { useDemoStore } from '@/lib/store/store';
import { getService } from '@/lib/services';
import { useAction } from '@/lib/hooks/use-action';
import { Badge, Button, MockNotice, PageHeader } from '@/components/ui/primitives';
import { AvatarFigure } from '@/components/ui/avatar';
import { RequireSessionForAction, SocialNav } from '@/components/social/social-components';
import { ReportDialog } from '@/components/privacy-settings';

export default function PeoplePage() {
  const connections = useDemoStore((s) => s.connections);
  const blocked = useDemoStore((s) => s.privacy.blockedIds);
  const [report, setReport] = useState<string | null>(null);
  const connect = useAction((id: string) => getService().social.requestConnection(id), { success: 'Connection request sent (simulated)' });
  const remove = useAction((id: string) => getService().social.removeConnection(id), { success: 'Connection removed' });
  const block = useAction((id: string) => getService().social.block(id), { success: 'Blocked. They will no longer appear in your suggestions.' });
  const visible = SOCIAL_PROFILES.filter((p) => !blocked.includes(p.id));
  return (
    <div className="container section">
      <PageHeader title="People & connections" description="Professional networking across districts." />
      <SocialNav />
      <div className="stack">
        <MockNotice title="Simulated people">These are synthetic profiles. Connection requests are recorded locally and never delivered to anyone.</MockNotice>
        <ul className="grid" style={{ ['--min' as string]: '260px', listStyle: 'none', padding: 0 }}>
          {visible.map((p) => {
            const c = connections.find((x) => x.profileId === p.id);
            return (
              <li key={p.id} className="card stack" style={{ ['--gap' as string]: '6px' }}>
                <div className="row" style={{ flexWrap: 'nowrap' }}>
                  <div className="avatar-stage" style={{ padding: 4 }}>
                    <AvatarFigure avatar={p.avatar} size={48} label={`${p.name}'s avatar`} />
                  </div>
                  <div>
                    <strong>{p.name}</strong>
                    <p className="small muted">
                      {p.headline} · {getDistrict(p.district).name}
                    </p>
                  </div>
                </div>
                <div className="row">{p.interests.map((i) => <Badge key={i}>{i}</Badge>)}</div>
                <RequireSessionForAction next="/social/people">
                  <div className="row">
                    {!c ? (
                      <Button size="sm" variant="primary" onClick={() => connect.run(p.id)}>
                        Connect
                      </Button>
                    ) : c.status === 'pending' ? (
                      <Badge tone="warning">Request pending</Badge>
                    ) : (
                      <>
                        <Badge tone="success">Connected</Badge>
                        <Button size="sm" variant="ghost" onClick={() => remove.run(p.id)}>
                          Remove
                        </Button>
                      </>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => block.run(p.id)} aria-label={`Block ${p.name}`}>
                      Block
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setReport(p.name)} aria-label={`Report ${p.name}`}>
                      Report
                    </Button>
                  </div>
                </RequireSessionForAction>
              </li>
            );
          })}
        </ul>
        {blocked.length ? <p className="small muted">{blocked.length} blocked — manage in Privacy & safety.</p> : null}
      </div>
      <ReportDialog open={!!report} onClose={() => setReport(null)} targetName={report ?? ''} />
    </div>
  );
}
