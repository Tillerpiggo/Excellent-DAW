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
    <div className="h-full border-t border-border bg-surface flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-surface">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">Visual View</span>
          <span className="text-xs text-muted">
            {visualTrackIds.length} visual instrument{visualTrackIds.length !== 1 ? 's' : ''}
          </span>
        </div>
        <button
          onClick={() => setShowVisualView(false)}
          className="text-muted hover:text-foreground transition-colors p-1"
          title="Close visual view"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Visual content */}
      <div className="flex-1 overflow-hidden">
        <VisualView trackIds={visualTrackIds} />
      </div>
    </div>
  );
}
