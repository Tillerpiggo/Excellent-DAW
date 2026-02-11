'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useUIStore } from '@/stores/uiStore';
import { usePlayback } from '@/hooks/usePlayback';
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

export interface RangeLabel {
  startPitch: number;
  endPitch: number;
  label: string;
}

export interface MidiEditorProps {
  rows: MidiRow[];
  notes: MidiNote[];
  onNotesChange: (notes: MidiNote[]) => void;
  totalBeats: number;
  beatsPerBar: number;
  quantize: number;
  snapEnabled?: boolean;
  pixelsPerBeat?: number;
  rowHeight?: number;
  rangeLabels?: RangeLabel[];
  /** Beat offset of this block in the project timeline (for playhead positioning) */
  blockStartBeat?: number;
  /** Optional labels to render inside notes, keyed by note ID */
  noteLabels?: Map<string, string>;
}

interface DragState {
  type: 'none' | 'drawing' | 'moving' | 'resizing' | 'marquee' | 'copy-moving';
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  noteId?: string;
  originalTime?: number;
  originalPitch?: number;
  originalTimes?: Map<string, number>;
  originalPitches?: Map<string, number>;
  originalDurations?: Map<string, number>;
  startWorldX?: number;
  pitch?: number;
}

const DRAG_NONE: DragState = { type: 'none', startX: 0, startY: 0, currentX: 0, currentY: 0 };
const NOTE_EDGE_WIDTH = 8;

// Helper to lighten a color (supports both hex and hsl strings)
function lightenColor(color: string, amount: number): string {
  const hslMatch = color.match(/^hsl\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*\)$/);
  if (hslMatch) {
    const h = parseFloat(hslMatch[1]);
    const s = parseFloat(hslMatch[2]);
    const l = Math.min(100, parseFloat(hslMatch[3]) + amount * 100);
    return `hsl(${h}, ${s}%, ${l}%)`;
  }
  const cleanHex = color.replace('#', '');
  const num = parseInt(cleanHex, 16);
  const r = Math.min(255, ((num >> 16) & 0xff) + Math.round(255 * amount));
  const g = Math.min(255, ((num >> 8) & 0xff) + Math.round(255 * amount));
  const b = Math.min(255, (num & 0xff) + Math.round(255 * amount));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

