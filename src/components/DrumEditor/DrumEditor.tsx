'use client';

import { useCallback, useEffect, useState } from 'react';
import { Block, Track, Event, DRUM_PITCHES, getDrumType, DrumType } from '@/core/types';
import { useProjectStore } from '@/stores/projectStore';
import { useUIStore } from '@/stores/uiStore';
import { MidiEditor, MidiNote } from '@/components/shared/MidiEditor';

interface DrumEditorProps {
  block: Block;
  track: Track;
  beatsPerBar: number;
}

type QuantizeValue = '16th' | '8th' | 'quarter';

const DRUM_ORDER: DrumType[] = ['hihat', 'clap', 'snare', 'kick'];

const DRUM_LABELS: Record<DrumType, string> = {
  hihat: 'HiHat',
  clap: 'Clap',
  snare: 'Snare',
  kick: 'Kick',
};

const DRUM_COLORS: Record<DrumType, string> = {
  hihat: '#FFD93D',
  clap: '#6BCB77',
  snare: '#4D96FF',
  kick: '#FF6B6B',
};

const QUANTIZE_VALUES: Record<QuantizeValue, number> = {
  '16th': 0.25,
  '8th': 0.5,
  'quarter': 1,
};

function extractDrumsFromBlock(block: Block): MidiNote[] {
  const allEvents = block.streams?.flatMap(s => s.events) || [];
  const drumEvents = allEvents.filter(e => getDrumType(e.pitch) !== null);

  return drumEvents.map((event, index) => {
    const drumType = getDrumType(event.pitch)!;
    return {
      id: `${drumType}-${event.time}-${index}`,
      row: drumType,
      time: event.time,
      duration: event.duration,
      velocity: event.velocity,
    };
  });
}

function notesToEvents(notes: MidiNote[]): Event[] {
  return notes.map(n => ({
    time: n.time,
    pitch: DRUM_PITCHES[n.row as DrumType],
    velocity: n.velocity,
    duration: n.duration,
  }));
}

export function DrumEditor({ block, track, beatsPerBar }: DrumEditorProps) {
  const { updateBlockDrums } = useProjectStore();
  const { drumEditorQuantize, setDrumEditorQuantize } = useUIStore();

  const [notes, setNotes] = useState<MidiNote[]>(() => extractDrumsFromBlock(block));

  // Update notes when block ID changes (not on every block update)
  const blockId = block.id;
  useEffect(() => {
    setNotes(extractDrumsFromBlock(block));
  }, [blockId]); // eslint-disable-line react-hooks/exhaustive-deps

  const totalBeats = block.durationBars * beatsPerBar;
  const quantize = QUANTIZE_VALUES[drumEditorQuantize];

  // Handle notes change from MidiEditor
  const handleNotesChange = useCallback((newNotes: MidiNote[]) => {
    setNotes(newNotes);
  }, []);

  // Auto-save when notes change
  useEffect(() => {
    const timeout = setTimeout(() => {
      const events = notesToEvents(notes);
      updateBlockDrums(track.id, block.id, events);
    }, 500);
    return () => clearTimeout(timeout);
  }, [notes, track.id, block.id, updateBlockDrums]);

  // Clear all
  const handleClear = useCallback(() => {
    setNotes([]);
  }, []);

  return (
    <div className="flex flex-col h-full" data-editor-panel="drum">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border">
        {/* Quantize selector */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted">Grid:</span>
          <select
            value={drumEditorQuantize}
            onChange={(e) => setDrumEditorQuantize(e.target.value as QuantizeValue)}
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
          {notes.length} {notes.length === 1 ? 'hit' : 'hits'} | Click + drag to draw
        </span>
      </div>

      {/* Piano roll area using MidiEditor */}
      <MidiEditor
        rows={DRUM_ORDER}
        rowLabels={DRUM_LABELS}
        rowColors={DRUM_COLORS}
        notes={notes}
        onNotesChange={handleNotesChange}
        totalBeats={totalBeats}
        beatsPerBar={beatsPerBar}
        quantize={quantize}
      />
    </div>
  );
}
