import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { useActiveFrame } from '../sceneActive';
import { StaticBatch } from '../interior/StaticBatch';
import { Box, Cyl } from '../apartment/Furniture';
import { Planter } from '../hq/OfficeFurniture';
import { sharedGeometry } from '../sharedGeometry';
import { PLAZA_H } from '../../world/layout';
import { PLAZA_RING } from '../../world/plan';
import {
  CHECKERS_TABLES,
  CHESS_TABLES,
  FURNITURE_SCALE,
  GAMES_PAVILION,
  GAMES_ZONE_SIGN,
  GAME_STATIONS,
  GIANT_TOKENS,
  LOUNGE,
  LUDO_TABLES,
  POOL_SCALE,
  POOL_TABLES,
  PUZZLE_TABLES,
  deckOf,
  type GameId,
  type GameStationId,
} from '../../world/gamesZone';
import { areaSignTexture, gEmblemTexture, gamesMaterials, leaderboardTexture, playConnectTexture, puzzleConsoleTexture, setGamesNight, signMaterial, zoneSignTexture, type GamesMaterials } from './gamesAssets';
import { AreaSign, BALL_R, RBox, Shrub, BoardTable, CheckerStack, CurvedSofa, Deck, GiantDice, GiantToken, KnightStatue, LudoTable, POOL_FELT_Y, Pergola, PoolTable, PuzzleTable, StandScreen, rackedBalls } from './GameFurniture';
import { Pavilion } from './Pavilion';
import { GameCrowd, type CrowdSpot } from './GameCrowd';

const PI = Math.PI;
const S = FURNITURE_SCALE;

/** Clickable / hoverable station: opens its information panel; shows a ring at its interaction point. */
function Station({ id, nearbyId, onGame, children }: { id: GameStationId; nearbyId: string | null; onGame: (id: GameStationId) => void; children: ReactNode }) {
  const [hover, setHover] = useState(false);
  useEffect(() => () => void (hover && (document.body.style.cursor = '')), [hover]);
  const at = GAME_STATIONS.find((s) => s.id === id)!.position;
  const active = hover || nearbyId === id;
  return (
    <group
      onClick={(e: ThreeEvent<MouseEvent>) => {
        if (e.delta > 6) return;
        e.stopPropagation();
        onGame(id);
      }}
      onPointerOver={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        setHover(true);
        document.body.style.cursor = 'pointer';
      }}
      onPointerOut={() => {
        setHover(false);
        document.body.style.cursor = '';
      }}
    >
      {children}
      {active ? (
        <mesh position={[at.x, PLAZA_H + 0.03, at.z]} rotation-x={-PI / 2} userData={{ noBatch: true }}>
          <ringGeometry args={[0.9, 1.12, 48]} />
          <meshBasicMaterial color="#c4b5fd" transparent opacity={0.9} toneMapped={false} />
        </mesh>
      ) : null}
    </group>
  );
}

/** Jigsaw piece outline for the puzzle holograms. */
function jigsawGeometry() {
  const s = new THREE.Shape();
  s.moveTo(-0.2, -0.2);
  s.lineTo(-0.06, -0.2);
  s.absarc(0, -0.2, 0.06, PI, 0, true);
  s.lineTo(0.2, -0.2);
  s.lineTo(0.2, -0.06);
  s.absarc(0.2, 0, 0.06, -PI / 2, PI / 2, false);
  s.lineTo(0.2, 0.2);
  s.lineTo(0.06, 0.2);
  s.absarc(0, 0.2, 0.06, 0, PI, false);
  s.lineTo(-0.2, 0.2);
  s.closePath();
  return new THREE.ExtrudeGeometry(s, { depth: 0.06, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.012, bevelSegments: 2, curveSegments: 10 });
}

