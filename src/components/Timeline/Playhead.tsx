'use client';

import { useRef, useCallback, useEffect } from 'react';
import { useUIStore } from '@/stores/uiStore';
import { usePlayback } from '@/hooks/usePlayback';
import { useProjectStore } from '@/stores/projectStore';

interface PlayheadProps {
  currentBeat: number;
  pixelsPerBeat: number;
  scrollLeft: number;
}

export function Playhead({ currentBeat, pixelsPerBeat, scrollLeft }: PlayheadProps) {
  // Position relative to the fixed overlay container (accounts for scroll)
  const position = currentBeat * pixelsPerBeat - scrollLeft;

  const { isPlaying, seekTo } = usePlayback();
  const { isScrubbing, setIsScrubbing, setCurrentBeat } = useUIStore();
  const project = useProjectStore((state) => state.project);

  const isDraggingRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const pixelToBeat = useCallback(
    (pixelX: number) => {
      const totalBeats = project.totalBars * project.beatsPerBar;
      // Add scrollLeft back to convert from screen position to timeline position
      const beat = (pixelX + scrollLeft) / pixelsPerBeat;
      const quantize = 0.25; // 1/16th note
      const quantized = Math.round(beat / quantize) * quantize;
      return Math.max(0, Math.min(totalBeats - quantize, quantized));
    },
    [pixelsPerBeat, scrollLeft, project.totalBars, project.beatsPerBar]
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      isDraggingRef.current = true;
      setIsScrubbing(true);
      e.preventDefault();
      e.stopPropagation();
    },
    [setIsScrubbing]
  );

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDraggingRef.current) return;

      // Get the playhead's parent container to calculate position
      const container = containerRef.current?.parentElement;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const beat = pixelToBeat(x);

      if (isPlaying) {
        seekTo(beat);
      } else {
        setCurrentBeat(beat);
      }
    },
    [pixelToBeat, isPlaying, seekTo, setCurrentBeat]
  );

  const handleMouseUp = useCallback(() => {
    if (isDraggingRef.current) {
      isDraggingRef.current = false;
      setIsScrubbing(false);
    }
  }, [setIsScrubbing]);

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  return (
    <div
      ref={containerRef}
      className={`absolute top-0 bottom-0 w-0.5 bg-accent-to ${
        isScrubbing ? '' : 'transition-[left] duration-75'
      }`}
      style={{ left: position, pointerEvents: 'none' }}
    >
      {/* Playhead handle - draggable */}
      <div
        className={`absolute -top-1 left-1/2 -translate-x-1/2 w-3 h-3 bg-gradient-to-r from-accent-from to-accent-to rounded-full shadow-lg ${
          isScrubbing ? 'cursor-grabbing' : 'cursor-grab'
        }`}
        style={{ pointerEvents: 'auto' }}
        onMouseDown={handleMouseDown}
      />
    </div>
  );
}
