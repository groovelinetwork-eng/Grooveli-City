/**
 * Read-only relationship and permission checks, shared by the validator's dry
 * run and the generated post-seed-verify.sql. Each query returns one row with
 * a column `bad` (number of violations); 0 means the check passes.
 */
import { quote } from './sql.mjs';

const list = (values) => `ARRAY[${values.map(quote).join(', ')}]::text[]`;

/**
 * @param {{ placeholder: string, testAccountIds: string[], seedUserIds: string[], platformAdminIds: string[] }} ctx
 */
export function integrityChecks({ placeholder, testAccountIds, seedUserIds, platformAdminIds }) {
  return [
    ['Invitation token hashes are 64 hex characters and unique', `SELECT count(*)::int AS bad FROM "Invitation" WHERE "tokenHash" !~ '^[0-9a-f]{64}$' OR "tokenHash" IN (SELECT "tokenHash" FROM "Invitation" GROUP BY 1 HAVING count(*) > 1)`],
    ['Only test accounts can have a usable password (all other seeded accounts keep the placeholder)', `SELECT count(*)::int AS bad FROM "User" WHERE id = ANY(${list(seedUserIds)}) AND NOT (id = ANY(${list(testAccountIds)})) AND "passwordHash" <> ${quote(placeholder)}`],
    ['Seeded memberships outside the test accounts hold exactly the "employee" role', `SELECT count(*)::int AS bad FROM "Membership" WHERE "userId" = ANY(${list(seedUserIds)}) AND NOT ("userId" = ANY(${list(testAccountIds)})) AND roles <> ARRAY['employee']::"OrgRole"[]`],
    ['Only the designated platform account has platform-admin rights among seeded accounts', `SELECT count(*)::int AS bad FROM "User" WHERE id = ANY(${list(seedUserIds)}) AND "platformRole" = 'admin' AND NOT (id = ANY(${list(platformAdminIds)}))`],
    ['Membership → employee in the same organisation, linked to the same user', `SELECT count(*)::int AS bad FROM "Membership" m JOIN "Employee" e ON e.id = m."employeeId" WHERE e."organizationId" <> m."organizationId" OR e."userId" IS DISTINCT FROM m."userId"`],
    ['Employee → linked user has a membership of that organisation pointing back to the record', `SELECT count(*)::int AS bad FROM "Employee" e LEFT JOIN "Membership" m ON m."userId" = e."userId" AND m."organizationId" = e."organizationId" AND m."employeeId" = e.id WHERE e."userId" IS NOT NULL AND m.id IS NULL`],
    ['Activity RSVPs point at memberships of the same organisation', `SELECT count(*)::int AS bad FROM "ActivityRsvp" r JOIN "TeamActivity" a ON a.id = r."activityId" LEFT JOIN "Membership" m ON m.id = r."membershipId" WHERE m.id IS NULL OR m."organizationId" <> a."organizationId"`],
    ['Recognition senders are members and recipients are employees of the organisation', `SELECT count(*)::int AS bad FROM "Recognition" r LEFT JOIN "Employee" e ON e.id = r."toEmployeeId" AND e."organizationId" = r."organizationId" LEFT JOIN "Membership" m ON m."userId" = r."fromUserId" AND m."organizationId" = r."organizationId" WHERE e.id IS NULL OR m.id IS NULL`],
    ['Announcement authors are members of the organisation', `SELECT count(*)::int AS bad FROM "Announcement" a LEFT JOIN "Membership" m ON m."userId" = a."authorId" AND m."organizationId" = a."organizationId" WHERE m.id IS NULL`],
    ['Non-anonymous feedback has an author; anonymous feedback has none', `SELECT count(*)::int AS bad FROM "FeedbackItem" WHERE (NOT anonymous AND ("authorId" IS NULL OR "authorName" IS NULL)) OR (anonymous AND ("authorId" IS NOT NULL OR "authorName" IS NOT NULL))`],
    ['Community post authors are community members', `SELECT count(*)::int AS bad FROM "CommunityPost" p LEFT JOIN "CommunityMember" cm ON cm."communityId" = p."communityId" AND cm."userId" = p."authorId" WHERE cm."userId" IS NULL`],
    ['Interviews match their application\'s job and candidate', `SELECT count(*)::int AS bad FROM "Interview" i JOIN "Application" a ON a.id = i."applicationId" WHERE a."jobId" <> i."jobId" OR a."candidateId" <> i."candidateId"`],
    ['Applicants are onboarded candidates visible to employers', `SELECT count(*)::int AS bad FROM "Application" a JOIN "User" u ON u.id = a."candidateId" LEFT JOIN "CandidateProfile" p ON p."userId" = u.id WHERE u."accountType" <> 'candidate' OR NOT u."onboardingComplete" OR p.visibility NOT IN ('public', 'employers')`],
    ['Shortlist and assessment-result applications exist and belong to the same vacancy', `SELECT ((SELECT count(*) FROM "Shortlist" s CROSS JOIN LATERAL unnest(s."applicationIds") AS x(id) LEFT JOIN "Application" a ON a.id = x.id WHERE a.id IS NULL OR a."jobId" <> s."jobId") + (SELECT count(*) FROM "Assessment" s CROSS JOIN LATERAL jsonb_array_elements(s.results) AS r(v) LEFT JOIN "Application" a ON a.id = r.v->>'applicationId' WHERE a.id IS NULL OR a."jobId" <> s."jobId"))::int AS bad`],
  ];
}
