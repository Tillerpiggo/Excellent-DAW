'use client';

import { useMemo } from 'react';
import { useProjectStore } from '@/stores/projectStore';
import { useVisualPlayback } from '@/hooks/useVisualPlayback';
import { VisualView } from './VisualView';
import { getInstrument } from '@/instruments';

export function VisualViewPanel() {
  const { project } = useProjectStore();

  // Initialize visual playback hook
  useVisualPlayback();

  // Find all tracks with visual instruments (instruments that have hasVisual: true)
  const visualTracks = useMemo(() => {
    return Object.values(project.tracks)
      .filter((track) => {
        if (!track.instrumentId || track.muted) return false;
        const instrument = getInstrument(track.instrumentId);
        return instrument?.hasVisual === true;
      })
      .map((track) => ({ id: track.id, instrumentId: track.instrumentId! }));
  }, [project.tracks]);

  if (visualTracks.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-muted">
        <p className="text-sm">No tracks with visual instruments</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <VisualView tracks={visualTracks} />
    </div>
  );
}
