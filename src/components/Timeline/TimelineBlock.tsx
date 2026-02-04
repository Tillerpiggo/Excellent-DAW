'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Block, Track, getDrumType } from '@/core/types';
import { useUIStore } from '@/stores/uiStore';
import { useProjectStore } from '@/stores/projectStore';
import { useDragDrop } from '@/hooks/useDragDrop';
import { INSTRUMENT_COLORS, TRACK_TYPE_COLORS, darken, tintWhite } from '@/utils/colors';
import { WaveformVisualization } from './WaveformVisualization';

type ResizeMode = 'left' | 'right-loop' | 'right-extend' | null;

interface TimelineBlockProps {
  block: Block;
  track: Track;
  pixelsPerBeat: number;
  beatsPerBar: number;
  bpm: number;
}

// Helper to find track ID for a given block ID
function findTrackForBlock(tracks: Record<string, Track>, blockId: string): string | null {
  for (const [trackId, track] of Object.entries(tracks)) {
    if (track.blocks.some(b => b.id === blockId)) {
      return trackId;
    }
  }
  return null;
}

// Helper to calculate pattern bars for a block
function getPatternBars(block: Block, beatsPerBar: number): number {
  const allEvents = block.streams?.flatMap((s) => s.events) || [];
  const patternLengthBeats = allEvents.length > 0
    ? Math.max(...allEvents.map((e) => e.time + (e.duration || 0.25)), beatsPerBar)
    : beatsPerBar;
  return Math.ceil(patternLengthBeats / beatsPerBar);
}

interface SelectedBlockInfo {
  blockId: string;
  trackId: string;
  originalDuration: number;
  originalStartBar: number;
  patternBars: number;
}

