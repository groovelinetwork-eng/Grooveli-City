import type {
  Announcement,
  CityEvent,
  Community,
  CultureInitiative,
  EngagementSurvey,
  FeedbackItem,
  Recognition,
  SocialProfile,
  TeamActivity,
} from '../types';
import { addDays } from '../random';
import { DEMO_TODAY } from '../constants';
import { randomAvatar } from '../avatar';
import { ORG_STAFF as ORG_EMPLOYEES } from './employees';

const at = (days: number, hour = 17) => `${addDays(DEMO_TODAY, days)}T${String(hour).padStart(2, '0')}:00:00.000Z`;

export const CITY_EVENTS: CityEvent[] = [
  { id: 'evt-tech-fair', title: 'Tech Hub Career Fair', kind: 'career-fair', district: 'tech', venue: 'Kestrel Systems HQ atrium', start: at(2, 10), end: at(2, 16), host: 'Kestrel Systems', hostOrganizationId: 'kestrel-systems', description: 'Meet engineering and product teams, join portfolio reviews and quick chats.', capacity: 200, attendeeCount: 134, tags: ['tech', 'hiring', 'networking'], communityId: 'com-builders' },
  { id: 'evt-plaza-meetup', title: 'Friday Plaza Meetup', kind: 'meetup', district: 'plaza', venue: 'Grooveli Plaza stage', start: at(4, 18), end: at(4, 20), host: 'Grooveli community team', description: 'Open-air networking with music, food trucks and lightning talks.', capacity: 400, attendeeCount: 212, tags: ['networking', 'social'] },
  { id: 'evt-cv-clinic', title: 'CV Clinic', kind: 'workshop', district: 'recruitment', venue: 'Meridian Talent Partners', start: at(1, 12), end: at(1, 14), host: 'Meridian Talent Partners', hostOrganizationId: 'meridian-talent', description: 'Recruiters review CVs live and share tips.', capacity: 40, attendeeCount: 38, tags: ['cv', 'career'], communityId: 'com-hr' },
  { id: 'evt-creative-night', title: 'Creative Night Market', kind: 'social', district: 'creative', venue: 'Sound Studios courtyard', start: at(6, 19), end: at(6, 23), host: 'Halcyon Creative Co.', hostOrganizationId: 'halcyon-creative', description: 'Showcase of portfolios, music sets and short films.', capacity: 300, attendeeCount: 97, tags: ['creative', 'music', 'social'], communityId: 'com-creators' },
  { id: 'evt-fintech-talk', title: 'Fintech Futures Panel', kind: 'conference', district: 'finance', venue: 'Market Exchange hall', start: at(9, 15), end: at(9, 17), host: 'Copperleaf Finance', hostOrganizationId: 'copperleaf-finance', description: 'Panel on digital lending, risk and regulation.', capacity: 150, attendeeCount: 61, tags: ['finance', 'fintech'] },
  { id: 'evt-health-open', title: 'Healthcare Careers Open Day', kind: 'career-fair', district: 'healthcare', venue: 'Amberline Health main clinic', start: at(12, 9), end: at(12, 13), host: 'Amberline Health', hostOrganizationId: 'amberline-health', description: 'Meet clinical leads and tour the clinic.', capacity: 80, attendeeCount: 22, tags: ['healthcare', 'hiring'] },
  { id: 'evt-excel-sprint', title: 'Excel Skills Sprint', kind: 'workshop', district: 'university', venue: 'Grooveli Academy lab', start: at(3, 14), end: at(3, 16), host: 'Grooveli Academy', hostOrganizationId: 'grooveli-academy', description: 'Hands-on challenge session with tutors.', capacity: 60, attendeeCount: 44, tags: ['learning', 'excel'], communityId: 'com-learners' },
  { id: 'evt-chefs-table', title: "Chef's Table Mixer", kind: 'social', district: 'hospitality', venue: 'Street Café Row', start: at(5, 19), end: at(5, 22), host: 'Saffron & Salt Hospitality', hostOrganizationId: 'saffron-salt', description: 'Tasting evening and hospitality careers chat.', capacity: 50, attendeeCount: 41, tags: ['hospitality', 'social'] },
];

