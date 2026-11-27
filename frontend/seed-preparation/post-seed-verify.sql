-- Grooveli seed: post-seed verification. GENERATED FILE. Read-only (SELECT only).
-- Run: psql "$DATABASE_URL" -f frontend/seed-preparation/post-seed-verify.sql
-- "rows:" lines count only the seeded rows (by id), so other development data does not affect them.
-- Every line must show ok = true. Before provisioning, no account has a usable password; afterwards only the test accounts do.
SELECT check_name, expected, actual, actual = expected AS ok FROM (
  SELECT 'rows: TeamActivity', 4, (SELECT count(*)::int FROM "TeamActivity" WHERE "id" = ANY(ARRAY['act-k-1', 'act-k-2', 'act-k-3', 'act-a-1']::text[]))
  UNION ALL
  SELECT 'rows: ActivityRsvp', 13, (SELECT count(*)::int FROM "ActivityRsvp" WHERE "activityId" = ANY(ARRAY['act-k-1', 'act-k-2']::text[]))
  UNION ALL
  SELECT 'rows: Announcement', 4, (SELECT count(*)::int FROM "Announcement" WHERE "id" = ANY(ARRAY['ann-k-1', 'ann-k-2', 'ann-k-3', 'ann-a-1']::text[]))
  UNION ALL
  SELECT 'rows: Organization', 9, (SELECT count(*)::int FROM "Organization" WHERE "id" = ANY(ARRAY['kestrel-systems', 'amberline-health', 'copperleaf-finance', 'saffron-salt', 'halcyon-creative', 'meridian-talent', 'grooveli-academy', 'orbitwell-analytics', 'tidewater-logistics']::text[]))
  UNION ALL
  SELECT 'rows: Job', 32, (SELECT count(*)::int FROM "Job" WHERE "id" = ANY(ARRAY['job-k-backend', 'job-k-frontend', 'job-k-pd', 'job-k-data', 'job-k-people', 'job-k-devops', 'job-k-intern', 'job-k-support', 'job-k-sec', 'job-a-nurse', 'job-a-pharm', 'job-a-admin', 'job-a-healthtech', 'job-c-analyst', 'job-c-risk', 'job-c-acct', 'job-c-backend', 'job-s-chef', 'job-s-fo', 'job-s-events', 'job-h-motion', 'job-h-content', 'job-h-photo', 'job-h-music', 'job-m-recruiter', 'job-m-hrops', 'job-g-tutor', 'job-g-grad', 'job-o-ds', 'job-o-consult', 'job-t-ops', 'job-t-hr']::text[]))
  UNION ALL
  SELECT 'rows: User', 60, (SELECT count(*)::int FROM "User" WHERE "id" = ANY(ARRAY['seed-platform-admin', 'cand-demo', 'user-ifeoma-nwosu', 'user-daniel-mensah', 'user-zainab-bello', 'user-chidi-okeke', 'soc-3', 'soc-2', 'user-emp-kestrel-04', 'user-emp-kestrel-05', 'user-emp-kestrel-06', 'user-emp-kestrel-07', 'user-emp-kestrel-08', 'user-emp-kestrel-09', 'talent-01', 'talent-02', 'talent-03', 'talent-04', 'talent-05', 'talent-06', 'talent-07', 'talent-08', 'talent-09', 'talent-10', 'talent-11', 'talent-12', 'talent-13', 'talent-14', 'talent-15', 'talent-16', 'talent-17', 'talent-18', 'talent-19', 'talent-20', 'talent-21', 'talent-22', 'talent-23', 'talent-24', 'talent-25', 'talent-26', 'talent-27', 'talent-28', 'talent-29', 'talent-30', 'talent-31', 'talent-32', 'talent-33', 'talent-34', 'talent-35', 'talent-36', 'talent-37', 'talent-38', 'talent-39', 'talent-40', 'soc-1', 'soc-4', 'soc-5', 'soc-6', 'soc-7', 'soc-8']::text[]))
  UNION ALL
  SELECT 'rows: Application', 60, (SELECT count(*)::int FROM "Application" WHERE "id" = ANY(ARRAY['app-seed-2', 'app-seed-3', 'app-seed-4', 'app-seed-5', 'app-seed-6', 'app-seed-7', 'app-seed-8', 'app-seed-9', 'app-seed-10', 'app-seed-11', 'app-seed-14', 'app-seed-15', 'app-seed-16', 'app-seed-17', 'app-seed-18', 'app-seed-19', 'app-seed-20', 'app-seed-21', 'app-seed-22', 'app-seed-23', 'app-seed-24', 'app-seed-25', 'app-seed-26', 'app-seed-27', 'app-seed-29', 'app-seed-30', 'app-seed-31', 'app-seed-32', 'app-seed-33', 'app-seed-35', 'app-seed-36', 'app-seed-37', 'app-seed-38', 'app-seed-39', 'app-seed-42', 'app-seed-43', 'app-seed-44', 'app-seed-45', 'app-seed-48', 'app-seed-49', 'app-seed-50', 'app-seed-51', 'app-seed-52', 'app-seed-53', 'app-seed-54', 'app-seed-55', 'app-seed-56', 'app-seed-57', 'app-seed-58', 'app-seed-59', 'app-seed-60', 'app-seed-61', 'app-seed-62', 'app-seed-63', 'app-seed-64', 'app-seed-67', 'app-seed-68', 'app-seed-69', 'app-seed-70', 'app-seed-71']::text[]))
  UNION ALL
  SELECT 'rows: Assessment', 3, (SELECT count(*)::int FROM "Assessment" WHERE "id" = ANY(ARRAY['asm-backend', 'asm-pd', 'asm-nurse']::text[]))
  UNION ALL
  SELECT 'rows: Employee', 42, (SELECT count(*)::int FROM "Employee" WHERE "id" = ANY(ARRAY['emp-kestrel-01', 'emp-kestrel-02', 'emp-kestrel-03', 'emp-kestrel-04', 'emp-kestrel-05', 'emp-kestrel-06', 'emp-kestrel-07', 'emp-kestrel-08', 'emp-kestrel-09', 'emp-kestrel-10', 'emp-kestrel-11', 'emp-kestrel-12', 'emp-kestrel-13', 'emp-kestrel-14', 'emp-kestrel-15', 'emp-kestrel-16', 'emp-kestrel-17', 'emp-kestrel-18', 'emp-kestrel-19', 'emp-kestrel-20', 'emp-kestrel-21', 'emp-kestrel-22', 'emp-kestrel-23', 'emp-kestrel-24', 'emp-kestrel-25', 'emp-kestrel-26', 'emp-kestrel-27', 'emp-kestrel-28', 'emp-amberline-01', 'emp-amberline-02', 'emp-amberline-03', 'emp-amberline-04', 'emp-amberline-05', 'emp-amberline-06', 'emp-amberline-07', 'emp-amberline-08', 'emp-amberline-09', 'emp-amberline-10', 'emp-amberline-11', 'emp-amberline-12', 'emp-amberline-13', 'emp-amberline-14']::text[]))
  UNION ALL
  SELECT 'rows: AttendanceEntry', 600, (SELECT count(*)::int FROM "AttendanceEntry" WHERE "employeeId" = ANY(ARRAY['emp-kestrel-01', 'emp-kestrel-02', 'emp-kestrel-03', 'emp-kestrel-04', 'emp-kestrel-05', 'emp-kestrel-06', 'emp-kestrel-07', 'emp-kestrel-08', 'emp-kestrel-09', 'emp-kestrel-10', 'emp-kestrel-11', 'emp-kestrel-12', 'emp-kestrel-13', 'emp-kestrel-14', 'emp-kestrel-15', 'emp-kestrel-16', 'emp-kestrel-17', 'emp-kestrel-18', 'emp-kestrel-19', 'emp-kestrel-20', 'emp-kestrel-21', 'emp-kestrel-22', 'emp-kestrel-23', 'emp-kestrel-24', 'emp-kestrel-25', 'emp-kestrel-26', 'emp-kestrel-27', 'emp-amberline-01', 'emp-amberline-02', 'emp-amberline-03', 'emp-amberline-04', 'emp-amberline-05', 'emp-amberline-06', 'emp-amberline-07', 'emp-amberline-08', 'emp-amberline-09', 'emp-amberline-10', 'emp-amberline-11', 'emp-amberline-12', 'emp-amberline-13']::text[]))
  UNION ALL
  SELECT 'rows: CandidateProfile', 49, (SELECT count(*)::int FROM "CandidateProfile" WHERE "userId" = ANY(ARRAY['cand-demo', 'talent-01', 'talent-02', 'talent-03', 'talent-04', 'talent-05', 'talent-06', 'talent-07', 'talent-08', 'talent-09', 'talent-10', 'talent-11', 'talent-12', 'talent-13', 'talent-14', 'talent-15', 'talent-16', 'talent-17', 'talent-18', 'talent-19', 'talent-20', 'talent-21', 'talent-22', 'talent-23', 'talent-24', 'talent-25', 'talent-26', 'talent-27', 'talent-28', 'talent-29', 'talent-30', 'talent-31', 'talent-32', 'talent-33', 'talent-34', 'talent-35', 'talent-36', 'talent-37', 'talent-38', 'talent-39', 'talent-40', 'soc-1', 'soc-2', 'soc-3', 'soc-4', 'soc-5', 'soc-6', 'soc-7', 'soc-8']::text[]))
  UNION ALL
  SELECT 'rows: CityEvent', 8, (SELECT count(*)::int FROM "CityEvent" WHERE "id" = ANY(ARRAY['evt-tech-fair', 'evt-plaza-meetup', 'evt-cv-clinic', 'evt-creative-night', 'evt-fintech-talk', 'evt-health-open', 'evt-excel-sprint', 'evt-chefs-table']::text[]))
  UNION ALL
  SELECT 'rows: Community', 6, (SELECT count(*)::int FROM "Community" WHERE "id" = ANY(ARRAY['com-builders', 'com-creators', 'com-hr', 'com-learners', 'com-founders', 'com-care']::text[]))
  UNION ALL
  SELECT 'rows: CommunityMember', 6, (SELECT count(*)::int FROM "CommunityMember" WHERE "communityId" = ANY(ARRAY['com-builders', 'com-creators', 'com-founders', 'com-hr', 'com-learners']::text[]))
  UNION ALL
  SELECT 'rows: CommunityPost', 6, (SELECT count(*)::int FROM "CommunityPost" WHERE "id" = ANY(ARRAY['com-builders-p1', 'com-builders-p2', 'com-creators-p1', 'com-hr-p1', 'com-learners-p1', 'com-founders-p1']::text[]))
  UNION ALL
  SELECT 'rows: Compensation', 42, (SELECT count(*)::int FROM "Compensation" WHERE "employeeId" = ANY(ARRAY['emp-kestrel-01', 'emp-kestrel-02', 'emp-kestrel-03', 'emp-kestrel-04', 'emp-kestrel-05', 'emp-kestrel-06', 'emp-kestrel-07', 'emp-kestrel-08', 'emp-kestrel-09', 'emp-kestrel-10', 'emp-kestrel-11', 'emp-kestrel-12', 'emp-kestrel-13', 'emp-kestrel-14', 'emp-kestrel-15', 'emp-kestrel-16', 'emp-kestrel-17', 'emp-kestrel-18', 'emp-kestrel-19', 'emp-kestrel-20', 'emp-kestrel-21', 'emp-kestrel-22', 'emp-kestrel-23', 'emp-kestrel-24', 'emp-kestrel-25', 'emp-kestrel-26', 'emp-kestrel-27', 'emp-kestrel-28', 'emp-amberline-01', 'emp-amberline-02', 'emp-amberline-03', 'emp-amberline-04', 'emp-amberline-05', 'emp-amberline-06', 'emp-amberline-07', 'emp-amberline-08', 'emp-amberline-09', 'emp-amberline-10', 'emp-amberline-11', 'emp-amberline-12', 'emp-amberline-13', 'emp-amberline-14']::text[]))
  UNION ALL
  SELECT 'rows: CompensationStructure', 8, (SELECT count(*)::int FROM "CompensationStructure" WHERE "id" = ANY(ARRAY['cs-g1-a', 'cs-g2-a', 'cs-g3-a', 'cs-g4-a', 'cs-g1-k', 'cs-g2-k', 'cs-g3-k', 'cs-g4-k']::text[]))
  UNION ALL
  SELECT 'rows: Connection', 1, (SELECT count(*)::int FROM "Connection" WHERE "requesterId" = ANY(ARRAY['cand-demo']::text[]))
  UNION ALL
  SELECT 'rows: CultureInitiative', 4, (SELECT count(*)::int FROM "CultureInitiative" WHERE "id" = ANY(ARRAY['ci-k-1', 'ci-k-2', 'ci-k-3', 'ci-k-4']::text[]))
  UNION ALL
  SELECT 'rows: OfficeLocation', 4, (SELECT count(*)::int FROM "OfficeLocation" WHERE "id" = ANY(ARRAY['loc-k-hq', 'loc-k-remote', 'loc-k-north', 'loc-a-main']::text[]))
  UNION ALL
  SELECT 'rows: Department', 7, (SELECT count(*)::int FROM "Department" WHERE "id" = ANY(ARRAY['dep-k-eng', 'dep-k-product', 'dep-k-ops', 'dep-k-people', 'dep-k-sales', 'dep-a-clinical', 'dep-a-admin']::text[]))
  UNION ALL
  SELECT 'rows: EventInvitation', 1, (SELECT count(*)::int FROM "EventInvitation" WHERE "id" = ANY(ARRAY['inv-seed-1']::text[]))
  UNION ALL
  SELECT 'rows: FeedbackItem', 2, (SELECT count(*)::int FROM "FeedbackItem" WHERE "id" = ANY(ARRAY['fb-k-1', 'fb-k-3']::text[]))
  UNION ALL
  SELECT 'rows: Interview', 8, (SELECT count(*)::int FROM "Interview" WHERE "id" = ANY(ARRAY['int-seed-1', 'int-seed-2', 'int-seed-3', 'int-seed-4', 'int-seed-5', 'int-seed-6', 'int-seed-7', 'int-seed-8']::text[]))
  UNION ALL
  SELECT 'rows: Invitation', 1, (SELECT count(*)::int FROM "Invitation" WHERE "id" = ANY(ARRAY['inv-k-1']::text[]))
  UNION ALL
  SELECT 'rows: LeaveRequest', 15, (SELECT count(*)::int FROM "LeaveRequest" WHERE "id" = ANY(ARRAY['leave-emp-kestrel-01', 'leave-emp-kestrel-02', 'leave-emp-kestrel-03', 'leave-emp-kestrel-04', 'leave-emp-kestrel-05', 'leave-emp-kestrel-06', 'leave-emp-kestrel-07', 'leave-emp-kestrel-08', 'leave-emp-kestrel-09', 'leave-emp-kestrel-10', 'leave-emp-amberline-01', 'leave-emp-amberline-02', 'leave-emp-amberline-03', 'leave-emp-amberline-04', 'leave-emp-amberline-05']::text[]))
  UNION ALL
  SELECT 'rows: LifecycleTask', 20, (SELECT count(*)::int FROM "LifecycleTask" WHERE "id" = ANY(ARRAY['emp-kestrel-27-t1', 'emp-kestrel-27-t2', 'emp-kestrel-27-t3', 'emp-kestrel-27-t4', 'emp-kestrel-27-t5', 'emp-kestrel-28-t1', 'emp-kestrel-28-t2', 'emp-kestrel-28-t3', 'emp-kestrel-28-t4', 'emp-kestrel-28-t5', 'emp-amberline-13-t1', 'emp-amberline-13-t2', 'emp-amberline-13-t3', 'emp-amberline-13-t4', 'emp-amberline-13-t5', 'emp-amberline-14-t1', 'emp-amberline-14-t2', 'emp-amberline-14-t3', 'emp-amberline-14-t4', 'emp-amberline-14-t5']::text[]))
  UNION ALL
  SELECT 'rows: Membership', 13, (SELECT count(*)::int FROM "Membership" WHERE "id" = ANY(ARRAY['mem-k-1', 'mem-k-2', 'mem-k-3', 'mem-k-4', 'mem-a-1', 'mem-a-2', 'mem-k-soc-2', 'mem-emp-kestrel-04', 'mem-emp-kestrel-05', 'mem-emp-kestrel-06', 'mem-emp-kestrel-07', 'mem-emp-kestrel-08', 'mem-emp-kestrel-09']::text[]))
  UNION ALL
  SELECT 'rows: Notification', 1, (SELECT count(*)::int FROM "Notification" WHERE "id" = ANY(ARRAY['n-welcome']::text[]))
  UNION ALL
  SELECT 'rows: PayComponent', 10, (SELECT count(*)::int FROM "PayComponent" WHERE "id" = ANY(ARRAY['pc-housing-a', 'pc-transport-a', 'pc-remote-a', 'pc-pension-a', 'pc-hmo-a', 'pc-housing-k', 'pc-transport-k', 'pc-remote-k', 'pc-pension-k', 'pc-hmo-k']::text[]))
  UNION ALL
  SELECT 'rows: PerformanceReview', 40, (SELECT count(*)::int FROM "PerformanceReview" WHERE "id" = ANY(ARRAY['rev-emp-kestrel-01', 'rev-emp-kestrel-02', 'rev-emp-kestrel-03', 'rev-emp-kestrel-04', 'rev-emp-kestrel-05', 'rev-emp-kestrel-06', 'rev-emp-kestrel-07', 'rev-emp-kestrel-08', 'rev-emp-kestrel-09', 'rev-emp-kestrel-10', 'rev-emp-kestrel-11', 'rev-emp-kestrel-12', 'rev-emp-kestrel-13', 'rev-emp-kestrel-14', 'rev-emp-kestrel-15', 'rev-emp-kestrel-16', 'rev-emp-kestrel-17', 'rev-emp-kestrel-18', 'rev-emp-kestrel-19', 'rev-emp-kestrel-20', 'rev-emp-kestrel-21', 'rev-emp-kestrel-22', 'rev-emp-kestrel-23', 'rev-emp-kestrel-24', 'rev-emp-kestrel-25', 'rev-emp-kestrel-26', 'rev-emp-kestrel-27', 'rev-emp-amberline-01', 'rev-emp-amberline-02', 'rev-emp-amberline-03', 'rev-emp-amberline-04', 'rev-emp-amberline-05', 'rev-emp-amberline-06', 'rev-emp-amberline-07', 'rev-emp-amberline-08', 'rev-emp-amberline-09', 'rev-emp-amberline-10', 'rev-emp-amberline-11', 'rev-emp-amberline-12', 'rev-emp-amberline-13']::text[]))
  UNION ALL
  SELECT 'rows: Policy', 6, (SELECT count(*)::int FROM "Policy" WHERE "id" = ANY(ARRAY['pol-leave-k', 'pol-conduct-k', 'pol-remote-k', 'pol-security-k', 'pol-leave-a', 'pol-conduct-a']::text[]))
  UNION ALL
  SELECT 'rows: Recognition', 6, (SELECT count(*)::int FROM "Recognition" WHERE "id" = ANY(ARRAY['rec-k-1', 'rec-k-2', 'rec-k-3', 'rec-k-4', 'rec-k-5', 'rec-k-6']::text[]))
  UNION ALL
  SELECT 'rows: SavedJob', 1, (SELECT count(*)::int FROM "SavedJob" WHERE "userId" = ANY(ARRAY['cand-demo']::text[]))
  UNION ALL
  SELECT 'rows: Shortlist', 1, (SELECT count(*)::int FROM "Shortlist" WHERE "id" = ANY(ARRAY['sl-backend']::text[]))
  UNION ALL
  SELECT 'rows: Survey', 2, (SELECT count(*)::int FROM "Survey" WHERE "id" = ANY(ARRAY['svy-k-pulse', 'svy-k-q3']::text[]))
  UNION ALL
  SELECT 'rows: SurveyResponse', 39, (SELECT count(*)::int FROM "SurveyResponse" WHERE "id" = ANY(ARRAY['svy-k-pulse-r01', 'svy-k-pulse-r02', 'svy-k-pulse-r03', 'svy-k-pulse-r04', 'svy-k-pulse-r05', 'svy-k-pulse-r06', 'svy-k-pulse-r07', 'svy-k-pulse-r08', 'svy-k-pulse-r09', 'svy-k-pulse-r10', 'svy-k-pulse-r11', 'svy-k-pulse-r12', 'svy-k-pulse-r13', 'svy-k-pulse-r14', 'svy-k-pulse-r15', 'svy-k-pulse-r16', 'svy-k-pulse-r17', 'svy-k-q3-r01', 'svy-k-q3-r02', 'svy-k-q3-r03', 'svy-k-q3-r04', 'svy-k-q3-r05', 'svy-k-q3-r06', 'svy-k-q3-r07', 'svy-k-q3-r08', 'svy-k-q3-r09', 'svy-k-q3-r10', 'svy-k-q3-r11', 'svy-k-q3-r12', 'svy-k-q3-r13', 'svy-k-q3-r14', 'svy-k-q3-r15', 'svy-k-q3-r16', 'svy-k-q3-r17', 'svy-k-q3-r18', 'svy-k-q3-r19', 'svy-k-q3-r20', 'svy-k-q3-r21', 'svy-k-q3-r22']::text[]))
  UNION ALL
  SELECT 'check: Invitation token hashes are 64 hex characters and unique', 0, (SELECT count(*)::int FROM "Invitation" WHERE "tokenHash" !~ '^[0-9a-f]{64}$' OR "tokenHash" IN (SELECT "tokenHash" FROM "Invitation" GROUP BY 1 HAVING count(*) > 1))
  UNION ALL
  SELECT 'check: Only test accounts can have a usable password (all other seeded accounts keep the placeholder)', 0, (SELECT count(*)::int FROM "User" WHERE id = ANY(ARRAY['seed-platform-admin', 'cand-demo', 'user-ifeoma-nwosu', 'user-daniel-mensah', 'user-zainab-bello', 'user-chidi-okeke', 'soc-3', 'soc-2', 'user-emp-kestrel-04', 'user-emp-kestrel-05', 'user-emp-kestrel-06', 'user-emp-kestrel-07', 'user-emp-kestrel-08', 'user-emp-kestrel-09', 'talent-01', 'talent-02', 'talent-03', 'talent-04', 'talent-05', 'talent-06', 'talent-07', 'talent-08', 'talent-09', 'talent-10', 'talent-11', 'talent-12', 'talent-13', 'talent-14', 'talent-15', 'talent-16', 'talent-17', 'talent-18', 'talent-19', 'talent-20', 'talent-21', 'talent-22', 'talent-23', 'talent-24', 'talent-25', 'talent-26', 'talent-27', 'talent-28', 'talent-29', 'talent-30', 'talent-31', 'talent-32', 'talent-33', 'talent-34', 'talent-35', 'talent-36', 'talent-37', 'talent-38', 'talent-39', 'talent-40', 'soc-1', 'soc-4', 'soc-5', 'soc-6', 'soc-7', 'soc-8']::text[]) AND NOT (id = ANY(ARRAY['seed-platform-admin', 'cand-demo', 'user-ifeoma-nwosu', 'user-daniel-mensah', 'user-zainab-bello', 'user-chidi-okeke', 'soc-3', 'soc-2']::text[])) AND "passwordHash" <> '!seed:password-not-set')
  UNION ALL
  SELECT 'check: Seeded memberships outside the test accounts hold exactly the "employee" role', 0, (SELECT count(*)::int FROM "Membership" WHERE "userId" = ANY(ARRAY['seed-platform-admin', 'cand-demo', 'user-ifeoma-nwosu', 'user-daniel-mensah', 'user-zainab-bello', 'user-chidi-okeke', 'soc-3', 'soc-2', 'user-emp-kestrel-04', 'user-emp-kestrel-05', 'user-emp-kestrel-06', 'user-emp-kestrel-07', 'user-emp-kestrel-08', 'user-emp-kestrel-09', 'talent-01', 'talent-02', 'talent-03', 'talent-04', 'talent-05', 'talent-06', 'talent-07', 'talent-08', 'talent-09', 'talent-10', 'talent-11', 'talent-12', 'talent-13', 'talent-14', 'talent-15', 'talent-16', 'talent-17', 'talent-18', 'talent-19', 'talent-20', 'talent-21', 'talent-22', 'talent-23', 'talent-24', 'talent-25', 'talent-26', 'talent-27', 'talent-28', 'talent-29', 'talent-30', 'talent-31', 'talent-32', 'talent-33', 'talent-34', 'talent-35', 'talent-36', 'talent-37', 'talent-38', 'talent-39', 'talent-40', 'soc-1', 'soc-4', 'soc-5', 'soc-6', 'soc-7', 'soc-8']::text[]) AND NOT ("userId" = ANY(ARRAY['seed-platform-admin', 'cand-demo', 'user-ifeoma-nwosu', 'user-daniel-mensah', 'user-zainab-bello', 'user-chidi-okeke', 'soc-3', 'soc-2']::text[])) AND roles <> ARRAY['employee']::"OrgRole"[])
  UNION ALL
  SELECT 'check: Only the designated platform account has platform-admin rights among seeded accounts', 0, (SELECT count(*)::int FROM "User" WHERE id = ANY(ARRAY['seed-platform-admin', 'cand-demo', 'user-ifeoma-nwosu', 'user-daniel-mensah', 'user-zainab-bello', 'user-chidi-okeke', 'soc-3', 'soc-2', 'user-emp-kestrel-04', 'user-emp-kestrel-05', 'user-emp-kestrel-06', 'user-emp-kestrel-07', 'user-emp-kestrel-08', 'user-emp-kestrel-09', 'talent-01', 'talent-02', 'talent-03', 'talent-04', 'talent-05', 'talent-06', 'talent-07', 'talent-08', 'talent-09', 'talent-10', 'talent-11', 'talent-12', 'talent-13', 'talent-14', 'talent-15', 'talent-16', 'talent-17', 'talent-18', 'talent-19', 'talent-20', 'talent-21', 'talent-22', 'talent-23', 'talent-24', 'talent-25', 'talent-26', 'talent-27', 'talent-28', 'talent-29', 'talent-30', 'talent-31', 'talent-32', 'talent-33', 'talent-34', 'talent-35', 'talent-36', 'talent-37', 'talent-38', 'talent-39', 'talent-40', 'soc-1', 'soc-4', 'soc-5', 'soc-6', 'soc-7', 'soc-8']::text[]) AND "platformRole" = 'admin' AND NOT (id = ANY(ARRAY['seed-platform-admin']::text[])))
  UNION ALL
  SELECT 'check: Membership → employee in the same organisation, linked to the same user', 0, (SELECT count(*)::int FROM "Membership" m JOIN "Employee" e ON e.id = m."employeeId" WHERE e."organizationId" <> m."organizationId" OR e."userId" IS DISTINCT FROM m."userId")
  UNION ALL
  SELECT 'check: Employee → linked user has a membership of that organisation pointing back to the record', 0, (SELECT count(*)::int FROM "Employee" e LEFT JOIN "Membership" m ON m."userId" = e."userId" AND m."organizationId" = e."organizationId" AND m."employeeId" = e.id WHERE e."userId" IS NOT NULL AND m.id IS NULL)
  UNION ALL
  SELECT 'check: Activity RSVPs point at memberships of the same organisation', 0, (SELECT count(*)::int FROM "ActivityRsvp" r JOIN "TeamActivity" a ON a.id = r."activityId" LEFT JOIN "Membership" m ON m.id = r."membershipId" WHERE m.id IS NULL OR m."organizationId" <> a."organizationId")
  UNION ALL
  SELECT 'check: Recognition senders are members and recipients are employees of the organisation', 0, (SELECT count(*)::int FROM "Recognition" r LEFT JOIN "Employee" e ON e.id = r."toEmployeeId" AND e."organizationId" = r."organizationId" LEFT JOIN "Membership" m ON m."userId" = r."fromUserId" AND m."organizationId" = r."organizationId" WHERE e.id IS NULL OR m.id IS NULL)
  UNION ALL
  SELECT 'check: Announcement authors are members of the organisation', 0, (SELECT count(*)::int FROM "Announcement" a LEFT JOIN "Membership" m ON m."userId" = a."authorId" AND m."organizationId" = a."organizationId" WHERE m.id IS NULL)
  UNION ALL
  SELECT 'check: Non-anonymous feedback has an author; anonymous feedback has none', 0, (SELECT count(*)::int FROM "FeedbackItem" WHERE (NOT anonymous AND ("authorId" IS NULL OR "authorName" IS NULL)) OR (anonymous AND ("authorId" IS NOT NULL OR "authorName" IS NOT NULL)))
  UNION ALL
  SELECT 'check: Community post authors are community members', 0, (SELECT count(*)::int FROM "CommunityPost" p LEFT JOIN "CommunityMember" cm ON cm."communityId" = p."communityId" AND cm."userId" = p."authorId" WHERE cm."userId" IS NULL)
  UNION ALL
  SELECT 'check: Interviews match their application''s job and candidate', 0, (SELECT count(*)::int FROM "Interview" i JOIN "Application" a ON a.id = i."applicationId" WHERE a."jobId" <> i."jobId" OR a."candidateId" <> i."candidateId")
  UNION ALL
  SELECT 'check: Applicants are onboarded candidates visible to employers', 0, (SELECT count(*)::int FROM "Application" a JOIN "User" u ON u.id = a."candidateId" LEFT JOIN "CandidateProfile" p ON p."userId" = u.id WHERE u."accountType" <> 'candidate' OR NOT u."onboardingComplete" OR p.visibility NOT IN ('public', 'employers'))
  UNION ALL
  SELECT 'check: Shortlist and assessment-result applications exist and belong to the same vacancy', 0, (SELECT ((SELECT count(*) FROM "Shortlist" s CROSS JOIN LATERAL unnest(s."applicationIds") AS x(id) LEFT JOIN "Application" a ON a.id = x.id WHERE a.id IS NULL OR a."jobId" <> s."jobId") + (SELECT count(*) FROM "Assessment" s CROSS JOIN LATERAL jsonb_array_elements(s.results) AS r(v) LEFT JOIN "Application" a ON a.id = r.v->>'applicationId' WHERE a.id IS NULL OR a."jobId" <> s."jobId"))::int)
) AS v(check_name, expected, actual)
ORDER BY ok, check_name;

