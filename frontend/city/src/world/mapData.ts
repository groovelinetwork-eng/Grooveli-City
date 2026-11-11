import { DISTRICTS, PARK_BLOCK, type DistrictId } from '@grooveli/frontend-domain/public';
import { ALL_BUILDINGS, ROADS, SIDEWALK, WORLD_BOUNDS, blockBounds, districtLabelPoint, type AABB, type PlacedBuilding, type Vec2 } from './layout';
import { MINOR_STREETS, PLAZA_RECT, PLAZA_RING } from './plan';
import { buildCityProps } from './props';
import { PARK_POND, buildMarkings } from './streets';

/**
 * 2D city map model, derived from the same world data the 3D city uses
 * (block grid, roads, markings, building plan, props). Coordinates are world
 * units: x → right, z → down (north up, like the default camera).
 */
export const DISTRICT_ICON: Record<DistrictId, string> = {
  plaza: '⭐',
  corporate: '🏢',
  recruitment: '🤝',
  university: '🎓',
  tech: '💻',
  creative: '🎨',
  healthcare: '🏥',
  hospitality: '🏨',
  finance: '💰',
  apartment: '🏠',
  'ai-center': '🤖',
};

/** Short map labels (full names appear in the details card and the full map). */
export const DISTRICT_SHORT: Record<DistrictId, string> = {
  plaza: 'Plaza',
  corporate: 'Corporate',
  recruitment: 'Recruitment',
  university: 'University',
  tech: 'Tech Hub',
  creative: 'Creative',
  healthcare: 'Healthcare',
  hospitality: 'Hospitality',
  finance: 'Finance',
  apartment: 'Apartments',
  'ai-center': 'AI Center',
};

export interface MapDistrict {
  id: DistrictId;
  name: string;
  short: string;
  tagline: string;
  description: string;
  color: string;
  icon: string;
  /** Whole block (district boundary, including sidewalks). */
  block: AABB;
  /** Inside the sidewalk ring. */
  lot: AABB;
  label: Vec2;
  /** Enterable / landmark buildings in this district. */
  landmarks: string[];
}

export interface MapBuilding {
  id: string;
  name: string;
  district: DistrictId;
  rect: AABB;
  height: number;
  landmark: boolean;
  entrance: Vec2 | null;
  icon: string | null;
  source: PlacedBuilding;
}

export interface CityMapModel {
  bounds: AABB;
  roads: AABB[];
  minorStreets: AABB[];
  markings: ReturnType<typeof buildMarkings>;
  districts: MapDistrict[];
  park: { block: AABB; lot: AABB; pond: { x: number; z: number; r: number } };
  plaza: { rect: AABB; ring: typeof PLAZA_RING };
  buildings: MapBuilding[];
  trees: Vec2[];
}

const inset = (b: AABB, d: number): AABB => ({ minX: b.minX + d, maxX: b.maxX - d, minZ: b.minZ + d, maxZ: b.maxZ - d });

let cached: CityMapModel | null = null;

export function cityMapModel(): CityMapModel {
  if (cached) return cached;
  const buildings: MapBuilding[] = ALL_BUILDINGS.filter((b) => b.style !== 'flat' && b.h > 0).map((b) => {
    const landmark = !!b.entrance;
    return {
      id: b.id,
      name: b.name,
      district: b.district,
      rect: b.aabb,
      height: b.h,
      landmark,
      entrance: b.entrance,
      icon: landmark ? DISTRICT_ICON[b.district] : null,
      source: b,
    };
  });
  const districts: MapDistrict[] = DISTRICTS.map((d) => {
    const block = blockBounds(d.grid);
    return {
      id: d.id,
      name: d.name,
      short: DISTRICT_SHORT[d.id],
      tagline: d.tagline,
      description: d.description,
      color: d.color,
      icon: DISTRICT_ICON[d.id],
      block,
      lot: d.id === 'plaza' ? block : inset(block, SIDEWALK),
      label: districtLabelPoint(d.id),
      landmarks: buildings.filter((b) => b.district === d.id && b.landmark).map((b) => b.name),
    };
  });
  const parkBlock = blockBounds(PARK_BLOCK);
  const props = buildCityProps();
  cached = {
    bounds: WORLD_BOUNDS,
    roads: ROADS.filter((r) => !r.minor),
    minorStreets: MINOR_STREETS,
    markings: buildMarkings(),
    districts,
    park: {
      block: parkBlock,
      lot: inset(parkBlock, SIDEWALK),
      pond: { x: (parkBlock.minX + parkBlock.maxX) / 2 + PARK_POND.dx, z: (parkBlock.minZ + parkBlock.maxZ) / 2 + PARK_POND.dz, r: PARK_POND.r },
    },
    plaza: { rect: PLAZA_RECT, ring: PLAZA_RING },
    buildings,
    // street-level trees only (roof gardens sit on building footprints)
    trees: props.trees.filter((t) => t.y < 1).map((t) => ({ x: t.x, z: t.z })),
  };
  return cached;
}

/** District whose block contains a world point (no street margin; for map hit-testing). */
export function mapDistrictAt(p: Vec2): DistrictId | null {
  for (const d of cityMapModel().districts) if (p.x >= d.block.minX && p.x <= d.block.maxX && p.z >= d.block.minZ && p.z <= d.block.maxZ) return d.id;
  return null;
}
