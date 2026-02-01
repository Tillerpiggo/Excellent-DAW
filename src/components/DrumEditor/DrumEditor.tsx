'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Block, Track, Event } from '@/core/types';
import { useProjectStore } from '@/stores/projectStore';
import { useUIStore } from '@/stores/uiStore';
import { DrumNote } from './DrumNote';
import { generateId } from '@/utils/id';

interface DrumEditorProps {
  block: Block;
  track: Track;
  beatsPerBar: number;
}

type DrumType = 'kick' | 'snare' | 'hihat' | 'clap';
type QuantizeValue = '16th' | '8th' | 'quarter';

const DRUM_ORDER: DrumType[] = ['hihat', 'clap', 'snare', 'kick'];
const ROW_HEIGHT = 28;

const DRUM_LABELS: Record<DrumType, string> = {
  hihat: 'HiHat',
  clap: 'Clap',
  snare: 'Snare',
  kick: 'Kick',
};

const QUANTIZE_VALUES: Record<QuantizeValue, number> = {
  '16th': 0.25,
  '8th': 0.5,
  'quarter': 1,
};

interface DrumHit {
  id: string;
  drum: DrumType;
  time: number;
  duration: number;
  velocity: number;
}

function extractDrumsFromBlock(block: Block): DrumHit[] {
  const allEvents = block.streams?.flatMap(s => s.events) || [];
  const drumEvents = allEvents.filter(e => e.drum !== undefined);

  return drumEvents.map((event, index) => ({
    id: `${event.drum}-${event.time}-${index}`,
    drum: event.drum as DrumType,
    time: event.time,
    duration: event.duration ?? 0.25,
    velocity: event.velocity ?? 100,
  }));
}

function hitsToEvents(hits: DrumHit[]): Event[] {
  return hits.map(h => ({
    time: h.time,
    drum: h.drum,
    velocity: h.velocity,
    duration: h.duration,
  }));
}

