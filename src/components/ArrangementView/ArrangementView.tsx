'use client';

import { useRef, useCallback, useEffect, useState } from 'react';
import { TimelineCanvas } from './TimelineCanvas';
import { TrackLabels } from './TrackLabels';
import { TimelineToolbar } from './TimelineToolbar';
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
    scrollTop,
    currentBeat,
    setScrollLeft,
    setScrollTop,
    setPixelsPerBeat,
    setTrackHeightScale,
  } = useUIStore();

  const containerRef = useRef<HTMLDivElement>(null);
  const [viewportSize, setViewportSize] = useState({ width: 800, height: 600 });
  // Create minimal project-like object for flattenTracks
  const flatTracks = flattenTracks({ tracks, rootTracks } as Parameters<typeof flattenTracks>[0], collapsedTrackIds);

  const totalBeats = totalBars * beatsPerBar;
  const timelineWidth = totalBeats * pixelsPerBeat;
  const trackLabelWidth = 256;

  // Track viewport size for canvas rendering
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateViewportSize = () => {
      // Viewport is the visible area minus track labels
      const width = container.clientWidth - trackLabelWidth;
      const height = container.clientHeight;
      setViewportSize({ width: Math.max(width, 100), height: Math.max(height, 100) });
    };

    updateViewportSize();

    const resizeObserver = new ResizeObserver(updateViewportSize);
    resizeObserver.observe(container);

    return () => resizeObserver.disconnect();
  }, [trackLabelWidth]);

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

  // Handle wheel zoom with native event listener (passive: false to allow preventDefault)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      // Option/Alt + scroll: Zoom mode
      // deltaX controls horizontal zoom, deltaY controls vertical zoom
      if (e.altKey) {
        e.preventDefault();
        e.stopPropagation();

        // Horizontal zoom from deltaX - centered on playhead
        if (Math.abs(e.deltaX) > 2) {
          const hDelta = -e.deltaX * 0.02;
          const newPixelsPerBeat = Math.max(2, Math.min(100, pixelsPerBeat + hDelta));

          const playheadX = currentBeat * pixelsPerBeat;
          const newPlayheadX = currentBeat * newPixelsPerBeat;
          const playheadViewportOffset = playheadX - scrollLeft;
          const newScrollLeft = newPlayheadX - playheadViewportOffset;

          setPixelsPerBeat(newPixelsPerBeat);
          setScrollLeft(Math.max(0, newScrollLeft));
        }

        // Vertical zoom from deltaY
        if (Math.abs(e.deltaY) > 2) {
          const vDelta = -e.deltaY * 0.005;
          setTrackHeightScale(Math.max(0.5, Math.min(2.0, trackHeightScale + vDelta)));
        }
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [pixelsPerBeat, trackHeightScale, scrollLeft, currentBeat, setPixelsPerBeat, setTrackHeightScale, setScrollLeft]);

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <TimelineToolbar />

      {/* Scrollable content */}
      <div
        ref={containerRef}
        className="flex-1 overflow-auto bg-background"
        onScroll={handleScroll}
      >
        <div
          className="grid timeline-content"
          style={{
            gridTemplateColumns: `${trackLabelWidth}px 1fr`,
            gridTemplateRows: '1fr',
            width: timelineWidth + trackLabelWidth,
            minHeight: '100%',
          }}
        >
          {/* Track Labels - sticky left, z-30 to stay above timeline blocks and handles */}
          <div className="sticky left-0 z-30 bg-surface border-r border-border">
            {/* Corner header - part of track labels column */}
            <div className="sticky top-0 z-40 bg-surface border-b border-border">
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
            <TrackLabels flatTracks={flatTracks} />
          </div>

          {/* Timeline Content */}
          <TimelineCanvas
            flatTracks={flatTracks}
            pixelsPerBeat={pixelsPerBeat}
            beatsPerBar={beatsPerBar}
            totalBars={totalBars}
            bpm={bpm}
            viewportWidth={viewportSize.width}
            viewportHeight={viewportSize.height}
            scrollContainerRef={containerRef}
          />
        </div>
      </div>

    </div>
  );
}