function Holograms({ G, reducedMotion }: { G: GamesMaterials; reducedMotion: boolean }) {
  const geo = useMemo(jigsawGeometry, []);
  useEffect(() => () => geo.dispose(), [geo]);
  const refs = useRef<(THREE.Group | null)[]>([]);
  const y = deckOf('puzzle').y + 0.74 * S + 0.7;
  useActiveFrame(({ clock }) => {
    if (reducedMotion) return;
    refs.current.forEach((g, i) => {
      if (!g) return;
      g.rotation.y = clock.elapsedTime * 0.6 + i;
      g.position.y = y + Math.sin(clock.elapsedTime * 1.4 + i) * 0.06;
    });
  });
  return (
    <>
      {PUZZLE_TABLES.map(([x, z], i) => (
        <group key={i} ref={(g) => void (refs.current[i] = g)} position={[x, y, z]}>
          <mesh geometry={geo} material={G.holo} scale={1.3} position={[-0.04, 0, -0.04]} userData={{ noBatch: true }} />
          <mesh position-y={-0.45} rotation-x={-PI / 2} material={G.cyanGlow} geometry={sharedGeometry('torus', 0.26, 0.012, 6, 32)} userData={{ noBatch: true }} />
        </group>
      ))}
    </>
  );
}

/** Where simulated visitors sit or stand (decorative). */
function crowdSpots(): CrowdSpot[] {
  const out: CrowdSpot[] = [];
  const pairSeats = (tables: [number, number][], id: GameId, n: number) =>
    tables.slice(0, n).forEach(([x, z]) => {
      const y = deckOf(id).y;
      out.push({ x: x - 0.6 * S, z, y, heading: PI / 2, pose: 'sit' }, { x: x + 0.6 * S, z, y, heading: -PI / 2, pose: 'sit' });
    });
  pairSeats(CHESS_TABLES, 'chess', 4);
  pairSeats(CHECKERS_TABLES, 'checkers', 3);
  LUDO_TABLES.forEach(([x, z], t) =>
    [0, 1, 2, 3]
      .filter((i) => i !== (t === 0 ? 1 : 3))
      .forEach((i) => {
        const a = (i * PI) / 2;
        out.push({ x: x + Math.sin(a) * 0.66 * S, z: z + Math.cos(a) * 0.66 * S, y: deckOf('ludo').y, heading: a + PI, pose: 'sit' });
      }),
  );
  PUZZLE_TABLES.forEach(([x, z], t) => {
    out.push({ x, z: z - 0.62 * S, y: deckOf('puzzle').y, heading: 0, pose: 'sit' });
    if (t === 0) out.push({ x, z: z + 0.62 * S, y: deckOf('puzzle').y, heading: PI, pose: 'sit' });
  });
  POOL_TABLES.forEach(([x, z], t) => out.push({ x: x + (t ? 1.95 : -1.95), z: z + (t ? 0.3 : -0.2), y: deckOf('pool').y, heading: t ? -PI / 2 : PI / 2, pose: 'stand' }));
  out.push({ x: 13.4, z: -4.8, y: deckOf('pool').y, heading: -PI / 2 - 0.4, pose: 'stand' });
  // host behind the pavilion's reception counter
  out.push({ x: GAMES_PAVILION.x, z: GAMES_PAVILION.z - 0.2, y: 0.47, heading: 0, pose: 'stand' });
  // lounge: three on each sofa arc, facing the centre
  for (const base of [PI, 0])
    for (const t of [-0.55, 0.05, 0.6]) {
      const a = base + t * LOUNGE.arcHalf;
      const r = LOUNGE.sofaRadius - 0.12;
      out.push({ x: PLAZA_RING.x + Math.cos(a) * r, z: PLAZA_RING.z + Math.sin(a) * r, y: PLAZA_H, heading: Math.atan2(-Math.cos(a), -Math.sin(a)), pose: 'sit' });
    }
  return out;
}

/**
 * Grooveli Games Zone on Grooveli Plaza (world/gamesZone.ts): pavilion,
 * Chess & Checkers terraces, covered 8-Ball Pool, Ludo, Puzzles, the central
 * "G" lounge and signage. Stations open information panels — no game is
 * playable yet. Static furniture is merged per material (StaticBatch).
 */
