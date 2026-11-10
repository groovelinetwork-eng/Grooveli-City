import type { CityBuilding, CityDistrict, DistrictId } from '../types';

/**
 * Fictional city layout. 4 × 3 block grid; block (3,2) is a decorative park.
 * NYC-inspired energy (dense blocks, taxis, plazas) without real geography.
 */
export const DISTRICTS: CityDistrict[] = [
  {
    id: 'plaza',
    name: 'Grooveli Plaza',
    tagline: 'Spawn point & city square',
    description: 'The heart of the city: meet people, catch live events and get your bearings.',
    color: '#38bdf8',
    grid: { x: 1, z: 1 },
    industries: [],
    actions: [
      { label: "Today's events", intent: { type: 'openSocial' } },
      { label: 'Browse all jobs', intent: { type: 'browseJobs' } },
    ],
  },
  {
    id: 'corporate',
    name: 'Corporate District',
    tagline: 'Employers & headquarters',
    description: 'Company headquarters, employer profiles and open positions.',
    color: '#6366f1',
    grid: { x: 2, z: 2 },
    industries: ['Operations', 'Logistics', 'Consulting', 'Analytics'],
    actions: [
      { label: 'Explore jobs', intent: { type: 'browseJobs', district: 'corporate' } },
      { label: 'Skill missions', intent: { type: 'openMissions', district: 'corporate' } },
    ],
  },
  {
    id: 'recruitment',
    name: 'Recruitment Agency',
    tagline: 'Matching & talent discovery',
    description: "Grooveli's recruitment marketplace: matching, talent discovery and guided job search.",
    color: '#f59e0b',
    grid: { x: 3, z: 1 },
    industries: ['Recruitment', 'HR'],
    actions: [
      { label: 'Find opportunities with the assistant', intent: { type: 'openCareerCenter' } },
      { label: 'Browse all jobs', intent: { type: 'browseJobs' } },
    ],
  },
  {
    id: 'university',
    name: 'University & Training Center',
    tagline: 'Courses, challenges, certifications',
    description: 'Learning paths, skill missions and certifications.',
    color: '#22c55e',
    grid: { x: 0, z: 0 },
    industries: ['Education', 'Training'],
    actions: [
      { label: 'Learning paths', intent: { type: 'openLearning' } },
      { label: 'Skill missions', intent: { type: 'openMissions', district: 'university' } },
    ],
  },
  {
    id: 'tech',
    name: 'Technology Hub',
    tagline: 'Software, AI, data, security',
    description: 'Software engineering, AI, data, cybersecurity, product, DevOps and IT.',
    color: '#06b6d4',
    grid: { x: 1, z: 0 },
    industries: ['Software', 'AI', 'Data', 'Cybersecurity', 'Product', 'DevOps', 'IT'],
    actions: [
      { label: 'Explore jobs', intent: { type: 'browseJobs', district: 'tech' } },
      { label: 'Skill missions', intent: { type: 'openMissions', district: 'tech' } },
      { label: 'Talk to the career assistant', intent: { type: 'openCareerCenter' } },
    ],
  },
  {
    id: 'creative',
    name: 'Creative District',
    tagline: 'Design, music, media, marketing',
    description: 'Design, music, content, photography, film, media, marketing and creative technology.',
    color: '#ec4899',
    grid: { x: 0, z: 1 },
    industries: ['Design', 'Music', 'Content', 'Photography', 'Film', 'Media', 'Marketing'],
    actions: [
      { label: 'Explore jobs', intent: { type: 'browseJobs', district: 'creative' } },
      { label: 'Skill missions', intent: { type: 'openMissions', district: 'creative' } },
    ],
  },
  {
    id: 'healthcare',
    name: 'Healthcare District',
    tagline: 'Care, pharmacy, health tech',
    description: 'Healthcare, nursing, pharmacy, medical administration and health technology.',
    color: '#ef4444',
    grid: { x: 2, z: 0 },
    industries: ['Healthcare', 'Nursing', 'Pharmacy', 'Medical administration', 'Health technology'],
    actions: [
      { label: 'Explore jobs', intent: { type: 'browseJobs', district: 'healthcare' } },
      { label: 'Skill missions', intent: { type: 'openMissions', district: 'healthcare' } },
    ],
  },
  {
    id: 'hospitality',
    name: 'Hospitality District',
    tagline: 'Hotels, food, tourism, events',
    description: 'Hotels, restaurants, tourism, events, customer service and hospitality management.',
    color: '#f97316',
    grid: { x: 2, z: 1 },
    industries: ['Hotels', 'Restaurants', 'Tourism', 'Events', 'Customer service'],
    actions: [
      { label: 'Explore jobs', intent: { type: 'browseJobs', district: 'hospitality' } },
      { label: 'Skill missions', intent: { type: 'openMissions', district: 'hospitality' } },
    ],
  },
  {
    id: 'finance',
    name: 'Finance District',
    tagline: 'Banking, fintech, accounting',
    description: 'Banking, accounting, investment, fintech, insurance and financial analysis.',
    color: '#eab308',
    grid: { x: 3, z: 0 },
    industries: ['Banking', 'Accounting', 'Investment', 'Fintech', 'Insurance'],
    actions: [
      { label: 'Explore jobs', intent: { type: 'browseJobs', district: 'finance' } },
      { label: 'Skill missions', intent: { type: 'openMissions', district: 'finance' } },
    ],
  },
  {
    id: 'apartment',
    name: 'Your Apartment',
    tagline: 'Personal career headquarters',
    description: 'Your desk, laptop, CV folder, trophy shelf, stats wall and phone.',
    color: '#a855f7',
    grid: { x: 0, z: 2 },
    industries: [],
    actions: [
      { label: 'Career dashboard', intent: { type: 'openDashboard' } },
      { label: 'CV folder', intent: { type: 'openCv' } },
    ],
  },
  {
    id: 'ai-center',
    name: 'AI Career Center',
    tagline: 'Your career companion',
    description: 'Guidance, job discovery, CV help and interview practice (simulated assistant in this build).',
    color: '#14b8a6',
    grid: { x: 1, z: 2 },
    industries: [],
    actions: [{ label: 'Open the Career Center', intent: { type: 'openCareerCenter' } }],
  },
];

