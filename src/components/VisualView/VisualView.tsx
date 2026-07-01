'use client';

import { useMemo, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import { VisualScene } from './VisualScene';
import { SceneCompositor } from './SceneCompositor';
import { ExportController } from '../ExportController';
import { getInstrument } from '@/instruments';
import { getVisualPlaybackEngine } from '@/core/visualPlayback';
import { useProjectStore } from '@/stores/projectStore';

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

const EMPTY_ROOT_SCENES: string[] = [];
const DEFAULT_MASTER_GLOW = {
  intensity: 1.5,
  threshold: 0.2,
  smoothing: 0.9,
};

type MasterGlowParams = typeof DEFAULT_MASTER_GLOW;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function num(params: Record<string, unknown> | undefined, key: string, fallback: number): number {
  const value = params?.[key];
  return typeof value === 'number' ? value : fallback;
}

function getMasterGlowParams(params: Record<string, unknown> | undefined): MasterGlowParams {
  return {
    intensity: clamp(num(params, 'glowIntensity', DEFAULT_MASTER_GLOW.intensity), 0, 6),
    threshold: clamp(num(params, 'glowThreshold', DEFAULT_MASTER_GLOW.threshold), 0, 1),
    smoothing: clamp(num(params, 'glowSmoothing', DEFAULT_MASTER_GLOW.smoothing), 0, 1),
  };
}

function sameGlowParams(a: MasterGlowParams, b: MasterGlowParams): boolean {
  return a.intensity === b.intensity && a.threshold === b.threshold && a.smoothing === b.smoothing;
}

function MasterGlow({ disabled }: { disabled: boolean }) {
  const masterTrackId = useProjectStore((s) => Object.values(s.project.tracks).find((t) => t.typeId === 'master')?.id);
  const masterSettings = useProjectStore((s) => (
    masterTrackId ? s.project.tracks[masterTrackId]?.instrumentSettings : undefined
  ));

  const [glow, setGlow] = useState<MasterGlowParams>(DEFAULT_MASTER_GLOW);

  useFrame(() => {
    const engine = getVisualPlaybackEngine();
    const masterState = masterTrackId ? engine.getTrackState(masterTrackId) : undefined;
    const next = getMasterGlowParams(masterState?.params ?? masterSettings);
    setGlow((current) => (sameGlowParams(current, next) ? current : next));
  });

  if (disabled) return null;

  return (
    <EffectComposer multisampling={0}>
      <Bloom
        intensity={glow.intensity}
        luminanceThreshold={glow.threshold}
        luminanceSmoothing={glow.smoothing}
        mipmapBlur
      />
    </EffectComposer>
  );
}

export function VisualView({ tracks, rootScenes = EMPTY_ROOT_SCENES }: VisualViewProps) {
  const shouldDisableBloom = useMemo(
    () => tracks.some((t) => getInstrument(t.instrumentId)?.disableBloom),
    [tracks],
  );

  // Check if any track uses the master channel (always true for new projects)
  const hasMasterTrack = useMemo(
    () => tracks.some((t) => t.instrumentId === 'masterChannel'),
    [tracks],
  );
  const hasScenes = rootScenes.length > 0;
  // Always use compositor when master track exists (for post-processing) or when scenes exist
  const useCompositor = hasScenes || hasMasterTrack;

  return (
    <div className="w-full h-full bg-black/90">
      <Canvas
        camera={{ position: [0, 0, 8], fov: 50 }}
        gl={{ antialias: true, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: true }}
        dpr={[1, 2]}
      >
        <color attach="background" args={['#0a0a0f']} />
        <fog attach="fog" args={['#0a0a0f', 10, 30]} />
        <ExportController />

        {useCompositor ? (
          <SceneCompositor allTracks={tracks} rootScenes={rootScenes} />
        ) : (
          <VisualScene tracks={tracks} />
        )}

        <MasterGlow disabled={shouldDisableBloom} />
      </Canvas>
    </div>
  );
}
