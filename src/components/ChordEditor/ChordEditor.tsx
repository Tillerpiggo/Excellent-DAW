'use client';

import { useRef, useState, useCallback, useEffect } from 'react';
import { Block, Track } from '@/core/types';
import { ChordData, ChordQuality, extractChordsFromBlock, generateChordPitches } from '@/core/harmony';
import { useProjectStore } from '@/stores/projectStore';
import { useUIStore } from '@/stores/uiStore';
import { ChordBlock } from './ChordBlock';
import { ChordPicker } from './ChordPicker';
import { generateId } from '@/utils/id';

interface ChordEditorProps {
  block: Block;
  track: Track;
  beatsPerBar: number;
}

export function ChordEditor({ block, track, beatsPerBar }: ChordEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { updateBlockChords } = useProjectStore();
  const { chordPickerOpen, chordPickerTargetIndex, openChordPicker, closeChordPicker } = useUIStore();

  // Extract chords from block or use local state
  const [chords, setChords] = useState<ChordData[]>(() =>
    extractChordsFromBlock(block, beatsPerBar)
  );
  const [selectedChordIndex, setSelectedChordIndex] = useState<number | null>(null);

  // Update chords when block changes
  useEffect(() => {
    setChords(extractChordsFromBlock(block, beatsPerBar));
  }, [block, beatsPerBar]);

  // Calculate total beats in the block
  const totalBeats = block.durationBars * beatsPerBar;
  const pixelsPerBeat = 40; // Larger scale for the chord editor

  // Update a chord
  const handleUpdateChord = useCallback((index: number, updates: Partial<ChordData>) => {
    setChords(prev => {
      const newChords = [...prev];
      newChords[index] = { ...newChords[index], ...updates };
      return newChords;
    });
  }, []);

  // Save changes to the block
  const handleSaveChords = useCallback(() => {
    updateBlockChords(track.id, block.id, chords);
  }, [track.id, block.id, chords, updateBlockChords]);

  // Auto-save when chords change
  useEffect(() => {
    const timeout = setTimeout(() => {
      handleSaveChords();
    }, 500);
    return () => clearTimeout(timeout);
  }, [chords, handleSaveChords]);

  // Handle chord picker selection
  const handleChordPickerSelect = useCallback((root: number, quality: ChordQuality) => {
    if (chordPickerTargetIndex !== null) {
      handleUpdateChord(chordPickerTargetIndex, { root, quality });
    }
  }, [chordPickerTargetIndex, handleUpdateChord]);

  // Add a new chord
  const handleAddChord = useCallback(() => {
    // Find the end of the last chord or start at 0
    const lastChord = chords[chords.length - 1];
    const startBeat = lastChord
      ? lastChord.startBeat + lastChord.durationBeats
      : 0;

    if (startBeat >= totalBeats) return; // No room for more chords

    const newChord: ChordData = {
      id: generateId(),
      root: 0, // C
      quality: 'major',
      startBeat,
      durationBeats: Math.min(beatsPerBar, totalBeats - startBeat),
      octave: 4,
    };

    setChords(prev => [...prev, newChord]);
    setSelectedChordIndex(chords.length);
  }, [chords, totalBeats, beatsPerBar]);

  // Delete selected chord
  const handleDeleteChord = useCallback(() => {
    if (selectedChordIndex === null) return;

    setChords(prev => prev.filter((_, i) => i !== selectedChordIndex));
    setSelectedChordIndex(null);
  }, [selectedChordIndex]);

  // Handle click on empty area to deselect
  const handleContainerClick = useCallback(() => {
    setSelectedChordIndex(null);
  }, []);

  // Draw beat lines
  const beatLines = [];
  for (let beat = 0; beat <= totalBeats; beat++) {
    const isBar = beat % beatsPerBar === 0;
    beatLines.push(
      <div
        key={beat}
        className={`absolute top-0 bottom-0 ${isBar ? 'bg-border' : 'bg-border/30'}`}
        style={{
          left: beat * pixelsPerBeat,
          width: isBar ? 2 : 1,
        }}
      />
    );
  }

  const selectedChord = selectedChordIndex !== null ? chords[selectedChordIndex] : null;

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border">
        <button
          onClick={handleAddChord}
          className="px-3 py-1.5 bg-coral text-white rounded-lg text-sm font-medium hover:bg-coral/90 transition-colors"
        >
          + Add Chord
        </button>
        {selectedChordIndex !== null && (
          <>
            <button
              onClick={() => openChordPicker(selectedChordIndex)}
              className="px-3 py-1.5 bg-background border border-border text-foreground rounded-lg text-sm font-medium hover:bg-border transition-colors"
            >
              Edit Chord
            </button>
            <button
              onClick={handleDeleteChord}
              className="px-3 py-1.5 bg-background border border-border text-red-500 rounded-lg text-sm font-medium hover:bg-red-500/10 transition-colors"
            >
              Delete
            </button>
          </>
        )}
        <div className="flex-1" />
        <span className="text-xs text-muted">
          {chords.length} {chords.length === 1 ? 'chord' : 'chords'} | {totalBeats} beats
        </span>
      </div>

      {/* Timeline area */}
      <div
        ref={containerRef}
        className="flex-1 relative overflow-x-auto overflow-y-hidden bg-background"
        onClick={handleContainerClick}
      >
        <div
          className="relative h-full min-h-[100px]"
          style={{ width: totalBeats * pixelsPerBeat + 20 }}
        >
          {/* Beat lines */}
          {beatLines}

          {/* Bar numbers */}
          <div className="absolute top-0 left-0 right-0 h-6 flex">
            {Array.from({ length: block.durationBars }).map((_, barIndex) => (
              <div
                key={barIndex}
                className="text-xs text-muted flex items-center justify-start pl-1"
                style={{ width: beatsPerBar * pixelsPerBeat }}
              >
                {barIndex + 1}
              </div>
            ))}
          </div>

          {/* Chord blocks */}
          <div className="absolute top-6 bottom-0 left-0 right-0">
            {chords.map((chord, index) => (
              <ChordBlock
                key={chord.id}
                chord={chord}
                pixelsPerBeat={pixelsPerBeat}
                isSelected={selectedChordIndex === index}
                onSelect={() => setSelectedChordIndex(index)}
                onUpdate={(updates) => handleUpdateChord(index, updates)}
                onDoubleClick={() => openChordPicker(index)}
                containerRef={containerRef}
                minBeat={0}
                maxBeat={totalBeats}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Chord picker modal */}
      <ChordPicker
        isOpen={chordPickerOpen && chordPickerTargetIndex !== null}
        currentRoot={selectedChord?.root ?? 0}
        currentQuality={selectedChord?.quality ?? 'major'}
        onSelect={handleChordPickerSelect}
        onClose={closeChordPicker}
      />
    </div>
  );
}
