'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { MidiNoteComponent } from './MidiNoteComponent';
import { generateId } from '@/utils/id';

export interface MidiRow {
  pitch: number;
  label: string;
  color: string;
}

export interface MidiNote {
  id: string;
  pitch: number;
  time: number;
  duration: number;
  velocity: number;
}

export interface MidiEditorProps {
  rows: MidiRow[];
  notes: MidiNote[];
  onNotesChange: (notes: MidiNote[]) => void;
  totalBeats: number;
  beatsPerBar: number;
  quantize: number;
  pixelsPerBeat?: number;
  rowHeight?: number;
}

interface MarqueeState {
  isActive: boolean;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

export function MidiEditor({
  rows,
  notes,
  onNotesChange,
  totalBeats,
  beatsPerBar,
  quantize,
  pixelsPerBeat = 40,
  rowHeight = 28,
}: MidiEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const [selectedNoteIds, setSelectedNoteIds] = useState<Set<string>>(new Set());

  // Drawing state for click-and-drag note creation
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawingNote, setDrawingNote] = useState<MidiNote | null>(null);
  const drawStartX = useRef(0);

  // Marquee selection state
  const [marquee, setMarquee] = useState<MarqueeState | null>(null);

  // Create pitch-to-row index lookup
  const pitchToRowIndex = new Map(rows.map((row, index) => [row.pitch, index]));

  // Select a note (with shift-click support)
  const handleSelectNote = useCallback((noteId: string, addToSelection: boolean) => {
    setSelectedNoteIds(prev => {
      if (addToSelection) {
        const newSet = new Set(prev);
        if (newSet.has(noteId)) {
          newSet.delete(noteId);
        } else {
          newSet.add(noteId);
        }
        return newSet;
      }
      return new Set([noteId]);
    });
  }, []);

  // Clear selection
  const clearSelection = useCallback(() => {
    setSelectedNoteIds(new Set());
  }, []);

  // Update a note
  const handleUpdateNote = useCallback((noteId: string, updates: { time?: number; duration?: number }) => {
    onNotesChange(notes.map(n =>
      n.id === noteId ? { ...n, ...updates } : n
    ));
  }, [notes, onNotesChange]);

  // Update multiple selected notes (for dragging)
  const handleUpdateSelectedNotes = useCallback((deltaTime: number) => {
    if (selectedNoteIds.size === 0) return;

    onNotesChange(notes.map(n => {
      if (selectedNoteIds.has(n.id)) {
        const newTime = Math.max(0, Math.min(totalBeats - n.duration, n.time + deltaTime));
        return { ...n, time: newTime };
      }
      return n;
    }));
  }, [notes, onNotesChange, selectedNoteIds, totalBeats]);

  // Delete a note
  const handleDeleteNote = useCallback((noteId: string) => {
    onNotesChange(notes.filter(n => n.id !== noteId));
    setSelectedNoteIds(prev => {
      const newSet = new Set(prev);
      newSet.delete(noteId);
      return newSet;
    });
  }, [notes, onNotesChange]);

  // Delete all selected notes
  const handleDeleteSelectedNotes = useCallback(() => {
    if (selectedNoteIds.size === 0) return;
    onNotesChange(notes.filter(n => !selectedNoteIds.has(n.id)));
    setSelectedNoteIds(new Set());
  }, [notes, onNotesChange, selectedNoteIds]);

  // Start drawing a new note on mousedown
  const handleRowMouseDown = useCallback((pitch: number, e: React.MouseEvent) => {
    // Only handle left click on empty space
    if (e.button !== 0) return;

    // Don't start drawing if clicking on an existing note
    if ((e.target as HTMLElement).closest('[data-midi-note]')) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const rawTime = x / pixelsPerBeat;
    const time = Math.round(rawTime / quantize) * quantize;

    if (time >= 0 && time < totalBeats) {
      e.preventDefault();
      drawStartX.current = e.clientX;

      const newNote: MidiNote = {
        id: generateId(),
        pitch,
        time,
        duration: quantize,
        velocity: 100,
      };

      setDrawingNote(newNote);
      setIsDrawing(true);
      // Clear selection when drawing a new note (unless shift)
      if (!e.shiftKey) {
        setSelectedNoteIds(new Set([newNote.id]));
      } else {
        setSelectedNoteIds(prev => new Set([...prev, newNote.id]));
      }
    }
  }, [pixelsPerBeat, quantize, totalBeats]);