export const COMMUNITIES: Community[] = [
  { id: 'com-builders', name: 'City Builders', description: 'Engineers, designers and PMs building products.', topic: 'Technology', members: 1840, district: 'tech', affinity: { thinking: 'analytical', workStyle: 'collaborative' }, posts: [{ id: 'p1', author: 'Kofi A.', text: 'Who is going to the Tech Hub fair on Wednesday?', at: at(-1, 9) }, { id: 'p2', author: 'Amara E.', text: 'Sharing my portfolio review notes in the thread.', at: at(-2, 15) }] },
  { id: 'com-creators', name: 'Creators Collective', description: 'Designers, musicians, filmmakers and writers.', topic: 'Creative', members: 960, district: 'creative', affinity: { thinking: 'creative', outlook: 'adventurous' }, posts: [{ id: 'p1', author: 'Zara N.', text: 'Night market slots open for short films!', at: at(-1, 12) }] },
  { id: 'com-hr', name: 'People & Talent Circle', description: 'HR, recruitment and people operations professionals.', topic: 'HR', members: 720, district: 'recruitment', affinity: { workStyle: 'collaborative', role: 'supporter' }, posts: [{ id: 'p1', author: 'Grace A.', text: 'Template: structured interview scorecards.', at: at(-3, 10) }] },
  { id: 'com-learners', name: 'Lifelong Learners', description: 'Study groups and accountability partners.', topic: 'Learning', members: 2310, district: 'university', affinity: { energy: 'introverted', outlook: 'reserved' }, posts: [{ id: 'p1', author: 'Seun L.', text: 'SQL study group every Tuesday 7pm.', at: at(-1, 18) }] },
  { id: 'com-founders', name: 'Founders Floor', description: 'Entrepreneurs and freelancers swapping lessons.', topic: 'Entrepreneurship', members: 540, district: 'corporate', affinity: { role: 'leader', energy: 'extroverted' }, posts: [{ id: 'p1', author: 'Musa D.', text: 'Pricing your first freelance project — AMA.', at: at(-2, 11) }] },
  { id: 'com-care', name: 'Care Professionals', description: 'Nurses, pharmacists and health-tech folks.', topic: 'Healthcare', members: 410, district: 'healthcare', affinity: { role: 'supporter' }, posts: [] },
];

export const SOCIAL_PROFILES: SocialProfile[] = [
  ['soc-1', 'Amara Eze', 'Product Designer', 'creative', ['Design', 'Music']],
  ['soc-2', 'Kofi Asante', 'Engineering Manager', 'tech', ['Mentoring', 'Cloud']],
  ['soc-3', 'Grace Ayodele', 'HR & Talent Lead', 'healthcare', ['Recruitment', 'Wellbeing']],
  ['soc-4', 'Seun Lawal', 'Data Analyst', 'university', ['SQL', 'Study groups']],
  ['soc-5', 'Zara Nkosi', 'Filmmaker', 'creative', ['Film', 'Storytelling']],
  ['soc-6', 'Musa Danjuma', 'Founder', 'corporate', ['Startups', 'Fintech']],
  ['soc-7', 'Efua Boateng', 'Financial Analyst', 'finance', ['Investing', 'Excel']],
  ['soc-8', 'Obinna Chukwu', 'Sous Chef', 'hospitality', ['Food', 'Events']],
].map(([id, name, headline, district, interests]) => ({
  id: id as string,
  name: name as string,
  headline: headline as string,
  district: district as SocialProfile['district'],
  interests: interests as string[],
  avatar: randomAvatar(id as string),
}));

const kEmployees = ORG_EMPLOYEES['kestrel-systems']!;
const aEmployees = ORG_EMPLOYEES['amberline-health']!;

