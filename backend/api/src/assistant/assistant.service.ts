import Anthropic from '@anthropic-ai/sdk';
import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { AssistantMessage, User } from '@prisma/client';
import { z } from 'zod';
import { CandidateService } from '../candidate/candidate.service';
import { toMatchInput } from '../candidate/profile';
import { ApiError } from '../common/api-exception.filter';
import { todayUtc } from '../common/pagination';
import { env } from '../config/env';
import { toApiApplication } from '../jobs/job.mapper';
import { JobsService } from '../jobs/jobs.service';
import { matchJob } from '../jobs/matching';
import { PrismaService } from '../prisma/prisma.service';
import { ASSISTANT_LLM, LlmCall } from './llm';

const MAX_TOOL_ROUNDS = 6;
const HISTORY_MESSAGES = 20;
const MAX_PROPOSALS = 10;

/** Stable (cacheable) system prompt. Nothing per-user or time-based goes here. */
const SYSTEM = `You are the Grooveli City career assistant. You help one job seeker explore jobs, understand how well they match, and decide what to apply for.

How to work:
- Use get_my_profile before giving personal advice, and search_jobs / get_job_match for anything about specific jobs. Only talk about jobs your tools returned; never invent jobs, employers, salaries or requirements.
- Salaries are whole Nigerian naira (NGN) per month.
- When the person wants to apply, or a job is a strong fit they seem keen on, call propose_applications. Proposing does NOT submit anything: the person must confirm in the app. Say clearly that they need to confirm.
- Never claim an application was submitted.
- Matching uses skills, experience, salary, work mode, employment type, qualifications and location only. Do not ask about or use personality, gender, age, religion, ethnicity, appearance or photos for job decisions.
- Be concise and practical: short paragraphs or brief lists. Plain text, no markdown tables.
- If asked for something unrelated to careers, jobs or skills, briefly say you can only help with career topics.`;

const TOOLS: Anthropic.Beta.BetaTool[] = [
  {
    name: 'get_my_profile',
    description: "Get the job seeker's career profile: headline, skills (0–100), years of experience, qualifications, and job preferences (roles, locations, minimum monthly salary in NGN, work modes, employment types).",
    input_schema: { type: 'object', properties: {}, required: [], additionalProperties: false },
    strict: true,
  },
  {
    name: 'search_jobs',
    description: 'Search open jobs on Grooveli City. Returns up to 8 jobs, each with a match score (0–100) for this job seeker. Use a short keyword query (a role, skill or employer) and optional filters.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: ['string', 'null'], description: 'Keyword, e.g. "data analyst" or "Excel". null for no keyword.' },
        workMode: { type: ['string', 'null'], enum: ['remote', 'hybrid', 'onsite', null] },
        employmentType: { type: ['string', 'null'], enum: ['full-time', 'part-time', 'contract', 'internship', 'freelance', null] },
        level: { type: ['string', 'null'], enum: ['entry', 'mid', 'senior', 'lead', null] },
        minSalary: { type: ['integer', 'null'], description: 'Minimum monthly salary in NGN' },
      },
      required: ['query', 'workMode', 'employmentType', 'level', 'minSalary'],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: 'get_job_match',
    description: 'Get full details of one job and an explainable match: score, which skills match or are missing, which requirements pass or fail, and gaps to work on.',
    input_schema: { type: 'object', properties: { jobId: { type: 'string' } }, required: ['jobId'], additionalProperties: false },
    strict: true,
  },
  {
    name: 'propose_applications',
    description: 'Propose applications for the person to confirm in the app. Does not submit anything. Use only job IDs returned by your other tools. At most 10.',
    input_schema: {
      type: 'object',
      properties: { jobIds: { type: 'array', items: { type: 'string' } } },
      required: ['jobIds'],
      additionalProperties: false,
    },
    strict: true,
  },
];

const SearchInput = z.object({
  query: z.string().max(100).nullable(),
  workMode: z.enum(['remote', 'hybrid', 'onsite']).nullable(),
  employmentType: z.enum(['full-time', 'part-time', 'contract', 'internship', 'freelance']).nullable(),
  level: z.enum(['entry', 'mid', 'senior', 'lead']).nullable(),
  minSalary: z.number().int().min(0).nullable(),
});
const MatchInput = z.object({ jobId: z.string().min(1).max(64) });
const ProposeInput = z.object({ jobIds: z.array(z.string().min(1).max(64)).max(MAX_PROPOSALS) });

