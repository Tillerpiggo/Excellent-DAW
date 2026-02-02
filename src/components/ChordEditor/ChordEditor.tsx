'use client';

import { useRef, useState, useCallback, useEffect } from 'react';
import { Block, Track } from '@/core/types';
import { ChordData, ChordQuality, ChordVoicing, ChordInversion, extractChordsFromBlock } from '@/core/harmony';
import { useProjectStore } from '@/stores/projectStore';
import { ChordBlock } from './ChordBlock';
import { CircleOfFifths } from './CircleOfFifths';
import { generateId } from '@/utils/id';

interface ChordEditorProps {
  block: Block;
  track: Track;
  beatsPerBar: number;
}

interface MarqueeState {
  isActive: boolean;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

export function ChordEditor({ block, track, beatsPerBar }: ChordEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const { updateBlockChords } = useProjectStore();

  // Extract chords from block or use local state
  const [chords, setChords] = useState<ChordData[]>(() =>
    extractChordsFromBlock(block, beatsPerBar)
  );
  const [selectedChordIds, setSelectedChordIds] = useState<Set<string>>(new Set());

  // Marquee selection state
  const [marquee, setMarquee] = useState<MarqueeState | null>(null);

  // Update chords when block changes
  useEffect(() => {
    setChords(extractChordsFromBlock(block, beatsPerBar));
  }, [block, beatsPerBar]);

  // Calculate total beats in the block
  const totalBeats = block.durationBars * beatsPerBar;
  const pixelsPerBeat = 40; // Larger scale for the chord editor

  // Get first selected chord for Circle of Fifths
  const selectedChordId = selectedChordIds.size === 1 ? Array.from(selectedChordIds)[0] : null;
  const selectedChordIndex = selectedChordId ? chords.findIndex(c => c.id === selectedChordId) : -1;
  const selectedChord = selectedChordIndex >= 0 ? chords[selectedChordIndex] : null;

  // Select a chord (with shift-click support)
  const handleSelectChord = useCallback((chordId: string, addToSelection: boolean) => {
    setSelectedChordIds(prev => {
      if (addToSelection) {
        const newSet = new Set(prev);
        if (newSet.has(chordId)) {
          newSet.delete(chordId);
        } else {
          newSet.add(chordId);
        }
        return newSet;
      }
      return new Set([chordId]);
    });
  }, []);

  // Clear selection
  const clearSelection = useCallback(() => {
    setSelectedChordIds(new Set());
  }, []);

  // Update a chord
  const handleUpdateChord = useCallback((chordId: string, updates: Partial<ChordData>) => {
    setChords(prev => prev.map(c => c.id === chordId ? { ...c, ...updates } : c));
  }, []);

  // Update multiple selected chords (for dragging)
  const handleUpdateSelectedChords = useCallback((deltaBeats: number) => {
    if (selectedChordIds.size === 0) return;

    setChords(prev => prev.map(chord => {
      if (selectedChordIds.has(chord.id)) {
        const newStartBeat = Math.max(0, Math.min(totalBeats - chord.durationBeats, chord.startBeat + deltaBeats));
        return { ...chord, startBeat: newStartBeat };
      }
      return chord;
    }));
  }, [selectedChordIds, totalBeats]);

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

  // Handle circle of fifths selection
  const handleCircleSelect = useCallback((root: number, quality: ChordQuality) => {
    if (selectedChordId) {
      handleUpdateChord(selectedChordId, { root, quality });
    }
  }, [selectedChordId, handleUpdateChord]);

  // Handle octave change
  const handleOctaveChange = useCallback((octave: number) => {
    if (selectedChordId) {
      handleUpdateChord(selectedChordId, { octave });
    }
  }, [selectedChordId, handleUpdateChord]);

  // Handle voicing change
  const handleVoicingChange = useCallback((voicing: ChordVoicing) => {
    if (selectedChordId) {
      handleUpdateChord(selectedChordId, { voicing });
    }
  }, [selectedChordId, handleUpdateChord]);

  // Handle inversion change
  const handleInversionChange = useCallback((inversion: ChordInversion) => {
    if (selectedChordId) {
      handleUpdateChord(selectedChordId, { inversion });
    }
  }, [selectedChordId, handleUpdateChord]);

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
    setSelectedChordIds(new Set([newChord.id]));
  }, [chords, totalBeats, beatsPerBar]);

  // Delete selected chords
  const handleDeleteChords = useCallback(() => {
    if (selectedChordIds.size === 0) return;

    setChords(prev => prev.filter(c => !selectedChordIds.has(c.id)));
    setSelectedChordIds(new Set());
  }, [selectedChordIds]);

  // Get chords in marquee
  const getChordsInMarquee = useCallback(() => {
    if (!marquee || !timelineRef.current) return [];

    const { startX, startY, currentX, currentY } = marquee;
    const minX = Math.min(startX, currentX);
    const maxX = Math.max(startX, currentX);
    const minY = Math.min(startY, currentY);
    const maxY = Math.max(startY, currentY);

    const matchingIds: string[] = [];
    const chordAreaTop = 24; // Bar numbers height
    const chordAreaHeight = 100; // Approximate chord area height

    chords.forEach(chord => {
      const chordLeft = chord.startBeat * pixelsPerBeat;
      const chordRight = chordLeft + chord.durationBeats * pixelsPerBeat;
      const chordTop = chordAreaTop + 8; // top-2 padding
      const chordBottom = chordAreaTop + chordAreaHeight - 8; // bottom-2 padding

      // Check intersection
      if (maxX >= chordLeft && minX <= chordRight && maxY >= chordTop && minY <= chordBottom) {
        matchingIds.push(chord.id);
      }
    });

    return matchingIds;
  }, [marquee, chords, pixelsPerBeat]);

  // Handle marquee start
  const handleTimelineMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;

    // Don't start marquee if clicking on a chord
    const target = e.target as HTMLElement;
    if (target.closest('[data-chord-block]')) return;

    e.preventDefault();

    const rect = timelineRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (!e.shiftKey) {
      clearSelection();
    }

    setMarquee({
      isActive: true,
      startX: x,
      startY: y,
      currentX: x,
      currentY: y,
    });
  }, [clearSelection]);

  // Handle marquee move
  const handleMarqueeMouseMove = useCallback((e: MouseEvent) => {
    if (!marquee?.isActive) return;

    const rect = timelineRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setMarquee(prev => prev ? { ...prev, currentX: x, currentY: y } : null);
  }, [marquee?.isActive]);

  // Handle marquee end
  const handleMarqueeMouseUp = useCallback(() => {
    if (!marquee?.isActive) return;

    const chordIds = getChordsInMarquee();
    if (chordIds.length > 0) {
      setSelectedChordIds(new Set(chordIds));
    }

    setMarquee(null);
  }, [marquee?.isActive, getChordsInMarquee]);

  // Marquee event listeners
  useEffect(() => {
    if (marquee?.isActive) {
      document.addEventListener('mousemove', handleMarqueeMouseMove);
      document.addEventListener('mouseup', handleMarqueeMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMarqueeMouseMove);
        document.removeEventListener('mouseup', handleMarqueeMouseUp);
      };
    }
  }, [marquee?.isActive, handleMarqueeMouseMove, handleMarqueeMouseUp]);

  // Handle keyboard events for the chord editor
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check if the event target is within our editor
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      if (selectedChordIds.size > 0 && (e.code === 'Delete' || e.code === 'Backspace')) {
        e.preventDefault();
        e.stopPropagation();
        handleDeleteChords();
      } else if (e.key === 'Escape') {
        clearSelection();
      }
    };

    // Use capture phase to intercept before global handler
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [selectedChordIds, handleDeleteChords, clearSelection]);

  // Handle click on empty area to deselect
  const handleContainerClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      clearSelection();
    }
  }, [clearSelection]);

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

  // Calculate marquee rectangle
  const marqueeRect = marquee ? {
    left: Math.min(marquee.startX, marquee.currentX),
    top: Math.min(marquee.startY, marquee.currentY),
    width: Math.abs(marquee.currentX - marquee.startX),
    height: Math.abs(marquee.currentY - marquee.startY),
  } : null;

  return (
    <div className="flex h-full" data-editor-panel="chord">
      {/* Main content - Timeline */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Toolbar */}
        <div className="flex items-center gap-2 px-4 py-2 border-b border-border">
          <button
            onClick={handleAddChord}
            className="px-3 py-1.5 bg-coral text-white rounded-lg text-sm font-medium hover:bg-coral/90 transition-colors"
          >
            + Add Chord
          </button>
          {selectedChordIds.size > 0 && (
            <button
              onClick={handleDeleteChords}
              className="px-3 py-1.5 bg-background border border-border text-red-500 rounded-lg text-sm font-medium hover:bg-red-500/10 transition-colors"
            >
              Delete{selectedChordIds.size > 1 ? ` (${selectedChordIds.size})` : ''}
            </button>
          )}
          <div className="flex-1" />
          <span className="text-xs text-muted">
            {chords.length} {chords.length === 1 ? 'chord' : 'chords'} | {totalBeats} beats
            {selectedChordIds.size > 1 && ` | ${selectedChordIds.size} selected`}
          </span>
        </div>

        {/* Timeline area */}
        <div
          ref={containerRef}
          className={`flex-1 relative overflow-x-auto overflow-y-hidden bg-background ${marquee?.isActive ? 'select-none' : ''}`}
          onClick={handleContainerClick}
        >
          <div
            ref={timelineRef}
            className="relative h-full min-h-[100px]"
            style={{ width: totalBeats * pixelsPerBeat + 20 }}
            onMouseDown={handleTimelineMouseDown}
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
              {chords.map((chord) => (
                <ChordBlock
                  key={chord.id}
                  chord={chord}
                  pixelsPerBeat={pixelsPerBeat}
                  isSelected={selectedChordIds.has(chord.id)}
                  onSelect={(addToSelection) => handleSelectChord(chord.id, addToSelection)}
                  onUpdate={(updates) => handleUpdateChord(chord.id, updates)}
                  onDoubleClick={() => handleSelectChord(chord.id, false)}
                  containerRef={containerRef}
                  minBeat={0}
                  maxBeat={totalBeats}
                  instrumentId={track.instrumentId ?? 'pad'}
                  selectedCount={selectedChordIds.size}
                  onUpdateSelected={handleUpdateSelectedChords}
                />
              ))}
            </div>

            {/* Marquee selection box */}
            {marquee?.isActive && marqueeRect && marqueeRect.width > 2 && marqueeRect.height > 2 && (
              <div
                className="absolute pointer-events-none z-50"
                style={{
                  left: marqueeRect.left,
                  top: marqueeRect.top,
                  width: marqueeRect.width,
                  height: marqueeRect.height,
                  backgroundColor: 'rgba(59, 130, 246, 0.15)',
                  border: '1px solid rgba(59, 130, 246, 0.6)',
                  borderRadius: 2,
                }}
              />
            )}
          </div>
        </div>
      </div>

      {/* Side panel - Circle of Fifths */}
      {selectedChord && (
        <div className="w-64 flex-shrink-0">
          <CircleOfFifths
            currentRoot={selectedChord.root}
            currentQuality={selectedChord.quality}
            octave={selectedChord.octave}
            voicing={selectedChord.voicing ?? 'close'}
            inversion={selectedChord.inversion ?? 0}
            instrumentId={track.instrumentId ?? 'pad'}
            onSelect={handleCircleSelect}
            onOctaveChange={handleOctaveChange}
            onVoicingChange={handleVoicingChange}
            onInversionChange={handleInversionChange}
          />
        </div>
      )}
    </div>
  );
}
