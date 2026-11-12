import * as THREE from 'three';

/**
 * One material for every vehicle. Per-vertex channels (attribute `surf`):
 *   x paint  – how much the instance (body) colour tints this part
 *   y gloss  – 0 matte … 1 mirror (roughness / metalness)
 *   z glow   – lamp / sign emission, scaled by time of day
 *   w glass  – window glass: lighter tint and interior glow at night
 * The atlas map supplies liveries; alphaTest cuts decal backgrounds.
 */
export interface VehicleMaterial extends THREE.MeshStandardMaterial {
  userData: { uniforms: { uGlow: { value: number }; uNight: { value: number }; uGlassTint: { value: THREE.Color }; uGlassGlow: { value: THREE.Color } } };
}

export function createVehicleMaterial(map: THREE.Texture | null): VehicleMaterial {
  const uniforms = {
    uGlow: { value: 0.45 },
    uNight: { value: 0 },
    uGlassTint: { value: new THREE.Color('#7fa6e0') },
    uGlassGlow: { value: new THREE.Color('#000000') },
  };
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, map, alphaTest: map ? 0.45 : 0, roughness: 1, metalness: 0 }) as VehicleMaterial;
  m.userData.uniforms = uniforms;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 surf;\nvarying vec4 vSurf;')
      .replace(
        '#include <color_vertex>',
        `vColor = vec3(1.0);
#ifdef USE_COLOR
  vColor *= color;
#endif
#ifdef USE_INSTANCING_COLOR
  vColor *= mix(vec3(1.0), instanceColor.rgb, surf.x);
#endif
vSurf = surf;`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec4 vSurf;\nuniform float uGlow;\nuniform float uNight;\nuniform vec3 uGlassTint;\nuniform vec3 uGlassGlow;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, uGlassTint, clamp(vSurf.w, 0.0, 1.0) * uNight);')
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = mix(0.92, 0.1, vSurf.y);')
      // glass keeps its gloss but is mostly dielectric, so it reads as tinted glass rather than black metal
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = 0.7 * vSurf.y * vSurf.y * (1.0 - 0.8 * clamp(vSurf.w, 0.0, 1.0));')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * vSurf.z * uGlow + uGlassGlow * vSurf.w + vec3(0.035, 0.05, 0.075) * clamp(vSurf.w, 0.0, 1.0) * (1.0 - uNight);');
  };
  m.customProgramCacheKey = () => 'grooveli-vehicle-v2';
  return m;
}

/** Day/night: lamps and signs brighten, windows lighten and glow from inside. */
export function setVehicleNight(m: VehicleMaterial, night: boolean) {
  const u = m.userData.uniforms;
  u.uGlow.value = night ? 2.4 : 0.45;
  u.uNight.value = night ? 1 : 0;
  u.uGlassGlow.value.set(night ? '#3b5f9e' : '#000000').multiplyScalar(night ? 0.45 : 0);
}
