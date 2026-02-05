'use client';

import { useRef, useCallback, useEffect } from 'react';
import { TimelineRuler } from '../Timeline/TimelineRuler';
import { TimelineCanvas } from './TimelineCanvas';
import { TrackLabels } from './TrackLabels';
import { ZoomControls } from './ZoomControls';
import { useProjectStore } from '@/stores/projectStore';
import { useUIStore } from '@/stores/uiStore';
import { flattenTracks } from '@/utils/tree';

export function ArrangementView() {
  // Separate selectors for primitives vs object data
  const totalBars = useProjectStore((state) => state.project.totalBars);
  const beatsPerBar = useProjectStore((state) => state.project.beatsPerBar);
  const bpm = useProjectStore((state) => state.project.bpm);
  // tracks subscription still needed for flattenTracks - this is a known remaining bottleneck
  const tracks = useProjectStore((state) => state.project.tracks);
  const rootTracks = useProjectStore((state) => state.project.rootTracks);
  const { addTrack } = useProjectStore();
  const {
    collapsedTrackIds,
    pixelsPerBeat,
    trackHeightScale,
    scrollLeft,
    setScrollLeft,
    setScrollTop,
    setPixelsPerBeat,
    setTrackHeightScale,
  } = useUIStore();

  const containerRef = useRef<HTMLDivElement>(null);
  // Create minimal project-like object for flattenTracks
  const flatTracks = flattenTracks({ tracks, rootTracks } as Parameters<typeof flattenTracks>[0], collapsedTrackIds);

  const totalBeats = totalBars * beatsPerBar;
  const timelineWidth = totalBeats * pixelsPerBeat;
  const trackLabelWidth = 256;

  // Restore scroll position when layout changes (e.g., bottom panel opens/closes)
  useEffect(() => {
    if (containerRef.current && containerRef.current.scrollLeft !== scrollLeft) {
      containerRef.current.scrollLeft = scrollLeft;
    }
  });

  // Handle scroll
  const handleScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      setScrollLeft(e.currentTarget.scrollLeft);
      setScrollTop(e.currentTarget.scrollTop);
    },
    [setScrollLeft, setScrollTop]
  );

  // Handle wheel zoom
  const handleWheel = useCallback(
    (e: React.WheelEvent<HTMLDivElement>) => {
      // Ctrl + scroll: Horizontal zoom
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -5 : 5;
        const newPixelsPerBeat = Math.max(10, Math.min(100, pixelsPerBeat + delta));

        // Zoom centered on cursor position
        if (containerRef.current) {
          const rect = containerRef.current.getBoundingClientRect();
          const cursorX = e.clientX - rect.left - trackLabelWidth + scrollLeft;
          const beatAtCursor = cursorX / pixelsPerBeat;
          const newCursorX = beatAtCursor * newPixelsPerBeat;
          const newScrollLeft = newCursorX - (e.clientX - rect.left - trackLabelWidth);

          setPixelsPerBeat(newPixelsPerBeat);
          setScrollLeft(Math.max(0, newScrollLeft));
        } else {
          setPixelsPerBeat(newPixelsPerBeat);
        }
      }
      // Shift + scroll: Vertical zoom
      else if (e.shiftKey) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -0.1 : 0.1;
        setTrackHeightScale(Math.max(0.5, Math.min(2.0, trackHeightScale + delta)));
      }
    },
    [pixelsPerBeat, trackHeightScale, scrollLeft, trackLabelWidth, setPixelsPerBeat, setTrackHeightScale, setScrollLeft]
  );

  return (
    <div className="h-full relative">
      {/* Scrollable content */}
      <div
        ref={containerRef}
        className="h-full overflow-auto bg-background"
        onScroll={handleScroll}
        onWheel={handleWheel}
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
              totalBars={totalBars}
              beatsPerBar={beatsPerBar}
              pixelsPerBeat={pixelsPerBeat}
            />
          </div>

          {/* Track Labels - sticky left, z-30 to stay above timeline blocks and handles */}
          <div className="sticky left-0 z-30 bg-surface border-r border-border">
            <TrackLabels flatTracks={flatTracks} />
          </div>

          {/* Timeline Content */}
          <TimelineCanvas
            flatTracks={flatTracks}
            pixelsPerBeat={pixelsPerBeat}
            beatsPerBar={beatsPerBar}
            totalBars={totalBars}
            bpm={bpm}
          />
        </div>
      </div>

      {/* Zoom Controls */}
      <ZoomControls />
    </div>
  );
}
