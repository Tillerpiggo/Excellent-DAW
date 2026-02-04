'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { TrackNode } from '@/utils/tree';
import { TimelineTrack } from '../Timeline/TimelineTrack';
import { useUIStore } from '@/stores/uiStore';
import { useDragDrop } from '@/hooks/useDragDrop';
import { isAudioFile } from '@/core/audio';

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
  const containerRef = useRef<HTMLDivElement>(null);

  const {
    marqueeSelection,
    startMarqueeSelection,
    updateMarqueeSelection,
    endMarqueeSelection,
    selectBlocks,
    clearBlockSelection,
    trackHeightScale,
  } = useUIStore();

  const { handleAudioFileDrop, isProcessingAudio } = useDragDrop();

  // Track if we're dragging an audio file over the timeline
  const [isDraggingAudioFile, setIsDraggingAudioFile] = useState(false);
  const dragCounter = useRef(0);

  // Track height (scaled from base 64px)
  const trackHeight = Math.round(64 * trackHeightScale);
  const barWidth = beatsPerBar * pixelsPerBeat;

  // File drag handlers for audio drop zone
  const handleFileDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current++;

    // Check if dragging files
    if (e.dataTransfer.types.includes('Files')) {
      setIsDraggingAudioFile(true);
    }
  }, []);

  const handleFileDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current--;

    // Only clear if we've left all elements
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

    // Calculate drop position
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX - rect.left;
    const bar = Math.max(0, Math.floor(x / barWidth));

    // Determine which track (if any) was dropped on
    const y = e.clientY - rect.top;
    const trackIndex = Math.floor(y / trackHeight);
    const targetTrack = flatTracks[trackIndex]?.track;

    await handleAudioFileDrop(file, targetTrack?.id || null, bar);
  }, [barWidth, trackHeight, flatTracks, handleAudioFileDrop]);

  // Calculate which blocks are inside the marquee selection
  const getBlocksInMarquee = useCallback(() => {
    if (!marqueeSelection || !containerRef.current) return [];

    const { startX, startY, currentX, currentY } = marqueeSelection;

    // Get marquee bounds (normalize for any drag direction)
    const minX = Math.min(startX, currentX);
    const maxX = Math.max(startX, currentX);
    const minY = Math.min(startY, currentY);
    const maxY = Math.max(startY, currentY);

    const matchingBlockIds: string[] = [];

    flatTracks.forEach((node, trackIndex) => {
      const track = node.track;
      const trackTop = trackIndex * trackHeight;
      const trackBottom = trackTop + trackHeight;

      // Check if marquee overlaps with this track vertically
      if (maxY < trackTop || minY > trackBottom) return;

      // Check each block in this track
      track.blocks.forEach((block) => {
        const blockLeft = block.startBar * barWidth;
        const blockRight = blockLeft + block.durationBars * barWidth;

        // Check if marquee overlaps with this block horizontally
        if (maxX >= blockLeft && minX <= blockRight) {
          matchingBlockIds.push(block.id);
        }
      });
    });

    return matchingBlockIds;
  }, [marqueeSelection, flatTracks, trackHeight, barWidth]);

  // Handle mouse down - start marquee if clicking on empty space
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // Only start marquee on left click
    if (e.button !== 0) return;

    // Don't start marquee if clicking on a block
    const target = e.target as HTMLElement;
    if (target.closest('[data-block]')) return;

    // Prevent text selection during drag
    e.preventDefault();

    // Get position relative to the timeline container
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Clear selection when clicking empty space (unless shift is held)
    if (!e.shiftKey) {
      clearBlockSelection();
    }

    startMarqueeSelection(x, y);
  }, [startMarqueeSelection, clearBlockSelection]);

  // Handle mouse move - update marquee and select blocks
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!marqueeSelection?.isActive) return;

    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    updateMarqueeSelection(x, y);
  }, [marqueeSelection?.isActive, updateMarqueeSelection]);

  // Handle mouse up - finalize selection
  const handleMouseUp = useCallback(() => {
    if (!marqueeSelection?.isActive) return;

    // Get blocks in marquee and select them
    const blockIds = getBlocksInMarquee();
    if (blockIds.length > 0) {
      selectBlocks(blockIds);
    }

    endMarqueeSelection();
  }, [marqueeSelection?.isActive, getBlocksInMarquee, selectBlocks, endMarqueeSelection]);

  // Add global mouse listeners for drag
  useEffect(() => {
    if (marqueeSelection?.isActive) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [marqueeSelection?.isActive, handleMouseMove, handleMouseUp]);

  // Calculate marquee rectangle for rendering
  const marqueeRect = marqueeSelection ? {
    left: Math.min(marqueeSelection.startX, marqueeSelection.currentX),
    top: Math.min(marqueeSelection.startY, marqueeSelection.currentY),
    width: Math.abs(marqueeSelection.currentX - marqueeSelection.startX),
    height: Math.abs(marqueeSelection.currentY - marqueeSelection.startY),
  } : null;

  return (
    <div
      ref={containerRef}
      className={`timeline-content relative overflow-hidden ${marqueeSelection?.isActive ? 'select-none' : ''}`}
      style={{ width: timelineWidth, minHeight: '100%' }}
      onMouseDown={handleMouseDown}
      onDragEnter={handleFileDragEnter}
      onDragLeave={handleFileDragLeave}
      onDragOver={handleFileDragOver}
      onDrop={handleFileDrop}
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

      {/* Marquee selection box */}
      {marqueeSelection?.isActive && marqueeRect && marqueeRect.width > 2 && marqueeRect.height > 2 && (
        <div
          className="absolute pointer-events-none z-50"
          style={{
            left: marqueeRect.left,
            top: marqueeRect.top,
            width: marqueeRect.width,
            height: marqueeRect.height,
            backgroundColor: 'rgba(59, 130, 246, 0.15)',
            border: '1px solid rgba(59, 130, 246, 0.6)',
            borderRadius: 2,
          }}
        />
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