export function DrumEditor({ block, track, beatsPerBar }: DrumEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { updateBlockDrums } = useProjectStore();
  const { drumEditorQuantize, setDrumEditorQuantize } = useUIStore();

  const [hits, setHits] = useState<DrumHit[]>(() => extractDrumsFromBlock(block));
  const [selectedHitId, setSelectedHitId] = useState<string | null>(null);

  // Drawing state for click-and-drag note creation
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawingHit, setDrawingHit] = useState<DrumHit | null>(null);
  const drawStartX = useRef(0);

  // Update hits when block ID changes (not on every block update)
  const blockId = block.id;
  useEffect(() => {
    setHits(extractDrumsFromBlock(block));
    setSelectedHitId(null);
  }, [blockId]); // eslint-disable-line react-hooks/exhaustive-deps

  const totalBeats = block.durationBars * beatsPerBar;
  const pixelsPerBeat = 40;
  const quantize = QUANTIZE_VALUES[drumEditorQuantize];

  // Update a hit
  const handleUpdateHit = useCallback((hitId: string, updates: { time?: number; duration?: number }) => {
    setHits(prev => prev.map(h =>
      h.id === hitId ? { ...h, ...updates } : h
    ));
  }, []);

  // Delete a hit
  const handleDeleteHit = useCallback((hitId: string) => {
    setHits(prev => prev.filter(h => h.id !== hitId));
    setSelectedHitId(null);
  }, []);

  // Start drawing a new note on mousedown
  const handleRowMouseDown = useCallback((drum: DrumType, e: React.MouseEvent) => {
    // Only handle left click on empty space
    if (e.button !== 0) return;

    // Don't start drawing if clicking on an existing note
    if ((e.target as HTMLElement).closest('[data-drum-note]')) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const rawTime = x / pixelsPerBeat;
    const time = Math.round(rawTime / quantize) * quantize;

    if (time >= 0 && time < totalBeats) {
      e.preventDefault();
      drawStartX.current = e.clientX;

      const newHit: DrumHit = {
        id: generateId(),
        drum,
        time,
        duration: quantize, // Start with minimum duration
        velocity: 100,
      };

      setDrawingHit(newHit);
      setIsDrawing(true);
      setSelectedHitId(newHit.id);
    }
  }, [pixelsPerBeat, quantize, totalBeats]);

  // Update drawing note duration on mouse move
  const handleDrawingMouseMove = useCallback((e: MouseEvent) => {
    if (!isDrawing || !drawingHit) return;

    const deltaX = e.clientX - drawStartX.current;
    const deltaDuration = deltaX / pixelsPerBeat;

    // Calculate new duration, snap to grid, minimum 1 grid unit
    let newDuration = Math.round((quantize + deltaDuration) / quantize) * quantize;
    newDuration = Math.max(quantize, Math.min(totalBeats - drawingHit.time, newDuration));

    if (newDuration !== drawingHit.duration) {
      setDrawingHit(prev => prev ? { ...prev, duration: newDuration } : null);
    }
  }, [isDrawing, drawingHit, pixelsPerBeat, quantize, totalBeats]);

  // Finish drawing on mouse up
  const handleDrawingMouseUp = useCallback(() => {
    if (isDrawing && drawingHit) {
      // Add the completed hit to the list
      setHits(prev => [...prev, drawingHit]);
    }
    setIsDrawing(false);
    setDrawingHit(null);
  }, [isDrawing, drawingHit]);

  // Add/remove drawing event listeners
  useEffect(() => {
    if (isDrawing) {
      document.addEventListener('mousemove', handleDrawingMouseMove);
      document.addEventListener('mouseup', handleDrawingMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleDrawingMouseMove);
        document.removeEventListener('mouseup', handleDrawingMouseUp);
      };
    }
  }, [isDrawing, handleDrawingMouseMove, handleDrawingMouseUp]);

  // Auto-save when hits change
  useEffect(() => {
    const timeout = setTimeout(() => {
      const events = hitsToEvents(hits);
      updateBlockDrums(track.id, block.id, events);
    }, 500);
    return () => clearTimeout(timeout);
  }, [hits, track.id, block.id, updateBlockDrums]);

  // Clear all
  const handleClear = useCallback(() => {
    setHits([]);
    setSelectedHitId(null);
  }, []);

  // Deselect on container click
  const handleContainerClick = useCallback(() => {
    setSelectedHitId(null);
  }, []);

  // Delete selected hit
  const handleDeleteSelected = useCallback(() => {
    if (selectedHitId) {
      handleDeleteHit(selectedHitId);
    }
  }, [selectedHitId, handleDeleteHit]);

  // Draw beat lines
  const beatLines = [];
  for (let beat = 0; beat <= totalBeats; beat += quantize) {
    const isBar = beat % beatsPerBar === 0;
    const isBeat = beat % 1 === 0;
    beatLines.push(
      <div
        key={beat}
        className={`absolute top-0 bottom-0 ${
          isBar ? 'bg-border' : isBeat ? 'bg-border/50' : 'bg-border/20'
        }`}
        style={{
          left: beat * pixelsPerBeat,
          width: isBar ? 2 : 1,
        }}
      />
    );
  }

  return (
    <div className="flex flex-col h-full">
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

        {selectedHitId && (
          <button
            onClick={handleDeleteSelected}
            className="px-3 py-1.5 bg-background border border-border text-red-500 rounded-lg text-sm font-medium hover:bg-red-500/10 transition-colors"
          >
            Delete
          </button>
        )}

        <button
          onClick={handleClear}
          className="px-3 py-1.5 bg-background border border-border text-foreground rounded-lg text-sm font-medium hover:bg-border transition-colors"
        >
          Clear All
        </button>

        <div className="flex-1" />

        <span className="text-xs text-muted">
          {hits.length} {hits.length === 1 ? 'hit' : 'hits'} | Click + drag to draw
        </span>
      </div>

      {/* Piano roll area */}
      <div
        ref={containerRef}
        className="flex-1 overflow-auto bg-background"
        onClick={handleContainerClick}
      >
        <div className="flex">
          {/* Labels column */}
          <div className="w-16 flex-shrink-0 bg-surface border-r border-border">
            {DRUM_ORDER.map(drum => (
              <div
                key={drum}
                className="flex items-center justify-end pr-2 text-xs font-medium text-muted border-b border-border/50"
                style={{ height: ROW_HEIGHT }}
              >
                {DRUM_LABELS[drum]}
              </div>
            ))}
          </div>

          {/* Grid area */}
          <div
            className="relative"
            style={{ width: totalBeats * pixelsPerBeat + 20 }}
          >
            {/* Beat lines */}
            {beatLines}

            {/* Drum rows */}
            {DRUM_ORDER.map((drum) => {
              const rowHits = hits.filter(h => h.drum === drum);
              const isDrawingThisRow = drawingHit?.drum === drum;
              return (
                <div
                  key={drum}
                  className="relative border-b border-border/50 hover:bg-white/5"
                  style={{ height: ROW_HEIGHT }}
                  onMouseDown={(e) => handleRowMouseDown(drum, e)}
                >
                  {rowHits.map(hit => (
                    <DrumNote
                      key={hit.id}
                      id={hit.id}
                      drum={hit.drum}
                      time={hit.time}
                      duration={hit.duration}
                      pixelsPerBeat={pixelsPerBeat}
                      isSelected={selectedHitId === hit.id}
                      onSelect={() => setSelectedHitId(hit.id)}
                      onUpdate={(updates) => handleUpdateHit(hit.id, updates)}
                      onDelete={() => handleDeleteHit(hit.id)}
                      minTime={0}
                      maxTime={totalBeats}
                    />
                  ))}
                  {/* Drawing preview */}
                  {isDrawingThisRow && drawingHit && (
                    <DrumNote
                      key="drawing"
                      id={drawingHit.id}
                      drum={drawingHit.drum}
                      time={drawingHit.time}
                      duration={drawingHit.duration}
                      pixelsPerBeat={pixelsPerBeat}
                      isSelected={true}
                      onSelect={() => {}}
                      onUpdate={() => {}}
                      onDelete={() => {}}
                      minTime={0}
                      maxTime={totalBeats}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
