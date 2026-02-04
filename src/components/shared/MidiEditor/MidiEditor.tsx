'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
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

interface DragState {
  type: 'none' | 'drawing' | 'moving' | 'marquee';
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  noteId?: string;
  originalTime?: number;
  pitch?: number;
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
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [selectedNoteIds, setSelectedNoteIds] = useState<Set<string>>(new Set());
  const [dragState, setDragState] = useState<DragState>({ type: 'none', startX: 0, startY: 0, currentX: 0, currentY: 0 });
  const [drawingNote, setDrawingNote] = useState<MidiNote | null>(null);

  // Create pitch-to-row index lookup
  const pitchToRowIndex = useCallback((pitch: number) => {
    return rows.findIndex(r => r.pitch === pitch);
  }, [rows]);

  // Canvas dimensions
  const labelWidth = 64;
  const canvasWidth = totalBeats * pixelsPerBeat + labelWidth + 20;
  const canvasHeight = rows.length * rowHeight;

  // Get device pixel ratio for sharp rendering
  const getPixelRatio = () => typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;

  // Hit test: find note at canvas coordinates
  const hitTestNote = useCallback((canvasX: number, canvasY: number): MidiNote | null => {
    const gridX = canvasX - labelWidth;
    if (gridX < 0) return null;

    const rowIndex = Math.floor(canvasY / rowHeight);
    if (rowIndex < 0 || rowIndex >= rows.length) return null;

    const pitch = rows[rowIndex].pitch;
    const beat = gridX / pixelsPerBeat;

    // Find note at this position (check in reverse so topmost note wins)
    for (let i = notes.length - 1; i >= 0; i--) {
      const note = notes[i];
      if (note.pitch === pitch && beat >= note.time && beat < note.time + note.duration) {
        return note;
      }
    }
    return null;
  }, [notes, rows, rowHeight, pixelsPerBeat, labelWidth]);

  // Draw the entire canvas
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = getPixelRatio();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Clear
    ctx.fillStyle = '#1a1a1a'; // bg-background
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // Draw labels column background
    ctx.fillStyle = '#242424'; // bg-surface
    ctx.fillRect(0, 0, labelWidth, canvasHeight);

    // Draw row labels
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#888';

    rows.forEach((row, i) => {
      const y = i * rowHeight;
      // Row label
      ctx.fillText(row.label, labelWidth - 8, y + rowHeight / 2);
      // Row divider
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      ctx.fillRect(labelWidth, y + rowHeight - 1, canvasWidth - labelWidth, 1);
      ctx.fillStyle = '#888';
    });