export const SEED_ANNOUNCEMENTS: Announcement[] = [
  { id: 'ann-k-1', organizationId: 'kestrel-systems', title: 'We are hiring across Engineering', body: 'Six open roles in Engineering and Product. Visit our HQ in the Technology Hub or browse vacancies.', author: 'Ifeoma Nwosu', publishedAt: at(-2, 9), audience: 'public-hq', pinned: true },
  { id: 'ann-k-2', organizationId: 'kestrel-systems', title: 'Q4 all-hands on Thursday', body: 'Join us at 15:00 in the atrium or online.', author: 'Ifeoma Nwosu', publishedAt: at(-1, 8), audience: 'all', pinned: false },
  { id: 'ann-k-3', organizationId: 'kestrel-systems', title: 'Open enrolment for HMO upgrades', body: 'Submit changes before 30 November. (Synthetic.)', author: 'Daniel Mensah', publishedAt: at(-5, 11), audience: 'all', pinned: false },
  { id: 'ann-a-1', organizationId: 'amberline-health', title: 'Healthcare Careers Open Day', body: 'Meet our clinical leads on the 21st.', author: 'Grace Ayodele', publishedAt: at(-3, 9), audience: 'public-hq', pinned: true },
];

export const SEED_RECOGNITION: Recognition[] = kEmployees.slice(0, 6).map((e, i) => ({
  id: `rec-k-${i + 1}`,
  organizationId: 'kestrel-systems',
  from: kEmployees[(i + 3) % kEmployees.length]!.name,
  toEmployeeId: e.id,
  value: ['Ownership', 'Curiosity', 'Candour', 'Customer obsession'][i % 4]!,
  message: ['Shipped the billing fix overnight.', 'Great onboarding docs!', 'Honest, kind feedback in the retro.', 'Turned around an unhappy client.', 'Mentored two interns brilliantly.', 'Automated the weekly report.'][i]!,
  at: at(-i - 1, 12),
  reactions: 3 + i * 2,
}));

export const SEED_SURVEYS: EngagementSurvey[] = [
  {
    id: 'svy-k-pulse',
    organizationId: 'kestrel-systems',
    title: 'November pulse survey',
    status: 'open',
    anonymous: true,
    closesOn: addDays(DEMO_TODAY, 10),
    questions: [
      { id: 'q1', text: 'I would recommend Kestrel as a place to work (0–10).', kind: 'scale' },
      { id: 'q2', text: 'I have the tools I need to do my job (0–10).', kind: 'scale' },
      { id: 'q3', text: 'What one thing should we change?', kind: 'text' },
    ],
    responses: Array.from({ length: 17 }, (_, i) => ({
      at: at(-i % 5, 10),
      answers: { q1: [9, 8, 7, 10, 6, 9, 8, 5, 9, 10, 7, 8, 9, 6, 8, 9, 7][i]!, q2: [7, 8, 6, 9, 5, 8, 7, 6, 8, 9, 7, 7, 8, 5, 7, 8, 6][i]!, q3: i % 4 === 0 ? 'Fewer meetings' : '' },
    })),
  },
  {
    id: 'svy-k-q3',
    organizationId: 'kestrel-systems',
    title: 'Q3 engagement survey',
    status: 'closed',
    anonymous: true,
    closesOn: addDays(DEMO_TODAY, -40),
    questions: [{ id: 'q1', text: 'Overall satisfaction (0–10)', kind: 'scale' }],
    responses: Array.from({ length: 22 }, (_, i) => ({ at: at(-50, 10), answers: { q1: 5 + (i % 5) } })),
  },
];

export const SEED_FEEDBACK: FeedbackItem[] = [
  { id: 'fb-k-1', organizationId: 'kestrel-systems', category: 'idea', body: 'Quarterly hack day for internal tools.', at: at(-3, 10), status: 'acknowledged', anonymous: true },
  { id: 'fb-k-2', organizationId: 'kestrel-systems', category: 'concern', body: 'Satellite office internet is unreliable.', at: at(-6, 14), status: 'actioned', anonymous: false },
  { id: 'fb-k-3', organizationId: 'kestrel-systems', category: 'praise', body: 'The new onboarding buddy programme is great.', at: at(-1, 9), status: 'new', anonymous: true },
];

