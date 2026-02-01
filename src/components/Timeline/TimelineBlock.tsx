'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Block, Track } from '@/core/types';
import { useUIStore } from '@/stores/uiStore';
import { useProjectStore } from '@/stores/projectStore';
import { useDragDrop } from '@/hooks/useDragDrop';
import { INSTRUMENT_COLORS, TRACK_TYPE_COLORS, withAlpha, darken } from '@/utils/colors';

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
  const { updateBlock } = useProjectStore();
  const { handleBlockDragStart, handleDragEnd } = useDragDrop();

  const [isResizing, setIsResizing] = useState(false);
  const resizeStartX = useRef(0);
  const originalDuration = useRef(block.durationBars);

  const isSelected = selectedBlockId === block.id;

  // Calculate position and size
  const barWidth = beatsPerBar * pixelsPerBeat;
  const left = block.startBar * barWidth;
  const width = block.durationBars * barWidth;

  // Determine color
  const baseColor = track.instrumentId
    ? INSTRUMENT_COLORS[track.instrumentId]
    : TRACK_TYPE_COLORS[track.typeId];

  // Darker color for the handle
  const handleColor = darken(baseColor, 40);

  // Count events to show density
  const eventCount = block.streams?.reduce((sum, s) => sum + s.events.length, 0) || 0;

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setIsResizing(true);
    resizeStartX.current = e.clientX;
    originalDuration.current = block.durationBars;
  }, [block.durationBars]);

  const handleResizeMove = useCallback((e: MouseEvent) => {
    if (!isResizing) return;

    const deltaX = e.clientX - resizeStartX.current;
    const deltaBars = Math.round(deltaX / barWidth);
    const newDuration = Math.max(1, originalDuration.current + deltaBars);

    if (newDuration !== block.durationBars) {
      // When extending, enable loop by default
      const shouldLoop = newDuration > originalDuration.current ? true : block.loop;
      updateBlock(track.id, block.id, {
        durationBars: newDuration,
        loop: shouldLoop,
      });
    }
  }, [isResizing, barWidth, block.durationBars, block.id, block.loop, track.id, updateBlock]);

  const handleResizeEnd = useCallback(() => {
    setIsResizing(false);
  }, []);

  useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleResizeMove);
      document.addEventListener('mouseup', handleResizeEnd);
      return () => {
        document.removeEventListener('mousemove', handleResizeMove);
        document.removeEventListener('mouseup', handleResizeEnd);
      };
    }
  }, [isResizing, handleResizeMove, handleResizeEnd]);

  return (
    <div
      className={`absolute top-1 bottom-1 rounded-md cursor-pointer transition-all ${
        isSelected ? 'ring-2 ring-accent ring-offset-1 ring-offset-background' : ''
      } ${isResizing ? 'cursor-ew-resize' : ''}`}
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
      draggable={!isResizing}
      onDragStart={(e) => {
        if (isResizing) {
          e.preventDefault();
          return;
        }
        handleBlockDragStart(e, block.id, track.id);
      }}
      onDragEnd={handleDragEnd}
    >
      {/* Block content */}
      <div className="h-full flex flex-col justify-center px-2 overflow-hidden pr-4">
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
        <div className="absolute top-0.5 right-4 text-[10px] text-white/70">
          ⟳
        </div>
      )}

      {/* Visual event representation */}
      <div className="absolute bottom-0 left-0 right-3 h-1 flex gap-px px-1">
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

      {/* Resize handle */}
      <div
        className="absolute top-0 bottom-0 right-0 w-3 cursor-ew-resize rounded-r-md flex items-center justify-center hover:opacity-100 opacity-80 transition-opacity"
        style={{
          backgroundColor: handleColor,
        }}
        onMouseDown={handleResizeStart}
      >
        <div className="flex flex-col gap-0.5">
          <div className="w-0.5 h-2 bg-white/50 rounded-full" />
          <div className="w-0.5 h-2 bg-white/50 rounded-full" />
        </div>
      </div>
    </div>
  );
}
