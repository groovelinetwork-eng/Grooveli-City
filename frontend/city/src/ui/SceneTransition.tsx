import type { CSSProperties } from 'react';
import type { TransitionState } from '../app/sceneTransition';

/**
 * Full-screen door transition shown while a building interior (or the street)
 * is being built. Purely visual: the screen-reader announcement is made by the
 * app, so this layer is hidden from assistive technology.
 */
export function SceneTransition({ t, reducedMotion }: { t: TransitionState; reducedMotion: boolean }) {
  return (
    <div
      className={`scene-tx is-${t.phase} tx-${t.direction}${reducedMotion ? ' tx-reduced' : ''}`}
      style={{ '--tx-accent': t.accent } as CSSProperties}
      data-testid="scene-transition"
      data-phase={t.phase}
      aria-hidden="true"
    >
      <div className="scene-tx-door scene-tx-left" />
      <div className="scene-tx-door scene-tx-right" />
      <div className="scene-tx-card">
        <div className="scene-tx-badge">{t.badge}</div>
        <div className="scene-tx-eyebrow">{t.direction === 'enter' ? 'Entering' : 'Leaving the building'}</div>
        <div className="scene-tx-title">{t.title}</div>
        <div className="scene-tx-sub">{t.subtitle}</div>
        <div className="scene-tx-bar">
          <span />
        </div>
      </div>
    </div>
  );
}
