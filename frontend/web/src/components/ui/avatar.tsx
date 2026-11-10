import {
  ACCESSORIES,
  HAIR_COLORS,
  HAIR_STYLES,
  OUTFIT_COLORS,
  OUTFITS,
  SKIN_TONES,
  initials,
  type AvatarConfig,
} from '@grooveli/frontend-domain';

/** 2D SVG rendering of an AvatarConfig — the same config drives the 3D city avatar. */
export function AvatarFigure({ avatar, size = 160, label }: { avatar: AvatarConfig; size?: number; label?: string }) {
  const skin = SKIN_TONES[avatar.skin] ?? SKIN_TONES[0];
  const hair = HAIR_COLORS[avatar.hairColor] ?? HAIR_COLORS[0];
  const outfit = OUTFIT_COLORS[avatar.outfitColor] ?? OUTFIT_COLORS[0];
  const style = HAIR_STYLES[avatar.hair];
  const bodyW = [34, 42, 52][avatar.body]!;
  const accessory = ACCESSORIES[avatar.accessory];
  const outfitName = OUTFITS[avatar.outfit];
  const desc =
    label ??
    `Avatar: ${['slim', 'regular', 'broad'][avatar.body]} build, ${style} hair, ${outfitName}${accessory !== 'None' ? `, ${accessory}` : ''}`;
  return (
    <svg width={size} height={size * 1.25} viewBox="0 0 120 150" role="img" aria-label={desc}>
      <ellipse cx="60" cy="144" rx="34" ry="5" fill="rgb(0 0 0 / 25%)" />
      {/* legs */}
      <rect x={60 - bodyW / 2 + 4} y="104" width={bodyW / 2 - 6} height="36" rx="5" fill="#1e293b" />
      <rect x="62" y="104" width={bodyW / 2 - 6} height="36" rx="5" fill="#1e293b" />
      {/* torso */}
      <rect x={60 - bodyW / 2} y="62" width={bodyW} height="48" rx="12" fill={outfit} />
      {outfitName === 'Business suit' ? <polygon points="60,64 53,64 60,84 67,64" fill="#f8fafc" /> : null}
      {outfitName === 'Hoodie' ? <path d={`M${60 - 12} 64 Q60 76 ${60 + 12} 64`} stroke="#0003" strokeWidth="3" fill="none" /> : null}
      {outfitName === 'Scrubs' ? <rect x="56" y="66" width="8" height="10" fill="#fff8" /> : null}
      {outfitName === 'Kaftan' ? <rect x={60 - bodyW / 2} y="96" width={bodyW} height="20" rx="6" fill={outfit} /> : null}
      {accessory === 'Lanyard' ? <path d="M50 64 L60 86 L70 64" stroke="#22d3ee" strokeWidth="2" fill="none" /> : null}
      {/* arms */}
      <rect x={60 - bodyW / 2 - 9} y="66" width="10" height="38" rx="5" fill={outfit} />
      <rect x={60 + bodyW / 2 - 1} y="66" width="10" height="38" rx="5" fill={outfit} />
      {/* head */}
      <rect x="54" y="52" width="12" height="12" fill={skin} />
      <circle cx="60" cy="38" r="20" fill={skin} />
      {style === 'Afro' ? <circle cx="60" cy="28" r="24" fill={hair} /> : null}
      {style === 'Short crop' ? <path d="M40 34 Q60 6 80 34 Q72 24 60 24 Q48 24 40 34Z" fill={hair} /> : null}
      {style === 'Buzz' ? <path d="M41 32 Q60 12 79 32 Q60 22 41 32Z" fill={hair} /> : null}
      {style === 'Bun' ? (
        <>
          <path d="M40 36 Q60 4 80 36 Q70 22 60 22 Q50 22 40 36Z" fill={hair} />
          <circle cx="60" cy="12" r="8" fill={hair} />
        </>
      ) : null}
      {style === 'Long' ? <path d="M38 40 Q60 0 82 40 L84 70 L74 66 L72 36 Q60 26 48 36 L46 66 L36 70Z" fill={hair} /> : null}
      {style === 'Braids' || style === 'Locs' ? (
        <>
          <path d="M40 34 Q60 6 80 34 Q70 22 60 22 Q50 22 40 34Z" fill={hair} />
          {[42, 48, 72, 78].map((x) => (
            <rect key={x} x={x - 2} y="34" width="4" height={style === 'Locs' ? 34 : 28} rx="2" fill={hair} />
          ))}
        </>
      ) : null}
      {style === 'Afro' ? <circle cx="60" cy="42" r="16" fill={skin} /> : null}
      {/* face */}
      <circle cx="53" cy="40" r="2" fill="#111" />
      <circle cx="67" cy="40" r="2" fill="#111" />
      <path d="M54 48 Q60 52 66 48" stroke="#111" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      {accessory === 'Glasses' ? (
        <g stroke="#111" strokeWidth="1.5" fill="none">
          <circle cx="53" cy="40" r="5" />
          <circle cx="67" cy="40" r="5" />
          <line x1="58" y1="40" x2="62" y2="40" />
        </g>
      ) : null}
      {accessory === 'Headphones' ? (
        <g fill="#334155">
          <path d="M38 40 Q60 6 82 40" stroke="#334155" strokeWidth="4" fill="none" />
          <rect x="34" y="36" width="8" height="12" rx="3" />
          <rect x="78" y="36" width="8" height="12" rx="3" />
        </g>
      ) : null}
      {accessory === 'Cap' ? <path d="M40 30 Q60 10 80 30 L92 32 L40 32Z" fill="#be123c" /> : null}
    </svg>
  );
}

export function InitialsAvatar({ name, size = 36, color }: { name: string; size?: number; color?: string }) {
  return (
    <span
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        display: 'inline-grid',
        placeItems: 'center',
        background: color ?? 'linear-gradient(135deg, var(--g-violet-500), var(--g-cyan-600))',
        color: '#fff',
        fontWeight: 700,
        fontSize: size * 0.38,
        flexShrink: 0,
      }}
    >
      {initials(name)}
    </span>
  );
}

export function OrgLogo({ glyph, color, size = 40, name }: { glyph: string; color: string; size?: number; name: string }) {
  return (
    <span
      role="img"
      aria-label={`${name} logo`}
      style={{
        width: size,
        height: size,
        borderRadius: 10,
        display: 'inline-grid',
        placeItems: 'center',
        background: color,
        color: '#fff',
        fontWeight: 800,
        fontFamily: 'var(--g-font-display)',
        fontSize: size * 0.48,
        flexShrink: 0,
      }}
    >
      {glyph}
    </span>
  );
}
