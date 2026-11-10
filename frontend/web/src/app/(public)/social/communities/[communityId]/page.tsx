'use client';

import Link from 'next/link';
import { use, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { formatDateTime, getDistrict } from '@grooveli/frontend-domain';
import { useDemoStore } from '@/lib/store/store';
import { getService } from '@/lib/services';
import { useAction } from '@/lib/hooks/use-action';
import { Badge, Button, Card, EmptyState, LinkButton } from '@/components/ui/primitives';
import { TextArea } from '@/components/ui/form';
import { RequireSessionForAction, SocialNav, EventCard } from '@/components/social/social-components';
import { ReportDialog } from '@/components/privacy-settings';

export default function CommunityPage({ params }: { params: Promise<{ communityId: string }> }) {
  const { communityId } = use(params);
  const community = useDemoStore((s) => s.communities.find((c) => c.id === communityId));
  const joined = useDemoStore((s) => s.joinedCommunities.includes(communityId));
  const events = useDemoStore(useShallow((s) => s.events.filter((e) => e.communityId === communityId)));
  const rsvps = useDemoStore((s) => s.rsvps);
  const [text, setText] = useState('');
  const [reportTarget, setReportTarget] = useState<string | null>(null);
  const toggle = useAction(() => getService().social.toggleCommunity(communityId), { success: (r) => (r.joined ? 'Joined community' : 'Left community') });
  const post = useAction((t: string) => getService().social.postToCommunity(communityId, t), { success: 'Posted (visible only in this browser)' });

  if (!community) return <div className="container section"><EmptyState title="Community not found" action={<LinkButton href="/social">All communities</LinkButton>} /></div>;

  return (
    <div className="container section">
      <SocialNav />
      <div className="stack" style={{ ['--gap' as string]: '16px' }}>
        <nav aria-label="Breadcrumb" className="small">
          <Link href="/social">Communities</Link> / {community.name}
        </nav>
        <header className="row-between">
          <div>
            <h1>{community.name}</h1>
            <p className="muted">
              {community.description} · {community.members.toLocaleString()} members · {getDistrict(community.district).name}
            </p>
          </div>
          <RequireSessionForAction next={`/social/communities/${communityId}`}>
            <Button variant={joined ? 'default' : 'primary'} onClick={() => toggle.run()} pending={toggle.pending} aria-pressed={joined}>
              {joined ? '✓ Member — leave' : 'Join community'}
            </Button>
          </RequireSessionForAction>
        </header>
        <div className="grid-2">
          <Card title="Discussion" actions={<Badge tone="mock">Synthetic posts</Badge>}>
            <RequireSessionForAction next={`/social/communities/${communityId}`}>
              {joined ? (
                <form
                  className="stack"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (await post.run(text)) setText('');
                  }}
                >
                  <TextArea label="Share something" value={text} onChange={(e) => setText(e.target.value)} maxLength={600} rows={3} />
                  <div>
                    <Button type="submit" variant="primary" size="sm" disabled={!text.trim()} pending={post.pending}>
                      Post
                    </Button>
                  </div>
                </form>
              ) : (
                <p className="small muted">Join to post.</p>
              )}
            </RequireSessionForAction>
            <ul className="stack" style={{ listStyle: 'none', padding: 0, marginTop: 12 }}>
              {community.posts.length === 0 ? <li className="muted small">No posts yet.</li> : null}
              {community.posts.map((p) => (
                <li key={p.id} className="card" style={{ boxShadow: 'none', padding: 12 }}>
                  <div className="row-between">
                    <strong>{p.author}</strong>
                    <span className="row small muted">
                      {formatDateTime(p.at)}
                      <button type="button" className="btn btn-sm btn-ghost" onClick={() => setReportTarget(`post by ${p.author}`)} aria-label={`Report post by ${p.author}`}>
                        ⚑ Report
                      </button>
                    </span>
                  </div>
                  <p className="small">{p.text}</p>
                </li>
              ))}
            </ul>
          </Card>
          <Card title="Community events">
            {events.length === 0 ? (
              <p className="small muted">No events scheduled.</p>
            ) : (
              <div className="stack">
                {events.map((e) => (
                  <EventCard key={e.id} event={e} attending={rsvps.includes(e.id)} />
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
      <ReportDialog open={!!reportTarget} onClose={() => setReportTarget(null)} targetName={reportTarget ?? ''} />
    </div>
  );
}
