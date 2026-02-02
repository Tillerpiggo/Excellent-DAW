'use client';

import { TrackNode } from '@/utils/tree';
import { TimelineTrack } from '../Timeline/TimelineTrack';

interface TimelineContentProps {
  flatTracks: TrackNode[];
  pixelsPerBeat: number;
  beatsPerBar: number;
  totalBars: number;
}

export function TimelineContent({
  flatTracks,
  pixelsPerBeat,
  beatsPerBar,
  totalBars,
}: TimelineContentProps) {
  const timelineWidth = totalBars * beatsPerBar * pixelsPerBeat;

  return (
    <div
      className="timeline-content relative"
      style={{ width: timelineWidth, minHeight: '100%' }}
    >
      {/* Grid lines */}
      <div className="absolute inset-0 pointer-events-none">
        {Array.from({ length: totalBars + 1 }).map((_, i) => (
          <div
            key={i}
            className="absolute top-0 bottom-0 w-px bg-border"
            style={{ left: i * beatsPerBar * pixelsPerBeat }}
          />
        ))}
      </div>

      {/* Track lanes */}
      {flatTracks.map((node) => (
        <TimelineTrack
          key={node.track.id}
          track={node.track}
          pixelsPerBeat={pixelsPerBeat}
          beatsPerBar={beatsPerBar}
          totalBars={totalBars}
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
    </div>
  );
}
