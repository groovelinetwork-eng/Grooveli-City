import type { Achievement, CandidateProfile, Course, Mission, SkillChallenge } from '../types';
import { DEFAULT_AVATAR } from '../avatar';

export const MISSIONS: Mission[] = [
  {
    id: 'mission-first-job',
    title: 'Get Your First Job',
    description: 'A guided path from profile to interview-ready.',
    kind: 'career',
    district: 'ai-center',
    orientations: 'all',
    rewardXp: 250,
    objectives: [
      { id: 'o1', label: 'Complete your career profile', check: 'profile-complete' },
      { id: 'o2', label: 'Upload your CV', check: 'cv-uploaded' },
      { id: 'o3', label: 'Complete the career assessment', check: 'assessment-done' },
      { id: 'o4', label: 'Apply to three suitable jobs', check: 'applications-3' },
      { id: 'o5', label: 'Complete an interview simulation', check: 'interview-sim-done' },
    ],
  },
  {
    id: 'mission-upskill',
    title: 'Sharpen a Skill',
    description: 'Complete a skill challenge and a short course.',
    kind: 'skill',
    district: 'university',
    orientations: 'all',
    rewardXp: 150,
    objectives: [
      { id: 'o1', label: 'Complete any skill challenge', check: 'skill-challenge-done' },
      { id: 'o2', label: 'Finish a course', check: 'course-done' },
    ],
  },
  {
    id: 'mission-freelance',
    title: 'Freelancer Launchpad',
    description: 'Prepare your profile for project work.',
    kind: 'career',
    district: 'creative',
    orientations: ['freelancer', 'entrepreneur', 'open'],
    rewardXp: 200,
    objectives: [
      { id: 'o1', label: 'Complete your career profile', check: 'profile-complete' },
      { id: 'o2', label: 'Complete any skill challenge', check: 'skill-challenge-done' },
      { id: 'o3', label: 'Apply to three suitable opportunities', check: 'applications-3' },
    ],
  },
  {
    id: 'mission-graduate',
    title: 'Graduate Kickstart',
    description: 'From campus to first role.',
    kind: 'career',
    district: 'university',
    orientations: ['student', 'open'],
    rewardXp: 200,
    objectives: [
      { id: 'o1', label: 'Upload your CV', check: 'cv-uploaded' },
      { id: 'o2', label: 'Finish a course', check: 'course-done' },
      { id: 'o3', label: 'Complete an interview simulation', check: 'interview-sim-done' },
    ],
  },
];