@Injectable()
export class AssistantService {
  private readonly logger = new Logger('Assistant');

  constructor(
    private readonly prisma: PrismaService,
    private readonly candidates: CandidateService,
    private readonly jobs: JobsService,
    @Inject(ASSISTANT_LLM) private readonly llm: LlmCall | null,
  ) {}

  private toApi = (m: AssistantMessage) => ({
    id: m.id, role: m.role as 'user' | 'assistant', text: m.text, at: m.createdAt.toISOString(),
    ...(m.jobIds.length ? { jobIds: m.jobIds } : {}),
    ...(m.pendingApplicationJobIds.length ? { pendingApplicationJobIds: m.pendingApplicationJobIds } : {}),
  });

  async thread(userId: string) {
    const rows = await this.prisma.assistantMessage.findMany({ where: { userId }, orderBy: { createdAt: 'asc' }, take: 200 });
    return rows.map(this.toApi);
  }

  async clear(userId: string) {
    await this.prisma.assistantMessage.deleteMany({ where: { userId } });
  }

  // ── Tools ────────────────────────────────────────────────────────────────
  private async runTool(user: User, name: string, input: unknown, found: Set<string>, proposed: Set<string>): Promise<{ content: string; isError?: boolean }> {
    switch (name) {
      case 'get_my_profile': {
        // Job-relevant fields only: never personality, gender, photo or contact details.
        const p = await this.candidates.getProfile(user.id);
        return { content: JSON.stringify({ headline: p.headline, location: p.location, orientation: p.orientation, summary: p.summary, desiredRoles: p.preferences.desiredRoles, ...toMatchInput(p) }) };
      }
      case 'search_jobs': {
        const q = SearchInput.parse(input);
        const page = await this.jobs.search(
          { q: q.query ?? undefined, workMode: q.workMode ?? undefined, employmentType: q.employmentType ?? undefined, level: q.level ?? undefined, minSalary: q.minSalary ?? undefined },
          { page: 1, pageSize: 8 },
        );
        const profile = toMatchInput(await this.candidates.getProfile(user.id));
        const rows = await this.prisma.job.findMany({ where: { id: { in: page.items.map((j) => j.id) } }, include: { organization: { select: { name: true } } } });
        const byId = new Map(rows.map((r) => [r.id, r]));
        const results = page.items.map((j) => {
          const row = byId.get(j.id)!;
          found.add(j.id);
          return {
            jobId: j.id, title: j.title, employer: row.organization.name, location: j.location, workMode: j.workMode, employmentType: j.employmentType,
            level: j.level, salaryMinNGN: j.salaryMin, salaryMaxNGN: j.salaryMax, closesOn: j.closesOn, matchScore: matchJob(profile, row).score,
          };
        });
        return { content: JSON.stringify({ total: page.total, results }) };
      }
      case 'get_job_match': {
        const { jobId } = MatchInput.parse(input);
        try {
          const job = await this.jobs.getPublic(jobId);
          found.add(jobId);
          return { content: JSON.stringify({ job, match: await this.jobs.matchOne(user.id, jobId) }) };
        } catch {
          return { content: 'No job with that ID.', isError: true };
        }
      }
      case 'propose_applications': {
        const { jobIds } = ProposeInput.parse(input);
        const outcome: { jobId: string; status: string }[] = [];
        for (const jobId of [...new Set(jobIds)]) {
          const job = await this.prisma.job.findFirst({ where: { id: jobId, status: 'published', closesOn: { gte: todayUtc() } } });
          const applied = job && (await this.prisma.application.findUnique({ where: { jobId_candidateId: { jobId, candidateId: user.id } } }));
          if (!job) outcome.push({ jobId, status: 'skipped: not an open job' });
          else if (applied) outcome.push({ jobId, status: 'skipped: already applied' });
          else {
            proposed.add(jobId);
            found.add(jobId);
            outcome.push({ jobId, status: 'proposed: waiting for the person to confirm in the app' });
          }
        }
        return { content: JSON.stringify({ outcome, note: 'Nothing has been submitted.' }) };
      }
      default:
        return { content: `Unknown tool ${name}`, isError: true };
    }
  }

