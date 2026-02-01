'use client';

import { useCallback, useEffect, useState } from 'react';
import { Block, Track, Event } from '@/core/types';
import { useProjectStore } from '@/stores/projectStore';
import { useUIStore } from '@/stores/uiStore';
import { MidiEditor, MidiNote } from '@/components/shared/MidiEditor';
import {
  eventsToArpNotes,
  arpNotesToEvents,
  ArpNote,
  ARP_ROWS,
  ArpRow,
  DEGREE_LABELS,
  DEGREE_COLORS,
} from '@/core/arp';

interface ArpEditorProps {
  block: Block;
  track: Track;
  beatsPerBar: number;
}

type QuantizeValue = '16th' | '8th' | 'quarter';

const QUANTIZE_VALUES: Record<QuantizeValue, number> = {
  '16th': 0.25,
  '8th': 0.5,
  'quarter': 1,
};

// Convert ArpNotes to MidiNotes for the editor
function arpNotesToMidiNotes(arpNotes: ArpNote[]): MidiNote[] {
  return arpNotes.map(note => ({
    id: note.id,
    row: String(note.degree),
    time: note.time,
    duration: note.duration,
    velocity: note.velocity,
  }));
}

// Convert MidiNotes back to ArpNotes (all in base octave for simplicity)
function midiNotesToArpNotes(midiNotes: MidiNote[]): ArpNote[] {
  return midiNotes.map(note => ({
    id: note.id,
    degree: parseInt(note.row, 10),
    time: note.time,
    duration: note.duration,
    velocity: note.velocity,
    octaveOffset: 0, // New notes are in base octave
  }));
}

function extractArpFromBlock(block: Block): MidiNote[] {
  const allEvents = block.streams?.flatMap(s => s.events) || [];
  const pitchedEvents = allEvents.filter(e => e.pitch !== undefined);
  const arpNotes = eventsToArpNotes(pitchedEvents);
  return arpNotesToMidiNotes(arpNotes);
}

export function ArpEditor({ block, track, beatsPerBar }: ArpEditorProps) {
  const { updateBlock } = useProjectStore();
  const { arpEditorQuantize, setArpEditorQuantize } = useUIStore();

  const [notes, setNotes] = useState<MidiNote[]>(() => extractArpFromBlock(block));

  // Update notes when block ID changes (not on every block update)
  const blockId = block.id;
  useEffect(() => {
    setNotes(extractArpFromBlock(block));
  }, [blockId]); // eslint-disable-line react-hooks/exhaustive-deps

  const totalBeats = block.durationBars * beatsPerBar;
  const quantize = QUANTIZE_VALUES[arpEditorQuantize];

  // Handle notes change from MidiEditor
  const handleNotesChange = useCallback((newNotes: MidiNote[]) => {
    setNotes(newNotes);
  }, []);

  // Auto-save when notes change
  useEffect(() => {
    const timeout = setTimeout(() => {
      const arpNotes = midiNotesToArpNotes(notes);
      const events = arpNotesToEvents(arpNotes);
      updateBlock(track.id, block.id, {
        streams: [{ events }],
      });
    }, 500);
    return () => clearTimeout(timeout);
  }, [notes, track.id, block.id, updateBlock]);

  // Clear all
  const handleClear = useCallback(() => {
    setNotes([]);
  }, []);

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border">
        {/* Quantize selector */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted">Grid:</span>
          <select
            value={arpEditorQuantize}
            onChange={(e) => setArpEditorQuantize(e.target.value as QuantizeValue)}
            className="px-2 py-1 bg-background border border-border rounded text-sm text-foreground"
          >
            <option value="16th">1/16</option>
            <option value="8th">1/8</option>
            <option value="quarter">1/4</option>
          </select>
        </div>

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
        rows={ARP_ROWS as unknown as ArpRow[]}
        rowLabels={DEGREE_LABELS as Record<ArpRow, string>}
        rowColors={DEGREE_COLORS as Record<ArpRow, string>}
        notes={notes}
        onNotesChange={handleNotesChange}
        totalBeats={totalBeats}
        beatsPerBar={beatsPerBar}
        quantize={quantize}
      />
    </div>
  );
}