export const PARK_BLOCK = { x: 3, z: 2 } as const;

export function getDistrict(id: DistrictId): CityDistrict {
  const d = DISTRICTS.find((x) => x.id === id);
  if (!d) throw new Error(`Unknown district ${id}`);
  return d;
}

export const DISTRICT_IDS = DISTRICTS.map((d) => d.id) as DistrictId[];

export const BUILDINGS: CityBuilding[] = [
  // Tech hub
  { id: 'b-kestrel', district: 'tech', name: 'Kestrel Systems HQ', kind: 'hq', organizationId: 'kestrel-systems', offset: { x: -0.45, z: -0.35 }, size: { w: 0.8, d: 0.75, h: 3.4 }, color: '#1e3a8a', enterable: true },
  { id: 'b-tech-tower', district: 'tech', name: 'Hub Tower', kind: 'filler', offset: { x: 0.5, z: -0.45 }, size: { w: 0.7, d: 0.6, h: 2.6 }, color: '#334155', enterable: false },
  { id: 'b-tech-lab', district: 'tech', name: 'Open Lab', kind: 'filler', offset: { x: 0.45, z: 0.45 }, size: { w: 0.8, d: 0.6, h: 1.2 }, color: '#0e7490', enterable: false },
  // Corporate
  { id: 'b-orbitwell', district: 'corporate', name: 'Orbitwell Analytics', kind: 'hq', organizationId: 'orbitwell-analytics', offset: { x: -0.45, z: -0.4 }, size: { w: 0.75, d: 0.7, h: 4.2 }, color: '#312e81', enterable: true },
  { id: 'b-tidewater', district: 'corporate', name: 'Tidewater Logistics', kind: 'hq', organizationId: 'tidewater-logistics', offset: { x: 0.45, z: 0.35 }, size: { w: 0.8, d: 0.8, h: 2.8 }, color: '#475569', enterable: true },
  { id: 'b-corp-tower', district: 'corporate', name: 'Meridian Tower', kind: 'filler', offset: { x: 0.5, z: -0.5 }, size: { w: 0.55, d: 0.55, h: 5 }, color: '#1e293b', enterable: false },
  // Finance
  { id: 'b-copperleaf', district: 'finance', name: 'Copperleaf Finance', kind: 'hq', organizationId: 'copperleaf-finance', offset: { x: -0.4, z: -0.3 }, size: { w: 0.85, d: 0.8, h: 4.6 }, color: '#78350f', enterable: true },
  { id: 'b-exchange', district: 'finance', name: 'Market Exchange', kind: 'landmark', offset: { x: 0.45, z: 0.4 }, size: { w: 0.8, d: 0.7, h: 1.8 }, color: '#a16207', enterable: false },
  // Healthcare
  { id: 'b-amberline', district: 'healthcare', name: 'Amberline Health', kind: 'hq', organizationId: 'amberline-health', offset: { x: -0.3, z: -0.3 }, size: { w: 1.1, d: 0.9, h: 2.4 }, color: '#f1f5f9', enterable: true },
  { id: 'b-pharmacy', district: 'healthcare', name: 'City Pharmacy', kind: 'service', offset: { x: 0.55, z: 0.5 }, size: { w: 0.55, d: 0.5, h: 0.9 }, color: '#dc2626', enterable: false },
  // Hospitality
  { id: 'b-saffron', district: 'hospitality', name: 'Saffron & Salt Hotel', kind: 'hq', organizationId: 'saffron-salt', offset: { x: -0.35, z: -0.35 }, size: { w: 0.9, d: 0.8, h: 3 }, color: '#9a3412', enterable: true },
  { id: 'b-cafe', district: 'hospitality', name: 'Street Café Row', kind: 'venue', offset: { x: 0.5, z: 0.45 }, size: { w: 0.7, d: 0.5, h: 0.7 }, color: '#fb923c', enterable: false },
  // Creative
  { id: 'b-halcyon', district: 'creative', name: 'Halcyon Creative Co.', kind: 'hq', organizationId: 'halcyon-creative', offset: { x: -0.35, z: 0.3 }, size: { w: 0.85, d: 0.85, h: 2 }, color: '#9d174d', enterable: true },
  { id: 'b-studio', district: 'creative', name: 'Sound Studios', kind: 'venue', offset: { x: 0.45, z: -0.45 }, size: { w: 0.7, d: 0.6, h: 1.4 }, color: '#db2777', enterable: false },
  // Recruitment
  { id: 'b-meridian', district: 'recruitment', name: 'Meridian Talent Partners', kind: 'hq', organizationId: 'meridian-talent', offset: { x: 0, z: -0.2 }, size: { w: 1.1, d: 0.9, h: 2.6 }, color: '#b45309', enterable: true },
  // University
  { id: 'b-academy', district: 'university', name: 'Grooveli Academy', kind: 'hq', organizationId: 'grooveli-academy', offset: { x: -0.2, z: -0.25 }, size: { w: 1.2, d: 0.9, h: 1.8 }, color: '#166534', enterable: true },
  { id: 'b-library', district: 'university', name: 'Library', kind: 'landmark', offset: { x: 0.55, z: 0.5 }, size: { w: 0.5, d: 0.5, h: 1.1 }, color: '#4d7c0f', enterable: false },
  // Plaza
  { id: 'b-plaza-stage', district: 'plaza', name: 'Plaza Stage', kind: 'venue', offset: { x: 0, z: -0.62 }, size: { w: 0.6, d: 0.25, h: 0.3 }, color: '#0ea5e9', enterable: false },
  // Apartment
  { id: 'b-apartment', district: 'apartment', name: 'Your Apartment', kind: 'residential', offset: { x: 0, z: -0.2 }, size: { w: 0.9, d: 0.8, h: 2.2 }, color: '#6b21a8', enterable: true },
  { id: 'b-apts-2', district: 'apartment', name: 'Residences', kind: 'filler', offset: { x: 0.55, z: 0.5 }, size: { w: 0.5, d: 0.5, h: 1.6 }, color: '#7e22ce', enterable: false },
  // AI center
  { id: 'b-ai-center', district: 'ai-center', name: 'AI Career Center', kind: 'landmark', offset: { x: 0, z: -0.15 }, size: { w: 1, d: 1, h: 2.4 }, color: '#0f766e', enterable: true },
];