export const SKILL_CHALLENGES: SkillChallenge[] = [
  {
    id: 'ch-excel',
    title: 'Excel Challenge',
    skill: 'Excel',
    district: 'university',
    xp: 100,
    questions: [
      { id: 'q1', prompt: 'Which function returns a value from a table based on a lookup in the first column?', options: ['SUMIF', 'VLOOKUP', 'COUNTA', 'CONCAT'], answer: 1, explanation: 'VLOOKUP (or XLOOKUP) searches the first column and returns a matching value.' },
      { id: 'q2', prompt: 'What does $A$1 mean in a formula?', options: ['Currency format', 'An absolute reference', 'A named range', 'A hidden cell'], answer: 1, explanation: 'Dollar signs lock the column and row when copying the formula.' },
      { id: 'q3', prompt: 'Best way to summarise sales by region and month?', options: ['Pivot table', 'Conditional formatting', 'Freeze panes', 'Data validation'], answer: 0, explanation: 'Pivot tables aggregate by multiple dimensions quickly.' },
    ],
  },
  {
    id: 'ch-communication',
    title: 'Communication Exercise',
    skill: 'Communication',
    district: 'corporate',
    xp: 100,
    questions: [
      { id: 'q1', prompt: 'A stakeholder emails angrily about a missed deadline. First step?', options: ['Ignore until calm', 'Acknowledge, own the impact, propose a new date', 'Blame the team', 'Escalate immediately'], answer: 1, explanation: 'Acknowledge and offer a concrete path forward.' },
      { id: 'q2', prompt: 'Best structure for a status update?', options: ['Chronological diary', 'Outcome, risks, next steps, asks', 'Only the good news', 'A long attachment'], answer: 1, explanation: 'Lead with what matters to the reader.' },
    ],
  },
  {
    id: 'ch-recruitment',
    title: 'Recruitment Mission',
    skill: 'Recruitment',
    district: 'recruitment',
    xp: 100,
    questions: [
      { id: 'q1', prompt: 'Which signal should NOT be used to rank candidates?', options: ['Required certification', 'Relevant experience', 'Personality type preference', 'Demonstrated skills'], answer: 2, explanation: 'Personality preferences are not job-relevant evidence and can introduce bias.' },
      { id: 'q2', prompt: 'Structured interviews help because…', options: ['They are shorter', 'Every candidate is assessed on the same criteria', 'They need no preparation', 'They replace references'], answer: 1, explanation: 'Consistency improves fairness and predictive value.' },
    ],
  },
  {
    id: 'ch-sales',
    title: 'Sales Conversation',
    skill: 'Sales',
    district: 'hospitality',
    xp: 100,
    questions: [
      { id: 'q1', prompt: 'A customer says the price is too high. Best response?', options: ['Immediately discount', 'Ask what value they need and connect it to outcomes', 'End the call', 'Repeat the price'], answer: 1, explanation: 'Discovery before concessions.' },
      { id: 'q2', prompt: 'When should you ask for the commitment?', options: ['Never', 'After confirming needs and handling objections', 'In the first minute', 'Only by email'], answer: 1, explanation: 'Close once value is established.' },
    ],
  },
  {
    id: 'ch-security',
    title: 'Security Basics',
    skill: 'Cybersecurity',
    district: 'tech',
    xp: 100,
    questions: [
      { id: 'q1', prompt: 'Which is the strongest login protection?', options: ['Long password only', 'Password + MFA', 'Security questions', 'Shared team password'], answer: 1, explanation: 'MFA protects against stolen passwords.' },
      { id: 'q2', prompt: 'Where should access tokens never appear?', options: ['Secure cookies', 'URL query strings', 'Server memory', 'Encrypted vaults'], answer: 1, explanation: 'URLs leak via logs, history and referrers.' },
    ],
  },
  {
    id: 'ch-care',
    title: 'Patient Triage Basics',
    skill: 'Patient care',
    district: 'healthcare',
    xp: 100,
    questions: [
      { id: 'q1', prompt: 'Triage prioritises patients by…', options: ['Arrival time only', 'Clinical urgency', 'Age only', 'Insurance status'], answer: 1, explanation: 'Urgency drives priority.' },
    ],
  },
  {
    id: 'ch-finance',
    title: 'Financial Statements',
    skill: 'Accounting',
    district: 'finance',
    xp: 100,
    questions: [
      { id: 'q1', prompt: 'Which statement shows assets, liabilities and equity?', options: ['Income statement', 'Balance sheet', 'Cash-flow statement', 'Budget'], answer: 1, explanation: 'The balance sheet is a point-in-time position.' },
    ],
  },
  {
    id: 'ch-design',
    title: 'Design Critique',
    skill: 'Design',
    district: 'creative',
    xp: 100,
    questions: [
      { id: 'q1', prompt: 'Minimum contrast ratio for normal body text (WCAG AA)?', options: ['2:1', '3:1', '4.5:1', '10:1'], answer: 2, explanation: 'AA requires 4.5:1 for normal text.' },
    ],
  },
];

