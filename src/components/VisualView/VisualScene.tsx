'use client';

import { OrbitControls } from '@react-three/drei';
import { SilkSymmetry } from './instruments/SilkSymmetry';
import { HexagonDots } from './instruments/HexagonDots';
import { FractalTunnel } from './instruments/FractalTunnel';
import { VisualTrackInfo } from './VisualView';

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
      {tracks.map((track) => (
        <group key={track.id} position={[0, 0, 0]}>
          {track.instrumentId === 'silkSymmetry' && (
            <SilkSymmetry trackId={track.id} />
          )}
          {track.instrumentId === 'hexagonDots' && (
            <HexagonDots trackId={track.id} />
          )}
          {track.instrumentId === 'fractalTunnel' && (
            <FractalTunnel trackId={track.id} />
          )}
        </group>
      ))}
    </>
  );
}
