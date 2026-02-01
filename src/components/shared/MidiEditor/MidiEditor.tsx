'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { MidiNoteComponent } from './MidiNoteComponent';
import { generateId } from '@/utils/id';

export interface MidiNote {
  id: string;
  row: string;
  time: number;
  duration: number;
  velocity: number;
}

export interface MidiEditorProps<TRow extends string> {
  rows: TRow[];
  rowLabels: Record<TRow, string>;
  rowColors: Record<TRow, string>;
  notes: MidiNote[];
  onNotesChange: (notes: MidiNote[]) => void;
  totalBeats: number;
  beatsPerBar: number;
  quantize: number;
  pixelsPerBeat?: number;
  rowHeight?: number;
}

export function MidiEditor<TRow extends string>({
  rows,
  rowLabels,
  rowColors,
  notes,
  onNotesChange,
  totalBeats,
  beatsPerBar,
  quantize,
  pixelsPerBeat = 40,
  rowHeight = 28,
}: MidiEditorProps<TRow>) {
  const containerRef = useRef<HTMLDivElement>(null);

  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);

  // Drawing state for click-and-drag note creation
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawingNote, setDrawingNote] = useState<MidiNote | null>(null);
  const drawStartX = useRef(0);

  // Update a note
  const handleUpdateNote = useCallback((noteId: string, updates: { time?: number; duration?: number }) => {
    onNotesChange(notes.map(n =>
      n.id === noteId ? { ...n, ...updates } : n
    ));
  }, [notes, onNotesChange]);

  // Delete a note
  const handleDeleteNote = useCallback((noteId: string) => {
    onNotesChange(notes.filter(n => n.id !== noteId));
    setSelectedNoteId(null);
  }, [notes, onNotesChange]);

  // Start drawing a new note on mousedown
  const handleRowMouseDown = useCallback((row: TRow, e: React.MouseEvent) => {
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
        row,
        time,
        duration: quantize, // Start with minimum duration
        velocity: 100,
      };

      setDrawingNote(newNote);
      setIsDrawing(true);
      setSelectedNoteId(newNote.id);
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

  // Deselect on container click
  const handleContainerClick = useCallback(() => {
    setSelectedNoteId(null);
  }, []);

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

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-auto bg-background"
      onClick={handleContainerClick}
    >
      <div className="flex">
        {/* Labels column */}
        <div className="w-16 flex-shrink-0 bg-surface border-r border-border">
          {rows.map(row => (
            <div
              key={row}
              className="flex items-center justify-end pr-2 text-xs font-medium text-muted border-b border-border/50"
              style={{ height: rowHeight }}
            >
              {rowLabels[row]}
            </div>
          ))}
        </div>

        {/* Grid area */}
        <div
          className="relative"
          style={{ width: totalBeats * pixelsPerBeat + 20 }}
        >
          {/* Beat lines */}
          {beatLines}

          {/* Note rows */}
          {rows.map((row) => {
            const rowNotes = notes.filter(n => n.row === row);
            const isDrawingThisRow = drawingNote?.row === row;
            return (
              <div
                key={row}
                className="relative border-b border-border/50 hover:bg-white/5"
                style={{ height: rowHeight }}
                onMouseDown={(e) => handleRowMouseDown(row, e)}
              >
                {rowNotes.map(note => (
                  <MidiNoteComponent
                    key={note.id}
                    id={note.id}
                    time={note.time}
                    duration={note.duration}
                    pixelsPerBeat={pixelsPerBeat}
                    color={rowColors[row]}
                    isSelected={selectedNoteId === note.id}
                    onSelect={() => setSelectedNoteId(note.id)}
                    onUpdate={(updates) => handleUpdateNote(note.id, updates)}
                    onDelete={() => handleDeleteNote(note.id)}
                    minTime={0}
                    maxTime={totalBeats}
                    quantize={quantize}
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
                    color={rowColors[row]}
                    isSelected={true}
                    onSelect={() => {}}
                    onUpdate={() => {}}
                    onDelete={() => {}}
                    minTime={0}
                    maxTime={totalBeats}
                    quantize={quantize}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