export function GamesZone({ night, reducedMotion, nearbyId, onGame }: { night: boolean; reducedMotion: boolean; nearbyId: string | null; onGame: (id: GameStationId) => void }) {
  const G = gamesMaterials();
  const m = G.m;
  useEffect(() => setGamesNight(G, night), [G, night]);
  const spots = useMemo(crowdSpots, []);
  const sign = (id: GameId) => signMaterial(areaSignTexture(id));
  const deck = (id: GameId) => {
    const d = deckOf(id);
    const base = d.y > 0.35 ? PLAZA_H : 0.2;
    return (
      <group position={[(d.minX + d.maxX) / 2, base, (d.minZ + d.maxZ) / 2]}>
        <Deck G={G} w={d.maxX - d.minX} d={d.maxZ - d.minZ} h={d.y - base} open={d.open} top={base > 0.3 ? G.deckEast : G.deckWest} edge={G.violetGlow} />
      </group>
    );
  };
  const ring = PLAZA_RING;
  return (
    <group>
      {/* One merge for all static furniture (per material); animated / instanced parts are excluded. */}
      <StaticBatch>
      {/* ---- Games Hub pavilion */}
      <Station id="games-hub" nearbyId={nearbyId} onGame={onGame}>
          <Pavilion G={G} />
      </Station>
      <group position={[4.75, PLAZA_H, -6.9]} rotation-y={-0.35} scale={1.15}>
        <StandScreen G={G} material={signMaterial(playConnectTexture())} w={1.6} h={1.15} y={0.9} />
      </group>

      {/* ---- Chess terrace: pergola, giant knight, tournaments screen */}
      <Station id="chess" nearbyId={nearbyId} onGame={onGame}>
          {deck('chess')}
          {CHESS_TABLES.map(([x, z], i) => (
            <group key={i} position={[x, deckOf('chess').y, z]} scale={S}>
              <BoardTable G={G} kind="chess" seed={i} />
            </group>
          ))}
          <group position={[-19.0, deckOf('chess').y, -6.75]}>
            <Pergola G={G} w={6.3} d={1.5} h={2.9} />
          </group>
          <group position={[-16.6, deckOf('chess').y, -6.4]} scale={1.1}>
            <KnightStatue G={G} />
          </group>
          <group position={[-19.9, deckOf('chess').y, -7.05]}>
            <StandScreen G={G} material={signMaterial(leaderboardTexture())} w={2.3} h={1.35} y={0.95} />
          </group>
          <group position={[-15.95, deckOf('chess').y, 0.9]}>
            <AreaSign G={G} material={sign('chess')} />
          </group>
      </Station>

      {/* ---- Checkers terrace */}
      <Station id="checkers" nearbyId={nearbyId} onGame={onGame}>
          {deck('checkers')}
          {CHECKERS_TABLES.map(([x, z], i) => (
            <group key={i} position={[x, deckOf('checkers').y, z]} scale={S}>
              <BoardTable G={G} kind="checkers" seed={i} />
            </group>
          ))}
          <group position={[-16.4, deckOf('checkers').y, 3.75]}>
            <CheckerStack G={G} />
          </group>
          <group position={[-21.6, deckOf('checkers').y, 10.6]}>
            <Shrub G={G} s={1.2} />
          </group>
          <group position={[-15.95, deckOf('checkers').y, 10.8]}>
            <AreaSign G={G} material={sign('checkers')} />
          </group>
      </Station>

      {/* ---- Covered 8-Ball Pool */}
      <Station id="pool" nearbyId={nearbyId} onGame={onGame}>
          {deck('pool')}
          <group position={[10.55, deckOf('pool').y, -4.8]}>
            <Pergola G={G} w={6.9} d={6.5} h={3.05} slats={0.55} />
          </group>
          {POOL_TABLES.map(([x, z], i) => (
            <group key={i} position={[x, deckOf('pool').y, z]} scale={POOL_SCALE}>
              <PoolTable G={G} lampTop={2.75} />
            </group>
          ))}
          {/* cue rack on the east posts */}
          <group position={[13.75, deckOf('pool').y, -4.8]}>
            <RBox size={[0.08, 1.4, 0.7]} at={[0, 1.1, 0]} mat={m.darkWood} r={0.02} />
            {[-0.24, -0.08, 0.08, 0.24].map((z) => (
              <mesh key={z} position={[-0.07, 1.0, z]} geometry={sharedGeometry('cylinder', 0.007, 0.015, 1.5, 8)} material={m.lightWood} castShadow />
            ))}
          </group>
          <group position={[7.45, deckOf('pool').y, -1.85]}>
            <AreaSign G={G} material={sign('pool')} />
          </group>
      </Station>

      {/* ---- Ludo: tables, giant dice and tokens */}
      <Station id="ludo" nearbyId={nearbyId} onGame={onGame}>
          {deck('ludo')}
          {LUDO_TABLES.map(([x, z], i) => (
            <group key={i} position={[x, deckOf('ludo').y, z]} scale={S} rotation-y={i * 0.3}>
              <LudoTable G={G} />
            </group>
          ))}
          <group position={[13.3, deckOf('ludo').y, 4.5]} rotation-y={0.45}>
            <GiantDice G={G} size={0.85} />
          </group>
          {GIANT_TOKENS.map((t) => (
            <group key={t.color} position={[t.x, deckOf('ludo').y, t.z]}>
              <GiantToken G={G} color={t.color} height={1.15} />
            </group>
          ))}
          <group position={[7.45, deckOf('ludo').y, 5.0]}>
            <AreaSign G={G} material={sign('ludo')} />
          </group>
      </Station>

      {/* ---- Puzzles: challenge tables with holograms, console */}
      <Station id="puzzle" nearbyId={nearbyId} onGame={onGame}>
          {deck('puzzle')}
          {PUZZLE_TABLES.map(([x, z], i) => (
            <group key={i} position={[x, deckOf('puzzle').y, z]} scale={S}>
              <PuzzleTable G={G} />
            </group>
          ))}
          <group position={[13.2, deckOf('puzzle').y, 11.55]}>
            <StandScreen G={G} material={signMaterial(puzzleConsoleTexture())} w={1.2} h={0.8} y={0.85} />
          </group>
          <group position={[7.45, deckOf('puzzle').y, 11.6]}>
            <AreaSign G={G} material={sign('puzzle')} />
          </group>
        <Holograms G={G} reducedMotion={reducedMotion} />
      </Station>

      {/* ---- Central "G" lounge on the plaza ring */}
      <group position={[ring.x, PLAZA_H, ring.z]}>
          <CurvedSofa G={G} fabric={G.violetFabric} radius={LOUNGE.sofaRadius} a0={PI - LOUNGE.arcHalf} a1={PI + LOUNGE.arcHalf} />
          <CurvedSofa G={G} fabric={G.navyFabric} radius={LOUNGE.sofaRadius} a0={-LOUNGE.arcHalf} a1={LOUNGE.arcHalf} />
          {[PI, 0].map((a) => (
            <group key={a} position={[Math.cos(a) * 2.55, 0, Math.sin(a) * 2.55]}>
              <Cyl r={0.42} h={0.05} at={[0, 0.47, 0]} mat={m.marble} seg={32} />
              <Cyl r={0.05} h={0.44} at={[0, 0.23, 0]} mat={G.darkSteel} seg={10} />
              <Cyl r={0.22} h={0.02} at={[0, 0.01, 0]} mat={G.darkSteel} seg={20} />
            </group>
          ))}
          {[PI - LOUNGE.arcHalf - 0.24, PI + LOUNGE.arcHalf + 0.24, -LOUNGE.arcHalf - 0.24, LOUNGE.arcHalf + 0.24].map((a, i) => (
            <group key={i} position={[Math.cos(a) * LOUNGE.sofaRadius, 0, Math.sin(a) * LOUNGE.sofaRadius]}>
              <Shrub G={G} s={1.1 + (i % 2) * 0.15} />
            </group>
          ))}
        {/* floor emblem and violet ring around the lounge */}
        <mesh position-y={0.032} rotation-x={-PI / 2} material={signMaterial(gEmblemTexture(), true)}>
          <circleGeometry args={[ring.discRadius * 0.92, 48]} />
        </mesh>
        <mesh position-y={0.014} rotation-x={-PI / 2} material={G.violetGlow}>
          <ringGeometry args={[ring.radius + 0.42, ring.radius + 0.5, 96]} />
        </mesh>
      </group>

      {/* ---- "Games Zone" landmark sign on the south entrance */}
      <group position={[GAMES_ZONE_SIGN.x, PLAZA_H, GAMES_ZONE_SIGN.z]}>
          <group position={[0, 0, 0]}>
            <Planter m={m} w={GAMES_ZONE_SIGN.width + 0.2} d={0.6} />
          </group>
          <RBox size={[GAMES_ZONE_SIGN.width - 0.2, 1.3, 0.22]} at={[0, 1.25, 0]} mat={G.navy} r={0.12} />
          {[-1, 1].map((s) => (
            <RBox key={s} size={[0.12, 0.7, 0.12]} at={[s * 1.5, 0.6, -0.02]} mat={G.darkSteel} r={0.02} />
          ))}
          {/* glowing frame */}
          {[0.62, 1.88].map((y) => (
            <Box key={y} size={[GAMES_ZONE_SIGN.width - 0.3, 0.04, 0.03]} at={[0, y, 0.115]} mat={G.cyanGlow} />
          ))}
          {[-1, 1].map((s) => (
            <Box key={s} size={[0.04, 1.26, 0.03]} at={[s * ((GAMES_ZONE_SIGN.width - 0.3) / 2), 1.25, 0.115]} mat={G.cyanGlow} />
          ))}
        <mesh position={[0, 1.25, 0.117]} material={signMaterial(zoneSignTexture())} geometry={sharedGeometry('box', GAMES_ZONE_SIGN.width - 0.42, 1.16, 0.001)} />
      </group>

      {/* ---- shrubs between the two west terraces */}
      {[-21.2, -18.9, -16.6].map((x) => (
        <group key={x} position={[x, 0.2, 2.15]}>
          <Shrub G={G} s={1.05} />
        </group>
      ))}

      {/* ---- landscaping around the pavilion */}
        {[-1, 1].map((s) => (
          <group key={s} position={[s * 5.3, PLAZA_H, -7.7]}>
            <Planter m={m} w={2.2} d={0.7} />
          </group>
        ))}

      </StaticBatch>
      <PoolBalls />
      <GameCrowd spots={spots} />
    </group>
  );
}

