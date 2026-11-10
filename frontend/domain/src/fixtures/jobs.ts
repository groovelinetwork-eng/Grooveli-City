import type { DistrictId, EmploymentType, ExperienceLevel, Job, WorkMode } from '../types';
import { addDays } from '../random';
import { DEMO_TODAY } from '../constants';
import { getOrganization } from './orgs';

type JobSeed = [
  id: string,
  org: string,
  title: string,
  department: string,
  workMode: WorkMode,
  type: EmploymentType,
  level: ExperienceLevel,
  minYears: number,
  salaryK: [number, number],
  skills: string[],
  postedDaysAgo: number,
  quals?: string[],
];

const SEEDS: JobSeed[] = [
  ['job-k-backend', 'kestrel-systems', 'Backend Engineer', 'Engineering', 'hybrid', 'full-time', 'mid', 3, [700, 1100], ['Node.js', 'TypeScript', 'PostgreSQL', 'APIs'], 3],
  ['job-k-frontend', 'kestrel-systems', 'Senior Frontend Engineer', 'Engineering', 'remote', 'full-time', 'senior', 5, [900, 1400], ['React', 'TypeScript', 'Accessibility', 'Testing'], 2],
  ['job-k-pd', 'kestrel-systems', 'Product Designer', 'Product & Design', 'hybrid', 'full-time', 'mid', 3, [600, 950], ['Figma', 'UX research', 'Prototyping', 'Design systems'], 6],
  ['job-k-data', 'kestrel-systems', 'Data Analyst', 'Engineering', 'remote', 'full-time', 'entry', 1, [380, 600], ['SQL', 'Excel', 'Python', 'Dashboards'], 1],
  ['job-k-people', 'kestrel-systems', 'HR Generalist', 'People & Finance', 'remote', 'full-time', 'mid', 3, [320, 480], ['HR Operations', 'Recruitment', 'Excel', 'Employee relations'], 4],
  ['job-k-devops', 'kestrel-systems', 'DevOps Engineer', 'Engineering', 'hybrid', 'contract', 'senior', 5, [1000, 1500], ['Kubernetes', 'AWS', 'Terraform', 'Observability'], 9],
  ['job-k-intern', 'kestrel-systems', 'Software Engineering Intern', 'Engineering', 'onsite', 'internship', 'entry', 0, [120, 180], ['JavaScript', 'Git', 'Problem solving'], 5],
  ['job-k-support', 'kestrel-systems', 'Customer Success Associate', 'Operations', 'onsite', 'full-time', 'entry', 1, [220, 320], ['Customer service', 'Communication', 'CRM'], 7],
  ['job-k-sec', 'kestrel-systems', 'Security Analyst', 'Engineering', 'hybrid', 'full-time', 'mid', 3, [750, 1050], ['Cybersecurity', 'SIEM', 'Incident response'], 12],
  ['job-a-nurse', 'amberline-health', 'Registered Nurse', 'Clinical', 'onsite', 'full-time', 'mid', 2, [280, 420], ['Patient care', 'Triage', 'Clinical documentation'], 2, ['Nursing licence']],
  ['job-a-pharm', 'amberline-health', 'Pharmacist', 'Clinical', 'onsite', 'full-time', 'mid', 2, [380, 520], ['Pharmacology', 'Dispensing', 'Patient counselling'], 8, ['Pharmacy licence']],
  ['job-a-admin', 'amberline-health', 'Medical Administrator', 'Administration', 'onsite', 'part-time', 'entry', 1, [150, 220], ['Scheduling', 'Billing', 'Excel', 'Customer service'], 3],
  ['job-a-healthtech', 'amberline-health', 'Health Tech Product Manager', 'Administration', 'hybrid', 'full-time', 'senior', 5, [800, 1200], ['Product management', 'Healthcare', 'Data'], 10],
  ['job-c-analyst', 'copperleaf-finance', 'Financial Analyst', 'Finance', 'hybrid', 'full-time', 'mid', 3, [550, 800], ['Financial modelling', 'Excel', 'Reporting'], 4],
  ['job-c-risk', 'copperleaf-finance', 'Credit Risk Officer', 'Risk', 'hybrid', 'full-time', 'mid', 3, [600, 850], ['Credit analysis', 'Excel', 'Regulation'], 6],
  ['job-c-acct', 'copperleaf-finance', 'Accountant', 'Finance', 'onsite', 'full-time', 'mid', 2, [400, 600], ['Accounting', 'IFRS', 'Excel'], 11, ['ICAN or ACCA']],
  ['job-c-backend', 'copperleaf-finance', 'Fintech Backend Engineer', 'Technology', 'hybrid', 'full-time', 'senior', 5, [1100, 1600], ['Java', 'Payments', 'PostgreSQL', 'APIs'], 2],
  ['job-s-chef', 'saffron-salt', 'Sous Chef', 'Kitchen', 'onsite', 'full-time', 'mid', 3, [250, 350], ['Culinary', 'Kitchen management', 'Food safety'], 5],
  ['job-s-fo', 'saffron-salt', 'Front Office Supervisor', 'Front of house', 'onsite', 'full-time', 'mid', 2, [200, 300], ['Customer service', 'Hospitality', 'Leadership'], 3],
  ['job-s-events', 'saffron-salt', 'Events Coordinator', 'Events', 'onsite', 'contract', 'entry', 1, [180, 260], ['Event planning', 'Communication', 'Vendor management'], 9],
  ['job-h-motion', 'halcyon-creative', 'Motion Designer', 'Studio', 'remote', 'freelance', 'mid', 2, [400, 650], ['After Effects', 'Animation', 'Storyboarding'], 1],
  ['job-h-content', 'halcyon-creative', 'Content Strategist', 'Studio', 'hybrid', 'full-time', 'mid', 3, [380, 560], ['Content', 'Marketing', 'Copywriting', 'Analytics'], 6],
  ['job-h-photo', 'halcyon-creative', 'Photographer (Contract)', 'Production', 'onsite', 'contract', 'entry', 1, [200, 320], ['Photography', 'Lighting', 'Editing'], 14],
  ['job-h-music', 'halcyon-creative', 'Music Producer', 'Audio', 'hybrid', 'freelance', 'senior', 5, [500, 900], ['Music production', 'Mixing', 'Sound design'], 4],
  ['job-m-recruiter', 'meridian-talent', 'Talent Acquisition Partner', 'Delivery', 'hybrid', 'full-time', 'mid', 3, [350, 550], ['Recruitment', 'Sourcing', 'Stakeholder management'], 2],
  ['job-m-hrops', 'meridian-talent', 'Remote HR Operations Specialist', 'Client services', 'remote', 'full-time', 'mid', 3, [320, 450], ['HR Operations', 'Excel', 'Payroll', 'Compliance'], 1],
  ['job-g-tutor', 'grooveli-academy', 'Excel & Data Tutor', 'Faculty', 'remote', 'part-time', 'mid', 2, [180, 280], ['Excel', 'Teaching', 'Data'], 7],
  ['job-g-grad', 'grooveli-academy', 'Graduate Learning Associate', 'Programmes', 'onsite', 'full-time', 'entry', 0, [160, 220], ['Communication', 'Organisation', 'Microsoft Office'], 3],
  ['job-o-ds', 'orbitwell-analytics', 'Data Scientist', 'Analytics', 'hybrid', 'full-time', 'senior', 4, [900, 1300], ['Python', 'Machine learning', 'SQL', 'Statistics'], 5],
  ['job-o-consult', 'orbitwell-analytics', 'Business Analyst', 'Consulting', 'onsite', 'full-time', 'entry', 1, [300, 450], ['Excel', 'Requirements', 'Presentation'], 8],
  ['job-t-ops', 'tidewater-logistics', 'Operations Supervisor', 'Hub operations', 'onsite', 'full-time', 'mid', 3, [260, 380], ['Logistics', 'Leadership', 'Excel'], 2],
  ['job-t-hr', 'tidewater-logistics', 'HR Business Partner', 'People', 'hybrid', 'full-time', 'senior', 5, [500, 700], ['HR Operations', 'Employee relations', 'Recruitment', 'Payroll'], 6],
];

export const JOBS: Job[] = SEEDS.map(([id, org, title, department, workMode, employmentType, level, minYears, [min, max], skills, ago, quals]) => {
  const o = getOrganization(org)!;
  const postedOn = addDays(DEMO_TODAY, -ago);
  return {
    id,
    organizationId: org,
    title,
    department,
    district: o.district as DistrictId,
    location: workMode === 'remote' ? 'Remote' : o.headquarters,
    workMode,
    employmentType,
    level,
    minYears,
    salaryMin: min * 1000,
    salaryMax: max * 1000,
    skills,
    requiredQualifications: quals ?? [],
    description: `${o.name} is hiring a ${title} to join ${department}. ${o.description} (Synthetic listing — not a real vacancy.)`,
    responsibilities: [
      `Own day-to-day ${skills[0]} work within ${department}`,
      `Collaborate with the wider team using ${skills.slice(1, 3).join(' and ')}`,
      'Document decisions and share learning with peers',
    ],
    postedOn,
    closesOn: addDays(postedOn, 30),
    status: 'published',
  };
});

export function getJob(id: string): Job | undefined {
  return JOBS.find((j) => j.id === id);
}
