'use client';

import { Track } from '@/core/types';
import { useProjectStore } from '@/stores/projectStore';
import { TRACK_TYPE_COLORS, INSTRUMENT_COLORS, withAlpha } from '@/utils/colors';
import { getDescendants } from '@/utils/tree';

interface TrackDragOverlayProps {
  track: Track;
  depth: number;
}

export function TrackDragOverlay({ track, depth }: TrackDragOverlayProps) {
  const project = useProjectStore((state) => state.project);
  const typeColor = TRACK_TYPE_COLORS[track.typeId];
  const instrumentColor = track.instrumentId ? INSTRUMENT_COLORS[track.instrumentId] : undefined;

  // Count children for badge
  const childCount = getDescendants(project, track.id).length;

  return (
    <div
      className="flex items-center h-16 px-2 bg-background border border-border rounded shadow-lg opacity-90"
      style={{
        paddingLeft: `${8 + depth * 16}px`,
        width: 240,
      }}
    >
      {/* Drag grip icon */}
      <div className="w-5 h-5 flex items-center justify-center text-muted-foreground mr-1">
        <svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor">
          <circle cx="2" cy="2" r="1.5" />
          <circle cx="8" cy="2" r="1.5" />
          <circle cx="2" cy="7" r="1.5" />
          <circle cx="8" cy="7" r="1.5" />
          <circle cx="2" cy="12" r="1.5" />
          <circle cx="8" cy="12" r="1.5" />
        </svg>
      </div>

      {/* Track Type Badge */}
      <div
        className="w-2 h-2 rounded-full mx-1.5"
        style={{ backgroundColor: typeColor }}
        title={track.typeId}
      />

      {/* Track Name */}
      <span
        className={`flex-1 text-base truncate ${
          track.muted ? 'text-muted-foreground line-through' : ''
        }`}
      >
        {track.name}
      </span>

      {/* Child count badge */}
      {childCount > 0 && (
        <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground ml-1">
          +{childCount}
        </span>
      )}

      {/* Instrument Badge */}
      {track.instrumentId && (
        <span
          className="text-xs px-1.5 py-0.5 rounded ml-1"
          style={{
            backgroundColor: withAlpha(instrumentColor || '#888', 0.2),
            color: instrumentColor,
          }}
        >
          {track.instrumentId.slice(0, 3)}
        </span>
      )}
    </div>
  );
}
