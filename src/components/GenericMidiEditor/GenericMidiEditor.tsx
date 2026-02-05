'use client';

import { useCallback, useEffect, useRef } from 'react';
import { Block, Track, Event } from '@/core/types';
import { useProjectStore } from '@/stores/projectStore';
import { MidiEditor, MidiNote, MidiRow } from '@/components/shared/MidiEditor';
import { QuantizeSelect } from '@/components/shared/QuantizeSelect';
import { useMidiEditorState } from '@/hooks/useMidiEditorState';

interface GenericMidiEditorProps {
  block: Block;
  track: Track;
  beatsPerBar: number;
}

const DEFAULT_QUANTIZE = 0.25;

// Generate 73 rows from C1 (MIDI 24) to C7 (MIDI 96) with chromatic gradient colors
function generateMidiRows(): MidiRow[] {
  const rows: MidiRow[] = [];
  const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

  // C7 (96) down to C1 (24) - higher pitches at top
  for (let pitch = 96; pitch >= 24; pitch--) {
    const octave = Math.floor(pitch / 12) - 1;
    const noteIndex = pitch % 12;
    const hue = (noteIndex / 12) * 360; // Chromatic gradient
    rows.push({
      pitch,
      label: `${noteNames[noteIndex]}${octave}`,
      color: `hsl(${hue}, 70%, 55%)`,
    });
  }
  return rows;
}

const MIDI_ROWS = generateMidiRows();

// Find index for C5 (MIDI 72) to scroll to on mount - shows C3-C5 range
const DEFAULT_SCROLL_ROW_INDEX = MIDI_ROWS.findIndex(r => r.pitch === 72);

function extractNotesFromBlock(block: Block): MidiNote[] {
  const allEvents = block.streams?.flatMap(s => s.events) || [];
  // Get all pitched events
  const pitchedEvents = allEvents.filter(e => e.pitch !== undefined);

  return pitchedEvents.map((event, index) => ({
    id: `note-${event.startTimeInBeats}-${event.pitch}-${index}`,
    pitch: event.pitch!,
    time: event.startTimeInBeats,
    duration: event.duration,
    velocity: event.velocity,
  }));
}

function notesToEvents(notes: MidiNote[]): Event[] {
  return notes.map(n => ({
    startTimeInBeats: n.time,
    pitch: n.pitch,
    velocity: n.velocity,
    duration: n.duration,
  }));
}

export function GenericMidiEditor({ block, track, beatsPerBar }: GenericMidiEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const hasScrolledRef = useRef(false);
  const { updateBlockEvents } = useProjectStore();

  const saveNotes = useCallback((notes: MidiNote[], trackId: string, blockId: string) => {
    const events = notesToEvents(notes);
    updateBlockEvents(trackId, blockId, events);
  }, [updateBlockEvents]);

  const { notes, quantize, setQuantize, handleNotesChange, handleClear } = useMidiEditorState({
    block,
    track,
    extractNotes: extractNotesFromBlock,
    saveNotes,
    defaultQuantize: DEFAULT_QUANTIZE,
  });

  const totalBeats = block.durationBars * beatsPerBar;

  // Scroll to show C3-C5 range on mount
  useEffect(() => {
    if (hasScrolledRef.current || !containerRef.current) return;

    // Find the scrollable container (the overflow-auto div inside MidiEditor)
    const scrollContainer = containerRef.current.querySelector('.overflow-auto');
    if (scrollContainer) {
      const rowHeight = 28; // Default row height from MidiEditor
      const scrollTop = DEFAULT_SCROLL_ROW_INDEX * rowHeight;
      scrollContainer.scrollTop = scrollTop;
      hasScrolledRef.current = true;
    }
  }, []);

  // Reset scroll flag when block changes
  useEffect(() => {
    hasScrolledRef.current = false;
  }, [block.id]);

  return (
    <div ref={containerRef} className="flex flex-col h-full" data-editor-panel="generic">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border">
        <QuantizeSelect value={quantize} onChange={setQuantize} />

        <button
          onClick={handleClear}
          className="px-3 py-1.5 bg-background border border-border text-foreground rounded-lg text-sm font-medium hover:bg-border transition-colors"
        >
          Clear All
        </button>

        <div className="flex-1" />

        <span className="text-xs text-muted">
          {notes.length} {notes.length === 1 ? 'note' : 'notes'} | Click + drag to draw
        </span>
      </div>

      {/* Piano roll area using MidiEditor */}
      <MidiEditor
        rows={MIDI_ROWS}
        notes={notes}
        onNotesChange={handleNotesChange}
        totalBeats={totalBeats}
        beatsPerBar={beatsPerBar}
        quantize={quantize}
      />
    </div>
  );
}