export function MidiEditor({
  rows,
  notes,
  onNotesChange,
  totalBeats,
  beatsPerBar,
  quantize,
  snapEnabled = true,
  pixelsPerBeat = 40,
  rowHeight = 28,
  rangeLabels,
  blockStartBeat = 0,
  noteLabels,
}: MidiEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);
  const rulerPlayheadRef = useRef<HTMLDivElement>(null);

  const { seekTo } = usePlayback();

  const [selectedNoteIds, setSelectedNoteIds] = useState<Set<string>>(new Set());
  const [drawingNote, setDrawingNote] = useState<MidiNote | null>(null);
  const [dragState, setDragState] = useState<DragState>(DRAG_NONE);
  const dragStateRef = useRef(dragState);
  dragStateRef.current = dragState;

  // Direct DOM cursor updates (no re-renders)
  const setCursor = useCallback((cursor: string) => {
    if (containerRef.current) containerRef.current.style.cursor = cursor;
  }, []);

  // Alt+scroll zoom (horizontal = pixelsPerBeat, vertical = rowScale)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      if (!e.altKey) return;
      e.preventDefault();
      e.stopPropagation();

      if (Math.abs(e.deltaX) > 2) {
        const delta = -e.deltaX * 0.5;
        const current = useUIStore.getState().midiPixelsPerBeat;
        useUIStore.getState().setMidiPixelsPerBeat(current + delta);
      }

      if (Math.abs(e.deltaY) > 2) {
        const delta = -e.deltaY * 0.005;
        const current = useUIStore.getState().midiRowScale;
        useUIStore.getState().setMidiRowScale(current + delta);
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, []);

  // Snap resolution: use quantize grid when enabled, fine resolution when off
  const snapSize = snapEnabled ? quantize : 1 / 128;
  const snapValue = useCallback((v: number) => Math.round(v / snapSize) * snapSize, [snapSize]);

  // Canvas dimensions
  const labelWidth = 64;
  const canvasWidth = totalBeats * pixelsPerBeat + labelWidth + 20;
  const canvasHeight = rows.length * rowHeight;

  // Grid line CSS background
  const barWidthPx = beatsPerBar * pixelsPerBeat;
  const beatWidthPx = pixelsPerBeat;
  const subdivWidthPx = quantize * pixelsPerBeat;

  const gridBackground = useMemo(() => {
    const images: string[] = [];
    const sizes: string[] = [];

    // Bar lines (strongest)
    images.push(`repeating-linear-gradient(to right, rgba(255,255,255,0.15) 0px 1px, transparent 1px ${barWidthPx}px)`);
    sizes.push(`${barWidthPx}px 100%`);

    // Beat lines (medium) - only if different from bar lines
    if (beatWidthPx !== barWidthPx) {
      images.push(`repeating-linear-gradient(to right, rgba(255,255,255,0.08) 0px 1px, transparent 1px ${beatWidthPx}px)`);
      sizes.push(`${beatWidthPx}px 100%`);
    }

    // Subdivision lines (faint) - only if different from beat lines
    if (subdivWidthPx !== beatWidthPx) {
      images.push(`repeating-linear-gradient(to right, rgba(255,255,255,0.03) 0px 1px, transparent 1px ${subdivWidthPx}px)`);
      sizes.push(`${subdivWidthPx}px 100%`);
    }

    return {
      backgroundImage: images.join(', '),
      backgroundSize: sizes.join(', '),
    };
  }, [barWidthPx, beatWidthPx, subdivWidthPx]);

  // Compute range label positions (top/height in pixels) from rangeLabels + rows
  const rangeLabelPositions = useMemo(() => {
    if (!rangeLabels || rangeLabels.length === 0) return [];

    // Build a pitch -> rowIndex map
    const pitchToIdx = new Map<number, number>();
    rows.forEach((r, i) => pitchToIdx.set(r.pitch, i));

    return rangeLabels.map(rl => {
      // Rows are sorted high-to-low, so endPitch (higher) has a lower index
      const topIdx = pitchToIdx.get(rl.endPitch);
      const bottomIdx = pitchToIdx.get(rl.startPitch);
      if (topIdx === undefined || bottomIdx === undefined) return null;
      const top = topIdx * rowHeight;
      const height = (bottomIdx - topIdx + 1) * rowHeight;
      return { label: rl.label, top, height };
    }).filter(Boolean) as { label: string; top: number; height: number }[];
  }, [rangeLabels, rows, rowHeight]);

  // Create pitch-to-row index lookup
  const pitchToRowIndex = useCallback((pitch: number) => {
    return rows.findIndex(r => r.pitch === pitch);
  }, [rows]);

  // Hover handler for dynamic cursor
  const handleHoverChange = useCallback((target: 'noteBody' | 'noteEdge' | null) => {
    if (dragStateRef.current.type !== 'none') return;
    if (target === 'noteEdge') setCursor('ew-resize');
    else if (target === 'noteBody') setCursor('grab');
    else setCursor('crosshair');
  }, [setCursor]);

  // Handle note body pointer down -> start moving
  const handleNotePointerDown = useCallback((e: React.PointerEvent, note: MidiNote) => {
    e.stopPropagation();

    // Check if near right edge (resize)
    const noteEl = e.currentTarget as HTMLDivElement;
    const localX = e.nativeEvent.offsetX;
    const noteW = noteEl.offsetWidth;
    if (noteW > NOTE_EDGE_WIDTH * 2 && localX > noteW - NOTE_EDGE_WIDTH) {
      // Resize mode
      let newSelectedIds: Set<string>;
      if (!selectedNoteIds.has(note.id)) {
        newSelectedIds = new Set([note.id]);
        setSelectedNoteIds(newSelectedIds);
      } else {
        newSelectedIds = selectedNoteIds;
      }

      const originalDurations = new Map<string, number>();
      for (const n of notes) {
        if (newSelectedIds.has(n.id)) {
          originalDurations.set(n.id, n.duration);
        }
      }

      setDragState({
        type: 'resizing',
        startX: e.clientX,
        startY: e.clientY,
        currentX: e.clientX,
        currentY: e.clientY,
        noteId: note.id,
        originalDurations,
      });
      setCursor('ew-resize');
      return;
    }

    // Move mode
    let newSelectedIds: Set<string>;
    if (e.shiftKey) {
      newSelectedIds = new Set(selectedNoteIds);
      if (newSelectedIds.has(note.id)) newSelectedIds.delete(note.id);
      else newSelectedIds.add(note.id);
      setSelectedNoteIds(newSelectedIds);
    } else if (!selectedNoteIds.has(note.id)) {
      newSelectedIds = new Set([note.id]);
      setSelectedNoteIds(newSelectedIds);
    } else {
      newSelectedIds = selectedNoteIds;
    }

    // Option+drag = copy selected notes, then drag the copies
    if (e.altKey && newSelectedIds.size > 0) {
      const oldToNew = new Map<string, string>();
      const duplicates: MidiNote[] = [];
      for (const n of notes) {
        if (newSelectedIds.has(n.id)) {
          const newId = generateId();
          oldToNew.set(n.id, newId);
          duplicates.push({ ...n, id: newId });
        }
      }

      // Add duplicates to notes (originals stay, copies will be dragged)
      const updatedNotes = [...notes, ...duplicates];
      onNotesChange(updatedNotes);

      // Select the copies instead
      const copyIds = new Set(oldToNew.values());
      setSelectedNoteIds(copyIds);

      const originalTimes = new Map<string, number>();
      const originalPitches = new Map<string, number>();
      for (const dup of duplicates) {
        originalTimes.set(dup.id, dup.time);
        originalPitches.set(dup.id, dup.pitch);
      }

      setDragState({
        type: 'moving',
        startX: e.clientX,
        startY: e.clientY,
        currentX: e.clientX,
        currentY: e.clientY,
        noteId: oldToNew.get(note.id) || note.id,
        originalTime: note.time,
        originalPitch: note.pitch,
        originalTimes,
        originalPitches,
      });
      setCursor('copy');
      return;
    }

    const originalTimes = new Map<string, number>();
    const originalPitches = new Map<string, number>();
    for (const n of notes) {
      if (newSelectedIds.has(n.id)) {
        originalTimes.set(n.id, n.time);
        originalPitches.set(n.id, n.pitch);
      }
    }

    setDragState({
      type: 'moving',
      startX: e.clientX,
      startY: e.clientY,
      currentX: e.clientX,
      currentY: e.clientY,
      noteId: note.id,
      originalTime: note.time,
      originalPitch: note.pitch,
      originalTimes,
      originalPitches,
    });
    setCursor('grabbing');
  }, [selectedNoteIds, notes, setCursor]);

  // Handle note hover for cursor changes
  const handleNotePointerMove = useCallback((e: React.PointerEvent) => {
    if (dragStateRef.current.type !== 'none') return;
    const noteEl = e.currentTarget as HTMLDivElement;
    const localX = e.nativeEvent.offsetX;
    const noteW = noteEl.offsetWidth;
    if (noteW > NOTE_EDGE_WIDTH * 2 && localX > noteW - NOTE_EDGE_WIDTH) {
      handleHoverChange('noteEdge');
    } else {
      handleHoverChange('noteBody');
    }
  }, [handleHoverChange]);

  // Handle background click (left-click = marquee selection, right-click = draw note)
  const handleBackgroundPointerDown = useCallback((e: React.PointerEvent) => {
    if (!gridRef.current) return;
    const rect = gridRef.current.getBoundingClientRect();
    const gridX = e.clientX - rect.left;
    const gridY = e.clientY - rect.top;

    // Right-click = draw new note
    if (e.button === 2) {
      const rowIndex = Math.floor(gridY / rowHeight);

      if (rowIndex >= 0 && rowIndex < rows.length) {
        const pitch = rows[rowIndex].pitch;
        const rawTime = gridX / pixelsPerBeat;
        const time = snapValue(rawTime);

        if (time >= 0 && time < totalBeats) {
          const newNote: MidiNote = {
            id: generateId(),
            pitch,
            time,
            duration: snapEnabled ? quantize : 0.25,
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
            startX: e.clientX,
            startY: e.clientY,
            currentX: e.clientX,
            currentY: e.clientY,
            startWorldX: gridX + labelWidth,
            pitch,
          });
        }
      }
      return;
    }

    // Left-click = marquee selection
    if (!e.shiftKey) setSelectedNoteIds(new Set());
    setDragState({
      type: 'marquee',
      startX: gridX + labelWidth,
      startY: gridY,
      currentX: gridX + labelWidth,
      currentY: gridY,
    });
    setCursor('crosshair');
  }, [labelWidth, rowHeight, rows, pixelsPerBeat, snapValue, snapEnabled, snapSize, totalBeats, setCursor]);

  // Get notes within marquee bounds
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

  // Handle global pointer move/up
  useEffect(() => {
    if (dragState.type === 'none') return;

    const handleMove = (e: PointerEvent) => {
      if (dragState.type === 'drawing' && drawingNote) {
        const deltaX = e.clientX - dragState.startX;
        const deltaDuration = deltaX / pixelsPerBeat;
        const baseDuration = snapEnabled ? quantize : 0.25;
        let newDuration = snapValue(baseDuration + deltaDuration);
        newDuration = Math.max(snapSize, Math.min(totalBeats - drawingNote.time, newDuration));

        if (newDuration !== drawingNote.duration) {
          setDrawingNote(prev => prev ? { ...prev, duration: newDuration } : null);
        }
      } else if (dragState.type === 'moving' && dragState.originalTimes && dragState.originalPitches) {
        const deltaX = e.clientX - dragState.startX;
        const deltaBeats = deltaX / pixelsPerBeat;
        const snappedDelta = snapValue(deltaBeats);

        const deltaY = e.clientY - dragState.startY;
        const rowDelta = Math.round(deltaY / rowHeight);

        onNotesChange(notes.map(n => {
          const originalTime = dragState.originalTimes!.get(n.id);
          const originalPitch = dragState.originalPitches!.get(n.id);
          if (originalTime !== undefined && originalPitch !== undefined) {
            const origRowIndex = rows.findIndex(r => r.pitch === originalPitch);
            const newRowIndex = Math.max(0, Math.min(rows.length - 1, origRowIndex + rowDelta));
            const newPitch = rows[newRowIndex].pitch;
            const newTime = Math.max(0, Math.min(totalBeats - n.duration, originalTime + snappedDelta));
            return { ...n, time: newTime, pitch: newPitch };
          }
          return n;
        }));
      } else if (dragState.type === 'resizing' && dragState.originalDurations) {
        const deltaX = e.clientX - dragState.startX;
        const deltaBeats = deltaX / pixelsPerBeat;
        const snappedDelta = snapValue(deltaBeats);

        onNotesChange(notes.map(n => {
          const originalDuration = dragState.originalDurations!.get(n.id);
          if (originalDuration !== undefined) {
            const newDuration = Math.max(snapSize, originalDuration + snappedDelta);
            return { ...n, duration: newDuration };
          }
          return n;
        }));
      } else if (dragState.type === 'marquee' && gridRef.current) {
        const rect = gridRef.current.getBoundingClientRect();
        const currentX = e.clientX - rect.left + labelWidth;
        const currentY = e.clientY - rect.top;
        setDragState(prev => ({ ...prev, currentX, currentY }));
      }
    };

    const handleUp = () => {
      if (dragState.type === 'drawing' && drawingNote) {
        onNotesChange([...notes, drawingNote]);
        setDrawingNote(null);
      } else if (dragState.type === 'marquee') {
        const ids = getNotesInMarquee(dragState.startX, dragState.startY, dragState.currentX, dragState.currentY);
        if (ids.length > 0) {
          setSelectedNoteIds(prev => new Set([...prev, ...ids]));
        }
      }

      setDragState(DRAG_NONE);
      setCursor('crosshair');
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);

    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };
  }, [dragState, drawingNote, pixelsPerBeat, snapValue, snapSize, snapEnabled, totalBeats, rowHeight, rows, notes, onNotesChange, getNotesInMarquee, setCursor]);

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

  // Playhead position via RAF (no React re-renders)
  useEffect(() => {
    let rafId: number;
    const tick = () => {
      const beat = useUIStore.getState().currentBeat - blockStartBeat;
      const visible = beat >= 0 && beat <= totalBeats;
      const px = beat * pixelsPerBeat;
      const el = playheadRef.current;
      if (el) {
        el.style.transform = `translateX(${px}px)`;
        el.style.display = visible ? '' : 'none';
      }
      const rel = rulerPlayheadRef.current;
      if (rel) {
        rel.style.transform = `translateX(${px}px)`;
        rel.style.display = visible ? '' : 'none';
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [pixelsPerBeat, blockStartBeat, totalBeats]);

  // Scrub handler: click/drag on grid to move playhead
  const scrubRef = useRef(false);

  const handleScrub = useCallback((clientX: number) => {
    if (!gridRef.current) return;
    const rect = gridRef.current.getBoundingClientRect();
    const gridX = clientX - rect.left;
    const rawBeat = gridX / pixelsPerBeat;
    const snapped = snapEnabled
      ? Math.round(rawBeat / quantize) * quantize
      : rawBeat;
    const clamped = Math.max(0, Math.min(totalBeats, snapped));
    const projectBeat = clamped + blockStartBeat;
    useUIStore.getState().setCurrentBeat(projectBeat);
    seekTo(projectBeat);
  }, [pixelsPerBeat, snapEnabled, quantize, totalBeats, seekTo, blockStartBeat]);

  const handlePlayheadPointerDown = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    scrubRef.current = true;
    useUIStore.getState().setIsScrubbing(true);
    handleScrub(e.clientX);

    const onMove = (ev: PointerEvent) => {
      if (scrubRef.current) handleScrub(ev.clientX);
    };
    const onUp = () => {
      scrubRef.current = false;
      useUIStore.getState().setIsScrubbing(false);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, [handleScrub]);

  // Click on background deselects (if not dragging)
  const handleContainerClick = useCallback((e: React.MouseEvent) => {
    // Only deselect if the click target is the grid background itself
    if (e.target === gridRef.current && !e.shiftKey && dragStateRef.current.type === 'none') {
      setSelectedNoteIds(new Set());
    }
  }, []);

  // All notes including the one being drawn
  const allNotes = drawingNote ? [...notes, drawingNote] : notes;

  // Marquee overlay
  const marqueeStyle = useMemo(() => {
    if (dragState.type !== 'marquee') return null;
    const x1 = Math.min(dragState.startX, dragState.currentX) - labelWidth;
    const y1 = Math.min(dragState.startY, dragState.currentY);
    const w = Math.abs(dragState.currentX - dragState.startX);
    const h = Math.abs(dragState.currentY - dragState.startY);
    if (w < 2 || h < 2) return null;
    return {
      position: 'absolute' as const,
      left: x1,
      top: y1,
      width: w,
      height: h,
      backgroundColor: 'rgba(59, 130, 246, 0.15)',
      border: '1px solid rgba(59, 130, 246, 0.6)',
      pointerEvents: 'none' as const,
      zIndex: 10,
    };
  }, [dragState, labelWidth]);

  const rulerHeight = 24;
  const barCount = Math.ceil(totalBeats / beatsPerBar);

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-auto bg-background"
      style={{ cursor: 'crosshair' }}
      onClick={handleContainerClick}
    >
      {/* Sticky ruler row */}
      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 20,
          display: 'flex',
          width: canvasWidth,
          height: rulerHeight,
          backgroundColor: '#1e1e1e',
          borderBottom: '1px solid rgba(255,255,255,0.1)',
        }}
      >
        {/* Ruler label spacer */}
        <div style={{ width: labelWidth, flexShrink: 0, backgroundColor: '#242424' }} />
        {/* Ruler track */}
        <div
          style={{
            flex: 1,
            position: 'relative',
            cursor: 'col-resize',
            overflow: 'hidden',
          }}
          onPointerDown={handlePlayheadPointerDown}
        >
          {/* Bar numbers */}
          {Array.from({ length: barCount }).map((_, i) => (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: i * beatsPerBar * pixelsPerBeat,
                top: 0,
                height: rulerHeight,
                borderLeft: '1px solid rgba(255,255,255,0.15)',
                display: 'flex',
                alignItems: 'center',
                paddingLeft: 4,
                fontSize: 10,
                color: '#666',
                fontFamily: 'monospace',
              }}
            >
              {i + 1}
            </div>
          ))}
          {/* Ruler playhead */}
          <div
            ref={rulerPlayheadRef}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: 1,
              height: rulerHeight,
              pointerEvents: 'none',
              zIndex: 21,
            }}
          >
            <div style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: 1.5,
              height: '100%',
              backgroundColor: '#ffd93d',
            }} />
            {/* Triangle head */}
            <div style={{
              position: 'absolute',
              bottom: 0,
              left: -4,
              width: 0,
              height: 0,
              borderLeft: '4.5px solid transparent',
              borderRight: '4.5px solid transparent',
              borderBottom: '6px solid #ffd93d',
            }} />
          </div>
        </div>
      </div>

      <div style={{ width: canvasWidth, height: canvasHeight, position: 'relative', display: 'flex' }}>
        {/* Labels column */}
        <div
          style={{
            width: labelWidth,
            height: canvasHeight,
            flexShrink: 0,
            backgroundColor: '#242424',
            position: 'relative',
            zIndex: 2,
            cursor: 'default',
          }}
          onPointerMove={() => {
            if (dragStateRef.current.type === 'none') setCursor('default');
          }}
        >
          {rows.map((row, i) => (
            <div
              key={row.pitch}
              style={{
                height: rowHeight,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
                paddingRight: 8,
                fontSize: 11,
                color: '#888',
                whiteSpace: 'nowrap',
                borderBottom: '1px solid rgba(255,255,255,0.05)',
              }}
            >
              {row.label}
            </div>
          ))}
          {/* Range label annotations */}
          {rangeLabelPositions.map((rl, i) => (
            <div
              key={i}
              style={{
                position: 'absolute',
                top: rl.top,
                left: 0,
                width: labelWidth,
                height: rl.height,
                pointerEvents: 'none',
                borderTop: '1px solid rgba(255,255,255,0.12)',
                borderBottom: i === rangeLabelPositions.length - 1 ? '1px solid rgba(255,255,255,0.12)' : undefined,
              }}
            >
              <span
                style={{
                  position: 'absolute',
                  top: 4,
                  left: 6,
                  fontSize: 9,
                  fontWeight: 600,
                  color: 'rgba(255,255,255,0.3)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                {rl.label}
              </span>
            </div>
          ))}
        </div>

        {/* Grid area */}
        <div
          ref={gridRef}
          style={{
            flex: 1,
            height: canvasHeight,
            position: 'relative',
            backgroundColor: '#1a1a1a',
            ...gridBackground,
          }}
          onPointerDown={handleBackgroundPointerDown}
          onContextMenu={(e) => e.preventDefault()}
          onPointerMove={() => {
            if (dragStateRef.current.type === 'none') setCursor('crosshair');
          }}
        >
          {/* Range label background bands */}
          {rangeLabelPositions.map((rl, i) => (
            <div
              key={`range-${i}`}
              style={{
                position: 'absolute',
                top: rl.top,
                left: 0,
                right: 0,
                height: rl.height,
                backgroundColor: i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent',
                borderTop: '1px solid rgba(255,255,255,0.08)',
                pointerEvents: 'none',
              }}
            />
          ))}

          {/* Row dividers */}
          {rows.map((_, i) => (
            <div
              key={i}
              style={{
                position: 'absolute',
                top: i * rowHeight + rowHeight - 1,
                left: 0,
                right: 0,
                height: 1,
                backgroundColor: 'rgba(255,255,255,0.05)',
                pointerEvents: 'none',
              }}
            />
          ))}

          {/* Note shadows - separate layer behind all notes so shadows never overlap notes */}
          {allNotes.map((note) => {
            const rowIndex = pitchToRowIndex(note.pitch);
            if (rowIndex === -1 || selectedNoteIds.has(note.id)) return null;
            const x = note.time * pixelsPerBeat;
            const y = rowIndex * rowHeight + 2;
            const w = Math.max(note.duration * pixelsPerBeat, 8);
            const h = rowHeight - 4;
            return (
              <div
                key={`s-${note.id}`}
                style={{
                  position: 'absolute',
                  left: x,
                  top: y,
                  width: w,
                  height: h,
                  borderRadius: 3,
                  boxShadow: '1px 1px 3px rgba(0,0,0,0.3)',
                  pointerEvents: 'none',
                  zIndex: 0,
                }}
              />
            );
          })}

          {/* Notes */}
          {allNotes.map((note) => {
            const rowIndex = pitchToRowIndex(note.pitch);
            if (rowIndex === -1) return null;
            const row = rows[rowIndex];
            const x = note.time * pixelsPerBeat;
            const y = rowIndex * rowHeight + 2;
            const w = Math.max(note.duration * pixelsPerBeat, 8);
            const h = rowHeight - 4;
            const isSelected = selectedNoteIds.has(note.id);
            const noteColor = isSelected ? lightenColor(row.color, 0.3) : row.color;

            return (
              <div
                key={note.id}
                style={{
                  position: 'absolute',
                  left: x,
                  top: y,
                  width: w,
                  height: h,
                  backgroundColor: noteColor,
                  borderRadius: 3,
                  boxShadow: isSelected
                    ? `0 0 14px ${row.color}, 0 0 6px ${row.color}`
                    : 'none',
                  outline: isSelected ? '1px solid rgba(255,255,255,0.6)' : 'none',
                  cursor: 'inherit',
                  zIndex: isSelected ? 3 : 1,
                }}
                onPointerDown={(e) => handleNotePointerDown(e, note)}
                onPointerMove={handleNotePointerMove}
                onPointerOut={() => handleHoverChange(null)}
              >
                {noteLabels?.get(note.id) && (
                  <span style={{
                    position: 'absolute',
                    left: 3,
                    right: 3,
                    top: 0,
                    height: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    fontSize: Math.min(10, h - 2),
                    lineHeight: 1,
                    color: 'rgba(0,0,0,0.7)',
                    fontWeight: 600,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    pointerEvents: 'none',
                    userSelect: 'none',
                  }}>
                    {noteLabels.get(note.id)}
                  </span>
                )}
              </div>
            );
          })}

          {/* Marquee overlay */}
          {marqueeStyle && <div style={marqueeStyle} />}

          {/* Playhead */}
          <div
            ref={playheadRef}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: 1,
              height: '100%',
              zIndex: 15,
              pointerEvents: 'none',
            }}
          >
            {/* Stem */}
            <div style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: 1.5,
              height: '100%',
              backgroundColor: '#ffd93d',
            }} />
            {/* Hit area for scrubbing */}
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: -8,
                width: 17,
                height: '100%',
                cursor: 'col-resize',
                pointerEvents: 'auto',
                zIndex: 16,
              }}
              onPointerDown={handlePlayheadPointerDown}
            />
          </div>
        </div>
      </div>  {/* end grid row */}
    </div>
  );
}