  // ── Conversation ─────────────────────────────────────────────────────────
  async send(user: User, text: string) {
    if (!this.llm) throw new ApiError(HttpStatus.SERVICE_UNAVAILABLE, 'SERVICE_UNAVAILABLE', 'The AI assistant is not configured yet');

    const history = await this.prisma.assistantMessage.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: HISTORY_MESSAGES });
    await this.prisma.assistantMessage.create({ data: { userId: user.id, role: 'user', text } });

    const ordered = history.reverse();
    while (ordered.length && ordered[0]!.role !== 'user') ordered.shift(); // must start with a user turn
    const messages: Anthropic.Beta.BetaMessageParam[] = [
      ...ordered.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.text })),
      { role: 'user', content: text },
    ];

    const found = new Set<string>();
    const proposed = new Set<string>();
    let reply = '';
    try {
      for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        const response = await this.llm({
          model: env().ASSISTANT_MODEL,
          max_tokens: 16000,
          system: SYSTEM,
          tools: TOOLS,
          messages,
          cache_control: { type: 'ephemeral' },
          output_config: { effort: 'medium' },
          // On a safety decline, the API re-runs the request on a fallback model.
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
        });

        if (response.stop_reason === 'refusal') {
          reply = "Sorry, I can't help with that. I can help you explore jobs, your matches and what to apply for.";
          break;
        }
        const textOut = response.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text').map((b) => b.text).join('');
        if (response.stop_reason === 'pause_turn') {
          messages.push({ role: 'assistant', content: response.content });
          continue;
        }
        const toolUses = response.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use');
        if (response.stop_reason !== 'tool_use' || !toolUses.length) {
          reply = textOut || reply;
          break;
        }
        messages.push({ role: 'assistant', content: response.content });
        const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
        for (const t of toolUses) {
          let out: { content: string; isError?: boolean };
          try {
            out = await this.runTool(user, t.name, t.input, found, proposed);
          } catch (err) {
            out = { content: err instanceof z.ZodError ? `Invalid input: ${err.issues.map((i) => i.message).join('; ')}` : 'The tool failed.', isError: true };
          }
          results.push({ type: 'tool_result', tool_use_id: t.id, content: out.content, ...(out.isError ? { is_error: true } : {}) });
        }
        messages.push({ role: 'user', content: results });
        reply = textOut;
      }
    } catch (err) {
      if (err instanceof Anthropic.RateLimitError || err instanceof Anthropic.InternalServerError || err instanceof Anthropic.APIConnectionError) {
        this.logger.warn(`Claude unavailable: ${(err as Error).message}`);
        throw new ApiError(HttpStatus.SERVICE_UNAVAILABLE, 'SERVICE_UNAVAILABLE', 'The assistant is busy. Please try again shortly.');
      }
      if (err instanceof Anthropic.APIError) {
        this.logger.error(`Claude API error ${err.status}: ${err.message}`);
        throw new ApiError(HttpStatus.SERVICE_UNAVAILABLE, 'SERVICE_UNAVAILABLE', 'The assistant is unavailable right now.');
      }
      throw err;
    }
    if (!reply.trim()) reply = 'I looked into that but could not put together an answer. Could you rephrase?';

    const saved = await this.prisma.assistantMessage.create({
      data: { userId: user.id, role: 'assistant', text: reply, jobIds: [...found].slice(0, 20), pendingApplicationJobIds: [...proposed] },
    });
    return this.toApi(saved);
  }

  // ── Confirmation ─────────────────────────────────────────────────────────
  async confirm(user: User, jobIds: string[]) {
    const suggested = new Set(
      (await this.prisma.assistantMessage.findMany({ where: { userId: user.id, role: 'assistant' }, select: { pendingApplicationJobIds: true } })).flatMap((m) => m.pendingApplicationJobIds),
    );
    const unknown = jobIds.filter((id) => !suggested.has(id));
    if (unknown.length) {
      throw new ApiError(HttpStatus.BAD_REQUEST, 'VALIDATION_FAILED', 'Only applications the assistant suggested can be confirmed here', { jobIds: `Not suggested: ${unknown.join(', ')}` });
    }
    const submitted: ReturnType<typeof toApiApplication>[] = [];
    const skipped: { jobId: string; reason: string }[] = [];
    for (const jobId of [...new Set(jobIds)]) {
      try {
        submitted.push((await this.jobs.apply(user, jobId, '', 'assistant')).application);
      } catch (err) {
        skipped.push({ jobId, reason: err instanceof ApiError ? err.message : 'Could not submit' });
      }
    }
    return { submitted, skipped };
  }
}
