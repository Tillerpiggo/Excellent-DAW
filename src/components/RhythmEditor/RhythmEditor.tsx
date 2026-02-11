'use client';

import { useCallback } from 'react';
import { Block, Track, Event } from '@/core/types';
import { useProjectStore } from '@/stores/projectStore';
import { MidiEditor, MidiNote, MidiRow } from '@/components/shared/MidiEditor';
import { QuantizeSelect } from '@/components/shared/QuantizeSelect';
import { useMidiEditorState } from '@/hooks/useMidiEditorState';

interface RhythmEditorProps {
  block: Block;
  track: Track;
  beatsPerBar: number;
}

// Single row for rhythm (C4 = 60 as reference pitch)
const RHYTHM_PITCH = 60;
const DEFAULT_QUANTIZE = 0.25;

const RHYTHM_ROWS: MidiRow[] = [
  { pitch: RHYTHM_PITCH, label: 'Rhythm', color: '#F9A826' },
];

function extractRhythmFromBlock(block: Block): MidiNote[] {
  const allEvents = block.streams?.flatMap(s => s.events) || [];
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

  const saveNotes = useCallback((notes: MidiNote[], trackId: string, blockId: string) => {
    const events = notesToEvents(notes);
    updateBlock(trackId, blockId, { streams: [{ events }] });
  }, [updateBlock]);

  const { notes, setNotes, quantize, setQuantize, handleNotesChange, handleClear } = useMidiEditorState({
    block,
    track,
    extractNotes: extractRhythmFromBlock,
    saveNotes,
    defaultQuantize: DEFAULT_QUANTIZE,
  });

  const totalBeats = block.durationBars * beatsPerBar;

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
  }, [totalBeats, quantize, setNotes]);

  return (
    <div className="flex flex-col h-full" data-editor-panel="rhythm">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border">
        <QuantizeSelect value={quantize} onChange={setQuantize} />

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
        blockStartBeat={block.startBar * beatsPerBar}
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
