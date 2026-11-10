import type { CityIntent, OrgArea, PublicHqProjection } from '@grooveli/frontend-domain/public';

export type InteriorKind = 'apartment' | 'ai-center' | 'hq';

export interface Station {
  id: string;
  label: string;
  icon: string;
  /** Position in the room (x, z) and box size for the 3D prop. */
  at: [number, number];
  size: [number, number, number];
  color: string;
}

export const APARTMENT_STATIONS: Station[] = [
  // Apartment stations are physical objects (world/apartment.ts anchors): desk, laptop on it,
  // folders on the side table, wall trophy shelf, wall display, phone on the radio table.
  { id: 'desk', label: 'Career desk', icon: '🖥️', at: [-1.65, -2.55], size: [1.5, 0.76, 0.72], color: '#8b5cf6' },
  { id: 'laptop', label: 'Jobs laptop', icon: '💻', at: [-0.35, -2.6], size: [0.38, 0.27, 0.26], color: '#38bdf8' },
  { id: 'cv', label: 'CV folder', icon: '📁', at: [1.93, -2.85], size: [0.2, 0.28, 0.22], color: '#f59e0b' },
  { id: 'trophies', label: 'Trophy shelf', icon: '🏆', at: [-3.05, 0.3], size: [0.22, 0.3, 1.1], color: '#eab308' },
  { id: 'stats', label: 'Stats wall', icon: '📊', at: [-3.0, -1.45], size: [0.05, 0.7, 0.95], color: '#22d3ee' },
  { id: 'phone', label: 'Phone', icon: '📱', at: [2.6, -1.62], size: [0.08, 0.012, 0.16], color: '#f472b6' },
];

/**
 * AI Career Center stations are physical objects in the AI Center floor plan
 * (world/aiCenter.ts AI_ANCHORS). Ids `assistant`, `matching`, `interview`
 * and `learning` keep their original meaning and web destinations.
 */
export const AI_CENTER_STATIONS: Station[] = [
  { id: 'assistant', label: 'AI core — career assistant', icon: '🤖', at: [0, 1.05], size: [1.5, 2.6, 1.5], color: '#22d3ee' },
  { id: 'reception', label: 'AI Center welcome terminal', icon: '👋', at: [4.75, 4.6], size: [0.6, 1.5, 0.6], color: '#38bdf8' },
  { id: 'guidance', label: 'Career guidance pod', icon: '🧭', at: [3.5, -4.3], size: [1.3, 1.2, 0.6], color: '#14b8a6' },
  { id: 'cv', label: 'CV & profile pod', icon: '📄', at: [5.3, -4.3], size: [1.3, 1.2, 0.6], color: '#0ea5e9' },
  { id: 'jobs', label: 'Job search pod', icon: '🔍', at: [7.1, -4.3], size: [1.3, 1.2, 0.6], color: '#6366f1' },
  { id: 'learning', label: 'Skills training terminals', icon: '🎓', at: [-6.1, -4.35], size: [2.9, 1.2, 0.6], color: '#22c55e' },
  { id: 'assessment', label: 'Skills assessment station', icon: '📐', at: [-3.4, -4.95], size: [0.7, 1.6, 0.5], color: '#a855f7' },
  { id: 'matching', label: 'Career intelligence wall', icon: '📊', at: [0, -4.15], size: [4.6, 2.3, 0.1], color: '#6366f1' },
  { id: 'interview', label: 'Interview practice chamber', icon: '🎤', at: [-3.6, 1.8], size: [3.8, 2.8, 4], color: '#f97316' },
  { id: 'pathway', label: 'Career pathway map', icon: '🗺️', at: [-3.4, 4.4], size: [2, 1.2, 2], color: '#c084fc' },
];

/**
 * HQ stations are physical objects in the headquarters floor plan
 * (world/hq.ts HQ_ANCHORS). `audience` is a UX hint only — the web workspace
 * and backend decide what a signed-in member may open.
 */
