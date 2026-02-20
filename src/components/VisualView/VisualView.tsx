'use client';

import { useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import { VisualScene } from './VisualScene';
import { SceneCompositor } from './SceneCompositor';
import { ExportController } from '../ExportController';
import { getInstrument } from '@/instruments';

export interface VisualTrackInfo {
  id: string;
  instrumentId: string;
  isGroup?: boolean;
  childIds?: string[];
  sceneId?: string;
}

interface VisualViewProps {
  tracks: VisualTrackInfo[];
  rootScenes?: string[];
}

export function VisualView({ tracks, rootScenes = [] }: VisualViewProps) {
  const shouldDisableBloom = useMemo(
    () => tracks.some((t) => getInstrument(t.instrumentId)?.disableBloom),
    [tracks],
  );

  const hasScenes = rootScenes.length > 0;

  return (
    <div className="w-full h-full bg-black/90">
      <Canvas
        camera={{ position: [0, 0, 8], fov: 50 }}
        gl={{ antialias: false, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: true }}
        dpr={1}
      >
        <color attach="background" args={['#0a0a0f']} />
        <fog attach="fog" args={['#0a0a0f', 10, 30]} />
        <ExportController />

        {hasScenes ? (
          <SceneCompositor allTracks={tracks} rootScenes={rootScenes} />
        ) : (
          <VisualScene tracks={tracks} />
        )}

        {!shouldDisableBloom && (
          <EffectComposer multisampling={0}>
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
