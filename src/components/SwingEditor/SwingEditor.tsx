'use client';

import { useCallback, useEffect, useState } from 'react';
import { Block, Track, Event } from '@/core/types';
import { useProjectStore } from '@/stores/projectStore';
import { useUIStore } from '@/stores/uiStore';
import { MidiEditor, MidiNote } from '@/components/shared/MidiEditor';

interface SwingEditorProps {
  block: Block;
  track: Track;
  beatsPerBar: number;
}

type SwingRow = 'swing';
type QuantizeValue = '16th' | '8th' | 'quarter';

const SWING_ROWS: SwingRow[] = ['swing'];

const SWING_LABELS: Record<SwingRow, string> = {
  swing: 'Swing',
};

const SWING_COLORS: Record<SwingRow, string> = {
  swing: '#f472b6', // Pink (matches swing category)
};

const QUANTIZE_VALUES: Record<QuantizeValue, number> = {
  '16th': 0.25,
  '8th': 0.5,
  'quarter': 1,
};

// Default swing amount (0-100%)
const DEFAULT_SWING_AMOUNT = 66;

function extractSwingFromBlock(block: Block): { notes: MidiNote[]; swingAmount: number } {
  const allEvents = block.streams?.flatMap(s => s.events) || [];

  // Swing events have velocity that represents swing amount
  const swingEvents = allEvents.filter(
    e => e.velocity !== undefined
  );

  // Calculate average velocity to determine swing amount
  let swingAmount = DEFAULT_SWING_AMOUNT;
  if (swingEvents.length > 0) {
    const avgVelocity = swingEvents.reduce((sum, e) => sum + (e.velocity ?? 64), 0) / swingEvents.length;
    swingAmount = Math.round((avgVelocity / 127) * 100);
  }

  const notes = swingEvents.map((event, index) => ({
    id: `swing-${event.time}-${index}`,
    row: 'swing' as SwingRow,
    time: event.time,
    duration: event.duration ?? 0.25,
    velocity: event.velocity ?? Math.round((swingAmount / 100) * 127),
  }));

  return { notes, swingAmount };
}

function notesToEvents(notes: MidiNote[], swingAmount: number): Event[] {
  const velocity = Math.round((swingAmount / 100) * 127);
  return notes.map(n => ({
    time: n.time,
    velocity,
    duration: n.duration,
  }));
}

export function SwingEditor({ block, track, beatsPerBar }: SwingEditorProps) {
  const { updateBlock } = useProjectStore();
  const { swingEditorQuantize, setSwingEditorQuantize } = useUIStore();

  const [notes, setNotes] = useState<MidiNote[]>([]);
  const [swingAmount, setSwingAmount] = useState(DEFAULT_SWING_AMOUNT);

  // Update notes when block ID changes
  const blockId = block.id;
  useEffect(() => {
    const { notes: extractedNotes, swingAmount: extractedAmount } = extractSwingFromBlock(block);
    setNotes(extractedNotes);
    setSwingAmount(extractedAmount);
  }, [blockId]); // eslint-disable-line react-hooks/exhaustive-deps

  const totalBeats = block.durationBars * beatsPerBar;
  const quantize = QUANTIZE_VALUES[swingEditorQuantize];

  // Handle notes change from MidiEditor
  const handleNotesChange = useCallback((newNotes: MidiNote[]) => {
    setNotes(newNotes);
  }, []);

  // Handle swing amount change
  const handleSwingAmountChange = useCallback((newAmount: number) => {
    setSwingAmount(newAmount);
    // Update all note velocities to match new swing amount
    const velocity = Math.round((newAmount / 100) * 127);
    setNotes(prev => prev.map(n => ({ ...n, velocity })));
  }, []);

  // Auto-save when notes or swing amount change
  useEffect(() => {
    const timeout = setTimeout(() => {
      const events = notesToEvents(notes, swingAmount);
      updateBlock(track.id, block.id, {
        streams: [{ events }],
      });
    }, 500);
    return () => clearTimeout(timeout);
  }, [notes, swingAmount, track.id, block.id, updateBlock]);

  // Fill off-beats (classic swing pattern)
  const handleFillOffbeats = useCallback(() => {
    const newNotes: MidiNote[] = [];
    const velocity = Math.round((swingAmount / 100) * 127);
    // Place markers on all 8th note off-beats
    for (let i = 0.5; i < totalBeats; i += 1) {
      newNotes.push({
        id: `swing-${i}-${Date.now()}`,
        row: 'swing',
        time: i,
        duration: 0.25,
        velocity,
      });
    }
    setNotes(newNotes);
  }, [totalBeats, swingAmount]);

  // Fill all grid positions
  const handleFillAll = useCallback(() => {
    const newNotes: MidiNote[] = [];
    const velocity = Math.round((swingAmount / 100) * 127);
    for (let i = 0; i < totalBeats; i += quantize) {
      newNotes.push({
        id: `swing-${i}-${Date.now()}`,
        row: 'swing',
        time: i,
        duration: quantize,
        velocity,
      });
    }
    setNotes(newNotes);
  }, [totalBeats, quantize, swingAmount]);

  // Clear all
  const handleClear = useCallback(() => {
    setNotes([]);
  }, []);

  // Get swing feel description
  const getSwingDescription = (amount: number): string => {
    if (amount < 10) return 'Straight';
    if (amount < 40) return 'Light swing';
    if (amount < 60) return 'Medium swing';
    if (amount < 80) return 'Triplet feel';
    return 'Heavy swing';
  };

  return (
    <div className="flex flex-col h-full" data-editor-panel="swing">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-border">
        {/* Swing amount slider */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted">Swing:</span>
          <input
            type="range"
            min="0"
            max="100"
            value={swingAmount}
            onChange={(e) => handleSwingAmountChange(Number(e.target.value))}
            className="w-24 h-2 bg-border rounded-lg appearance-none cursor-pointer accent-pink-500"
          />
          <span className="text-xs text-foreground w-8">{swingAmount}%</span>
          <span className="text-xs text-muted">({getSwingDescription(swingAmount)})</span>
        </div>

        <div className="w-px h-4 bg-border" />

        {/* Quantize selector */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted">Grid:</span>
          <select
            value={swingEditorQuantize}
            onChange={(e) => setSwingEditorQuantize(e.target.value as QuantizeValue)}
            className="px-2 py-1 bg-background border border-border rounded text-sm text-foreground"
          >
            <option value="quarter">Beat</option>
            <option value="8th">1/8</option>
            <option value="16th">1/16</option>
          </select>
        </div>

        <button
          onClick={handleFillOffbeats}
          className="px-3 py-1.5 bg-pink-500/20 border border-pink-500/50 text-pink-300 rounded-lg text-sm font-medium hover:bg-pink-500/30 transition-colors"
        >
          Fill Off-beats
        </button>

        <button
          onClick={handleFillAll}
          className="px-3 py-1.5 bg-background border border-border text-foreground rounded-lg text-sm font-medium hover:bg-border transition-colors"
        >
          Fill All
        </button>

        <button
          onClick={handleClear}
          className="px-3 py-1.5 bg-background border border-border text-foreground rounded-lg text-sm font-medium hover:bg-border transition-colors"
        >
          Clear
        </button>

        <div className="flex-1" />

        <span className="text-xs text-muted">
          {notes.length} marker{notes.length === 1 ? '' : 's'} | Click + drag to draw
        </span>
      </div>

      {/* Midi editor with single row and larger row height */}
      <MidiEditor
        rows={SWING_ROWS}
        rowLabels={SWING_LABELS}
        rowColors={SWING_COLORS}
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
