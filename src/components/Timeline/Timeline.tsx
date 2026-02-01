'use client';

import { useRef, useEffect } from 'react';
import { TimelineRuler } from './TimelineRuler';
import { TimelineTrack } from './TimelineTrack';
import { Playhead } from './Playhead';
import { useProjectStore } from '@/stores/projectStore';
import { useUIStore } from '@/stores/uiStore';
import { flattenTracks } from '@/utils/tree';

export function Timeline() {
  const project = useProjectStore((state) => state.project);
  const {
    collapsedTrackIds,
    pixelsPerBeat,
    scrollLeft,
    setScrollLeft,
    currentBeat,
  } = useUIStore();

  const containerRef = useRef<HTMLDivElement>(null);
  const flatTracks = flattenTracks(project, collapsedTrackIds);

  const totalBeats = project.totalBars * project.beatsPerBar;
  const timelineWidth = totalBeats * pixelsPerBeat;

  // Handle scroll
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    setScrollLeft(e.currentTarget.scrollLeft);
  };

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Ruler */}
      <div className="h-8 flex-shrink-0 overflow-hidden border-b border-border">
        <div
          className="h-full overflow-x-auto scrollbar-hide"
          style={{ marginLeft: -scrollLeft }}
        >
          <TimelineRuler
            totalBars={project.totalBars}
            beatsPerBar={project.beatsPerBar}
            pixelsPerBeat={pixelsPerBeat}
          />
        </div>
      </div>

      {/* Timeline Tracks */}
      <div
        ref={containerRef}
        className="flex-1 overflow-auto relative"
        onScroll={handleScroll}
      >
        <div
          className="relative"
          style={{ width: timelineWidth, minHeight: '100%' }}
        >
          {/* Grid lines */}
          <div className="absolute inset-0 pointer-events-none">
            {Array.from({ length: project.totalBars + 1 }).map((_, i) => (
              <div
                key={i}
                className="absolute top-0 bottom-0 w-px bg-border"
                style={{ left: i * project.beatsPerBar * pixelsPerBeat }}
              />
            ))}
          </div>

          {/* Track lanes */}
          {flatTracks.map((node) => (
            <TimelineTrack
              key={node.track.id}
              track={node.track}
              pixelsPerBeat={pixelsPerBeat}
              beatsPerBar={project.beatsPerBar}
              totalBars={project.totalBars}
            />
          ))}

          {/* Empty state */}
          {flatTracks.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center">
              <p className="text-muted-foreground">
                Add tracks from the Pattern Library
              </p>
            </div>
          )}

          {/* Playhead */}
          <Playhead
            currentBeat={currentBeat}
            pixelsPerBeat={pixelsPerBeat}
          />
        </div>
      </div>
    </div>
  );
}
