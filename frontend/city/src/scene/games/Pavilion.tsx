import { useMemo } from 'react';
import * as THREE from 'three';
import { Box, Cyl } from '../apartment/Furniture';
import { Bookshelf } from '../hq/OfficeFurniture';
import { sharedGeometry } from '../sharedGeometry';
import { GAMES_PAVILION } from '../../world/gamesZone';
import { gEmblemTexture, hubSignTexture, playConnectTexture, signMaterial, type GamesMaterials } from './gamesAssets';
import { RBox, Shrub, StandScreen } from './GameFurniture';

const PI = Math.PI;

/** Neon gamepad outline (reference: glowing controller crowning the pavilion). */
function controllerGeometries() {
  const outline = (k: number) => {
    const s = new THREE.Shape();
    s.moveTo(-0.55 * k, 0.42 * k);
    s.lineTo(0.55 * k, 0.42 * k);
    s.bezierCurveTo(0.9 * k, 0.42 * k, 1.0 * k, 0.05 * k, 1.0 * k, -0.2 * k);
    s.bezierCurveTo(1.0 * k, -0.5 * k, 0.74 * k, -0.62 * k, 0.58 * k, -0.46 * k);
    s.lineTo(0.4 * k, -0.24 * k);
    s.lineTo(-0.4 * k, -0.24 * k);
    s.lineTo(-0.58 * k, -0.46 * k);
    s.bezierCurveTo(-0.74 * k, -0.62 * k, -1.0 * k, -0.5 * k, -1.0 * k, -0.2 * k);
    s.bezierCurveTo(-1.0 * k, 0.05 * k, -0.9 * k, 0.42 * k, -0.55 * k, 0.42 * k);
    return s;
  };
  const ring = outline(1);
  const hole = outline(0.86);
  ring.holes.push(new THREE.Path(hole.getPoints(24).reverse()));
  const frame = new THREE.ExtrudeGeometry(ring, { depth: 0.06, bevelEnabled: false, curveSegments: 16 });
  const back = new THREE.ExtrudeGeometry(outline(0.97), { depth: 0.04, bevelEnabled: false, curveSegments: 16 });
  back.translate(0, 0, -0.05);
  return { frame, back };
}
let controller: ReturnType<typeof controllerGeometries> | null = null;

/**
 * Grooveli Games Hub pavilion: circular glass drum with mullions, a dark
 * roof with violet under-glow, an upper drum carrying the illuminated sign and
 * the neon controller, and a reception visible through the glass.
 */
