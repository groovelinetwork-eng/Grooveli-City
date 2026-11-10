'use client';

import { AppShell, SessionGuard, type NavSection } from '@/components/shell/app-shell';

const NAV: NavSection[] = [
  {
    title: 'Career',
    items: [
      { href: '/app', label: 'Dashboard', icon: '🏠', exact: true },
      { href: '/app/jobs', label: 'Find jobs', icon: '🔎' },
      { href: '/app/applications', label: 'Applications', icon: '📨' },
      { href: '/app/interviews', label: 'Interviews', icon: '🗓️' },
      { href: '/app/career-center', label: 'AI Career Center', icon: '🤖' },
    ],
  },
  {
    title: 'Growth',
    items: [
      { href: '/app/missions', label: 'Missions & XP', icon: '🎯' },
      { href: '/app/learning', label: 'Learning', icon: '🎓' },
      { href: '/app/skills', label: 'Skills', icon: '🧩' },
      { href: '/app/achievements', label: 'Achievements', icon: '🏆' },
    ],
  },
  {
    title: 'Identity',
    items: [
      { href: '/app/profile', label: 'Profile & avatar', icon: '🪪' },
      { href: '/app/cv', label: 'CV', icon: '📄' },
    ],
  },
  {
    title: 'Community',
    items: [
      { href: '/social', label: 'Events & communities', icon: '🎉' },
      { href: '/city-directory', label: 'City directory', icon: '🗺️' },
    ],
  },
  {
    title: 'Account',
    items: [
      { href: '/app/notifications', label: 'Notifications', icon: '🔔' },
      { href: '/app/settings', label: 'Settings & privacy', icon: '⚙️' },
    ],
  },
];

export default function CandidateLayout({ children }: { children: React.ReactNode }) {
  return (
    <SessionGuard allow={(p) => p === 'candidate'}>
      <AppShell nav={NAV} areaLabel="Candidate workspace">
        {children}
      </AppShell>
    </SessionGuard>
  );
}
