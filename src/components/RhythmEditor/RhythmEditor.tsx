'use client';

import { useCallback, useEffect, useState } from 'react';
import { Block, Track, Event } from '@/core/types';
import { useProjectStore } from '@/stores/projectStore';
import { useUIStore } from '@/stores/uiStore';
import { MidiEditor, MidiNote, MidiRow } from '@/components/shared/MidiEditor';

interface RhythmEditorProps {
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

// Single row for rhythm (C4 = 60 as reference pitch)
const RHYTHM_PITCH = 60;

const RHYTHM_ROWS: MidiRow[] = [
  { pitch: RHYTHM_PITCH, label: 'Rhythm', color: '#F9A826' },
];

function extractRhythmFromBlock(block: Block): MidiNote[] {
  const allEvents = block.streams?.flatMap(s => s.events) || [];
  // Rhythm events have pitch (usually 60 for C4)
  const rhythmEvents = allEvents.filter(e => e.pitch !== undefined);

  return rhythmEvents.map((event, index) => ({
    id: `rhythm-${event.startTimeInBeats}-${index}`,
    pitch: RHYTHM_PITCH,
    time: event.startTimeInBeats,
    duration: event.duration ?? 0.25,
    velocity: event.velocity ?? 100,
  }));
}

function notesToEvents(notes: MidiNote[]): Event[] {
  return notes.map(n => ({
    startTimeInBeats: n.time,
    pitch: RHYTHM_PITCH,
    velocity: n.velocity,
    duration: n.duration,
  }));
}

export function RhythmEditor({ block, track, beatsPerBar }: RhythmEditorProps) {
  const { updateBlock } = useProjectStore();
  const { rhythmEditorQuantize, setRhythmEditorQuantize } = useUIStore();

  const [notes, setNotes] = useState<MidiNote[]>(() => extractRhythmFromBlock(block));

  // Update notes when block ID changes
  const blockId = block.id;
  useEffect(() => {
    setNotes(extractRhythmFromBlock(block));
  }, [blockId]); // eslint-disable-line react-hooks/exhaustive-deps

  const totalBeats = block.durationBars * beatsPerBar;
  const quantize = QUANTIZE_VALUES[rhythmEditorQuantize];

  // Handle notes change from MidiEditor
  const handleNotesChange = useCallback((newNotes: MidiNote[]) => {
    setNotes(newNotes);
  }, []);

  // Auto-save when notes change
  useEffect(() => {
    const timeout = setTimeout(() => {
      const events = notesToEvents(notes);
      updateBlock(track.id, block.id, {
        streams: [{ events }],
      });
    }, 500);
    return () => clearTimeout(timeout);
  }, [notes, track.id, block.id, updateBlock]);

  // Fill all beats
  const handleFill = useCallback(() => {
    const newNotes: MidiNote[] = [];
    for (let i = 0; i < totalBeats; i += quantize) {
      newNotes.push({
        id: `rhythm-${i}-${Date.now()}`,
        pitch: RHYTHM_PITCH,
        time: i,
        duration: quantize,
        velocity: 100,
      });
    }
    setNotes(newNotes);
  }, [totalBeats, quantize]);

  // Clear all
  const handleClear = useCallback(() => {
    setNotes([]);
  }, []);

  return (
    <div className="flex flex-col h-full" data-editor-panel="rhythm">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border">
        {/* Quantize selector */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted">Grid:</span>
          <select
            value={rhythmEditorQuantize}
            onChange={(e) => setRhythmEditorQuantize(e.target.value as QuantizeValue)}
            className="px-2 py-1 bg-background border border-border rounded text-sm text-foreground"
          >
            <option value="quarter">Beat</option>
            <option value="8th">1/8</option>
            <option value="16th">1/16</option>
          </select>
        </div>

        <button
          onClick={handleFill}
          className="px-3 py-1.5 bg-background border border-border text-foreground rounded-lg text-sm font-medium hover:bg-border transition-colors"
        >
          Fill All
        </button>

        <button
          onClick={handleClear}
          className="px-3 py-1.5 bg-background border border-border text-foreground rounded-lg text-sm font-medium hover:bg-border transition-colors"
        >
          Clear All
        </button>

        <div className="flex-1" />

        <span className="text-xs text-muted">
          {notes.length} trigger{notes.length === 1 ? '' : 's'} | Click + drag to draw
        </span>
      </div>

      {/* Midi editor with single row and larger row height */}
      <MidiEditor
        rows={RHYTHM_ROWS}
        notes={notes}
        onNotesChange={handleNotesChange}
        totalBeats={totalBeats}
        beatsPerBar={beatsPerBar}
        quantize={quantize}
        rowHeight={48}
      />
    </div>
  );
}