/** All pool balls in one instanced mesh (one draw call, per-ball colour). */
function PoolBalls() {
  const balls = useMemo(() => {
    const local = rackedBalls();
    return POOL_TABLES.flatMap(([tx, tz]) =>
      local.map((b) => ({ x: tx + b.x * POOL_SCALE, z: tz + b.z * POOL_SCALE, y: deckOf('pool').y + (POOL_FELT_Y + BALL_R) * POOL_SCALE, color: b.color })),
    );
  }, []);
  const ref = useRef<THREE.InstancedMesh>(null);
  const geo = useMemo(() => new THREE.SphereGeometry(BALL_R * POOL_SCALE, 12, 8), []);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ roughness: 0.15, metalness: 0.05 }), []);
  useEffect(
    () => () => {
      geo.dispose();
      mat.dispose();
    },
    [geo, mat],
  );
  useEffect(() => {
    const m = ref.current;
    if (!m) return;
    const o = new THREE.Object3D();
    const c = new THREE.Color();
    balls.forEach((b, i) => {
      o.position.set(b.x, b.y, b.z);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
      m.setColorAt(i, c.set(b.color));
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.computeBoundingSphere();
  }, [balls]);
  return <instancedMesh ref={ref} args={[geo, mat, balls.length]} />;
}
