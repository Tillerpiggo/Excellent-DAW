'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { TrackNode } from '@/utils/tree';
import { Block, Track, getDrumType } from '@/core/types';
import { useUIStore } from '@/stores/uiStore';
import { useProjectStore } from '@/stores/projectStore';
import { useDragDrop } from '@/hooks/useDragDrop';
import { isAudioFile } from '@/core/audio';
import { INSTRUMENT_COLORS, TRACK_TYPE_COLORS, darken, tintWhite } from '@/utils/colors';

interface TimelineCanvasProps {
  flatTracks: TrackNode[];
  pixelsPerBeat: number;
  beatsPerBar: number;
  totalBars: number;
  bpm: number;
}

// Hit detection result
interface HitResult {
  trackId: string;
  trackIndex: number;
  block: Block;
  track: Track;
  zone: 'body' | 'left-edge' | 'right-loop' | 'right-extend';
}

// Drag state
interface DragState {
  type: 'none' | 'drag' | 'resize-left' | 'resize-right-loop' | 'resize-right-extend' | 'marquee';
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  hit?: HitResult;
  originalPositions?: Map<string, { startBar: number; durationBars: number; trackId: string }>;
  // For cross-track dragging
  startTrackIndex?: number;
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
    ? Math.max(...allEvents.map((e) => e.startTimeInBeats + (e.duration || 0.25)), beatsPerBar)
    : beatsPerBar;
  return Math.ceil(patternLengthBeats / beatsPerBar);
}

// Get base color for a track
function getTrackColor(track: Track): string {
  return track.instrumentId
    ? INSTRUMENT_COLORS[track.instrumentId]
    : TRACK_TYPE_COLORS[track.typeId];
}

