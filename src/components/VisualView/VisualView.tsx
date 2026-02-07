'use client';

import { useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import { VisualScene } from './VisualScene';
import { getInstrument } from '@/instruments';

export interface VisualTrackInfo {
  id: string;
  instrumentId: string;
  isGroup?: boolean;
  childIds?: string[];
}

interface VisualViewProps {
  tracks: VisualTrackInfo[];
}

export function VisualView({ tracks }: VisualViewProps) {
  const shouldDisableBloom = useMemo(
    () => tracks.some((t) => getInstrument(t.instrumentId)?.disableBloom),
    [tracks],
  );

  return (
    <div className="w-full h-full bg-black/90">
      <Canvas
        camera={{ position: [0, 0, 8], fov: 50 }}
        gl={{ antialias: true, alpha: true }}
        dpr={[1, 1.5]}
      >
        <color attach="background" args={['#0a0a0f']} />
        <fog attach="fog" args={['#0a0a0f', 10, 30]} />
        <VisualScene tracks={tracks} />
        {!shouldDisableBloom && (
          <EffectComposer>
            <Bloom
              intensity={1.5}
              luminanceThreshold={0.2}
              luminanceSmoothing={0.9}
              mipmapBlur
            />
          </EffectComposer>
        )}
      </Canvas>
    </div>
  );
}
