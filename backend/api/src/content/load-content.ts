/**
 * Loads platform career content from prisma/content/career.json into the
 * database. Safe to re-run: upserts every item and deactivates items that
 * are no longer in the file (users' progress on them is kept).
 *   pnpm --filter @grooveli/api db:content
 */
try {
  process.loadEnvFile();
} catch {
  /* env provided by the platform */
}

import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';

const district = z.enum(['plaza', 'corporate', 'recruitment', 'university', 'tech', 'creative', 'healthcare', 'hospitality', 'finance', 'apartment', 'ai-center']);
const slug = z.string().regex(/^[a-z0-9-]{1,64}$/);
const check = z.enum(['profile-complete', 'cv-uploaded', 'assessment-done', 'applications-3', 'interview-sim-done', 'skill-challenge-done', 'course-done']);

const Content = z.object({
  assessmentQuestions: z.array(z.object({ id: slug, prompt: z.string().min(1), options: z.array(z.string().min(1)).min(2) })),
  missions: z.array(
    z.object({
      id: slug, title: z.string().min(1), description: z.string(), kind: z.enum(['career', 'skill']), district,
      orientations: z.array(z.enum(['employee', 'freelancer', 'entrepreneur', 'student', 'open'])),
      rewardXp: z.number().int().min(0),
      objectives: z.array(z.object({ id: slug, label: z.string().min(1), check })).min(1),
    }),
  ),
  challenges: z.array(
    z.object({
      id: slug, title: z.string().min(1), skill: z.string().min(1), district, xp: z.number().int().min(0),
      questions: z
        .array(z.object({ id: slug, prompt: z.string().min(1), options: z.array(z.string()).min(2).max(8), answer: z.number().int().min(0), explanation: z.string() }))
        .min(1)
        .refine((qs) => qs.every((q) => q.answer < q.options.length), 'answer must index into options'),
    }),
  ),
  courses: z.array(
    z.object({ id: slug, title: z.string().min(1), provider: z.string(), skill: z.string(), hours: z.number().min(0), xp: z.number().int().min(0), modules: z.array(z.string().min(1)).min(1) }),
  ),
  achievements: z.array(
    z.object({
      id: slug, title: z.string().min(1), description: z.string(), icon: z.string(),
      ruleType: z.enum(['xp', 'applications', 'missions', 'challenges', 'profile-complete']), ruleMin: z.number().int().min(0).optional(),
    }),
  ),
});

async function main() {
  const file = process.argv[2] ?? join(__dirname, '..', '..', 'prisma', 'content', 'career.json');
  const content = Content.parse(JSON.parse(readFileSync(file, 'utf8')));
  const prisma = new PrismaClient();
  try {
    await prisma.$transaction(async (tx) => {
      const sync = async <T extends { id: string }>(
        items: T[],
        upsert: (item: T, sortOrder: number) => Promise<unknown>,
        deactivate: (ids: string[]) => Promise<{ count: number }>,
        label: string,
      ) => {
        for (const [i, item] of items.entries()) await upsert(item, i);
        const { count } = await deactivate(items.map((x) => x.id));
        console.log(`${label}: ${items.length} active${count ? `, ${count} deactivated` : ''}`);
      };

      await sync(
        content.assessmentQuestions,
        (q, sortOrder) => tx.contentAssessmentQuestion.upsert({ where: { id: q.id }, create: { ...q, sortOrder }, update: { ...q, sortOrder, active: true } }),
        (ids) => tx.contentAssessmentQuestion.updateMany({ where: { id: { notIn: ids }, active: true }, data: { active: false } }),
        'Assessment questions',
      );
      await sync(
        content.missions,
        (m, sortOrder) => tx.contentMission.upsert({ where: { id: m.id }, create: { ...m, sortOrder }, update: { ...m, sortOrder, active: true } }),
        (ids) => tx.contentMission.updateMany({ where: { id: { notIn: ids }, active: true }, data: { active: false } }),
        'Missions',
      );
      await sync(
        content.challenges,
        (c, sortOrder) => tx.contentChallenge.upsert({ where: { id: c.id }, create: { ...c, sortOrder }, update: { ...c, sortOrder, active: true } }),
        (ids) => tx.contentChallenge.updateMany({ where: { id: { notIn: ids }, active: true }, data: { active: false } }),
        'Challenges',
      );
      await sync(
        content.courses,
        (c, sortOrder) => tx.contentCourse.upsert({ where: { id: c.id }, create: { ...c, sortOrder }, update: { ...c, sortOrder, active: true } }),
        (ids) => tx.contentCourse.updateMany({ where: { id: { notIn: ids }, active: true }, data: { active: false } }),
        'Courses',
      );
      await sync(
        content.achievements,
        (a, sortOrder) => {
          const data = { ...a, ruleMin: a.ruleMin ?? null, sortOrder };
          return tx.contentAchievement.upsert({ where: { id: a.id }, create: data, update: { ...data, active: true } });
        },
        (ids) => tx.contentAchievement.updateMany({ where: { id: { notIn: ids }, active: true }, data: { active: false } }),
        'Achievements',
      );
    });
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
