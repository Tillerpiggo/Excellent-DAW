'use client';

import { OrbitControls } from '@react-three/drei';
import { useVisualStore } from '@/stores/visualStore';
import { SilkSymmetry } from './instruments/SilkSymmetry';
import { HexagonDots } from './instruments/HexagonDots';
import { FractalTunnel } from './instruments/FractalTunnel';

interface VisualSceneProps {
  trackIds: string[];
}

export function VisualScene({ trackIds }: VisualSceneProps) {
  const trackStates = useVisualStore((state) => state.trackStates);

  // Render all tracks that have states (includes inherited visual instruments)
  // Fall back to trackIds if no states yet (before playback starts)
  const trackIdsToRender = trackStates.size > 0
    ? Array.from(trackStates.keys())
    : trackIds;

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
      {trackIdsToRender.map((trackId) => {
        const state = trackStates.get(trackId);
        if (!state) return null;

        return (
          <group key={trackId} position={[0, 0, 0]}>
            {state.instrumentId === 'silkSymmetry' && (
              <SilkSymmetry state={state} />
            )}
            {state.instrumentId === 'hexagonDots' && (
              <HexagonDots state={state} />
            )}
            {state.instrumentId === 'fractalTunnel' && (
              <FractalTunnel state={state} />
            )}
          </group>
        );
      })}
    </>
  );
}
