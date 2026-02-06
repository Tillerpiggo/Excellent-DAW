'use client';

import { useMemo } from 'react';
import { useProjectStore } from '@/stores/projectStore';
import { useVisualSync } from '@/hooks/useVisualPlayback';
import { VisualView, VisualTrackInfo } from './VisualView';
import { getInstrument } from '@/instruments';
import { Track } from '@/core/types';

export function VisualViewPanel() {
  const { project } = useProjectStore();

  // Sync visual engine with project changes
  useVisualSync();

  // Find all tracks that should be rendered:
  // 1. Tracks with visual instruments
  // 2. Groups with visual plugins (effects) that have visual children
  const visualTracks = useMemo(() => {
    const result: VisualTrackInfo[] = [];
    const processedIds = new Set<string>();

    // Helper to check if a track or its descendants have visual instruments
    const hasVisualDescendant = (track: Track): boolean => {
      if (track.instrumentId) {
        const instrument = getInstrument(track.instrumentId);
        if (instrument?.hasVisual) return true;
      }
      return track.childIds.some((childId) => {
        const child = project.tracks[childId];
        return child && hasVisualDescendant(child);
      });
    };

    // Helper to collect visual tracks, respecting group hierarchy
    const collectVisualTracks = (trackIds: string[], parentHasEffects: boolean = false) => {
      for (const trackId of trackIds) {
        const track = project.tracks[trackId];
        if (!track || track.muted || processedIds.has(trackId)) continue;

        const hasPlugins = (track.visualPlugins?.length ?? 0) > 0;
        const isGroup = track.childIds.length > 0;
        const hasVisualInstrument = track.instrumentId
          ? getInstrument(track.instrumentId)?.hasVisual
          : false;

        // If this is a group with effects and has visual descendants, render as group
        if (isGroup && hasPlugins && hasVisualDescendant(track)) {
          processedIds.add(trackId);
          result.push({
            id: trackId,
            instrumentId: track.instrumentId || '__group__',
            isGroup: true,
            childIds: track.childIds,
          });
          // Mark all descendants as processed (they'll be rendered by the group)
          const markProcessed = (ids: string[]) => {
            for (const id of ids) {
              processedIds.add(id);
              const child = project.tracks[id];
              if (child) markProcessed(child.childIds);
            }
          };
          markProcessed(track.childIds);
        }
        // If this track has a visual instrument, render it
        else if (hasVisualInstrument) {
          processedIds.add(trackId);
          result.push({
            id: trackId,
            instrumentId: track.instrumentId!,
          });
        }
        // Otherwise, process children
        else if (isGroup) {
          collectVisualTracks(track.childIds);
        }
      }
    };

    collectVisualTracks(project.rootTracks);
    return result;
  }, [project.tracks, project.rootTracks]);

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
