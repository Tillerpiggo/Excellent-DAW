'use client';

import { useCallback } from 'react';
import { Block, Track, Event } from '@/core/types';
import { useProjectStore } from '@/stores/projectStore';
import { MidiEditor, MidiNote, MidiRow } from '@/components/shared/MidiEditor';
import { QuantizeSelect } from '@/components/shared/QuantizeSelect';
import { useMidiEditorState } from '@/hooks/useMidiEditorState';

interface MuteEditorProps {
  block: Block;
  track: Track;
  beatsPerBar: number;
}

// Single row for mute (pitch 0 as marker)
const MUTE_PITCH = 0;
const DEFAULT_QUANTIZE = 0.25;

const MUTE_ROWS: MidiRow[] = [
  { pitch: MUTE_PITCH, label: 'Mute', color: '#64748b' },
];

function extractMutesFromBlock(block: Block): MidiNote[] {
  const allEvents = block.streams?.flatMap(s => s.events) || [];
  return allEvents.map((event, index) => ({
    id: `mute-${event.startTimeInBeats}-${index}`,
    pitch: MUTE_PITCH,
    time: event.startTimeInBeats,
    duration: event.duration,
    velocity: event.velocity,
  }));
}

function notesToEvents(notes: MidiNote[]): Event[] {
  return notes.map(n => ({
    startTimeInBeats: n.time,
    pitch: MUTE_PITCH,
    velocity: n.velocity,
    duration: n.duration,
  }));
}

export function MuteEditor({ block, track, beatsPerBar }: MuteEditorProps) {
  const { updateBlock } = useProjectStore();

  const saveNotes = useCallback((notes: MidiNote[], trackId: string, blockId: string) => {
    const events = notesToEvents(notes);
    updateBlock(trackId, blockId, { streams: [{ events }] });
  }, [updateBlock]);

  const { notes, quantize, setQuantize, handleNotesChange, handleClear } = useMidiEditorState({
    block,
    track,
    extractNotes: extractMutesFromBlock,
    saveNotes,
    defaultQuantize: DEFAULT_QUANTIZE,
  });

  const totalBeats = block.durationBars * beatsPerBar;

  return (
    <div className="flex flex-col h-full" data-editor-panel="mute">
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
          {notes.length} mute {notes.length === 1 ? 'region' : 'regions'} | Click + drag to draw
        </span>
      </div>

      {/* Midi editor with single row and larger row height */}
      <MidiEditor
        rows={MUTE_ROWS}
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
