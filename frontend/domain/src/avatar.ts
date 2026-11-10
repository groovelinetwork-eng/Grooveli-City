import { z } from 'zod';
import type { AvatarConfig } from './types';
import { createRng, hashString } from './random';

export const SKIN_TONES = ['#f6d3b3', '#e8b58f', '#c98e64', '#a76b43', '#7a4a2a', '#4f2f1a'] as const;
export const HAIR_STYLES = ['Short crop', 'Afro', 'Braids', 'Bun', 'Long', 'Buzz', 'Locs', 'Bald'] as const;
export const HAIR_COLORS = ['#1b1410', '#3d2817', '#6b4423', '#a8743f', '#d9b26f', '#8c8c8c', '#5b3f8c'] as const;
export const OUTFITS = ['Business suit', 'Smart casual', 'Hoodie', 'Creative jacket', 'Scrubs', 'Kaftan'] as const;
export const OUTFIT_COLORS = ['#1f3a8a', '#0f766e', '#7c3aed', '#b45309', '#be123c', '#334155', '#15803d', '#f8fafc'] as const;
export const ACCESSORIES = ['None', 'Glasses', 'Headphones', 'Cap', 'Lanyard'] as const;
export const BODY_TYPES = ['Slim', 'Regular', 'Broad'] as const;

export const DEFAULT_AVATAR: AvatarConfig = {
  body: 1,
  skin: 3,
  hair: 0,
  hairColor: 0,
  outfit: 1,
  outfitColor: 0,
  accessory: 0,
};

export const avatarSchema = z.object({
  body: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  skin: z.number().int().min(0).max(SKIN_TONES.length - 1),
  hair: z.number().int().min(0).max(HAIR_STYLES.length - 1),
  hairColor: z.number().int().min(0).max(HAIR_COLORS.length - 1),
  outfit: z.number().int().min(0).max(OUTFITS.length - 1),
  outfitColor: z.number().int().min(0).max(OUTFIT_COLORS.length - 1),
  accessory: z.number().int().min(0).max(ACCESSORIES.length - 1),
});

const ORDER: (keyof AvatarConfig)[] = ['body', 'skin', 'hair', 'hairColor', 'outfit', 'outfitColor', 'accessory'];

/** Compact, cosmetic-only URL code, e.g. "1-3-0-0-1-0-0". Contains no PII. */
export function encodeAvatar(a: AvatarConfig): string {
  return ORDER.map((k) => a[k]).join('-');
}

export function decodeAvatar(code: string | null | undefined): AvatarConfig | null {
  if (!code || code.length > 40 || !/^\d{1,2}(-\d{1,2}){6}$/.test(code)) return null;
  const parts = code.split('-').map(Number);
  const candidate = Object.fromEntries(ORDER.map((k, i) => [k, parts[i]]));
  const parsed = avatarSchema.safeParse(candidate);
  return parsed.success ? (parsed.data as AvatarConfig) : null;
}

export function randomAvatar(seed: string): AvatarConfig {
  const rng = createRng(hashString(seed));
  return {
    body: rng.int(0, 2) as 0 | 1 | 2,
    skin: rng.int(0, SKIN_TONES.length - 1),
    hair: rng.int(0, HAIR_STYLES.length - 1),
    hairColor: rng.int(0, 4),
    outfit: rng.int(0, OUTFITS.length - 1),
    outfitColor: rng.int(0, OUTFIT_COLORS.length - 1),
    accessory: rng.chance(0.6) ? 0 : rng.int(1, ACCESSORIES.length - 1),
  };
}
