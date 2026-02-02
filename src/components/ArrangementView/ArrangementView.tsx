'use client';

import { useRef, useCallback } from 'react';
import { TimelineRuler } from '../Timeline/TimelineRuler';
import { TimelineContent } from './TimelineContent';
import { TrackLabels } from './TrackLabels';
import { Playhead } from '../Timeline/Playhead';
import { useProjectStore } from '@/stores/projectStore';
import { useUIStore } from '@/stores/uiStore';
import { flattenTracks } from '@/utils/tree';

export function ArrangementView() {
  const project = useProjectStore((state) => state.project);
  const { addTrack } = useProjectStore();
  const {
    collapsedTrackIds,
    pixelsPerBeat,
    scrollLeft,
    currentBeat,
    setScrollLeft,
    setScrollTop,
  } = useUIStore();

  const containerRef = useRef<HTMLDivElement>(null);
  const flatTracks = flattenTracks(project, collapsedTrackIds);

  const totalBeats = project.totalBars * project.beatsPerBar;
  const timelineWidth = totalBeats * pixelsPerBeat;
  const trackLabelWidth = 256;

  // Handle scroll
  const handleScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      setScrollLeft(e.currentTarget.scrollLeft);
      setScrollTop(e.currentTarget.scrollTop);
    },
    [setScrollLeft, setScrollTop]
  );

  // Calculate playhead position relative to the visible area
  const playheadPosition = trackLabelWidth + currentBeat * pixelsPerBeat - scrollLeft;
  const isPlayheadVisible = playheadPosition >= trackLabelWidth && playheadPosition <= trackLabelWidth + timelineWidth;

  return (
    <div className="h-full relative">
      {/* Scrollable content */}
      <div
        ref={containerRef}
        className="h-full overflow-auto bg-background"
        onScroll={handleScroll}
      >
        <div
          className="grid timeline-content"
          style={{
            gridTemplateColumns: `${trackLabelWidth}px 1fr`,
            gridTemplateRows: '48px 1fr',
            width: timelineWidth + trackLabelWidth,
            minHeight: '100%',
          }}
        >
          {/* Corner - sticky top-left, highest z-index */}
          <div className="sticky left-0 top-0 z-40 bg-surface border-b border-r border-border">
            <div className="h-12 px-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                Tracks
              </h2>
              <button
                onClick={() => addTrack()}
                className="px-2 py-1 text-xs rounded bg-gradient-to-r from-accent-from/20 to-accent-to/20 text-accent-from hover:from-accent-from/30 hover:to-accent-to/30 transition-colors"
              >
                + Add
              </button>
            </div>
          </div>

          {/* Ruler - sticky top */}
          <div className="sticky top-0 z-20 bg-surface border-b border-border h-12">
            <TimelineRuler
              totalBars={project.totalBars}
              beatsPerBar={project.beatsPerBar}
              pixelsPerBeat={pixelsPerBeat}
            />
          </div>

          {/* Track Labels - sticky left, z-30 to stay above timeline blocks and handles */}
          <div className="sticky left-0 z-30 bg-surface border-r border-border">
            <TrackLabels flatTracks={flatTracks} />
          </div>

          {/* Timeline Content */}
          <TimelineContent
            flatTracks={flatTracks}
            pixelsPerBeat={pixelsPerBeat}
            beatsPerBar={project.beatsPerBar}
            totalBars={project.totalBars}
          />
        </div>
      </div>

      {/* Fixed Playhead - positioned outside scroll container, starts at bottom half of ruler */}
      {isPlayheadVisible && (
        <div
          className="absolute top-6 bottom-0 pointer-events-none z-40"
          style={{
            left: trackLabelWidth,
            right: 0,
            overflow: 'hidden',
          }}
        >
          <Playhead
            currentBeat={currentBeat}
            pixelsPerBeat={pixelsPerBeat}
            scrollLeft={scrollLeft}
          />
        </div>
      )}
    </div>
  );
}