export const HQ_STATIONS: Station[] = [
  { id: 'reception', label: 'Reception & check-in', icon: '🛎️', at: [6.7, 3.55], size: [3, 1.1, 0.8], color: '#0ea5e9' },
  { id: 'culture', label: 'Culture & values wall', icon: '✨', at: [4.55, 1.6], size: [0.3, 2.4, 5.4], color: '#a855f7' },
  { id: 'announcements', label: 'Visitor information', icon: '📣', at: [9.2, 1.3], size: [1, 1.8, 0.4], color: '#f59e0b' },
  { id: 'directory', label: 'Public directory', icon: '👥', at: [5.15, -0.6], size: [0.6, 1.4, 0.6], color: '#8b5cf6' },
  { id: 'employees', label: 'Employee entrance', icon: '🔐', at: [6.35, -1.25], size: [3, 1, 1], color: '#ef4444' },
  { id: 'careers', label: 'Careers board', icon: '📋', at: [-1.4, 5.15], size: [1.95, 2.2, 0.36], color: '#22c55e' },
  { id: 'recruitment', label: 'Recruitment desk', icon: '🧑‍💼', at: [0.0, 5.6], size: [1.3, 0.76, 0.7], color: '#14b8a6' },
  { id: 'interview', label: 'Interview room', icon: '🗓️', at: [-4.3, 1.95], size: [0.2, 0.3, 0.3], color: '#f97316' },
  { id: 'meeting', label: 'Conference room', icon: '🎥', at: [-5.6, -1.1], size: [2.6, 0.75, 1.1], color: '#6366f1' },
  { id: 'departments', label: 'Departmental offices', icon: '🏢', at: [-1.2, -4.6], size: [2.5, 0.5, 0.1], color: '#64748b' },
  { id: 'hr', label: 'HR & employee services', icon: '🗂️', at: [3.8, -2.75], size: [1.6, 1.1, 0.6], color: '#0d9488' },
  { id: 'records', label: 'Employee records', icon: '🔒', at: [4.1, -6.5], size: [2.4, 1.3, 0.6], color: '#475569' },
  { id: 'lounge', label: 'Lounge noticeboard', icon: '☕', at: [-9.0, 7.35], size: [0.95, 0.75, 0.05], color: '#d97706' },
  { id: 'management', label: 'Management suite', icon: '📈', at: [-6.15, -5.35], size: [1.9, 0.75, 0.85], color: '#7c3aed' },
];

export function stationsFor(kind: InteriorKind): Station[] {
  return kind === 'apartment' ? APARTMENT_STATIONS : kind === 'ai-center' ? AI_CENTER_STATIONS : HQ_STATIONS;
}

/** Primary web intent for each station — the city never reimplements the workflow. */
export function stationIntent(kind: InteriorKind, stationId: string, hq?: PublicHqProjection | null): CityIntent {
  if (kind === 'apartment') {
    switch (stationId) {
      case 'desk':
        return { type: 'openDashboard' };
      case 'laptop':
        return { type: 'browseJobs' };
      case 'cv':
        return { type: 'openCv' };
      case 'trophies':
        return { type: 'openAchievements' };
      case 'stats':
        return { type: 'openProfile' };
      default:
        return { type: 'openNotifications' };
    }
  }
  if (kind === 'ai-center') {
    switch (stationId) {
      case 'matching':
      case 'jobs':
        return { type: 'browseJobs' };
      case 'interview':
        return { type: 'openInterviews' };
      case 'learning':
        return { type: 'openLearning' };
      case 'assessment':
      case 'pathway':
        return { type: 'openSkills' };
      case 'cv':
        return { type: 'openCv' };
      default:
        return { type: 'openCareerCenter' };
    }
  }
  const orgId = hq?.organization.id ?? 'unknown';
  const area = (a: OrgArea): CityIntent => ({ type: 'openOrgArea', organizationId: orgId, area: a });
  switch (stationId) {
    case 'employees':
      return { type: 'openEmployeePortal', organizationId: orgId };
    case 'careers':
      return { type: 'browseJobs', district: hq?.organization.district };
    case 'recruitment':
      return { type: 'openRecruitment', organizationId: orgId };
    case 'interview':
      return { type: 'openApplications' };
    case 'meeting':
      return { type: 'openSocial' };
    case 'departments':
      return area('structure');
    case 'hr':
      return { type: 'openEmployeePortal', organizationId: orgId };
    case 'records':
      return area('people');
    case 'lounge':
      return area('engagement');
    case 'management':
      return area('overview');
    default:
      return { type: 'viewOrganization', organizationId: orgId };
  }
}
