'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export interface MidiNoteProps {
  id: string;
  time: number;
  duration: number;
  pixelsPerBeat: number;
  color: string;
  isSelected: boolean;
  onSelect: () => void;
  onUpdate: (updates: { time?: number; duration?: number }) => void;
  onDelete: () => void;
  minTime: number;
  maxTime: number;
  quantize: number;
}

export function MidiNoteComponent({
  id,
  time,
  duration,
  pixelsPerBeat,
  color,
  isSelected,
  onSelect,
  onUpdate,
  onDelete,
  minTime,
  maxTime,
  quantize,
}: MidiNoteProps) {
  const [isDragging, setIsDragging] = useState(false);

  const dragStartX = useRef(0);
  const originalTime = useRef(time);

  const left = time * pixelsPerBeat;
  const width = duration * pixelsPerBeat;

  // Handle drag start (move entire note)
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setIsDragging(true);
    dragStartX.current = e.clientX;
    originalTime.current = time;
    onSelect();
  }, [time, onSelect]);

  // Handle mouse move
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging) return;

    const deltaX = e.clientX - dragStartX.current;
    const deltaBeats = deltaX / pixelsPerBeat;

    // Move the note - snap to quantize grid
    let newTime = Math.round((originalTime.current + deltaBeats) / quantize) * quantize;
    newTime = Math.max(minTime, Math.min(maxTime - duration, newTime));
    if (newTime !== time) {
      onUpdate({ time: newTime });
    }
  }, [isDragging, pixelsPerBeat, quantize, time, duration, onUpdate, minTime, maxTime]);

  // Handle mouse up
  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Handle keyboard delete
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (isSelected && (e.key === 'Delete' || e.key === 'Backspace')) {
      e.preventDefault();
      onDelete();
    }
  }, [isSelected, onDelete]);

  // Add/remove event listeners
  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  useEffect(() => {
    if (isSelected) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isSelected, handleKeyDown]);

  return (
    <div
      data-midi-note
      className={`absolute top-0.5 bottom-0.5 rounded cursor-pointer transition-shadow select-none ${
        isDragging ? 'opacity-80' : ''
      } ${isSelected ? 'ring-2 ring-white ring-offset-1 ring-offset-surface z-10' : ''}`}
      style={{
        left,
        width: Math.max(width, 8),
        backgroundColor: color,
        boxShadow: isSelected
          ? `0 2px 8px ${color}80`
          : '0 1px 3px rgba(0, 0, 0, 0.3)',
      }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      onMouseDown={handleDragStart}
    />
  );
}