export const COURSES: Course[] = [
  { id: 'course-excel', title: 'Excel for Work', provider: 'Grooveli Academy', skill: 'Excel', hours: 6, xp: 200, modules: ['Formulas', 'Lookups', 'Pivot tables', 'Charts'] },
  { id: 'course-interview', title: 'Interview Confidence', provider: 'Grooveli Academy', skill: 'Communication', hours: 3, xp: 200, modules: ['STAR answers', 'Research the employer', 'Questions to ask'] },
  { id: 'course-sql', title: 'SQL Foundations', provider: 'Grooveli Academy', skill: 'SQL', hours: 8, xp: 200, modules: ['SELECT basics', 'Joins', 'Aggregation', 'Window functions'] },
  { id: 'course-hr', title: 'HR Operations Essentials', provider: 'Meridian Talent Partners', skill: 'HR Operations', hours: 5, xp: 200, modules: ['Employee lifecycle', 'Leave & attendance', 'Payroll inputs', 'Policies'] },
  { id: 'course-ux', title: 'UX Research in Practice', provider: 'Halcyon Creative Co.', skill: 'UX research', hours: 4, xp: 200, modules: ['Planning', 'Interviews', 'Synthesis'] },
];

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'ach-profile', title: 'First Impressions', description: 'Complete your career profile', icon: '🪪', rule: { type: 'profile-complete' } },
  { id: 'ach-first-app', title: 'First Application', description: 'Submit your first (simulated) application', icon: '📨', rule: { type: 'applications', min: 1 } },
  { id: 'ach-challenger', title: 'Challenger', description: 'Complete 3 skill challenges', icon: '🧩', rule: { type: 'challenges', min: 3 } },
  { id: 'ach-mission', title: 'Mission Complete', description: 'Complete a mission', icon: '🎯', rule: { type: 'missions', min: 1 } },
  { id: 'ach-500', title: 'Rising Talent', description: 'Earn 500 XP', icon: '⭐', rule: { type: 'xp', min: 500 } },
  { id: 'ach-1500', title: 'Career Climber', description: 'Earn 1,500 XP', icon: '🏆', rule: { type: 'xp', min: 1500 } },
];

/** Default synthetic candidate used when the demo candidate persona is chosen without onboarding. */
export const DEMO_CANDIDATE: CandidateProfile = {
  id: 'cand-demo',
  displayName: 'Tolu Adebayo',
  headline: 'HR Operations Specialist · open to remote roles',
  location: 'Grooveli City',
  gender: null,
  yearsExperience: 4,
  orientation: 'employee',
  personality: {
    energy: 'balanced',
    thinking: 'analytical',
    workStyle: 'collaborative',
    outlook: 'adventurous',
    role: 'supporter',
  },
  avatar: { ...DEFAULT_AVATAR, hair: 2, hairColor: 0, outfit: 1, outfitColor: 2 },
  photoDataUrl: null,
  summary: 'HR generalist with four years in recruitment and HR operations. (Synthetic profile.)',
  skills: [
    { name: 'Recruitment', level: 86 },
    { name: 'HR Operations', level: 80 },
    { name: 'Excel', level: 64 },
    { name: 'Payroll', level: 55 },
    { name: 'Communication', level: 78 },
  ],
  certifications: ['CIPM Associate (synthetic)'],
  experience: [
    { id: 'exp-1', title: 'HR Officer', company: 'Brightway Retail (fictional)', start: '2023-02', end: null, summary: 'Ran end-to-end hiring for 40+ roles per year.' },
    { id: 'exp-2', title: 'Recruitment Assistant', company: 'Harbour Staffing (fictional)', start: '2021-06', end: '2023-01', summary: 'Screened candidates and coordinated interviews.' },
  ],
  education: [{ id: 'edu-1', school: 'Grooveli City University (fictional)', qualification: 'BSc Business Administration', year: '2021' }],
  preferences: {
    desiredRoles: ['HR', 'Recruitment', 'People operations'],
    locations: ['Remote', 'Grooveli City'],
    minSalary: 300_000,
    workModes: ['remote', 'hybrid'],
    employmentTypes: ['full-time'],
  },
  cvFile: null,
  visibility: 'employers',
};