export const SEED_ACTIVITIES: TeamActivity[] = [
  { id: 'act-k-1', organizationId: 'kestrel-systems', title: 'Team football at the park', date: addDays(DEMO_TODAY, 5), location: 'City Park', kind: 'wellbeing', rsvps: kEmployees.slice(0, 9).map((e) => e.id) },
  { id: 'act-k-2', organizationId: 'kestrel-systems', title: 'Lunch & learn: accessibility', date: addDays(DEMO_TODAY, 2), location: 'HQ atrium', kind: 'learning', rsvps: kEmployees.slice(3, 15).map((e) => e.id) },
  { id: 'act-k-3', organizationId: 'kestrel-systems', title: 'Community coding club volunteering', date: addDays(DEMO_TODAY, 12), location: 'Grooveli Academy', kind: 'volunteering', rsvps: kEmployees.slice(10, 14).map((e) => e.id) },
  { id: 'act-a-1', organizationId: 'amberline-health', title: 'Staff wellness morning', date: addDays(DEMO_TODAY, 4), location: 'Main Clinic', kind: 'wellbeing', rsvps: aEmployees.slice(0, 5).map((e) => e.id) },
];

export const SEED_INITIATIVES: CultureInitiative[] = [
  { id: 'ci-k-1', organizationId: 'kestrel-systems', title: 'Written-first decision records', owner: 'Engineering', progress: 70, status: 'active' },
  { id: 'ci-k-2', organizationId: 'kestrel-systems', title: 'Mentorship circles', owner: 'People & Finance', progress: 45, status: 'active' },
  { id: 'ci-k-3', organizationId: 'kestrel-systems', title: 'Publish internal pay bands', owner: 'People & Finance', progress: 100, status: 'done' },
  { id: 'ci-k-4', organizationId: 'kestrel-systems', title: 'Quiet Wednesdays', owner: 'Leadership', progress: 10, status: 'planned' },
];

/** Monthly synthetic engagement / turnover history for analytics charts. */
export const WORKFORCE_HISTORY: Record<string, { month: string; headcount: number; exits: number; hires: number; enps: number; payrollSpend: number }[]> = {
  'kestrel-systems': [
    { month: '2026-06', headcount: 22, exits: 1, hires: 2, enps: 18, payrollSpend: 19_800_000 },
    { month: '2026-07', headcount: 23, exits: 0, hires: 1, enps: 21, payrollSpend: 20_700_000 },
    { month: '2026-08', headcount: 25, exits: 1, hires: 3, enps: 24, payrollSpend: 22_400_000 },
    { month: '2026-09', headcount: 26, exits: 1, hires: 2, enps: 22, payrollSpend: 23_100_000 },
    { month: '2026-10', headcount: 27, exits: 0, hires: 1, enps: 27, payrollSpend: 24_200_000 },
    { month: '2026-11', headcount: 28, exits: 1, hires: 2, enps: 29, payrollSpend: 25_300_000 },
  ],
  'amberline-health': [
    { month: '2026-06', headcount: 11, exits: 1, hires: 1, enps: 10, payrollSpend: 5_100_000 },
    { month: '2026-07', headcount: 12, exits: 0, hires: 1, enps: 12, payrollSpend: 5_500_000 },
    { month: '2026-08', headcount: 12, exits: 1, hires: 1, enps: 9, payrollSpend: 5_500_000 },
    { month: '2026-09', headcount: 13, exits: 0, hires: 1, enps: 14, payrollSpend: 5_900_000 },
    { month: '2026-10', headcount: 13, exits: 0, hires: 0, enps: 15, payrollSpend: 5_900_000 },
    { month: '2026-11', headcount: 14, exits: 0, hires: 1, enps: 17, payrollSpend: 6_300_000 },
  ],
};
