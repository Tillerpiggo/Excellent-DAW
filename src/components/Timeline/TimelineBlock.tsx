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
      {/* Block content - track name */}
      <div className="absolute top-0.5 left-1 z-10">
        <span className="text-xs font-medium truncate text-white/90">
          {track.name}
        </span>
      </div>

      {/* Loop indicator */}
      {block.loop && (
        <div className="absolute top-0.5 right-4 text-[10px] text-white/70 z-10">
          ⟳
        </div>
      )}

      {/* Visual event representation - piano roll style */}
      <EventVisualization
        block={block}
        beatsPerBar={beatsPerBar}
        pixelsPerBeat={pixelsPerBeat}
      />

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

// Event visualization component - shows events at their actual positions
interface EventVisualizationProps {
  block: Block;
  beatsPerBar: number;
  pixelsPerBeat: number;
}

function EventVisualization({
  block,
  beatsPerBar,
  pixelsPerBeat,
}: EventVisualizationProps) {
  // Gather all events from all streams
  const allEvents = block.streams?.flatMap((s) => s.events) || [];
  if (allEvents.length === 0) return null;

  // Calculate the block's total duration in beats
  const blockTotalBeats = block.durationBars * beatsPerBar;
  const blockWidthPx = blockTotalBeats * pixelsPerBeat;

  // Calculate the original pattern length (find the end of the last event)
  const patternLengthBeats = Math.max(
    ...allEvents.map((e) => e.time + (e.duration || 0.25)),
    beatsPerBar // At least one bar
  );
  // Round up to nearest bar for clean looping
  const patternBars = Math.ceil(patternLengthBeats / beatsPerBar);
  const patternBeats = patternBars * beatsPerBar;

  // Find pitch range for vertical positioning
  const pitches = allEvents.filter((e) => e.pitch !== undefined).map((e) => e.pitch!);
  const minPitch = pitches.length > 0 ? Math.min(...pitches) : 60;
  const maxPitch = pitches.length > 0 ? Math.max(...pitches) : 72;
  const pitchRange = Math.max(maxPitch - minPitch + 1, 1);

  // Reserved space
  const handleWidthPx = 12;

  // Calculate how many loop iterations we need
  const loopCount = block.loop ? Math.ceil(blockTotalBeats / patternBeats) : 1;

  // Build all events to render (including loop repetitions)
  const eventsToRender: Array<{
    event: (typeof allEvents)[0];
    offsetBeats: number;
    loopIndex: number;
  }> = [];

  for (let loopIdx = 0; loopIdx < loopCount; loopIdx++) {
    const offsetBeats = loopIdx * patternBeats;
    for (const event of allEvents) {
      const eventStartBeat = event.time + offsetBeats;
      // Only include if the event starts within the block duration
      if (eventStartBeat < blockTotalBeats) {
        eventsToRender.push({ event, offsetBeats, loopIndex: loopIdx });
      }
    }
  }

  return (
    <div
      className="absolute overflow-hidden pointer-events-none"
      style={{
        top: 4,
        bottom: 4,
        left: 3, // Account for left border
        right: handleWidthPx,
      }}
    >
      {/* Loop boundary markers */}
      {block.loop &&
        Array.from({ length: loopCount - 1 }).map((_, i) => {
          const boundaryBeat = (i + 1) * patternBeats;
          const xPercent = (boundaryBeat / blockTotalBeats) * 100;
          if (xPercent >= 100) return null;
          return (
            <div
              key={`loop-${i}`}
              className="absolute top-0 bottom-0 w-px bg-white/30"
              style={{ left: `${xPercent}%` }}
            />
          );
        })}

      {/* Event blocks */}
      {eventsToRender.map(({ event, offsetBeats, loopIndex }, i) => {
        const eventStartBeat = event.time + offsetBeats;
        const duration = event.duration || 0.25;

        // Calculate horizontal position and width as percentage
        const xPercent = (eventStartBeat / blockTotalBeats) * 100;
        const widthPercent = (duration / blockTotalBeats) * 100;

        // Clip if event extends beyond block
        const clippedWidthPercent = Math.min(widthPercent, 100 - xPercent);

        // Calculate vertical position based on pitch or drum type
        let topPercent: number;
        let heightPercent: number;

        if (event.drum) {
          // Drums: position based on drum type with fixed lanes
          const drumLanes: Record<string, number> = {
            hihat: 0,
            clap: 1,
            snare: 2,
            kick: 3,
          };
          const laneCount = 4;
          const lane = drumLanes[event.drum] ?? 2;
          heightPercent = 100 / laneCount - 4;
          topPercent = (lane / laneCount) * 100 + 2;
        } else if (event.pitch !== undefined) {
          // Melodic: position based on pitch (higher pitch = higher position)
          const normalizedPitch = (event.pitch - minPitch) / pitchRange;
          heightPercent = Math.max(100 / pitchRange, 6);
          topPercent = (1 - normalizedPitch) * (100 - heightPercent);
        } else {
          topPercent = 40;
          heightPercent = 20;
        }

        return (
          <div
            key={`${loopIndex}-${i}`}
            className="absolute rounded-sm"
            style={{
              left: `${xPercent}%`,
              width: `${Math.max(clippedWidthPercent, 0.5)}%`,
              top: `${topPercent}%`,
              height: `${heightPercent}%`,
              backgroundColor: 'rgba(255, 255, 255, 0.8)',
              opacity: Math.max((event.velocity || 100) / 127, 0.4),
              minWidth: 2,
            }}
          />
        );
      })}
    </div>
  );
}
