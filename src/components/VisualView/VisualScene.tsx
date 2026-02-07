'use client';

import { OrbitControls } from '@react-three/drei';
import { VisualTrackInfo } from './VisualView';
import { TrackRenderer } from './TrackRenderer';
import { VisualBeatSync } from './VisualBeatSync';
import { useProjectStore } from '@/stores/projectStore';
import { useMemo } from 'react';
import { PluginInstance } from '@/core/types';
import { useShallow } from 'zustand/react/shallow';

interface VisualSceneProps {
  tracks: VisualTrackInfo[];
}

export function VisualScene({ tracks }: VisualSceneProps) {
  // Narrow selector: only extract visualPlugins for tracks we render
  const trackIds = useMemo(() => tracks.map((t) => t.id), [tracks]);
  const pluginsByTrack = useProjectStore(
    useShallow((s) => {
      const result: Record<string, PluginInstance[]> = {};
      for (const id of trackIds) {
        result[id] = s.project.tracks[id]?.visualPlugins ?? [];
      }
      return result;
    }),
  );

  return (
    <>
      {/* Compute visual state before instruments read it */}
      <VisualBeatSync />

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

      {/* Render visual instruments through plugin chain */}
      {tracks.map((track) => (
        <TrackRenderer
          key={track.id}
          trackId={track.id}
          instrumentId={track.instrumentId}
          plugins={pluginsByTrack[track.id] ?? []}
          isGroup={track.isGroup}
          childIds={track.childIds}
        />
      ))}
    </>
  );
}