export function TimelineBlock({
  block,
  track,
  pixelsPerBeat,
  beatsPerBar,
  bpm,
}: TimelineBlockProps) {
  // Check if this is an audio block
  const isAudioBlock = track.instrumentId === 'audio' && block.audioData;
  const { selectedBlockIds, selectBlock } = useUIStore();
  const { updateBlock } = useProjectStore();
  const project = useProjectStore((state) => state.project);
  const { handleBlockDragStart, handleDragEnd } = useDragDrop();

  const [resizeMode, setResizeMode] = useState<ResizeMode>(null);
  const resizeStartX = useRef(0);
  const originalDuration = useRef(block.durationBars);
  const originalStartBar = useRef(block.startBar);
  // Track info for all selected blocks at resize start
  const selectedBlocksInfo = useRef<SelectedBlockInfo[]>([]);

  const isSelected = selectedBlockIds.has(block.id);

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

  // Capture info for all selected blocks at resize start
  const captureSelectedBlocksInfo = useCallback(() => {
    const info: SelectedBlockInfo[] = [];
    for (const blockId of selectedBlockIds) {
      const trackId = findTrackForBlock(project.tracks, blockId);
      if (trackId) {
        const foundBlock = project.tracks[trackId].blocks.find(b => b.id === blockId);
        if (foundBlock) {
          info.push({
            blockId,
            trackId,
            originalDuration: foundBlock.durationBars,
            originalStartBar: foundBlock.startBar,
            patternBars: getPatternBars(foundBlock, beatsPerBar),
          });
        }
      }
    }
    selectedBlocksInfo.current = info;
  }, [selectedBlockIds, project.tracks, beatsPerBar]);

  // Left handle resize start
  const handleLeftResizeStart = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setResizeMode('left');
    resizeStartX.current = e.clientX;
    originalDuration.current = block.durationBars;
    originalStartBar.current = block.startBar;
    captureSelectedBlocksInfo();
  }, [block.durationBars, block.startBar, captureSelectedBlocksInfo]);

  // Right handle resize start - mode passed directly from zone
  const handleRightResizeStart = useCallback((e: React.MouseEvent, mode: 'loop' | 'extend') => {
    e.stopPropagation();
    e.preventDefault();
    setResizeMode(mode === 'loop' ? 'right-loop' : 'right-extend');
    resizeStartX.current = e.clientX;
    originalDuration.current = block.durationBars;
    originalStartBar.current = block.startBar;
    captureSelectedBlocksInfo();
  }, [block.durationBars, block.startBar, captureSelectedBlocksInfo]);

  const handleResizeMove = useCallback((e: MouseEvent) => {
    if (!resizeMode) return;

    const deltaX = e.clientX - resizeStartX.current;
    const deltaBars = Math.round(deltaX / barWidth);

    if (resizeMode === 'left') {
      // Left handle: moving left = earlier start + longer duration
      // Moving right = later start + shorter duration
      const newStartBar = Math.max(0, originalStartBar.current + deltaBars);
      const startDelta = newStartBar - originalStartBar.current;
      const newDuration = Math.max(1, originalDuration.current - startDelta);

      // Ensure we don't extend past the original end position
      const originalEndBar = originalStartBar.current + originalDuration.current;
      const clampedDuration = Math.min(newDuration, originalEndBar - newStartBar);

      if (clampedDuration >= 1 && (newStartBar !== block.startBar || clampedDuration !== block.durationBars)) {
        updateBlock(track.id, block.id, {
          startBar: newStartBar,
          durationBars: clampedDuration,
        });
      }
    } else if (resizeMode === 'right-loop') {
      // Right handle loop zone: extend with loop, disable loop if shrunk to single pattern
      // Apply to all selected blocks (Logic Pro-style: each block respects its own minimum)
      const blocksToUpdate = selectedBlocksInfo.current.length > 0
        ? selectedBlocksInfo.current
        : [{ blockId: block.id, trackId: track.id, originalDuration: originalDuration.current, originalStartBar: originalStartBar.current, patternBars }];

      for (const info of blocksToUpdate) {
        // Each block applies delta independently, respecting its own minimum
        const newDuration = Math.max(1, info.originalDuration + deltaBars);
        // Only update if actually changed
        const currentBlock = project.tracks[info.trackId]?.blocks.find(b => b.id === info.blockId);
        if (currentBlock && newDuration !== currentBlock.durationBars) {
          // Disable loop if shrunk to pattern length or less (no actual looping)
          const shouldLoop = newDuration > info.patternBars;
          updateBlock(info.trackId, info.blockId, {
            durationBars: newDuration,
            loop: shouldLoop,
          });
        }
      }
    } else if (resizeMode === 'right-extend') {
      // Right handle extend zone: extend without touching loop
      // Apply to all selected blocks (Logic Pro-style: each block respects its own minimum)
      const blocksToUpdate = selectedBlocksInfo.current.length > 0
        ? selectedBlocksInfo.current
        : [{ blockId: block.id, trackId: track.id, originalDuration: originalDuration.current, originalStartBar: originalStartBar.current, patternBars }];

      for (const info of blocksToUpdate) {
        // Each block applies delta independently, respecting its own minimum
        const newDuration = Math.max(1, info.originalDuration + deltaBars);
        // Only update if actually changed
        const currentBlock = project.tracks[info.trackId]?.blocks.find(b => b.id === info.blockId);
        if (currentBlock && newDuration !== currentBlock.durationBars) {
          updateBlock(info.trackId, info.blockId, {
            durationBars: newDuration,
          });
        }
      }
    }
  }, [resizeMode, barWidth, patternBars, block.startBar, block.durationBars, block.id, track.id, updateBlock, project.tracks]);

  const handleResizeEnd = useCallback(() => {
    setResizeMode(null);
  }, []);

  useEffect(() => {
    if (resizeMode) {
      document.addEventListener('mousemove', handleResizeMove);
      document.addEventListener('mouseup', handleResizeEnd);
      return () => {
        document.removeEventListener('mousemove', handleResizeMove);
        document.removeEventListener('mouseup', handleResizeEnd);
      };
    }
  }, [resizeMode, handleResizeMove, handleResizeEnd]);

  const isResizing = resizeMode !== null;

  // Reserved space for resize handle
  const handleWidthPx = 12;

  // Tinted white for selection (white mixed with midi color)
  const selectionColor = tintWhite(baseColor, 0.85);
  // Handle uses a more midi-colored tint when selected
  const selectedHandleColor = tintWhite(baseColor, 0.5);

  return (
    <div
      data-block
      data-block-id={block.id}
      data-track-id={track.id}
      className={`absolute top-1 bottom-1 rounded-md cursor-pointer overflow-hidden transition-all select-none ${
        isResizing ? 'cursor-ew-resize' : ''
      }`}
      style={{
        left,
        width: Math.max(width - 2, 20),
        // No backgroundColor - iteration containers provide it
      }}
      onClick={(e) => {
        e.stopPropagation();
        selectBlock(block.id, track.id, e.shiftKey);
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
      {/* Iteration background containers - render differently for looped vs non-looped */}
      {block.loop ? (
        // Looped: render multiple iteration segments
        Array.from({ length: loopCount }).map((_, i) => {
          const iterationLeftPx = i * patternWidthPx;
          const visibleBeats = Math.min(patternBeats, blockTotalBeats - i * patternBeats);
          const iterationWidthPx = visibleBeats * pixelsPerBeat;
          if (iterationWidthPx <= 0) return null;

          const isFirst = i === 0;
          const isLast = i === loopCount - 1;

          return (
            <div
              key={`iter-${i}`}
              className={`absolute top-0 bottom-0 pointer-events-none ${isLast ? 'transition-all' : ''}`}
              style={{
                left: iterationLeftPx,
                width: Math.max(
                  4,
                  isLast
                    ? Math.min(iterationWidthPx, width - iterationLeftPx - handleWidthPx)
                    : iterationWidthPx
                ),
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
        })
      ) : (
        // Not looped: render single solid background for full width
        <div
          className="absolute top-0 bottom-0 pointer-events-none"
          style={{
            left: 0,
            width: Math.max(4, width - handleWidthPx),
            backgroundColor: baseColor,
            borderTopLeftRadius: 6,
            borderBottomLeftRadius: 6,
            borderTopRightRadius: 0,
            borderBottomRightRadius: 0,
            boxSizing: 'border-box',
            borderTop: isSelected ? `2px solid ${selectionColor}` : undefined,
            borderBottom: isSelected ? `2px solid ${selectionColor}` : undefined,
            borderLeft: isSelected ? `2px solid ${selectionColor}` : `3px solid ${baseColor}`,
          }}
        />
      )}

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

      {/* Visual event representation - piano roll for MIDI, waveform for audio */}
      {isAudioBlock ? (
        <WaveformVisualization
          audioData={block.audioData!}
          pixelsPerBeat={pixelsPerBeat}
          beatsPerBar={beatsPerBar}
          blockDurationBars={block.durationBars}
          loop={block.loop}
          color={baseColor}
          bpm={bpm}
        />
      ) : (
        <EventVisualization
          block={block}
          beatsPerBar={beatsPerBar}
          pixelsPerBeat={pixelsPerBeat}
        />
      )}

      {/* Left resize handle - transparent, cursor only */}
      <div
        className="absolute top-0 bottom-0 left-0 w-3 cursor-ew-resize z-20"
        onMouseDown={handleLeftResizeStart}
      />

      {/* Right resize handle - split into two interactive zones */}
      <div
        className={`absolute top-0 bottom-0 right-0 w-3 z-20 ${
          isSelected ? '' : 'hover:opacity-100 opacity-80'
        }`}
        style={{
          backgroundColor: isSelected ? selectedHandleColor : handleColor,
        }}
      >
        {/* Top half - Loop zone */}
        <div
          className="absolute top-0 left-0 right-0 cursor-ew-resize"
          style={{ height: '50%' }}
          onMouseDown={(e) => handleRightResizeStart(e, 'loop')}
          title="Drag to loop"
        />
        {/* Bottom half - Extend zone */}
        <div
          className="absolute bottom-0 left-0 right-0 cursor-ew-resize"
          style={{ height: '50%' }}
          onMouseDown={(e) => handleRightResizeStart(e, 'extend')}
          title="Drag to extend"
        />
      </div>
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

        const drumType = getDrumType(event.pitch);
        if (drumType) {
          // Drums: position based on drum type with fixed lanes
          const drumLanes: Record<string, number> = {
            hihat: 0,
            clap: 1,
            snare: 2,
            kick: 3,
          };
          const laneCount = 4;
          const lane = drumLanes[drumType] ?? 2;
          heightPercent = 100 / laneCount - 4;
          topPercent = (lane / laneCount) * 100 + 2;
        } else {
          // Melodic: position based on pitch (higher pitch = higher position)
          const normalizedPitch = (event.pitch - minPitch) / pitchRange;
          heightPercent = Math.max(100 / pitchRange, 6);
          topPercent = (1 - normalizedPitch) * (100 - heightPercent);
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
