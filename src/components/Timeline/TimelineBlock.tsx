'use client';

import { Block, Track } from '@/core/types';
import { useUIStore } from '@/stores/uiStore';
import { useDragDrop } from '@/hooks/useDragDrop';
import { INSTRUMENT_COLORS, TRACK_TYPE_COLORS, withAlpha } from '@/utils/colors';

interface TimelineBlockProps {
  block: Block;
  track: Track;
  pixelsPerBeat: number;
  beatsPerBar: number;
}

export function TimelineBlock({
  block,
  track,
  pixelsPerBeat,
  beatsPerBar,
}: TimelineBlockProps) {
  const { selectedBlockId, selectBlock } = useUIStore();
  const { handleBlockDragStart, handleDragEnd } = useDragDrop();

  const isSelected = selectedBlockId === block.id;

  // Calculate position and size
  const barWidth = beatsPerBar * pixelsPerBeat;
  const left = block.startBar * barWidth;
  const width = block.durationBars * barWidth;

  // Determine color
  const baseColor = track.instrumentId
    ? INSTRUMENT_COLORS[track.instrumentId]
    : TRACK_TYPE_COLORS[track.typeId];

  // Count events to show density
  const eventCount = block.streams?.reduce((sum, s) => sum + s.events.length, 0) || 0;

  return (
    <div
      className={`absolute top-1 bottom-1 rounded-md cursor-pointer transition-all ${
        isSelected ? 'ring-2 ring-accent ring-offset-1 ring-offset-background' : ''
      }`}
      style={{
        left,
        width: Math.max(width - 2, 20),
        backgroundColor: withAlpha(baseColor, 0.6),
        borderLeft: `3px solid ${baseColor}`,
      }}
      onClick={(e) => {
        e.stopPropagation();
        selectBlock(block.id, track.id);
      }}
      draggable
      onDragStart={(e) => handleBlockDragStart(e, block.id, track.id)}
      onDragEnd={handleDragEnd}
    >
      {/* Block content */}
      <div className="h-full flex flex-col justify-center px-2 overflow-hidden">
        <span className="text-xs font-medium truncate text-white/90">
          {track.name}
        </span>
        {eventCount > 0 && (
          <span className="text-[10px] text-white/60">
            {eventCount} {eventCount === 1 ? 'event' : 'events'}
          </span>
        )}
      </div>

      {/* Loop indicator */}
      {block.loop && (
        <div className="absolute top-0.5 right-1 text-[10px] text-white/70">
          ⟳
        </div>
      )}

      {/* Visual event representation */}
      <div className="absolute bottom-0 left-0 right-0 h-1 flex gap-px px-1">
        {block.streams?.[0]?.events.slice(0, 16).map((event, i) => (
          <div
            key={i}
            className="flex-1 rounded-t-sm bg-white/40"
            style={{
              maxWidth: 4,
              opacity: (event.velocity || 100) / 127,
            }}
          />
        ))}
      </div>
    </div>
  );
}
