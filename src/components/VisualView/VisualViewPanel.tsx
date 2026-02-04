'use client';

import { useEffect, useMemo } from 'react';
import { useUIStore } from '@/stores/uiStore';
import { useProjectStore } from '@/stores/projectStore';
import { useVisualStore } from '@/stores/visualStore';
import { useVisualPlayback } from '@/hooks/useVisualPlayback';
import { VisualView } from './VisualView';

export function VisualViewPanel() {
  const { showVisualView, setShowVisualView } = useUIStore();
  const { project } = useProjectStore();

  // Initialize visual playback hook
  useVisualPlayback();

  // Find all tracks with visual instruments
  const visualTrackIds = useMemo(() => {
    return Object.values(project.tracks)
      .filter((track) => track.visualInstrumentId && !track.muted)
      .map((track) => track.id);
  }, [project.tracks]);

  // Auto-show visual view when there are tracks with visual instruments
  useEffect(() => {
    if (visualTrackIds.length > 0 && !showVisualView) {
      setShowVisualView(true);
    } else if (visualTrackIds.length === 0 && showVisualView) {
      setShowVisualView(false);
    }
  }, [visualTrackIds.length, showVisualView, setShowVisualView]);

  if (!showVisualView || visualTrackIds.length === 0) {
    return null;
  }

  return (
    <div className="h-full flex flex-col">
      <VisualView trackIds={visualTrackIds} />
    </div>
  );
}