export function TimelineCanvas({
  flatTracks,
  pixelsPerBeat,
  beatsPerBar,
  totalBars,
  bpm,
}: TimelineCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const {
    selectedBlockIds,
    selectBlock,
    selectBlocks,
    clearBlockSelection,
    trackHeightScale,
  } = useUIStore();

  const { updateBlock, moveBlock } = useProjectStore();
  const tracks = useProjectStore((state) => state.project.tracks);
  const { handleAudioFileDrop, isProcessingAudio } = useDragDrop();

  // Drag state
  const [dragState, setDragState] = useState<DragState>({
    type: 'none',
    startX: 0,
    startY: 0,
    currentX: 0,
    currentY: 0,
  });

  // Hover state for handle highlighting
  const [hoverBlockId, setHoverBlockId] = useState<string | null>(null);
  const [hoverZone, setHoverZone] = useState<HitResult['zone'] | null>(null);

  // Track if we're dragging an audio file over the timeline
  const [isDraggingAudioFile, setIsDraggingAudioFile] = useState(false);
  const dragCounter = useRef(0);

  // Dimensions
  const trackHeight = Math.round(64 * trackHeightScale);
  const barWidth = beatsPerBar * pixelsPerBeat;
  const timelineWidth = totalBars * barWidth;
  const totalHeight = flatTracks.length * trackHeight;
  const handleWidthPx = 12;
  const edgeZonePx = 12;

  // Get device pixel ratio for sharp rendering
  const getPixelRatio = () => typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;

  // Hit test: find block at canvas coordinates
  const hitTest = useCallback((canvasX: number, canvasY: number): HitResult | null => {
    const trackIndex = Math.floor(canvasY / trackHeight);
    if (trackIndex < 0 || trackIndex >= flatTracks.length) return null;

    const node = flatTracks[trackIndex];
    const track = node.track;

    // Check each block (reverse order so topmost wins)
    for (let i = track.blocks.length - 1; i >= 0; i--) {
      const block = track.blocks[i];
      const blockLeft = block.startBar * barWidth;
      const blockRight = blockLeft + block.durationBars * barWidth;

      if (canvasX >= blockLeft && canvasX < blockRight) {
        // Determine zone
        const relativeX = canvasX - blockLeft;
        const blockWidth = blockRight - blockLeft;

        let zone: HitResult['zone'] = 'body';
        if (relativeX < edgeZonePx) {
          zone = 'left-edge';
        } else if (relativeX > blockWidth - handleWidthPx) {
          // Right handle split into two zones
          const handleTop = canvasY - trackIndex * trackHeight;
          if (handleTop < trackHeight / 2) {
            zone = 'right-loop';
          } else {
            zone = 'right-extend';
          }
        }

        return {
          trackId: track.id,
          trackIndex,
          block,
          track,
          zone,
        };
      }
    }

    return null;
  }, [flatTracks, trackHeight, barWidth, edgeZonePx, handleWidthPx]);

  // Draw the entire canvas
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const dpr = getPixelRatio();
    const width = timelineWidth;
    const height = Math.max(totalHeight, container.clientHeight);

    // Set canvas size with HiDPI support
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Reset transform and scale for HiDPI (per SO #17854337)
    ctx.setTransform(1, 0, 0, 1, 0, 0); // Reset to identity
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    // Draw grid lines
    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
    for (let i = 0; i <= totalBars; i++) {
      const x = i * barWidth;
      ctx.fillRect(x, 0, 1, height);
    }

    // Draw each track and its blocks
    flatTracks.forEach((node, trackIndex) => {
      const track = node.track;
      const trackTop = trackIndex * trackHeight;

      // Draw blocks
      for (const block of track.blocks) {
        drawBlock(ctx, block, track, trackTop, trackIndex);
      }
    });

    // Draw marquee selection
    if (dragState.type === 'marquee') {
      const x1 = Math.min(dragState.startX, dragState.currentX);
      const y1 = Math.min(dragState.startY, dragState.currentY);
      const w = Math.abs(dragState.currentX - dragState.startX);
      const h = Math.abs(dragState.currentY - dragState.startY);

      if (w > 2 && h > 2) {
        ctx.fillStyle = 'rgba(59, 130, 246, 0.15)';
        ctx.strokeStyle = 'rgba(59, 130, 246, 0.6)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(x1, y1, w, h, 2);
        ctx.fill();
        ctx.stroke();
      }
    }
  }, [flatTracks, timelineWidth, totalHeight, barWidth, totalBars, trackHeight, dragState, selectedBlockIds, bpm, pixelsPerBeat, beatsPerBar, hoverBlockId, hoverZone]);

  // Helper to truncate text with ellipsis
  const truncateText = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string => {
    const ellipsis = '...';
    let width = ctx.measureText(text).width;
    if (width <= maxWidth) return text;

    const ellipsisWidth = ctx.measureText(ellipsis).width;
    let truncated = text;
    while (truncated.length > 0 && ctx.measureText(truncated).width + ellipsisWidth > maxWidth) {
      truncated = truncated.slice(0, -1);
    }
    return truncated + ellipsis;
  };

  // Draw a single block
  const drawBlock = useCallback((
    ctx: CanvasRenderingContext2D,
    block: Block,
    track: Track,
    trackTop: number,
    _trackIndex: number
  ) => {
    const isAudioBlock = track.instrumentId === 'audio' && block.audioData;
    const isSelected = selectedBlockIds.has(block.id);
    const isHandleHovered = hoverBlockId === block.id && (hoverZone === 'right-loop' || hoverZone === 'right-extend');

    const baseColor = getTrackColor(track);
    const handleColor = darken(baseColor, 40);
    const selectionColor = tintWhite(baseColor, 0.85);
    const selectedHandleColor = tintWhite(baseColor, 0.5);

    // Calculate position and size - round to pixel boundaries for sharp rendering
    const fullBlockWidth = block.durationBars * barWidth;
    const blockLeft = Math.round(block.startBar * barWidth);
    const blockWidth = Math.round(Math.max(fullBlockWidth - 2, 20)); // -2 matches original DOM
    const blockTop = Math.round(trackTop + 4);
    const blockHeight = Math.round(trackHeight - 8);

    // Calculate pattern info for looped blocks
    const allEvents = block.streams?.flatMap((s) => s.events) || [];
    const patternLengthBeats = allEvents.length > 0
      ? Math.max(...allEvents.map((e) => e.startTimeInBeats + (e.duration || 0.25)), beatsPerBar)
      : beatsPerBar;
    const patternBars = Math.ceil(patternLengthBeats / beatsPerBar);
    const patternBeats = patternBars * beatsPerBar;
    const patternWidthPx = patternBeats * pixelsPerBeat;
    const blockTotalBeats = block.durationBars * beatsPerBar;
    const loopCount = block.loop ? Math.ceil(blockTotalBeats / patternBeats) : 1;

    // Content area width (excluding handle)
    const contentAreaWidth = Math.round(blockWidth - handleWidthPx);

    // Draw iteration backgrounds
    if (block.loop) {
      for (let i = 0; i < loopCount; i++) {
        const iterationLeftPx = Math.round(i * patternWidthPx);
        const visibleBeats = Math.min(patternBeats, blockTotalBeats - i * patternBeats);
        let iterationWidthPx = Math.round(visibleBeats * pixelsPerBeat);
        if (iterationWidthPx <= 0) continue;

        const isFirst = i === 0;
        const isLast = i === loopCount - 1;

        // Clip last iteration to content area
        if (isLast) {
          iterationWidthPx = Math.round(Math.min(iterationWidthPx, contentAreaWidth - iterationLeftPx));
        }
        if (iterationWidthPx <= 4) iterationWidthPx = 4;

        const iterColor = isFirst ? baseColor : darken(baseColor, 20);

        // All iterations have left rounding, only non-last have right rounding
        const leftRadius = 6;
        const rightRadius = isLast ? 0 : 6;

        // Draw iteration background
        ctx.fillStyle = iterColor;
        ctx.beginPath();
        ctx.roundRect(
          blockLeft + iterationLeftPx,
          blockTop,
          iterationWidthPx,
          blockHeight,
          [leftRadius, rightRadius, rightRadius, leftRadius]
        );
        ctx.fill();

        // First iteration gets 3px left accent border when not selected
        if (isFirst && !isSelected) {
          ctx.fillStyle = baseColor;
          ctx.beginPath();
          ctx.roundRect(blockLeft, blockTop, 3, blockHeight, [6, 0, 0, 6]);
          ctx.fill();
        }
      }
    } else {
      // Non-looped block: single solid background
      ctx.fillStyle = baseColor;
      ctx.beginPath();
      ctx.roundRect(blockLeft, blockTop, Math.max(4, contentAreaWidth), blockHeight, [6, 0, 0, 6]);
      ctx.fill();

      // Accent border when not selected
      if (!isSelected) {
        ctx.fillStyle = baseColor;
        ctx.beginPath();
        ctx.roundRect(blockLeft, blockTop, 3, blockHeight, [6, 0, 0, 6]);
        ctx.fill();
      }
    }

    // Draw selection border following iteration contours (including divets)
    if (isSelected) {
      ctx.strokeStyle = selectionColor;
      ctx.lineWidth = 2;
      const r = 6; // Same radius as fill so arcs meet at divets

      if (block.loop && loopCount > 1) {
        // Per-iteration borders following divets
        for (let i = 0; i < loopCount; i++) {
          const iterationLeftPx = Math.round(i * patternWidthPx);
          const visibleBeats = Math.min(patternBeats, blockTotalBeats - i * patternBeats);
          let iterationWidthPx = Math.round(visibleBeats * pixelsPerBeat);
          if (iterationWidthPx <= 0) continue;

          const isFirst = i === 0;
          const isLast = i === loopCount - 1;

          if (isLast) {
            iterationWidthPx = Math.round(Math.min(iterationWidthPx, contentAreaWidth - iterationLeftPx));
          }

          const iterLeft = blockLeft + iterationLeftPx;
          const iterRight = iterLeft + iterationWidthPx;

          // TOP EDGE with divet curves
          ctx.beginPath();
          if (isFirst) {
            // Start after left corner curve
            ctx.moveTo(iterLeft + r, blockTop);
          } else {
            // Start with curve coming UP out of divet (from previous iteration's down curve)
            ctx.moveTo(iterLeft, blockTop + r);
            ctx.arc(iterLeft + r, blockTop + r, r, Math.PI, Math.PI * 1.5); // Curve up to top edge
          }
          // Top edge line
          if (isLast) {
            ctx.lineTo(iterRight, blockTop); // Straight to handle
          } else {
            ctx.lineTo(iterRight - r, blockTop); // To before right curve
            ctx.arc(iterRight - r, blockTop + r, r, Math.PI * 1.5, Math.PI * 2); // Curve down into divet
          }
          ctx.stroke();

          // BOTTOM EDGE with divet curves
          ctx.beginPath();
          if (isFirst) {
            // Start after left corner curve
            ctx.moveTo(iterLeft + r, blockTop + blockHeight);
          } else {
            // Start with curve coming DOWN out of divet
            ctx.moveTo(iterLeft, blockTop + blockHeight - r);
            ctx.arc(iterLeft + r, blockTop + blockHeight - r, r, Math.PI, Math.PI * 0.5, true); // Curve down to bottom edge
          }
          // Bottom edge line
          if (isLast) {
            ctx.lineTo(iterRight, blockTop + blockHeight); // Straight to handle
          } else {
            ctx.lineTo(iterRight - r, blockTop + blockHeight); // To before right curve
            ctx.arc(iterRight - r, blockTop + blockHeight - r, r, Math.PI * 0.5, 0, true); // Curve up into divet
          }
          ctx.stroke();

          // LEFT EDGE - only for first iteration
          if (isFirst) {
            ctx.beginPath();
            ctx.moveTo(iterLeft + r, blockTop);
            ctx.arc(iterLeft + r, blockTop + r, r, Math.PI * 1.5, Math.PI, true);
            ctx.lineTo(iterLeft, blockTop + blockHeight - r);
            ctx.arc(iterLeft + r, blockTop + blockHeight - r, r, Math.PI, Math.PI * 0.5, true);
            ctx.stroke();
          }
        }
      } else {
        // Non-looped or single iteration: simple border with rounded left corners
        ctx.beginPath();
        ctx.moveTo(blockLeft + r, blockTop);
        ctx.arc(blockLeft + r, blockTop + r, r, Math.PI * 1.5, Math.PI, true);
        ctx.lineTo(blockLeft, blockTop + blockHeight - r);
        ctx.arc(blockLeft + r, blockTop + blockHeight - r, r, Math.PI, Math.PI * 0.5, true);
        ctx.stroke();

        // Top border
        ctx.beginPath();
        ctx.moveTo(blockLeft + r, blockTop);
        ctx.lineTo(blockLeft + contentAreaWidth, blockTop);
        ctx.stroke();

        // Bottom border
        ctx.beginPath();
        ctx.moveTo(blockLeft + r, blockTop + blockHeight);
        ctx.lineTo(blockLeft + contentAreaWidth, blockTop + blockHeight);
        ctx.stroke();
      }
    }

    // Draw right resize handle (at right edge of container)
    const handleLeft = Math.round(blockLeft + blockWidth - handleWidthPx);
    // Handle opacity: 0.8 default, 1.0 on hover (when not selected)
    const handleOpacity = isSelected ? 1.0 : (isHandleHovered ? 1.0 : 0.8);
    ctx.globalAlpha = handleOpacity;
    ctx.fillStyle = isSelected ? selectedHandleColor : handleColor;
    ctx.beginPath();
    ctx.roundRect(handleLeft, blockTop, handleWidthPx, blockHeight, [0, 6, 6, 0]);
    ctx.fill();
    ctx.globalAlpha = 1.0;

    // Selection border on handle (top, bottom, right - follows curves)
    if (isSelected) {
      ctx.strokeStyle = selectionColor;
      ctx.lineWidth = 2;
      const r = 5; // Radius - 1 for inset

      // Top border with right curve
      ctx.beginPath();
      ctx.moveTo(handleLeft, blockTop + 1);
      ctx.lineTo(handleLeft + handleWidthPx - 6, blockTop + 1);
      ctx.arc(handleLeft + handleWidthPx - 6, blockTop + 6, r, Math.PI * 1.5, Math.PI * 2);
      ctx.stroke();

      // Bottom border with right curve
      ctx.beginPath();
      ctx.arc(handleLeft + handleWidthPx - 6, blockTop + blockHeight - 6, r, 0, Math.PI * 0.5);
      ctx.lineTo(handleLeft, blockTop + blockHeight - 1);
      ctx.stroke();

      // Right border (connects the two curves)
      ctx.beginPath();
      ctx.moveTo(handleLeft + handleWidthPx - 1, blockTop + 6);
      ctx.lineTo(handleLeft + handleWidthPx - 1, blockTop + blockHeight - 6);
      ctx.stroke();
    }

    // Draw header background when selected
    if (isSelected) {
      ctx.fillStyle = selectionColor;
      ctx.beginPath();
      ctx.roundRect(blockLeft, blockTop, contentAreaWidth, 20, [4, 0, 0, 0]);
      ctx.fill();
    }

    // Draw track name (with proper truncation, not compression)
    ctx.font = '500 12px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = isSelected ? baseColor : 'rgba(255, 255, 255, 0.9)';
    const maxTextWidth = contentAreaWidth - 8 - (block.loop ? 16 : 0); // Leave room for loop indicator
    const truncatedName = truncateText(ctx, track.name, maxTextWidth);
    ctx.fillText(truncatedName, blockLeft + 4, blockTop + 10);

    // Draw loop indicator
    if (block.loop) {
      ctx.font = '10px system-ui';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.textAlign = 'right';
      ctx.fillText('⟳', blockLeft + contentAreaWidth - 4, blockTop + 10);
    }

    // Draw events or waveform
    const contentTop = blockTop + 24;
    const contentHeight = blockHeight - 28;
    const contentLeft = blockLeft + 3;
    const contentWidth = contentAreaWidth - 6;

    if (isAudioBlock && block.audioData) {
      drawWaveform(ctx, block, contentLeft, contentTop, contentWidth, contentHeight);
    } else if (allEvents.length > 0) {
      drawEvents(ctx, block, contentLeft, contentTop, contentWidth, contentHeight);
    }
  }, [selectedBlockIds, barWidth, trackHeight, handleWidthPx, pixelsPerBeat, beatsPerBar, bpm, hoverBlockId, hoverZone]);

  // Draw MIDI events inside a block
  const drawEvents = useCallback((
    ctx: CanvasRenderingContext2D,
    block: Block,
    left: number,
    top: number,
    width: number,
    height: number
  ) => {
    const allEvents = block.streams?.flatMap((s) => s.events) || [];
    if (allEvents.length === 0) return;

    const blockTotalBeats = block.durationBars * beatsPerBar;
    const patternLengthBeats = Math.max(
      ...allEvents.map((e) => e.startTimeInBeats + (e.duration || 0.25)),
      beatsPerBar
    );
    const patternBars = Math.ceil(patternLengthBeats / beatsPerBar);
    const patternBeats = patternBars * beatsPerBar;
    const patternWidthPx = patternBeats * pixelsPerBeat;

    // Find pitch range for vertical positioning
    const pitches = allEvents.filter((e) => e.pitch !== undefined).map((e) => e.pitch);
    const minPitch = pitches.length > 0 ? Math.min(...pitches) : 60;
    const maxPitch = pitches.length > 0 ? Math.max(...pitches) : 72;
    const pitchRange = Math.max(maxPitch - minPitch + 1, 1);

    // Calculate how many loop iterations we need
    const loopCount = block.loop ? Math.ceil(blockTotalBeats / patternBeats) : 1;

    // Draw all events (including loop repetitions)
    for (let loopIdx = 0; loopIdx < loopCount; loopIdx++) {
      const offsetPx = loopIdx * patternWidthPx;

      for (const event of allEvents) {
        const eventStartBeat = event.startTimeInBeats + loopIdx * patternBeats;
        if (eventStartBeat >= blockTotalBeats) continue;

        const eventStartPx = event.startTimeInBeats * pixelsPerBeat + offsetPx;
        const duration = event.duration || 0.25;
        const eventWidthPx = Math.max(duration * pixelsPerBeat, 2);

        // Calculate vertical position
        let topPercent: number;
        let heightPercent: number;

        const drumType = getDrumType(event.pitch);
        if (drumType) {
          const drumLanes: Record<string, number> = {
            hihat: 0,
            clap: 1,
            snare: 2,
            kick: 3,
          };
          const laneCount = 4;
          const lane = drumLanes[drumType] ?? 2;
          heightPercent = (100 / laneCount - 4) / 100;
          topPercent = ((lane / laneCount) * 100 + 2) / 100;
        } else {
          const normalizedPitch = (event.pitch - minPitch) / pitchRange;
          heightPercent = Math.max(1 / pitchRange, 0.06);
          topPercent = (1 - normalizedPitch) * (1 - heightPercent);
        }

        const baseOpacity = Math.max((event.velocity || 100) / 127, 0.4);
        const opacity = loopIdx === 0 ? baseOpacity : baseOpacity * 0.85;

        const y = top + topPercent * height;
        const h = heightPercent * height;
        const x = left + eventStartPx;

        // Clamp to content bounds
        if (x >= left + width) continue;
        const drawWidth = Math.min(eventWidthPx, left + width - x);

        ctx.fillStyle = `rgba(255, 255, 255, ${0.8 * opacity})`;
        ctx.beginPath();
        ctx.roundRect(x, y, drawWidth, h, 2);
        ctx.fill();
      }
    }
  }, [beatsPerBar, pixelsPerBeat]);

  // Draw waveform for audio blocks
  const drawWaveform = useCallback((
    ctx: CanvasRenderingContext2D,
    block: Block,
    left: number,
    top: number,
    width: number,
    height: number
  ) => {
    if (!block.audioData) return;

    const peaks = block.audioData.waveformPeaks;
    if (!peaks || peaks.length === 0) return;

    const beatsPerSecond = bpm / 60;
    const audioBeats = block.audioData.duration * beatsPerSecond;
    const audioBars = audioBeats / beatsPerBar;
    const audioWidthPx = audioBars * barWidth;

    const centerY = top + height / 2;
    const maxAmplitude = Math.max(1, height / 2 - 2);

    const drawWaveformSegment = (offsetX: number, fadeOpacity: number = 1) => {
      if (offsetX >= width) return;

      const drawWidth = Math.min(audioWidthPx, width - offsetX);
      if (drawWidth <= 0) return;

      const samplesPerPixel = peaks.length / Math.max(1, audioWidthPx);

      ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.globalAlpha = fadeOpacity;

      for (let x = 0; x < drawWidth; x++) {
        const sampleIndex = Math.floor(x * samplesPerPixel);
        const peak = peaks[Math.min(sampleIndex, peaks.length - 1)] || 0;
        const barHeight = Math.max(1, peak * maxAmplitude);

        const drawX = left + offsetX + x;
        if (drawX >= left && drawX < left + width) {
          ctx.fillRect(drawX, centerY - barHeight, 1, barHeight * 2);
        }
      }
    };

    // Draw initial waveform
    drawWaveformSegment(0, 1);

    // If looping, draw repeated waveforms
    if (block.loop && audioWidthPx > 0) {
      let currentOffset = audioWidthPx;
      let iteration = 1;

      while (currentOffset < width && iteration < 50) {
        const fadeOpacity = Math.max(0.4, 1 - iteration * 0.15);
        drawWaveformSegment(currentOffset, fadeOpacity);

        // Draw loop boundary line
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = 1;
        ctx.globalAlpha = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(left + currentOffset, top);
        ctx.lineTo(left + currentOffset, top + height);
        ctx.stroke();
        ctx.setLineDash([]);

        currentOffset += audioWidthPx;
        iteration++;
      }
    }

    ctx.globalAlpha = 1;
  }, [bpm, beatsPerBar, barWidth]);

  // Calculate which blocks are inside the marquee selection
  const getBlocksInMarquee = useCallback(() => {
    if (dragState.type !== 'marquee') return [];

    const { startX, startY, currentX, currentY } = dragState;

    const minX = Math.min(startX, currentX);
    const maxX = Math.max(startX, currentX);
    const minY = Math.min(startY, currentY);
    const maxY = Math.max(startY, currentY);

    const matchingBlockIds: string[] = [];

    flatTracks.forEach((node, trackIndex) => {
      const track = node.track;
      const trackTop = trackIndex * trackHeight;
      const trackBottom = trackTop + trackHeight;

      if (maxY < trackTop || minY > trackBottom) return;

      track.blocks.forEach((block) => {
        const blockLeft = block.startBar * barWidth;
        const blockRight = blockLeft + block.durationBars * barWidth;

        if (maxX >= blockLeft && minX <= blockRight) {
          matchingBlockIds.push(block.id);
        }
      });
    });

    return matchingBlockIds;
  }, [dragState, flatTracks, trackHeight, barWidth]);

  // Convert mouse event to canvas coordinates
  const getCanvasCoords = useCallback((e: React.MouseEvent | MouseEvent) => {
    const container = containerRef.current;
    if (!container) return { x: 0, y: 0 };
    const rect = container.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  }, []);

  // Mouse down handler
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;

    const { x, y } = getCanvasCoords(e);
    const hit = hitTest(x, y);

    if (hit) {
      // Clicked on a block
      e.preventDefault();

      // Handle selection
      if (e.shiftKey) {
        // Toggle selection
        const newSelection = new Set(selectedBlockIds);
        if (newSelection.has(hit.block.id)) {
          newSelection.delete(hit.block.id);
        } else {
          newSelection.add(hit.block.id);
        }
        selectBlocks(Array.from(newSelection));
      } else if (!selectedBlockIds.has(hit.block.id)) {
        // Select this block only
        selectBlock(hit.block.id, hit.trackId, false);
      }

      // Start appropriate drag operation based on zone
      if (hit.zone === 'left-edge') {
        // Capture original positions for all selected blocks
        const originalPositions = new Map<string, { startBar: number; durationBars: number; trackId: string }>();
        for (const blockId of selectedBlockIds) {
          const trackId = findTrackForBlock(tracks, blockId);
          if (trackId) {
            const foundBlock = tracks[trackId].blocks.find(b => b.id === blockId);
            if (foundBlock) {
              originalPositions.set(blockId, {
                startBar: foundBlock.startBar,
                durationBars: foundBlock.durationBars,
                trackId,
              });
            }
          }
        }
        // Include current hit block if not already selected
        if (!originalPositions.has(hit.block.id)) {
          originalPositions.set(hit.block.id, {
            startBar: hit.block.startBar,
            durationBars: hit.block.durationBars,
            trackId: hit.trackId,
          });
        }

        setDragState({
          type: 'resize-left',
          startX: x,
          startY: y,
          currentX: x,
          currentY: y,
          hit,
          originalPositions,
        });
      } else if (hit.zone === 'right-loop' || hit.zone === 'right-extend') {
        // Capture original positions for resize
        const originalPositions = new Map<string, { startBar: number; durationBars: number; trackId: string }>();
        for (const blockId of selectedBlockIds) {
          const trackId = findTrackForBlock(tracks, blockId);
          if (trackId) {
            const foundBlock = tracks[trackId].blocks.find(b => b.id === blockId);
            if (foundBlock) {
              originalPositions.set(blockId, {
                startBar: foundBlock.startBar,
                durationBars: foundBlock.durationBars,
                trackId,
              });
            }
          }
        }
        if (!originalPositions.has(hit.block.id)) {
          originalPositions.set(hit.block.id, {
            startBar: hit.block.startBar,
            durationBars: hit.block.durationBars,
            trackId: hit.trackId,
          });
        }

        setDragState({
          type: hit.zone === 'right-loop' ? 'resize-right-loop' : 'resize-right-extend',
          startX: x,
          startY: y,
          currentX: x,
          currentY: y,
          hit,
          originalPositions,
        });
      } else {
        // Body - start drag
        const originalPositions = new Map<string, { startBar: number; durationBars: number; trackId: string }>();
        for (const blockId of selectedBlockIds) {
          const trackId = findTrackForBlock(tracks, blockId);
          if (trackId) {
            const foundBlock = tracks[trackId].blocks.find(b => b.id === blockId);
            if (foundBlock) {
              originalPositions.set(blockId, {
                startBar: foundBlock.startBar,
                durationBars: foundBlock.durationBars,
                trackId,
              });
            }
          }
        }
        if (!originalPositions.has(hit.block.id)) {
          originalPositions.set(hit.block.id, {
            startBar: hit.block.startBar,
            durationBars: hit.block.durationBars,
            trackId: hit.trackId,
          });
        }

        setDragState({
          type: 'drag',
          startX: x,
          startY: y,
          currentX: x,
          currentY: y,
          hit,
          originalPositions,
          startTrackIndex: hit.trackIndex,
        });
      }
    } else {
      // Clicked on empty space - start marquee
      e.preventDefault();
      if (!e.shiftKey) {
        clearBlockSelection();
      }
      setDragState({
        type: 'marquee',
        startX: x,
        startY: y,
        currentX: x,
        currentY: y,
      });
    }
  }, [getCanvasCoords, hitTest, selectedBlockIds, selectBlock, selectBlocks, clearBlockSelection, tracks]);

  // Mouse move handler
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (dragState.type === 'none') return;

    const { x, y } = getCanvasCoords(e);

    if (dragState.type === 'marquee') {
      setDragState(prev => ({ ...prev, currentX: x, currentY: y }));
    } else if (dragState.type === 'drag' && dragState.originalPositions && dragState.hit) {
      // Block dragging - handle both horizontal and cross-track movement
      const deltaX = x - dragState.startX;
      const deltaBars = Math.round(deltaX / barWidth);

      // Calculate target track based on Y position
      const targetTrackIndex = Math.floor(y / trackHeight);
      const clampedTrackIndex = Math.max(0, Math.min(targetTrackIndex, flatTracks.length - 1));
      const targetTrack = flatTracks[clampedTrackIndex]?.track;

      // For now, only move the primary dragged block across tracks (not multi-select)
      // Multi-track drag gets complex with different target tracks for each block
      const primaryBlockId = dragState.hit.block.id;
      const primaryOriginal = dragState.originalPositions.get(primaryBlockId);

      if (primaryOriginal && targetTrack) {
        const currentTrackId = findTrackForBlock(tracks, primaryBlockId);

        // Move to different track if needed
        if (currentTrackId && currentTrackId !== targetTrack.id) {
          moveBlock(currentTrackId, primaryBlockId, targetTrack.id);
          // Update the original positions map with new track ID
          dragState.originalPositions.set(primaryBlockId, {
            ...primaryOriginal,
            trackId: targetTrack.id,
          });
        }

        // Update horizontal position
        const newStartBar = Math.max(0, primaryOriginal.startBar + deltaBars);
        const blockCurrentTrackId = findTrackForBlock(tracks, primaryBlockId) || targetTrack.id;
        updateBlock(blockCurrentTrackId, primaryBlockId, { startBar: newStartBar });
      }

      // Handle other selected blocks (keep them on their original tracks, just move horizontally)
      for (const [blockId, original] of dragState.originalPositions) {
        if (blockId === primaryBlockId) continue;
        const newStartBar = Math.max(0, original.startBar + deltaBars);
        updateBlock(original.trackId, blockId, { startBar: newStartBar });
      }
    } else if (dragState.type === 'resize-left' && dragState.originalPositions) {
      const deltaX = x - dragState.startX;
      const deltaBars = Math.round(deltaX / barWidth);

      for (const [blockId, original] of dragState.originalPositions) {
        const newStartBar = Math.max(0, original.startBar + deltaBars);
        const startDelta = newStartBar - original.startBar;
        const newDuration = Math.max(1, original.durationBars - startDelta);
        const originalEndBar = original.startBar + original.durationBars;
        const clampedDuration = Math.min(newDuration, originalEndBar - newStartBar);

        if (clampedDuration >= 1) {
          updateBlock(original.trackId, blockId, {
            startBar: newStartBar,
            durationBars: clampedDuration,
          });
        }
      }
    } else if (dragState.type === 'resize-right-loop' && dragState.originalPositions) {
      const deltaX = x - dragState.startX;
      const deltaBars = Math.round(deltaX / barWidth);

      for (const [blockId, original] of dragState.originalPositions) {
        const newDuration = Math.max(1, original.durationBars + deltaBars);
        const block = tracks[original.trackId]?.blocks.find(b => b.id === blockId);
        if (block) {
          const patternBars = getPatternBars(block, beatsPerBar);
          const shouldLoop = newDuration > patternBars;
          updateBlock(original.trackId, blockId, {
            durationBars: newDuration,
            loop: shouldLoop,
          });
        }
      }
    } else if (dragState.type === 'resize-right-extend' && dragState.originalPositions) {
      const deltaX = x - dragState.startX;
      const deltaBars = Math.round(deltaX / barWidth);

      for (const [blockId, original] of dragState.originalPositions) {
        const newDuration = Math.max(1, original.durationBars + deltaBars);
        updateBlock(original.trackId, blockId, { durationBars: newDuration });
      }
    }
  }, [dragState, getCanvasCoords, barWidth, updateBlock, tracks, beatsPerBar]);

  // Mouse up handler
  const handleMouseUp = useCallback(() => {
    if (dragState.type === 'marquee') {
      const blockIds = getBlocksInMarquee();
      if (blockIds.length > 0) {
        selectBlocks(blockIds);
      }
    }

    setDragState({
      type: 'none',
      startX: 0,
      startY: 0,
      currentX: 0,
      currentY: 0,
    });
  }, [dragState.type, getBlocksInMarquee, selectBlocks]);

  // Cursor management and hover state
  const handleMouseMoveForCursor = useCallback((e: React.MouseEvent) => {
    if (dragState.type !== 'none') return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const { x, y } = getCanvasCoords(e);
    const hit = hitTest(x, y);

    if (hit) {
      // Update hover state for handle highlighting
      setHoverBlockId(hit.block.id);
      setHoverZone(hit.zone);

      if (hit.zone === 'left-edge' || hit.zone === 'right-loop' || hit.zone === 'right-extend') {
        canvas.style.cursor = 'ew-resize';
      } else {
        canvas.style.cursor = 'pointer';
      }
    } else {
      setHoverBlockId(null);
      setHoverZone(null);
      canvas.style.cursor = 'default';
    }
  }, [dragState.type, getCanvasCoords, hitTest]);

  // Global mouse event listeners
  useEffect(() => {
    if (dragState.type !== 'none') {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [dragState.type, handleMouseMove, handleMouseUp]);

  // Redraw on changes
  useLayoutEffect(() => {
    draw();
  }, [draw]);

  // Also redraw on window resize
  useEffect(() => {
    const handleResize = () => draw();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [draw]);

  // File drag handlers for audio drop zone
  const handleFileDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current++;

    if (e.dataTransfer.types.includes('Files')) {
      setIsDraggingAudioFile(true);
    }
  }, []);

  const handleFileDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current--;

    if (dragCounter.current === 0) {
      setIsDraggingAudioFile(false);
    }
  }, []);

  const handleFileDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const handleFileDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current = 0;
    setIsDraggingAudioFile(false);

    const files = e.dataTransfer.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    if (!isAudioFile(file)) return;

    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX - rect.left;
    const bar = Math.max(0, Math.floor(x / barWidth));

    const y = e.clientY - rect.top;
    const trackIndex = Math.floor(y / trackHeight);
    const targetTrack = flatTracks[trackIndex]?.track;

    await handleAudioFileDrop(file, targetTrack?.id || null, bar);
  }, [barWidth, trackHeight, flatTracks, handleAudioFileDrop]);

  return (
    <div
      ref={containerRef}
      className={`timeline-content relative overflow-hidden ${dragState.type !== 'none' ? 'select-none' : ''}`}
      style={{ width: timelineWidth, minHeight: '100%' }}
      onDragEnter={handleFileDragEnter}
      onDragLeave={handleFileDragLeave}
      onDragOver={handleFileDragOver}
      onDrop={handleFileDrop}
    >
      <canvas
        ref={canvasRef}
        className="block"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMoveForCursor}
      />

      {/* Empty state */}
      {flatTracks.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center">
          <p className="text-muted-foreground">
            Add tracks from the Pattern Library
          </p>
        </div>
      )}

      {/* Audio file drop zone overlay */}
      {isDraggingAudioFile && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none"
          style={{
            backgroundColor: 'rgba(34, 197, 94, 0.1)',
            border: '2px dashed rgba(34, 197, 94, 0.6)',
          }}
        >
          <div className="bg-surface/95 px-6 py-3 rounded-lg shadow-lg border border-green-500/30">
            <span className="text-green-400 font-medium text-lg">
              {isProcessingAudio ? 'Processing audio...' : 'Drop audio file here'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