export function Pavilion({ G }: { G: GamesMaterials }) {
  const m = G.m;
  const { radius: R, height: H, doorWidth } = GAMES_PAVILION;
  const base = 0.35;
  const plinth = 0.12;
  const doorHalf = Math.asin(doorWidth / 2 / R);
  const geo = useMemo(
    () => ({
      glass: new THREE.CylinderGeometry(R, R, H - 0.4, 64, 1, true, doorHalf, PI * 2 - doorHalf * 2),
      kick: new THREE.CylinderGeometry(R + 0.01, R + 0.01, 0.24, 64, 1, true, doorHalf, PI * 2 - doorHalf * 2),
      transom: new THREE.CylinderGeometry(R + 0.02, R + 0.02, 0.2, 64, 1, true),
      ledRing: new THREE.CylinderGeometry(R + 0.47, R + 0.47, 0.05, 64, 1, true),
    }),
    [R, H, doorHalf],
  );
  const pad = (controller ??= controllerGeometries());
  const mullions = useMemo(() => {
    const out: number[] = [];
    for (let a = doorHalf; a <= PI * 2 - doorHalf + 1e-6; a += (PI * 2 - doorHalf * 2) / 18) out.push(a);
    return out;
  }, [doorHalf]);
  const wallTop = base + plinth + H - 0.4;
  const roofTop = wallTop + 0.36;
  const drumTop = roofTop + 0.55;
  return (
    <group position={[GAMES_PAVILION.x, 0, GAMES_PAVILION.z]}>
      {/* plinth, floor and entrance mat */}
      <Cyl r={R + 0.3} h={plinth} at={[0, base + plinth / 2, 0]} mat={G.stone} seg={64} />
      <mesh position={[0, base + plinth + 0.002, 0]} material={G.pavilionFloor} receiveShadow geometry={sharedGeometry('cylinder', R - 0.05, R - 0.05, 0.004, 48)} />
      <Box size={[doorWidth, 0.01, 0.7]} at={[0, base + plinth + 0.006, R - 0.2]} mat={m.charcoal} />

      {/* glass drum: kick plate, glass, mullions, transom */}
      <mesh geometry={geo.kick} material={m.charcoal} position-y={base + plinth + 0.12} />
      <mesh geometry={geo.glass} material={G.glass} position-y={base + plinth + (H - 0.4) / 2} />
      {mullions.map((a, i) => (
        <Box key={i} size={[0.07, H - 0.4, 0.07]} at={[Math.sin(a) * R, base + plinth + (H - 0.4) / 2, Math.cos(a) * R]} mat={G.darkSteel} />
      ))}
      <mesh geometry={geo.transom} material={m.charcoal} position-y={wallTop} />
      {/* door frame */}
      {[-1, 1].map((s) => (
        <Box key={s} size={[0.12, H - 0.4, 0.14]} at={[s * (doorWidth / 2), base + plinth + (H - 0.4) / 2, Math.cos(doorHalf) * R]} mat={G.darkSteel} />
      ))}

      {/* roof with violet under-glow and LED edge */}
      <Cyl r={R + 0.45} h={0.36} at={[0, wallTop + 0.18, 0]} mat={G.roof} seg={64} />
      <mesh position-y={wallTop - 0.005} rotation-x={PI / 2} material={G.violetGlow} geometry={sharedGeometry('torus', R + 0.3, 0.035, 6, 72)} />
      <mesh geometry={geo.ledRing} material={G.cyanGlow} position-y={wallTop + 0.28} />
      {/* upper drum carrying the sign and the neon controller */}
      <Cyl r={2.3} h={0.55} at={[0, roofTop + 0.275, -0.2]} mat={m.charcoal} seg={48} />
      <mesh position={[0, drumTop + 0.005, -0.2]} rotation-x={PI / 2} material={G.violetGlow} geometry={sharedGeometry('torus', 2.3, 0.04, 6, 60)} />
      <group position={[0, roofTop + 0.62, 2.3]}>
        <RBox size={[4.6, 1.24, 0.24]} at={[0, 0, 0]} mat={G.navy} r={0.07} />
        <mesh position={[0, 0, 0.122]} material={signMaterial(hubSignTexture())} geometry={sharedGeometry('box', 4.4, 1.1, 0.001)} />
        <Box size={[4.5, 0.035, 0.035]} at={[0, -0.63, 0.11]} mat={G.violetGlow} />
      </group>
      <group position={[0, drumTop + 0.62, -0.1]} scale={0.95}>
        <mesh geometry={pad.back} material={G.navy} />
        <mesh geometry={pad.frame} material={G.pinkGlow} />
        <Box size={[0.32, 0.08, 0.05]} at={[-0.55, -0.02, 0.03]} mat={G.cyanGlow} />
        <Box size={[0.08, 0.32, 0.05]} at={[-0.55, -0.02, 0.03]} mat={G.cyanGlow} />
        {[
          [0.5, 0.1],
          [0.66, -0.04],
          [0.5, -0.18],
          [0.34, -0.04],
        ].map(([x, y], i) => (
          <mesh key={i} position={[x!, y!, 0.03]} rotation-x={PI / 2} material={G.cyanGlow} geometry={sharedGeometry('cylinder', 0.055, 0.055, 0.05, 16)} />
        ))}
        {/* support mast */}
        <Box size={[0.08, 0.5, 0.08]} at={[0, -0.75, -0.06]} mat={G.darkSteel} />
      </group>

      {/* interior: warm ceiling light, reception, shelves of games, screen */}
      <mesh position={[0, wallTop - 0.06, 0]} material={G.interior} geometry={sharedGeometry('cylinder', R - 0.15, R - 0.15, 0.02, 48)} />
      <group position={[0, base + plinth, 0.55]}>
        <RBox size={[2.3, 1.02, 0.62]} at={[0, 0.51, 0]} mat={m.deskWhite} r={0.05} />
        <RBox size={[2.42, 0.05, 0.72]} at={[0, 1.05, 0]} mat={m.stoneTop} r={0.02} />
        <Box size={[2.3, 0.03, 0.02]} at={[0, 0.12, 0.315]} mat={G.violetGlow} />
        <mesh position={[0, 0.58, 0.316]} material={signMaterial(gEmblemTexture(), true)} geometry={sharedGeometry('box', 0.62, 0.62, 0.001)} />
      </group>
      {[-1, 1].map((s) => (
        <group key={s} position={[Math.sin(PI + s * 0.62) * (R - 0.55), base + plinth, Math.cos(PI + s * 0.62) * (R - 0.55)]} rotation-y={s * 0.62} scale={1.25}>
          <Bookshelf m={m} w={1.3} h={1.8} />
        </group>
      ))}
      <group position={[0, base + plinth, -(R - 0.35)]} scale={1.2}>
        <StandScreen G={G} material={signMaterial(playConnectTexture())} w={1.7} h={1.05} y={0.75} />
      </group>
      {/* entrance plants */}
      {[-1, 1].map((s) => (
        <group key={s} position={[s * 1.75, base + plinth, R + 0.05]}>
          <Shrub G={G} s={1.2} />
        </group>
      ))}
    </group>
  );
}
