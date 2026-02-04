'use client';

import { useCallback, useEffect, useState } from 'react';
import { Block, Track, Event } from '@/core/types';
import { useProjectStore } from '@/stores/projectStore';
import { useUIStore } from '@/stores/uiStore';
import { MidiEditor, MidiNote } from '@/components/shared/MidiEditor';
import { generateId } from '@/utils/id';

interface TransposeEditorProps {
  block: Block;
  track: Track;
  beatsPerBar: number;
}

type QuantizeValue = '16th' | '8th' | 'quarter' | 'bar';

const QUANTIZE_VALUES: Record<QuantizeValue, number> = {
  '16th': 0.25,
  '8th': 0.5,
  'quarter': 1,
  'bar': 4,
};

// Transpose rows: -12 to +12 semitones (two octaves range)
const TRANSPOSE_ROW_DATA = [
  { id: '12', label: '+12 (Oct)', color: '#ef4444' },
  { id: '11', label: '+11', color: '#f97316' },
  { id: '10', label: '+10', color: '#f97316' },
  { id: '9', label: '+9', color: '#eab308' },
  { id: '8', label: '+8', color: '#eab308' },
  { id: '7', label: '+7 (5th)', color: '#84cc16' },
  { id: '6', label: '+6', color: '#22c55e' },
  { id: '5', label: '+5 (4th)', color: '#22c55e' },
  { id: '4', label: '+4 (M3)', color: '#14b8a6' },
  { id: '3', label: '+3 (m3)', color: '#14b8a6' },
  { id: '2', label: '+2', color: '#06b6d4' },
  { id: '1', label: '+1', color: '#06b6d4' },
  { id: '0', label: '0', color: '#64748b' },
  { id: '-1', label: '-1', color: '#8b5cf6' },
  { id: '-2', label: '-2', color: '#8b5cf6' },
  { id: '-3', label: '-3 (m3)', color: '#a855f7' },
  { id: '-4', label: '-4 (M3)', color: '#a855f7' },
  { id: '-5', label: '-5 (4th)', color: '#d946ef' },
  { id: '-6', label: '-6', color: '#d946ef' },
  { id: '-7', label: '-7 (5th)', color: '#ec4899' },
  { id: '-8', label: '-8', color: '#f43f5e' },
  { id: '-9', label: '-9', color: '#f43f5e' },
  { id: '-10', label: '-10', color: '#ef4444' },
  { id: '-11', label: '-11', color: '#ef4444' },
  { id: '-12', label: '-12 (Oct)', color: '#dc2626' },
] as const;

const TRANSPOSE_ROWS = TRANSPOSE_ROW_DATA.map(r => r.id);
const TRANSPOSE_ROW_LABELS = Object.fromEntries(TRANSPOSE_ROW_DATA.map(r => [r.id, r.label])) as Record<string, string>;
const TRANSPOSE_ROW_COLORS = Object.fromEntries(TRANSPOSE_ROW_DATA.map(r => [r.id, r.color])) as Record<string, string>;

// Convert semitone offset to MIDI pitch (C4 = 60 is the reference)
function semitonesToPitch(semitones: number): number {
  return 60 + semitones;
}

// Convert MIDI pitch back to semitone offset
function pitchToSemitones(pitch: number): number {
  return pitch - 60;
}

// Convert transpose events to MidiNotes for the editor
function eventsToMidiNotes(events: Event[]): MidiNote[] {
  return events
    .filter(e => e.pitch !== undefined)
    .map((e, i) => ({
      id: `transpose-${i}-${e.startTimeInBeats}`,
      row: String(pitchToSemitones(e.pitch!)),
      time: e.startTimeInBeats,
      duration: e.duration ?? 1,
      velocity: e.velocity ?? 100,
    }));
}

// Convert MidiNotes back to events
function midiNotesToEvents(notes: MidiNote[]): Event[] {
  return notes.map(note => ({
    startTimeInBeats: note.time,
    pitch: semitonesToPitch(parseInt(note.row, 10)),
    duration: note.duration,
    velocity: note.velocity,
  }));
}

function extractTransposeFromBlock(block: Block): MidiNote[] {
  const allEvents = block.streams?.flatMap(s => s.events) || [];
  return eventsToMidiNotes(allEvents);
}

export function TransposeEditor({ block, track, beatsPerBar }: TransposeEditorProps) {
  const { updateBlock } = useProjectStore();
  const { transposeEditorQuantize, setTransposeEditorQuantize } = useUIStore();

  const [notes, setNotes] = useState<MidiNote[]>(() => extractTransposeFromBlock(block));

  // Update notes when block ID changes
  const blockId = block.id;
  useEffect(() => {
    setNotes(extractTransposeFromBlock(block));
  }, [blockId]); // eslint-disable-line react-hooks/exhaustive-deps

  const totalBeats = block.durationBars * beatsPerBar;
  const quantize = QUANTIZE_VALUES[transposeEditorQuantize];

  // Handle notes change from MidiEditor
  const handleNotesChange = useCallback((newNotes: MidiNote[]) => {
    setNotes(newNotes);
  }, []);

  // Auto-save when notes change
  useEffect(() => {
    const timeout = setTimeout(() => {
      const events = midiNotesToEvents(notes);
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
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-surface/50">
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium text-foreground">
            Transpose: {track.name}
          </span>
          <span className="text-xs text-muted-foreground">
            Block: Bar {block.startBar + 1} ({block.durationBars} bar{block.durationBars > 1 ? 's' : ''})
          </span>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground">Grid:</label>
          <select
            value={transposeEditorQuantize}
            onChange={(e) => setTransposeEditorQuantize(e.target.value as QuantizeValue)}
            className="px-2 py-1 bg-background border border-border rounded text-sm text-foreground"
          >
            <option value="bar">Bar</option>
            <option value="quarter">1/4</option>
            <option value="8th">1/8</option>
            <option value="16th">1/16</option>
          </select>
          <button
            onClick={handleClear}
            className="px-2 py-1 text-xs bg-surface hover:bg-muted border border-border rounded"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 overflow-hidden">
        <MidiEditor
          notes={notes}
          rows={TRANSPOSE_ROWS}
          rowLabels={TRANSPOSE_ROW_LABELS}
          rowColors={TRANSPOSE_ROW_COLORS}
          onNotesChange={handleNotesChange}
          totalBeats={totalBeats}
          quantize={quantize}
          beatsPerBar={beatsPerBar}
        />
      </div>
    </div>
  );
}