    // Draw beat lines
    for (let beat = 0; beat <= totalBeats; beat += quantize) {
      const x = labelWidth + beat * pixelsPerBeat;
      const isBar = beat % beatsPerBar === 0;
      const isBeat = beat % 1 === 0;

      ctx.fillStyle = isBar ? 'rgba(255,255,255,0.15)' : isBeat ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.03)';
      ctx.fillRect(x, 0, isBar ? 2 : 1, canvasHeight);
    }

    // Draw notes
    const allNotes = drawingNote ? [...notes, drawingNote] : notes;

    for (const note of allNotes) {
      const rowIndex = pitchToRowIndex(note.pitch);
      if (rowIndex === -1) continue;

      const row = rows[rowIndex];
      const x = labelWidth + note.time * pixelsPerBeat;
      const y = rowIndex * rowHeight + 2;
      const w = Math.max(note.duration * pixelsPerBeat, 8);
      const h = rowHeight - 4;

      const isSelected = selectedNoteIds.has(note.id);

      // Note fill
      ctx.fillStyle = isSelected ? lightenColor(row.color, 0.3) : row.color;
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, 3);
      ctx.fill();

      // Selection ring
      if (isSelected) {
        ctx.strokeStyle = 'rgba(255,255,255,0.6)';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Glow effect
        ctx.shadowColor = row.color;
        ctx.shadowBlur = 8;
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      // Note shadow (subtle)
      if (!isSelected) {
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath();
        ctx.roundRect(x + 1, y + 1, w, h, 3);
        ctx.fill();
        // Redraw note on top
        ctx.fillStyle = row.color;
        ctx.beginPath();
        ctx.roundRect(x, y, w, h, 3);
        ctx.fill();
      }
    }

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
  }, [
    canvasWidth, canvasHeight, rows, rowHeight, notes, drawingNote,
    totalBeats, beatsPerBar, quantize, pixelsPerBeat, labelWidth,
    selectedNoteIds, pitchToRowIndex, dragState
  ]);

  // Redraw on state changes
  useEffect(() => {
    draw();
  }, [draw]);

  // Handle canvas resize
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = getPixelRatio();
    canvas.width = canvasWidth * dpr;
    canvas.height = canvasHeight * dpr;
    canvas.style.width = `${canvasWidth}px`;
    canvas.style.height = `${canvasHeight}px`;

    draw();
  }, [canvasWidth, canvasHeight, draw]);

  // Convert mouse event to canvas coordinates
  const getCanvasCoords = useCallback((e: React.MouseEvent | MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  }, []);

  // Get notes within marquee
  const getNotesInMarquee = useCallback((x1: number, y1: number, x2: number, y2: number): string[] => {
    const minX = Math.min(x1, x2) - labelWidth;
    const maxX = Math.max(x1, x2) - labelWidth;
    const minY = Math.min(y1, y2);
    const maxY = Math.max(y1, y2);

    const matchingIds: string[] = [];

    for (const note of notes) {
      const rowIndex = pitchToRowIndex(note.pitch);
      if (rowIndex === -1) continue;

      const noteTop = rowIndex * rowHeight;
      const noteBottom = noteTop + rowHeight;
      const noteLeft = note.time * pixelsPerBeat;
      const noteRight = noteLeft + note.duration * pixelsPerBeat;

      if (maxX >= noteLeft && minX <= noteRight && maxY >= noteTop && minY <= noteBottom) {
        matchingIds.push(note.id);
      }
    }

    return matchingIds;
  }, [notes, pitchToRowIndex, rowHeight, pixelsPerBeat, labelWidth]);

  // Mouse down handler
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;

    const { x, y } = getCanvasCoords(e);
    const hitNote = hitTestNote(x, y);

    if (hitNote) {
      // Clicked on a note - select and prepare to drag
      e.preventDefault();
      if (e.shiftKey) {
        setSelectedNoteIds(prev => {
          const next = new Set(prev);
          if (next.has(hitNote.id)) next.delete(hitNote.id);
          else next.add(hitNote.id);
          return next;
        });
      } else if (!selectedNoteIds.has(hitNote.id)) {
        setSelectedNoteIds(new Set([hitNote.id]));
      }
      setDragState({
        type: 'moving',
        startX: x,
        startY: y,
        currentX: x,
        currentY: y,
        noteId: hitNote.id,
        originalTime: hitNote.time,
      });
    } else if (x > labelWidth) {
      // Clicked on grid
      const gridX = x - labelWidth;
      const rowIndex = Math.floor(y / rowHeight);

      if (rowIndex >= 0 && rowIndex < rows.length) {
        // Start drawing a new note
        e.preventDefault();
        const pitch = rows[rowIndex].pitch;
        const rawTime = gridX / pixelsPerBeat;
        const time = Math.round(rawTime / quantize) * quantize;

        if (time >= 0 && time < totalBeats) {
          const newNote: MidiNote = {
            id: generateId(),
            pitch,
            time,
            duration: quantize,
            velocity: 100,
          };

          setDrawingNote(newNote);
          if (!e.shiftKey) {
            setSelectedNoteIds(new Set([newNote.id]));
          } else {
            setSelectedNoteIds(prev => new Set([...prev, newNote.id]));
          }

          setDragState({
            type: 'drawing',
            startX: x,
            startY: y,
            currentX: x,
            currentY: y,
            pitch,
          });
        }
      } else {
        // Start marquee
        e.preventDefault();
        if (!e.shiftKey) setSelectedNoteIds(new Set());
        setDragState({
          type: 'marquee',
          startX: x,
          startY: y,
          currentX: x,
          currentY: y,
        });
      }
    }
  }, [getCanvasCoords, hitTestNote, selectedNoteIds, rows, rowHeight, quantize, totalBeats, pixelsPerBeat, labelWidth]);

  // Mouse move handler
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (dragState.type === 'none') return;

    const { x, y } = getCanvasCoords(e);

    if (dragState.type === 'drawing' && drawingNote) {
      const deltaX = x - dragState.startX;
      const deltaDuration = deltaX / pixelsPerBeat;
      let newDuration = Math.round((quantize + deltaDuration) / quantize) * quantize;
      newDuration = Math.max(quantize, Math.min(totalBeats - drawingNote.time, newDuration));

      if (newDuration !== drawingNote.duration) {
        setDrawingNote(prev => prev ? { ...prev, duration: newDuration } : null);
      }
    } else if (dragState.type === 'moving' && dragState.originalTime !== undefined) {
      const deltaX = x - dragState.startX;
      const deltaBeats = deltaX / pixelsPerBeat;
      const snappedDelta = Math.round(deltaBeats / quantize) * quantize;

      // Move all selected notes
      if (snappedDelta !== 0) {
        onNotesChange(notes.map(n => {
          if (selectedNoteIds.has(n.id)) {
            const baseTime = n.id === dragState.noteId ? dragState.originalTime! : n.time;
            const newTime = Math.max(0, Math.min(totalBeats - n.duration, baseTime + snappedDelta));
            return { ...n, time: newTime };
          }
          return n;
        }));
      }
    } else if (dragState.type === 'marquee') {
      setDragState(prev => ({ ...prev, currentX: x, currentY: y }));
    }
  }, [dragState, drawingNote, getCanvasCoords, pixelsPerBeat, quantize, totalBeats, notes, selectedNoteIds, onNotesChange]);

  // Mouse up handler
  const handleMouseUp = useCallback(() => {
    if (dragState.type === 'drawing' && drawingNote) {
      onNotesChange([...notes, drawingNote]);
      setDrawingNote(null);
    } else if (dragState.type === 'marquee') {
      const ids = getNotesInMarquee(dragState.startX, dragState.startY, dragState.currentX, dragState.currentY);
      if (ids.length > 0) {
        setSelectedNoteIds(new Set(ids));
      }
    }

    setDragState({ type: 'none', startX: 0, startY: 0, currentX: 0, currentY: 0 });
  }, [dragState, drawingNote, notes, onNotesChange, getNotesInMarquee]);

  // Global mouse event listeners for drag operations
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

  // Keyboard handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      if (selectedNoteIds.size > 0 && (e.key === 'Delete' || e.key === 'Backspace')) {
        e.preventDefault();
        e.stopImmediatePropagation();
        onNotesChange(notes.filter(n => !selectedNoteIds.has(n.id)));
        setSelectedNoteIds(new Set());
      } else if (e.key === 'Escape') {
        setSelectedNoteIds(new Set());
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [selectedNoteIds, notes, onNotesChange]);

  return (
    <div
      ref={containerRef}
      className={`flex-1 overflow-auto bg-background ${dragState.type !== 'none' ? 'select-none' : ''}`}
    >
      <canvas
        ref={canvasRef}
        className="block cursor-crosshair"
        onMouseDown={handleMouseDown}
      />
    </div>
  );
}

// Helper to lighten a hex color
function lightenColor(hex: string, amount: number): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.min(255, ((num >> 16) & 0xff) + Math.round(255 * amount));
  const g = Math.min(255, ((num >> 8) & 0xff) + Math.round(255 * amount));
  const b = Math.min(255, (num & 0xff) + Math.round(255 * amount));
  return `rgb(${r},${g},${b})`;
}
