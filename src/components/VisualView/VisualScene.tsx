'use client';

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { useVisualStore } from '@/stores/visualStore';
import { PolarFlower } from './instruments/PolarFlower';

interface VisualSceneProps {
  trackIds: string[];
}

export function VisualScene({ trackIds }: VisualSceneProps) {
  const trackStates = useVisualStore((state) => state.trackStates);

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

      {/* Render visual instruments */}
      {trackIds.map((trackId, index) => {
        const state = trackStates.get(trackId);
        if (!state) return null;

        // Position instruments in a grid if multiple
        const offset = (index - (trackIds.length - 1) / 2) * 3;

        return (
          <group key={trackId} position={[offset, 0, 0]}>
            {state.instrumentId === 'polarFlower' && (
              <PolarFlower state={state} />
            )}
          </group>
        );
      })}
    </>
  );
}
