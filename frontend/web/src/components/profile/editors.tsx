'use client';

import { useState } from 'react';
import {
  ACCESSORIES,
  BODY_TYPES,
  HAIR_COLORS,
  HAIR_STYLES,
  OUTFIT_COLORS,
  OUTFITS,
  SKIN_TONES,
  type AvatarConfig,
  type PersonalityTraits,
  type SkillRating,
} from '@grooveli/frontend-domain';
import { AvatarFigure } from '@/components/ui/avatar';
import { ChoiceChips, TextField } from '@/components/ui/form';
import { Button } from '@/components/ui/primitives';

function SwatchGroup({ legend, colors, value, onChange }: { legend: string; colors: readonly string[]; value: number; onChange: (i: number) => void }) {
  return (
    <fieldset className="field">
      <legend>{legend}</legend>
      <div className="chips" style={{ marginTop: 6 }}>
        {colors.map((c, i) => (
          <label key={c} className="chip">
            <input type="radio" name={legend} checked={value === i} onChange={() => onChange(i)} aria-label={`${legend} option ${i + 1}`} />
            <span className="swatch" style={{ background: c, padding: 0, minHeight: 32 }} />
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function AvatarEditor({ value, onChange }: { value: AvatarConfig; onChange: (a: AvatarConfig) => void }) {
  const set = <K extends keyof AvatarConfig>(k: K, v: AvatarConfig[K]) => onChange({ ...value, [k]: v });
  const opts = (list: readonly string[]) => list.map((label, i) => ({ value: String(i), label }));
  return (
    <div className="grid-2">
      <div className="avatar-stage" aria-live="polite">
        <AvatarFigure avatar={value} size={180} />
        <p className="small" style={{ color: '#c7d2fe', marginTop: 8 }}>
          This avatar appears in Grooveli City.
        </p>
      </div>
      <div className="stack">
        <ChoiceChips legend="Build" value={String(value.body)} onChange={(v) => set('body', Number(v) as 0 | 1 | 2)} options={opts(BODY_TYPES)} />
        <SwatchGroup legend="Skin tone" colors={SKIN_TONES} value={value.skin} onChange={(i) => set('skin', i)} />
        <ChoiceChips legend="Hair style" value={String(value.hair)} onChange={(v) => set('hair', Number(v))} options={opts(HAIR_STYLES)} />
        <SwatchGroup legend="Hair colour" colors={HAIR_COLORS} value={value.hairColor} onChange={(i) => set('hairColor', i)} />
        <ChoiceChips legend="Clothing & style" value={String(value.outfit)} onChange={(v) => set('outfit', Number(v))} options={opts(OUTFITS)} />
        <SwatchGroup legend="Outfit colour" colors={OUTFIT_COLORS} value={value.outfitColor} onChange={(i) => set('outfitColor', i)} />
        <ChoiceChips legend="Accessory" value={String(value.accessory)} onChange={(v) => set('accessory', Number(v))} options={opts(ACCESSORIES)} />
      </div>
    </div>
  );
}

const TRAITS: { key: keyof PersonalityTraits; legend: string; options: [string, string] }[] = [
  { key: 'energy', legend: 'Social energy', options: ['introverted', 'extroverted'] },
  { key: 'thinking', legend: 'Thinking style', options: ['creative', 'analytical'] },
  { key: 'workStyle', legend: 'Working style', options: ['collaborative', 'independent'] },
  { key: 'outlook', legend: 'Outlook', options: ['adventurous', 'reserved'] },
  { key: 'role', legend: 'Team role', options: ['leader', 'supporter'] },
];

export const DEFAULT_PERSONALITY: PersonalityTraits = { energy: 'balanced', thinking: 'balanced', workStyle: 'balanced', outlook: 'balanced', role: 'balanced' };

export function PersonalityEditor({ value, onChange }: { value: PersonalityTraits; onChange: (p: PersonalityTraits) => void }) {
  const cap = (s: string) => s[0]!.toUpperCase() + s.slice(1);
  return (
    <div className="stack">
      {TRAITS.map((t) => (
        <ChoiceChips
          key={t.key}
          legend={t.legend}
          value={value[t.key]}
          onChange={(v) => onChange({ ...value, [t.key]: v } as PersonalityTraits)}
          options={[
            { value: t.options[0], label: cap(t.options[0]) },
            { value: 'balanced', label: 'A bit of both' },
            { value: t.options[1], label: cap(t.options[1]) },
          ]}
        />
      ))}
    </div>
  );
}

export function SkillsEditor({ value, onChange }: { value: SkillRating[]; onChange: (s: SkillRating[]) => void }) {
  const [name, setName] = useState('');
  const [level, setLevel] = useState(60);
  const add = () => {
    const n = name.trim();
    if (!n || value.some((s) => s.name.toLowerCase() === n.toLowerCase())) return;
    onChange([...value, { name: n.slice(0, 40), level }]);
    setName('');
  };
  return (
    <div className="stack">
      <ul className="stack" style={{ listStyle: 'none', padding: 0, ['--gap' as string]: '6px' }} aria-label="Your skills">
        {value.map((s) => (
          <li key={s.name} className="row" style={{ flexWrap: 'nowrap' }}>
            <span style={{ minWidth: 140 }}>{s.name}</span>
            <input
              type="range"
              min={0}
              max={100}
              value={s.level}
              aria-label={`${s.name} self-rated level`}
              onChange={(e) => onChange(value.map((x) => (x.name === s.name ? { ...x, level: Number(e.target.value) } : x)))}
              style={{ flex: 1 }}
            />
            <span className="mono small" style={{ width: 32 }}>
              {s.level}
            </span>
            <Button size="sm" variant="ghost" onClick={() => onChange(value.filter((x) => x.name !== s.name))} aria-label={`Remove ${s.name}`}>
              ✕
            </Button>
          </li>
        ))}
      </ul>
      <div className="row" style={{ alignItems: 'flex-end' }}>
        <div style={{ flex: 1, minWidth: 160 }}>
          <TextField
            label="Add a skill"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                add();
              }
            }}
            placeholder="e.g. Excel, Recruitment, React"
          />
        </div>
        <label className="field" style={{ width: 140 }}>
          <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>Level: {level}</span>
          <input type="range" min={0} max={100} value={level} onChange={(e) => setLevel(Number(e.target.value))} />
        </label>
        <Button onClick={add}>Add skill</Button>
      </div>
    </div>
  );
}
