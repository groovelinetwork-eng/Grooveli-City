import { Component, Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState, type ErrorInfo, type ReactNode } from 'react';
import { DISTRICTS, getDistrict, type DistrictId, type PresenceProjection } from '@grooveli/frontend-domain/public';
import { canUseWebGL } from './webgl';
import { cityConfig } from './config';
import { isNight, loadSettings, saveSettings, webHref, type CitySettings } from './settings';
import type { InteriorKind, Station } from './interiors';
import { parseLaunchParams, readBridge, resolveIdentity } from '../services/identity';
import { buildWorldData } from '../services/world-data';
import { SimulatedPresenceAdapter } from '../services/presence';
import { createMarketsAdapter, marketsBoardModel } from '../services/markets';
import { useMarketFeed } from '../services/useMarketFeed';
import { QUALITY } from '../world/ambient';
import { INTERACTABLES, PLACED_BUILDINGS, districtAt, districtKiosk, spawnPoint, type CityFeatureId, type Interactable, type PlacedBuilding, type Vec2 } from '../world/layout';
import { nearestInteractable } from '../world/movement';
import { CAMERA, createCityView } from '../scene/camera';
import type { InputState, PlayerState } from '../scene/Player';
import { Directory } from '../ui/Directory';
import { DistrictPill, IdentityChip, Joystick, PinIcon, PresenceChip, RoundButton } from '../ui/Hud';
import { CityMap } from '../ui/CityMap';
import { BuildingPanel, DistrictPanel, HelpPanel, MarketsPanel, MenuPanel, NotificationsPanel, PeoplePanel, PlacesPanel, SettingsPanel, StationList, StationPanel, hqFor } from '../ui/panels';
import { Panel, SimTag } from '../ui/Panel';

const CityCanvas = lazy(() => import('../scene/CityCanvas'));

