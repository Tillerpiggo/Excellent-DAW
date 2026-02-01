'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ChordData, formatChordName } from '@/core/harmony';
import { InstrumentId } from '@/core/types';

interface ChordBlockProps {
  chord: ChordData;
  pixelsPerBeat: number;
  isSelected: boolean;
  onSelect: () => void;
  onUpdate: (updates: Partial<ChordData>) => void;
  onDoubleClick: () => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
  minBeat: number;
  maxBeat: number;
  instrumentId: InstrumentId;
}

export function ChordBlock({
  chord,
  pixelsPerBeat,
  isSelected,
  onSelect,
  onUpdate,
  onDoubleClick,
  containerRef,
  minBeat,
  maxBeat,
  instrumentId,
}: ChordBlockProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isResizingLeft, setIsResizingLeft] = useState(false);
  const [isResizingRight, setIsResizingRight] = useState(false);

  const dragStartX = useRef(0);
  const originalStartBeat = useRef(chord.startBeat);
  const originalDurationBeats = useRef(chord.durationBeats);

  // Calculate position and size
  const left = chord.startBeat * pixelsPerBeat;
  const width = chord.durationBeats * pixelsPerBeat;

  // Coral color for chords
  const baseColor = '#FF6B6B';
  const selectedColor = '#FF8E8E';

  // Handle drag start (move entire chord)
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    if (isResizingLeft || isResizingRight) return;
    e.stopPropagation();
    e.preventDefault();
    setIsDragging(true);
    dragStartX.current = e.clientX;
    originalStartBeat.current = chord.startBeat;
    onSelect();
  }, [chord.startBeat, isResizingLeft, isResizingRight, onSelect]);

  // Handle left resize start
  const handleLeftResizeStart = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setIsResizingLeft(true);
    dragStartX.current = e.clientX;
    originalStartBeat.current = chord.startBeat;
    originalDurationBeats.current = chord.durationBeats;
    onSelect();
  }, [chord.startBeat, chord.durationBeats, onSelect]);

  // Handle right resize start
  const handleRightResizeStart = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setIsResizingRight(true);
    dragStartX.current = e.clientX;
    originalDurationBeats.current = chord.durationBeats;
    onSelect();
  }, [chord.durationBeats, onSelect]);

  // Handle mouse move
  const handleMouseMove = useCallback((e: MouseEvent) => {
    const deltaX = e.clientX - dragStartX.current;
    const deltaBeats = deltaX / pixelsPerBeat;

    if (isDragging) {
      // Move the chord
      let newStartBeat = Math.round((originalStartBeat.current + deltaBeats) * 4) / 4; // Snap to quarter beats
      newStartBeat = Math.max(minBeat, Math.min(maxBeat - chord.durationBeats, newStartBeat));
      if (newStartBeat !== chord.startBeat) {
        onUpdate({ startBeat: newStartBeat });
      }
    } else if (isResizingLeft) {
      // Resize from left edge (changes start and duration)
      let newStartBeat = Math.round((originalStartBeat.current + deltaBeats) * 4) / 4;
      const maxStart = originalStartBeat.current + originalDurationBeats.current - 0.5; // Min duration 0.5 beats
      newStartBeat = Math.max(minBeat, Math.min(maxStart, newStartBeat));
      const newDuration = originalStartBeat.current + originalDurationBeats.current - newStartBeat;
      if (newStartBeat !== chord.startBeat || newDuration !== chord.durationBeats) {
        onUpdate({ startBeat: newStartBeat, durationBeats: newDuration });
      }
    } else if (isResizingRight) {
      // Resize from right edge (changes duration only)
      let newDuration = Math.round((originalDurationBeats.current + deltaBeats) * 4) / 4;
      const maxDuration = maxBeat - chord.startBeat;
      newDuration = Math.max(0.5, Math.min(maxDuration, newDuration));
      if (newDuration !== chord.durationBeats) {
        onUpdate({ durationBeats: newDuration });
      }
    }
  }, [isDragging, isResizingLeft, isResizingRight, pixelsPerBeat, chord, onUpdate, minBeat, maxBeat]);

  // Handle mouse up
  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    setIsResizingLeft(false);
    setIsResizingRight(false);
  }, []);

  // Add/remove event listeners
  useEffect(() => {
    if (isDragging || isResizingLeft || isResizingRight) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, isResizingLeft, isResizingRight, handleMouseMove, handleMouseUp]);

  const chordName = formatChordName(chord.root, chord.quality);

  return (
    <div
      className={`absolute top-2 bottom-2 rounded-xl cursor-pointer transition-all select-none ${
        isDragging || isResizingLeft || isResizingRight ? 'opacity-90' : ''
      } ${isSelected ? 'ring-2 ring-white ring-offset-2 ring-offset-surface' : ''}`}
      style={{
        left,
        width: Math.max(width - 4, 40),
        backgroundColor: isSelected ? selectedColor : baseColor,
        boxShadow: isSelected
          ? '0 4px 12px rgba(255, 107, 107, 0.4)'
          : '0 2px 8px rgba(0, 0, 0, 0.2)',
      }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onDoubleClick();
      }}
      onMouseDown={handleDragStart}
    >
      {/* Left resize handle */}
      <div
        className="absolute top-0 bottom-0 left-0 w-3 cursor-ew-resize hover:bg-black/20 rounded-l-xl"
        onMouseDown={handleLeftResizeStart}
      />

      {/* Content */}
      <div className="absolute inset-0 flex flex-col items-center justify-center px-4 pointer-events-none">
        <span className="text-xl font-bold text-white drop-shadow-sm truncate max-w-full">
          {chordName}
        </span>
        <span className="text-xs text-white/70 mt-1">
          {chord.durationBeats} {chord.durationBeats === 1 ? 'beat' : 'beats'}
        </span>
      </div>

      {/* Right resize handle */}
      <div
        className="absolute top-0 bottom-0 right-0 w-3 cursor-ew-resize hover:bg-black/20 rounded-r-xl"
        onMouseDown={handleRightResizeStart}
      />
    </div>
  );
}