-- Seeded accounts with organisation roles (least-privilege review):
SELECT m."organizationId", u.email, m.roles, m."employeeId", u."platformRole", (u."passwordHash" <> '!seed:password-not-set') AS can_sign_in
FROM "Membership" m JOIN "User" u ON u.id = m."userId"
WHERE u.id = ANY(ARRAY['seed-platform-admin', 'cand-demo', 'user-ifeoma-nwosu', 'user-daniel-mensah', 'user-zainab-bello', 'user-chidi-okeke', 'soc-3', 'soc-2', 'user-emp-kestrel-04', 'user-emp-kestrel-05', 'user-emp-kestrel-06', 'user-emp-kestrel-07', 'user-emp-kestrel-08', 'user-emp-kestrel-09', 'talent-01', 'talent-02', 'talent-03', 'talent-04', 'talent-05', 'talent-06', 'talent-07', 'talent-08', 'talent-09', 'talent-10', 'talent-11', 'talent-12', 'talent-13', 'talent-14', 'talent-15', 'talent-16', 'talent-17', 'talent-18', 'talent-19', 'talent-20', 'talent-21', 'talent-22', 'talent-23', 'talent-24', 'talent-25', 'talent-26', 'talent-27', 'talent-28', 'talent-29', 'talent-30', 'talent-31', 'talent-32', 'talent-33', 'talent-34', 'talent-35', 'talent-36', 'talent-37', 'talent-38', 'talent-39', 'talent-40', 'soc-1', 'soc-4', 'soc-5', 'soc-6', 'soc-7', 'soc-8']::text[])
ORDER BY m."organizationId", m.roles::text, u.email;