  // Update drawing note duration on mouse move
  const handleDrawingMouseMove = useCallback((e: MouseEvent) => {
    if (!isDrawing || !drawingNote) return;

    const deltaX = e.clientX - drawStartX.current;
    const deltaDuration = deltaX / pixelsPerBeat;

    // Calculate new duration, snap to grid, minimum 1 grid unit
    let newDuration = Math.round((quantize + deltaDuration) / quantize) * quantize;
    newDuration = Math.max(quantize, Math.min(totalBeats - drawingNote.time, newDuration));

    if (newDuration !== drawingNote.duration) {
      setDrawingNote(prev => prev ? { ...prev, duration: newDuration } : null);
    }
  }, [isDrawing, drawingNote, pixelsPerBeat, quantize, totalBeats]);

  // Finish drawing on mouse up
  const handleDrawingMouseUp = useCallback(() => {
    if (isDrawing && drawingNote) {
      // Add the completed note to the list
      onNotesChange([...notes, drawingNote]);
    }
    setIsDrawing(false);
    setDrawingNote(null);
  }, [isDrawing, drawingNote, notes, onNotesChange]);

  // Add/remove drawing event listeners
  useEffect(() => {
    if (isDrawing) {
      document.addEventListener('mousemove', handleDrawingMouseMove);
      document.addEventListener('mouseup', handleDrawingMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleDrawingMouseMove);
        document.removeEventListener('mouseup', handleDrawingMouseUp);
      };
    }
  }, [isDrawing, handleDrawingMouseMove, handleDrawingMouseUp]);

  // Get notes within marquee selection
  const getNotesInMarquee = useCallback(() => {
    if (!marquee || !gridRef.current) return [];

    const { startX, startY, currentX, currentY } = marquee;
    const minX = Math.min(startX, currentX);
    const maxX = Math.max(startX, currentX);
    const minY = Math.min(startY, currentY);
    const maxY = Math.max(startY, currentY);

    const matchingIds: string[] = [];

    notes.forEach(note => {
      const rowIndex = pitchToRowIndex.get(note.pitch);
      if (rowIndex === undefined) return;

      const noteTop = rowIndex * rowHeight;
      const noteBottom = noteTop + rowHeight;
      const noteLeft = note.time * pixelsPerBeat;
      const noteRight = noteLeft + note.duration * pixelsPerBeat;

      // Check if marquee intersects this note
      if (maxX >= noteLeft && minX <= noteRight && maxY >= noteTop && minY <= noteBottom) {
        matchingIds.push(note.id);
      }
    });

    return matchingIds;
  }, [marquee, notes, pitchToRowIndex, rowHeight, pixelsPerBeat]);

  // Handle marquee start (on grid area)
  const handleGridMouseDown = useCallback((e: React.MouseEvent) => {
    // Only left click
    if (e.button !== 0) return;

    // Don't start marquee if clicking on a note or if we're in a row handler
    if ((e.target as HTMLElement).closest('[data-midi-note]')) return;

    // Check if this is directly on the grid container (not a row)
    const target = e.target as HTMLElement;
    if (target.closest('[data-midi-row]')) return;

    e.preventDefault();

    const rect = gridRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Clear selection unless shift is held
    if (!e.shiftKey) {
      clearSelection();
    }

    setMarquee({
      isActive: true,
      startX: x,
      startY: y,
      currentX: x,
      currentY: y,
    });
  }, [clearSelection]);

  // Handle marquee move
  const handleMarqueeMouseMove = useCallback((e: MouseEvent) => {
    if (!marquee?.isActive) return;

    const rect = gridRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setMarquee(prev => prev ? { ...prev, currentX: x, currentY: y } : null);
  }, [marquee?.isActive]);

  // Handle marquee end
  const handleMarqueeMouseUp = useCallback(() => {
    if (!marquee?.isActive) return;

    const noteIds = getNotesInMarquee();
    if (noteIds.length > 0) {
      setSelectedNoteIds(new Set(noteIds));
    }

    setMarquee(null);
  }, [marquee?.isActive, getNotesInMarquee]);

  // Marquee event listeners
  useEffect(() => {
    if (marquee?.isActive) {
      document.addEventListener('mousemove', handleMarqueeMouseMove);
      document.addEventListener('mouseup', handleMarqueeMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMarqueeMouseMove);
        document.removeEventListener('mouseup', handleMarqueeMouseUp);
      };
    }
  }, [marquee?.isActive, handleMarqueeMouseMove, handleMarqueeMouseUp]);

  // Handle keyboard events for delete and escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      if (selectedNoteIds.size > 0 && (e.key === 'Delete' || e.key === 'Backspace')) {
        e.preventDefault();
        e.stopImmediatePropagation();
        handleDeleteSelectedNotes();
      } else if (e.key === 'Escape') {
        clearSelection();
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [selectedNoteIds, handleDeleteSelectedNotes, clearSelection]);

  // Deselect on container click (but not grid - grid has its own handler)
  const handleContainerClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      clearSelection();
    }
  }, [clearSelection]);

  // Draw beat lines
  const beatLines = [];
  for (let beat = 0; beat <= totalBeats; beat += quantize) {
    const isBar = beat % beatsPerBar === 0;
    const isBeat = beat % 1 === 0;
    beatLines.push(
      <div
        key={beat}
        className={`absolute top-0 bottom-0 ${
          isBar ? 'bg-border' : isBeat ? 'bg-border/50' : 'bg-border/20'
        }`}
        style={{
          left: beat * pixelsPerBeat,
          width: isBar ? 2 : 1,
        }}
      />
    );
  }

  // Calculate marquee rectangle
  const marqueeRect = marquee ? {
    left: Math.min(marquee.startX, marquee.currentX),
    top: Math.min(marquee.startY, marquee.currentY),
    width: Math.abs(marquee.currentX - marquee.startX),
    height: Math.abs(marquee.currentY - marquee.startY),
  } : null;

  return (
    <div
      ref={containerRef}
      className={`flex-1 overflow-auto bg-background ${marquee?.isActive ? 'select-none' : ''}`}
      onClick={handleContainerClick}
    >
      <div className="flex">
        {/* Labels column */}
        <div className="w-16 flex-shrink-0 bg-surface border-r border-border">
          {rows.map(row => (
            <div
              key={row.pitch}
              className="flex items-center justify-end pr-2 text-xs font-medium text-muted border-b border-border/50"
              style={{ height: rowHeight }}
            >
              {row.label}
            </div>
          ))}
        </div>

        {/* Grid area */}
        <div
          ref={gridRef}
          className="relative"
          style={{ width: totalBeats * pixelsPerBeat + 20 }}
          onMouseDown={handleGridMouseDown}
        >
          {/* Beat lines */}
          {beatLines}

          {/* Note rows */}
          {rows.map((row) => {
            const rowNotes = notes.filter(n => n.pitch === row.pitch);
            const isDrawingThisRow = drawingNote?.pitch === row.pitch;
            return (
              <div
                key={row.pitch}
                data-midi-row
                className="relative border-b border-border/50 hover:bg-white/5"
                style={{ height: rowHeight }}
                onMouseDown={(e) => handleRowMouseDown(row.pitch, e)}
              >
                {rowNotes.map(note => (
                  <MidiNoteComponent
                    key={note.id}
                    id={note.id}
                    time={note.time}
                    duration={note.duration}
                    pixelsPerBeat={pixelsPerBeat}
                    color={row.color}
                    isSelected={selectedNoteIds.has(note.id)}
                    onSelect={(addToSelection) => handleSelectNote(note.id, addToSelection)}
                    onUpdate={(updates) => handleUpdateNote(note.id, updates)}
                    onDelete={() => handleDeleteNote(note.id)}
                    minTime={0}
                    maxTime={totalBeats}
                    quantize={quantize}
                    selectedCount={selectedNoteIds.size}
                    onUpdateSelected={handleUpdateSelectedNotes}
                  />
                ))}
                {/* Drawing preview */}
                {isDrawingThisRow && drawingNote && (
                  <MidiNoteComponent
                    key="drawing"
                    id={drawingNote.id}
                    time={drawingNote.time}
                    duration={drawingNote.duration}
                    pixelsPerBeat={pixelsPerBeat}
                    color={row.color}
                    isSelected={true}
                    onSelect={() => {}}
                    onUpdate={() => {}}
                    onDelete={() => {}}
                    minTime={0}
                    maxTime={totalBeats}
                    quantize={quantize}
                    selectedCount={1}
                    onUpdateSelected={() => {}}
                  />
                )}
              </div>
            );
          })}

          {/* Marquee selection box */}
          {marquee?.isActive && marqueeRect && marqueeRect.width > 2 && marqueeRect.height > 2 && (
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
        </div>
      </div>
    </div>
  );
}
