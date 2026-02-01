'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Block, Track } from '@/core/types';
import { useUIStore } from '@/stores/uiStore';
import { useProjectStore } from '@/stores/projectStore';
import { useDragDrop } from '@/hooks/useDragDrop';
import { INSTRUMENT_COLORS, TRACK_TYPE_COLORS, darken, tintWhite } from '@/utils/colors';

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

  // Calculate pattern length for loop iterations
  const allEvents = block.streams?.flatMap((s) => s.events) || [];
  const patternLengthBeats = allEvents.length > 0
    ? Math.max(...allEvents.map((e) => e.time + (e.duration || 0.25)), beatsPerBar)
    : beatsPerBar;
  const patternBars = Math.ceil(patternLengthBeats / beatsPerBar);
  const patternBeats = patternBars * beatsPerBar;
  const patternWidthPx = patternBeats * pixelsPerBeat;
  const blockTotalBeats = block.durationBars * beatsPerBar;
  const loopCount = block.loop ? Math.ceil(blockTotalBeats / patternBeats) : 1;

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

  // Reserved space for resize handle
  const handleWidthPx = 12;

  // Tinted white for selection (white mixed with midi color)
  const selectionColor = tintWhite(baseColor, 0.85);
  // Handle uses a more midi-colored tint when selected
  const selectedHandleColor = tintWhite(baseColor, 0.5);

  return (
    <div
      className={`absolute top-1 bottom-1 rounded-md cursor-pointer transition-all overflow-hidden ${
        isResizing ? 'cursor-ew-resize' : ''
      }`}
      style={{
        left,
        width: Math.max(width - 2, 20),
        // No backgroundColor - iteration containers provide it
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
      {/* Iteration background containers - each is its own rounded segment */}
      {Array.from({ length: loopCount }).map((_, i) => {
        const iterationLeftPx = i * patternWidthPx;
        const visibleBeats = Math.min(patternBeats, blockTotalBeats - i * patternBeats);
        const iterationWidthPx = visibleBeats * pixelsPerBeat;
        if (iterationWidthPx <= 0) return null;

        const isFirst = i === 0;
        const isLast = i === loopCount - 1;

        return (
          <div
            key={`iter-${i}`}
            className="absolute top-0 bottom-0 pointer-events-none"
            style={{
              left: iterationLeftPx,
              width: isLast
                ? Math.min(iterationWidthPx, width - iterationLeftPx - handleWidthPx)
                : iterationWidthPx,
              backgroundColor: isFirst ? baseColor : darken(baseColor, 20),
              // Last iteration blends into handle (no right border-radius)
              borderTopLeftRadius: 6,
              borderBottomLeftRadius: 6,
              borderTopRightRadius: isLast ? 0 : 6,
              borderBottomRightRadius: isLast ? 0 : 6,
              boxSizing: 'border-box',
              borderTop: isSelected ? `2px solid ${selectionColor}` : undefined,
              borderBottom: isSelected ? `2px solid ${selectionColor}` : undefined,
              borderLeft: isFirst
                ? (isSelected ? `2px solid ${selectionColor}` : `3px solid ${baseColor}`)
                : undefined,
              // No right border on last - blends into handle
            }}
          />
        );
      })}

      {/* Tinted header when selected - renders under handle */}
      {isSelected && (
        <div
          className="absolute top-0 left-0 right-0 h-5 pointer-events-none z-0"
          style={{
            backgroundColor: selectionColor,
            borderTopLeftRadius: 4,
            borderTopRightRadius: 0,
          }}
        />
      )}

      {/* Block content - track name */}
      <div className="absolute top-0 left-1 h-5 flex items-center z-10">
        <span
          className="text-xs font-medium truncate"
          style={{ color: isSelected ? baseColor : 'rgba(255, 255, 255, 0.9)' }}
        >
          {track.name}
        </span>
      </div>

      {/* Loop indicator */}
      {block.loop && (
        <div className="absolute top-0 right-4 py-0.5 text-[10px] text-white/70 z-10">
          ⟳
        </div>
      )}

      {/* Visual event representation - piano roll style */}
      <EventVisualization
        block={block}
        beatsPerBar={beatsPerBar}
        pixelsPerBeat={pixelsPerBeat}
      />

      {/* Resize handle - rectangular, renders over header */}
      <div
        className={`absolute top-0 bottom-0 right-0 w-3 cursor-ew-resize transition-opacity z-20 ${
          isSelected ? '' : 'hover:opacity-100 opacity-80'
        }`}
        style={{
          backgroundColor: isSelected ? selectedHandleColor : handleColor,
        }}
        onMouseDown={handleResizeStart}
      />
    </div>
  );
}

// Event visualization component - shows events at their actual positions using pixels
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

  // Calculate the original pattern length (find the end of the last event)
  const patternLengthBeats = Math.max(
    ...allEvents.map((e) => e.time + (e.duration || 0.25)),
    beatsPerBar // At least one bar
  );
  // Round up to nearest bar for clean looping
  const patternBars = Math.ceil(patternLengthBeats / beatsPerBar);
  const patternBeats = patternBars * beatsPerBar;
  const patternWidthPx = patternBeats * pixelsPerBeat;

  // Find pitch range for vertical positioning
  const pitches = allEvents.filter((e) => e.pitch !== undefined).map((e) => e.pitch!);
  const minPitch = pitches.length > 0 ? Math.min(...pitches) : 60;
  const maxPitch = pitches.length > 0 ? Math.max(...pitches) : 72;
  const pitchRange = Math.max(maxPitch - minPitch + 1, 1);

  // Reserved space for resize handle
  const handleWidthPx = 12;

  // Calculate how many loop iterations we need
  const loopCount = block.loop ? Math.ceil(blockTotalBeats / patternBeats) : 1;

  // Build all events to render (including loop repetitions)
  const eventsToRender: Array<{
    event: (typeof allEvents)[0];
    offsetPx: number;
    loopIndex: number;
  }> = [];

  for (let loopIdx = 0; loopIdx < loopCount; loopIdx++) {
    const offsetPx = loopIdx * patternWidthPx;
    for (const event of allEvents) {
      const eventStartBeat = event.time + loopIdx * patternBeats;
      // Only include if the event starts within the block duration
      if (eventStartBeat < blockTotalBeats) {
        eventsToRender.push({ event, offsetPx, loopIndex: loopIdx });
      }
    }
  }

  return (
    <div
      className="absolute overflow-hidden pointer-events-none"
      style={{
        top: 24, // Below the header with guaranteed padding
        bottom: 4,
        left: 3, // Account for left border
        right: handleWidthPx,
      }}
    >
      {/* Event blocks - positioned using pixels */}
      {eventsToRender.map(({ event, offsetPx, loopIndex }, i) => {
        // Calculate pixel position
        const eventStartPx = event.time * pixelsPerBeat + offsetPx;
        const duration = event.duration || 0.25;
        const eventWidthPx = duration * pixelsPerBeat;

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

        // Slightly reduced opacity for loop iterations
        const baseOpacity = Math.max((event.velocity || 100) / 127, 0.4);
        const opacity = loopIndex === 0 ? baseOpacity : baseOpacity * 0.85;

        return (
          <div
            key={`${loopIndex}-${i}`}
            className="absolute rounded-sm"
            style={{
              left: eventStartPx,
              width: Math.max(eventWidthPx, 2),
              top: `${topPercent}%`,
              height: `${heightPercent}%`,
              backgroundColor: 'rgba(255, 255, 255, 0.8)',
              opacity,
            }}
          />
        );
      })}
    </div>
  );
}
