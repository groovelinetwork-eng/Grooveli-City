/**
 * HQ lighting: bright working-hours daylight with warm accents. Shared by the
 * office and by the background shader warm-up (HqPreloader), whose compiled
 * programs only match the office's if the light setup is identical.
 */
export function HqLights({ shadows, shadowMap }: { shadows: boolean; shadowMap: number }) {
  return (
    <>
      <hemisphereLight args={['#fffaf0', '#8c7a64', 1.05]} />
      <ambientLight intensity={0.16} color="#fff3e0" />
      <directionalLight
        position={[9, 16, 11]}
        intensity={1.55}
        color="#fff4e2"
        castShadow={shadows}
        shadow-mapSize={[Math.max(512, shadowMap), Math.max(512, shadowMap)]}
        shadow-camera-left={-15}
        shadow-camera-right={15}
        shadow-camera-top={14}
        shadow-camera-bottom={-14}
        shadow-camera-far={60}
        shadow-bias={-0.0004}
        shadow-normalBias={0.03}
      />
      <pointLight position={[6.7, 2.6, 4.2]} intensity={1.3} distance={9} decay={2} color="#ffd9a8" />
      <pointLight position={[0, 2.6, 0.7]} intensity={1.0} distance={9} decay={2} color="#fff0d8" />
      <pointLight position={[-7.4, 2.3, -1.1]} intensity={0.8} distance={6} decay={2} color="#ffd9a8" />
      <pointLight position={[-6.6, 2.4, 6.4]} intensity={0.9} distance={7} decay={2} color="#ffcf94" />
    </>
  );
}
