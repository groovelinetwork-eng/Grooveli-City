import type { AvatarConfig } from '@grooveli/frontend-domain/public';
import type { LabelPortal } from './labels';
import type { InteriorKind, Station } from '../app/interiors';
import type { MutableRefObject } from 'react';
import type { InputState } from './Player';
import { Apartment } from './apartment/Apartment';
import { HqOffice } from './hq/HqOffice';
import { AiCenter } from './ai/AiCenter';
import type { AiVisitor } from './ai/aiTextures';
import type { PublicHqProjection } from '@grooveli/frontend-domain/public';

/** Walkable interior with stations as physical objects. A DOM list mirrors every station for keyboard/screen-reader users. */
export interface InteriorProps {
  kind: InteriorKind;
  avatar: AvatarConfig;
  brand?: { color: string; name: string };
  labels: boolean;
  onPick: (s: Station) => void;
  labelPortal: LabelPortal;
  input: MutableRefObject<InputState>;
  reducedMotion: boolean;
  shadows: boolean;
  onNearStation: (s: Station | null) => void;
  /** Public HQ projection for company headquarters (null → demonstration identity). */
  hq?: PublicHqProjection | null;
  zoom: number;
  quality: 'low' | 'medium' | 'high';
  shadowMap: number;
  /** Public-safe visitor info for AI Center displays (name, real bridged level). */
  visitor?: AiVisitor;
}

/** Interiors: walkable apartment, company HQ and AI Career Center. */
export function Interior(props: InteriorProps) {
  if (props.kind === 'hq') {
    return (
      <HqOffice
        avatar={props.avatar}
        hq={props.hq ?? null}
        input={props.input}
        zoom={props.zoom}
        labels={props.labels}
        reducedMotion={props.reducedMotion}
        shadows={props.shadows}
        quality={props.quality}
        shadowMap={props.shadowMap}
        onPick={props.onPick}
        onNearStation={props.onNearStation}
        labelPortal={props.labelPortal}
      />
    );
  }
  if (props.kind === 'ai-center') {
    return (
      <AiCenter
        avatar={props.avatar}
        visitor={props.visitor ?? { name: 'Guest', level: null, levelProgress: null, guest: true }}
        input={props.input}
        zoom={props.zoom}
        labels={props.labels}
        reducedMotion={props.reducedMotion}
        shadows={props.shadows}
        quality={props.quality}
        shadowMap={props.shadowMap}
        onPick={props.onPick}
        onNearStation={props.onNearStation}
        labelPortal={props.labelPortal}
      />
    );
  }
  if (props.kind === 'apartment') {
    return <Apartment avatar={props.avatar} input={props.input} labels={props.labels} reducedMotion={props.reducedMotion} shadows={props.shadows} onPick={props.onPick} onNearStation={props.onNearStation} labelPortal={props.labelPortal} />;
  }
  return null;
}
