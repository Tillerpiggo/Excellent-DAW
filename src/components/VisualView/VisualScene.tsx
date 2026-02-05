'use client';

import { OrbitControls } from '@react-three/drei';
import { VisualTrackInfo } from './VisualView';
import { getInstrument } from '@/instruments';

interface VisualSceneProps {
  tracks: VisualTrackInfo[];
}

export function VisualScene({ tracks }: VisualSceneProps) {
  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={0.4} />
      <directionalLight position={[5, 5, 5]} intensity={0.8} />
      <pointLight position={[-5, 5, -5]} intensity={0.5} color="#8b5cf6" />

      {/* Camera controls */}
      <OrbitControls
        enablePan={false}
        enableZoom={true}
        minDistance={3}
        maxDistance={15}
        autoRotate={false}
      />

      {/* Render visual instruments - all centered, overlapping */}
      {tracks.map((track) => {
        const instrument = getInstrument(track.instrumentId);
        if (!instrument?.VisualComponent) return null;
        const Component = instrument.VisualComponent;
        return (
          <group key={track.id} position={[0, 0, 0]}>
            <Component trackId={track.id} />
          </group>
        );
      })}
    </>
  );
}