class SceneBoundary extends Component<{ onError: (e: Error) => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error, _info: ErrorInfo) {
    this.props.onError(error);
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

type Overlay =
  | { kind: 'place'; target: Interactable }
  | { kind: 'places' }
  | { kind: 'people' }
  | { kind: 'settings' }
  | { kind: 'help' }
  | { kind: 'menu' }
  | { kind: 'notifications' }
  | { kind: 'station'; station: Station }
  | { kind: 'markets' }
  | { kind: 'map' }
  | null;

interface InteriorState {
  kind: InteriorKind;
  buildingId: string;
  organizationId?: string;
}

const MOVE_KEYS: Record<string, [number, number]> = {
  KeyW: [0, 1],
  ArrowUp: [0, 1],
  KeyS: [0, -1],
  ArrowDown: [0, -1],
  KeyA: [-1, 0],
  ArrowLeft: [-1, 0],
  KeyD: [1, 0],
  ArrowRight: [1, 0],
};

export function App({ search: searchProp, webgl: webglProp }: { search?: string; webgl?: boolean }) {
  // Evaluated once per mount (never per render): the WebGL probe must not leak contexts.
  const [search] = useState(() => searchProp ?? window.location.search);
  const [webgl] = useState(() => webglProp ?? canUseWebGL());
  const launch = useMemo(() => parseLaunchParams(search), [search]);
  const bridge = useMemo(() => readBridge(typeof localStorage !== 'undefined' ? localStorage : null), []);
  const identity = useMemo(() => resolveIdentity(search, bridge), [search, bridge]);
  const data = useMemo(() => buildWorldData(bridge), [bridge]);
  const [settings, setSettingsState] = useState<CitySettings>(loadSettings);
  const [fallback, setFallback] = useState<string | null>(
    !webgl ? 'WebGL is not available on this device, so you are seeing the accessible directory view.' : launch.forceDirectory ? 'Directory view (2D) selected.' : null,
  );
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [interior, setInterior] = useState<InteriorState | null>(null);
  const [nearby, setNearby] = useState<Interactable | null>(null);
  const [nearStation, setNearStation] = useState<Station | null>(null);
  const [pos, setPos] = useState<Vec2>(() => spawnPoint(launch));
  const [people, setPeople] = useState<PresenceProjection[]>([]);
  const [zoom, setZoom] = useState<number>(CAMERA.baseZoom);
  const [announcement, setAnnouncement] = useState('');
  const player = useRef<PlayerState>({ pos: spawnPoint(launch), target: null, heading: Math.PI });
  const input = useRef<InputState>({ x: 0, y: 0 });
  const keys = useRef(new Set<string>());
  const view = useRef(createCityView());
  const [assistName, setAssistName] = useState<string | null>(null);
  const [featurePulse, setFeaturePulse] = useState(0);
  const marketsAdapter = useMemo(() => createMarketsAdapter(cityConfig.marketsFeedUrl), []);
  const marketFeed = useMarketFeed(marketsAdapter, cityConfig.marketsRefreshMs, !fallback);
  const marketsModel = useMemo(() => (marketFeed.snapshot ? marketsBoardModel(marketFeed.snapshot, { fallback: marketFeed.status === 'fallback' }) : null), [marketFeed]);
  const [opened, setOpened] = useState<string | null>(null);

  const setSettings = (s: CitySettings) => {
    setSettingsState(s);
    saveSettings(s);
  };
  const quality = QUALITY[settings.quality];
  const night = isNight(settings);
  const district = districtAt(pos);
  const eventDistricts = useMemo(() => [...new Set(data.events.map((e) => e.district))], [data]);
  const hq = interior ? hqFor(data, interior.organizationId) : null;
  // Public-safe visitor summary for AI Center displays: real bridged level only.
  const visitor = useMemo(
    () => ({ name: identity.displayName, level: identity.level, levelProgress: identity.levelProgress, guest: identity.source === 'guest' }),
    [identity],
  );
  // "Today's Top Jobs" rooftop screen: real public vacancy counts grouped by title.
  const topJobs = useMemo(() => {
    const counts = new Map<string, number>();
    for (const h of data.hqs) for (const v of h.vacancies) counts.set(v.title, (counts.get(v.title) ?? 0) + 1);
    return [...counts.entries()].map(([title, count]) => ({ title, count })).sort((a, b) => b.count - a.count || a.title.localeCompare(b.title)).slice(0, 3);
  }, [data]);

  // Simulated presence (bounded update rate, explicitly labelled).
  useEffect(() => {
    if (fallback) return;
    const adapter = new SimulatedPresenceAdapter(settings.reducedMotion ? 0.25 : 1);
    return adapter.subscribe(setPeople);
  }, [fallback, settings.reducedMotion]);

  // Open the HQ or district panel for deep links.
  useEffect(() => {
    if (fallback) return;
    if (launch.organizationId) {
      const t = INTERACTABLES.find((i) => i.kind === 'building' && i.building.organizationId === launch.organizationId);
      if (t) setOverlay({ kind: 'place', target: t });
    } else if (launch.district) {
      const t = INTERACTABLES.find((i) => i.kind === 'district' && i.district === launch.district);
      if (t) setOverlay({ kind: 'place', target: t });
    }
  }, [launch, fallback]);

  const onAssist = useCallback((name: string | null) => {
    setAssistName(name);
    if (name) setAnnouncement(`Camera turned to show the ${name} entrance.`);
  }, []);
  /** Global Markets billboard: open the configured external charts page safely, or explain that none is configured. */
  const activateFeature = useCallback((id: CityFeatureId) => {
    if (id !== 'markets-board') return;
    setFeaturePulse((n) => n + 1);
    const url = cityConfig.marketsUrl;
    if (!url) {
      setOverlay({ kind: 'markets' });
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
    setOpened(url);
    setAnnouncement('Opened market charts in a new tab.');
  }, []);
  useEffect(() => {
    if (!opened) return;
    const t = window.setTimeout(() => setOpened(null), 7000);
    return () => window.clearTimeout(t);
  }, [opened]);

  /** Map → existing building panel (details + Enter); no new movement rules. */
  const openBuildingFromMap = useCallback((b: PlacedBuilding) => {
    const target = INTERACTABLES.find((i) => i.kind === 'building' && i.id === b.id);
    if (target) setOverlay({ kind: 'place', target });
  }, []);

  const rotateView = useCallback((dir: 1 | -1 | 0) => {
    if (dir === 0) view.current.reset = true;
    else view.current.turn += dir;
  }, []);

  const onMoved = useCallback((p: Vec2) => {
    setPos({ ...p });
    const n = nearestInteractable(p);
    setNearby((prev) => {
      if (prev?.id !== n?.id && n) setAnnouncement(`Near ${n.label}. Press E to interact.`);
      return n;
    });
  }, []);

  const travel = useCallback((d: DistrictId) => {
    const k = districtKiosk(d);
    player.current = { ...player.current, pos: { x: k.x, z: k.z + 1.5 }, target: null };
    setInterior(null);
    setPos(player.current.pos);
    const t = INTERACTABLES.find((i) => i.kind === 'district' && i.district === d)!;
    setOverlay({ kind: 'place', target: t });
    setAnnouncement(`Travelled to ${getDistrict(d).name}.`);
  }, []);

  const enterBuilding = useCallback((buildingId: string) => {
    const b = PLACED_BUILDINGS.find((x) => x.id === buildingId);
    if (!b) return;
    const kind: InteriorKind = b.district === 'apartment' ? 'apartment' : b.district === 'ai-center' ? 'ai-center' : 'hq';
    if (b.entrance) player.current = { ...player.current, pos: { x: b.entrance.x, z: b.entrance.z + 1 }, target: null };
    setInterior({ kind, buildingId, organizationId: b.organizationId });
    setOverlay(null);
    setAnnouncement(`Entered ${b.name}. Use the list of things in this room, or press Escape to leave.`);
  }, []);

  const leaveBuilding = useCallback(() => {
    setInterior(null);
    setOverlay(null);
    setAnnouncement('Back on the street.');
  }, []);

  const interact = useCallback(() => {
    if (interior) {
      if (nearStation) setOverlay({ kind: 'station', station: nearStation });
      return;
    }
    const n = nearestInteractable(player.current.pos);
    if (n?.kind === 'feature') activateFeature(n.id);
    else if (n) setOverlay({ kind: 'place', target: n });
  }, [interior, nearStation, activateFeature]);

  const onBuildingClick = useCallback((b: PlacedBuilding) => {
    const target = INTERACTABLES.find((i) => i.kind === 'building' && i.id === b.id);
    if (!target) {
      // Non-enterable: walk toward its district kiosk instead.
      player.current.target = districtKiosk(b.district);
      return;
    }
    const d = Math.hypot(target.position.x - player.current.pos.x, target.position.z - player.current.pos.z);
    if (d < 4) setOverlay({ kind: 'place', target });
    else player.current.target = { ...target.position };
  }, []);

  // Keyboard controls. Movement is ignored while typing in form controls.
  useEffect(() => {
    if (fallback) return;
    const recompute = () => {
      let x = 0;
      let y = 0;
      keys.current.forEach((k) => {
        const v = MOVE_KEYS[k];
        if (v) {
          x += v[0];
          y += v[1];
        }
      });
      input.current = { x, y };
    };
    const typing = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
    };
    const down = (e: KeyboardEvent) => {
      if (typing(e)) return;
      if (e.code === 'Escape') {
        if (overlay) setOverlay(null);
        else if (interior) leaveBuilding();
        return;
      }
      if (e.code === 'KeyE' && !overlay) {
        e.preventDefault();
        interact();
        return;
      }
      if (e.code === 'KeyP') setOverlay((o) => (o?.kind === 'places' ? null : { kind: 'places' }));
      if (!interior && !overlay && (e.code === 'KeyQ' || e.code === 'KeyR')) rotateView(e.code === 'KeyQ' ? -1 : 1);
      if (e.key === '+' || e.key === '=') setZoom((z) => Math.min(CAMERA.maxZoom, z + 3));
      if (e.key === '-') setZoom((z) => Math.max(CAMERA.minZoom, z - 3));
      if (MOVE_KEYS[e.code]) {
        // Arrow keys move the avatar only when focus isn't on an interactive control.
        const t = e.target as HTMLElement | null;
        if (e.code.startsWith('Arrow') && t && t !== document.body && t.closest('button, a, [role="button"], [role="dialog"]')) return;
        e.preventDefault();
        keys.current.add(e.code);
        recompute();
      }
    };
    const up = (e: KeyboardEvent) => {
      if (keys.current.delete(e.code)) recompute();
    };
    const blur = () => {
      keys.current.clear();
      recompute();
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, [fallback, overlay, interior, interact, leaveBuilding, rotateView]);

  if (fallback) {
    return <Directory identity={identity} data={data} reason={fallback} initialDistrict={launch.district} onTry3d={webgl ? () => setFallback(null) : undefined} />;
  }

  const homeHref = webHref(identity.source === 'guest' ? { type: 'signIn' } : { type: 'openDashboard' }, district);

  return (
    <div className={`city-root${night ? ' is-night' : ''}`}>
      <a className="skip-link" href="#city-hud">
        Skip to city controls
      </a>
      <div className="canvas-wrap" aria-hidden="true">
        <SceneBoundary onError={(e) => setFallback(`The 3D city couldn't start (${e.message}). Showing the directory view instead.`)}>
          <Suspense fallback={<div className="loading" role="status">Loading Grooveli City…</div>}>
            <CityCanvas
              avatar={identity.avatar}
              quality={quality}
              night={night}
              labels={settings.labels}
              reducedMotion={settings.reducedMotion}
              zoom={zoom}
              player={player}
              input={input}
              people={people}
              eventDistricts={eventDistricts}
              currentDistrict={district}
              nearbyId={nearby?.kind === 'building' || nearby?.kind === 'feature' ? nearby.id : null}
              topJobs={topJobs}
              interior={interior ? { kind: interior.kind, brand: hq ? { color: hq.organization.logoColor, name: hq.organization.name } : undefined, hq } : null}
              onMoved={onMoved}
              onGround={(p) => (player.current.target = p)}
              onBuilding={onBuildingClick}
              onStation={(s) => setOverlay({ kind: 'station', station: s })}
              onNearStation={setNearStation}
              onContextLost={() => setFallback('The graphics context was lost. Showing the directory view instead.')}
              visitor={visitor}
              view={view}
              cameraAssist={settings.cameraAssist}
              onAssist={onAssist}
              paused={overlay?.kind === 'map'}
              featurePulse={featurePulse}
              onFeature={activateFeature}
              markets={marketsModel}
            />
          </Suspense>
        </SceneBoundary>
      </div>

      <div id="city-hud" className="hud" role="region" aria-label="City controls">
        <div className="hud-top-left">
          <IdentityChip identity={identity} webHref={homeHref} />
          {cityConfig.dataMode === 'api' ? <span className="hud-chip warn">API mode: live city data unavailable</span> : null}
        </div>
        {!interior ? <DistrictPill name={district ? getDistrict(district).name : 'Street'} event={!!district && eventDistricts.includes(district)} /> : null}
        <div className="hud-top-right">
          <PresenceChip count={people.length} onClick={() => setOverlay({ kind: 'people' })} />
          <RoundButton label={`Notifications (${data.events.length} upcoming events)`} icon="bell" dot={data.events.length > 0} onClick={() => setOverlay({ kind: 'notifications' })} />
          <RoundButton label="Menu" icon="menu" onClick={() => setOverlay((o) => (o?.kind === 'menu' ? null : { kind: 'menu' }))} />
        </div>

        <div className="hud-location" aria-live="polite">
          <span className="dot" aria-hidden="true" />
          <PinIcon />
          {interior ? <span>Inside {PLACED_BUILDINGS.find((b) => b.id === interior.buildingId)?.name}</span> : <span>{district ? getDistrict(district).name : 'Street'}</span>}
          {interior && interior.kind !== 'apartment' ? <SimTag>people simulated</SimTag> : null}
        </div>

        {interior ? (
          <div className="interior-bar">
            {nearStation && !overlay ? (
              <button type="button" className="prompt prompt-inline" onClick={interact}>
                <span>
                  {nearStation.icon} {nearStation.label}
                </span>{' '}
                <kbd>E</kbd>
              </button>
            ) : null}
            <StationList kind={interior.kind} onPick={(s) => setOverlay({ kind: 'station', station: s })} />
            <button type="button" className="city-btn" onClick={leaveBuilding}>
              ⎋ Leave building (Esc)
            </button>
          </div>
        ) : nearby && !overlay ? (
          <button type="button" className="prompt" onClick={interact}>
            <span>{nearby.label}</span> <kbd>E</kbd>
          </button>
        ) : null}

        {opened && !interior ? (
          <div className="hud-assist hud-opened" role="status">
            Opened market charts in a new tab ·{' '}
            <a href={opened} target="_blank" rel="noopener noreferrer">
              open again ↗
            </a>
          </div>
        ) : null}
        {assistName && !interior && !overlay ? (
          <div className="hud-assist">
            <span aria-hidden="true">↻</span> View turned to show the <strong>{assistName}</strong> entrance · <kbd>Q</kbd>/<kbd>R</kbd> rotate
          </div>
        ) : null}

        <div className="hud-legend" aria-hidden="true">
          <span className="keys">
            <kbd>W</kbd>
            <kbd>A</kbd>
            <kbd>S</kbd>
            <kbd>D</kbd>
          </span>{' '}
          move <kbd>E</kbd> interact <kbd>Esc</kbd> close
        </div>

        {settings.joystick ? (
          <>
            <Joystick input={input} />
            {nearby ? (
              <button type="button" className="touch-interact" onClick={interact} aria-label={`Interact with ${nearby.label}`}>
                E
              </button>
            ) : null}
          </>
        ) : null}

        <p className="sr-only" aria-live="polite">
          {announcement}
        </p>

        {overlay?.kind === 'place' && overlay.target.kind === 'district' ? (
          <DistrictPanel district={overlay.target.district} data={data} onClose={() => setOverlay(null)} onEnter={enterBuilding} />
        ) : null}
        {overlay?.kind === 'place' && overlay.target.kind === 'building' ? (
          <BuildingPanel target={overlay.target} hq={hqFor(data, overlay.target.building.organizationId)} onClose={() => setOverlay(null)} onEnter={() => enterBuilding(overlay.target.id)} />
        ) : null}
        {overlay?.kind === 'station' && interior ? <StationPanel kind={interior.kind} station={overlay.station} hq={hq} identity={identity} onClose={() => setOverlay(null)} /> : null}
        {overlay?.kind === 'places' ? <PlacesPanel onClose={() => setOverlay(null)} onTravel={travel} /> : null}
        {overlay?.kind === 'people' ? <PeoplePanel people={people} onClose={() => setOverlay(null)} /> : null}
        {overlay?.kind === 'settings' ? (
          <SettingsPanel settings={settings} onChange={setSettings} onClose={() => setOverlay(null)} onDirectory={() => setFallback('Directory view (2D) selected.')} />
        ) : null}
        {overlay?.kind === 'help' ? <HelpPanel onClose={() => setOverlay(null)} /> : null}
        {overlay?.kind === 'map' && !interior ? (
          <Panel title="City map" subtitle={district ? `You are in ${getDistrict(district).name}` : 'Grooveli City'} onClose={() => setOverlay(null)} wide>
            <CityMap variant="full" pos={pos} currentDistrict={district} onTravel={travel} onOpenBuilding={openBuildingFromMap} />
          </Panel>
        ) : null}
        {overlay?.kind === 'markets' ? <MarketsPanel feed={marketFeed} onClose={() => setOverlay(null)} /> : null}
        {overlay?.kind === 'notifications' ? <NotificationsPanel events={data.events} onClose={() => setOverlay(null)} /> : null}
        {overlay?.kind === 'menu' ? (
          <MenuPanel
            onClose={() => setOverlay(null)}
            onPlaces={() => setOverlay({ kind: 'places' })}
            onSettings={() => setOverlay({ kind: 'settings' })}
            onHelp={() => setOverlay({ kind: 'help' })}
            onRotate={interior ? undefined : rotateView}
            onZoom={(dir) => setZoom((z) => (dir > 0 ? Math.min(CAMERA.maxZoom, z + 3) : Math.max(CAMERA.minZoom, z - 3)))}
            homeHref={homeHref}
            map={
              interior ? (
                <p className="small muted">Leave the building to use the map.</p>
              ) : (
                <CityMap pos={pos} currentDistrict={district} onTravel={travel} onOpenBuilding={openBuildingFromMap} onExpand={() => setOverlay({ kind: 'map' })} />
              )
            }
          />
        ) : null}

        <div className="hud-footer small">
          Demo city · synthetic data · people are <SimTag>simulated</SimTag> · {DISTRICTS.length} places
        </div>
      </div>
    </div>
  );
}
