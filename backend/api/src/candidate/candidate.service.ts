import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { ApiError } from '../common/api-exception.filter';
import { XpDecision, XpService } from '../career/xp.service';
import { PrismaService } from '../prisma/prisma.service';
import { DOCX, PDF, sniffType, StorageService } from '../storage/storage.service';
import {
  DEFAULT_AVATAR,
  DEFAULT_PREFERENCES,
  isProfileComplete,
  ProfileInput,
  toApiPrivacy,
  toApiProfile,
  toDbProfile,
} from './profile';

const CV_MAX_BYTES = 5 * 1024 * 1024;

@Injectable()
export class CandidateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly xp: XpService,
    private readonly storage: StorageService,
  ) {}

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, include: { candidateProfile: true } });
    return toApiProfile(user, user.candidateProfile);
  }

  private async completeXp(userId: string): Promise<XpDecision | null> {
    const profile = await this.getProfile(userId);
    return isProfileComplete(profile) ? this.xp.award(userId, 'profile-complete') : null;
  }

  async completeOnboarding(userId: string, input: ProfileInput): Promise<{ xp: XpDecision }> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.onboardingComplete) throw new ApiError(HttpStatus.CONFLICT, 'CONFLICT', 'Onboarding is already complete. Use PATCH /me/profile.');

    const data = toDbProfile(input) as Prisma.CandidateProfileUncheckedCreateInput;
    await this.prisma.$transaction([
      this.prisma.candidateProfile.upsert({ where: { userId }, create: { ...data, userId }, update: data }),
      this.prisma.user.update({ where: { id: userId }, data: { displayName: input.displayName, onboardingComplete: true } }),
    ]);
    return { xp: (await this.completeXp(userId)) ?? { award: 0, reason: 'Complete your profile to earn XP.' } };
  }

  async updateProfile(userId: string, patch: Partial<ProfileInput>): Promise<{ xp: XpDecision | null }> {
    const data = toDbProfile(patch);
    await this.prisma.$transaction([
      this.prisma.candidateProfile.upsert({
        where: { userId },
        create: { userId, avatar: DEFAULT_AVATAR, preferences: DEFAULT_PREFERENCES, ...(data as object) } as Prisma.CandidateProfileUncheckedCreateInput,
        update: data as Prisma.CandidateProfileUncheckedUpdateInput,
      }),
      ...(patch.displayName ? [this.prisma.user.update({ where: { id: userId }, data: { displayName: patch.displayName } })] : []),
    ]);
    return { xp: await this.completeXp(userId) };
  }

  // ── CV ───────────────────────────────────────────────────────────────────
  async uploadCv(userId: string, file: Express.Multer.File | undefined): Promise<{ xp: XpDecision }> {
    if (!file) throw new ApiError(HttpStatus.BAD_REQUEST, 'VALIDATION_FAILED', 'Attach the CV as the "file" field', { file: 'Required' });
    if (file.size > CV_MAX_BYTES) throw new ApiError(HttpStatus.PAYLOAD_TOO_LARGE, 'PAYLOAD_TOO_LARGE', 'CVs can be up to 5 MB');
    const type = sniffType(file.buffer);
    if (type !== PDF && type !== DOCX) {
      throw new ApiError(HttpStatus.UNSUPPORTED_MEDIA_TYPE, 'UNSUPPORTED_MEDIA_TYPE', 'Upload a PDF or Word (.docx) file');
    }

    const existing = await this.prisma.candidateProfile.findUnique({ where: { userId }, select: { cvKey: true } });
    const key = `cv/${userId}/${randomUUID()}${type === PDF ? '.pdf' : '.docx'}`;
    await this.storage.put(key, file.buffer, type);

    const name = (file.originalname || 'cv').replace(/[\r\n"]/g, '').slice(0, 120);
    const cv = { cvKey: key, cvName: name, cvSizeKb: Math.max(1, Math.round(file.size / 1024)), cvContentType: type, cvAddedAt: new Date() };
    await this.prisma.candidateProfile.upsert({
      where: { userId },
      create: { userId, avatar: DEFAULT_AVATAR, preferences: DEFAULT_PREFERENCES, ...cv },
      update: cv,
    });
    if (existing?.cvKey) await this.storage.delete(existing.cvKey).catch(() => undefined);
    return { xp: await this.xp.award(userId, 'cv-upload') };
  }

  async getCv(userId: string) {
    const p = await this.prisma.candidateProfile.findUnique({ where: { userId } });
    if (!p?.cvKey || !p.cvName || !p.cvAddedAt) return null;
    const { url } = await this.storage.downloadUrl(p.cvKey, p.cvName);
    return { name: p.cvName, sizeKb: p.cvSizeKb ?? 0, addedAt: p.cvAddedAt.toISOString(), downloadUrl: url };
  }

  async deleteCv(userId: string) {
    const p = await this.prisma.candidateProfile.findUnique({ where: { userId }, select: { cvKey: true } });
    if (!p?.cvKey) return;
    await this.prisma.candidateProfile.update({
      where: { userId },
      data: { cvKey: null, cvName: null, cvSizeKb: null, cvContentType: null, cvAddedAt: null },
    });
    await this.storage.delete(p.cvKey).catch(() => undefined);
  }

  // ── Privacy ──────────────────────────────────────────────────────────────
  async getPrivacy(userId: string) {
    const [p, blocks] = await Promise.all([
      this.prisma.candidateProfile.findUnique({ where: { userId } }),
      this.prisma.block.findMany({ where: { blockerId: userId }, select: { blockedId: true }, orderBy: { createdAt: 'asc' } }),
    ]);
    return toApiPrivacy(p, blocks.map((b) => b.blockedId));
  }

  async updatePrivacy(userId: string, patch: Record<string, unknown>) {
    await this.prisma.candidateProfile.upsert({
      where: { userId },
      create: { userId, avatar: DEFAULT_AVATAR, preferences: DEFAULT_PREFERENCES, ...patch } as Prisma.CandidateProfileUncheckedCreateInput,
      update: patch,
    });
    return this.getPrivacy(userId);
  }
}
