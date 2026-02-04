'use client';

import { useEffect, useMemo } from 'react';
import { useUIStore } from '@/stores/uiStore';
import { useProjectStore } from '@/stores/projectStore';
import { ChordEditor } from './ChordEditor';
import { PresetSelector } from '@/components/shared/PresetSelector';
import { Preset } from '@/core/types';
import { getPresetsByCategory } from '@/core/presets';
import { CATEGORY_COLORS } from '@/utils/colors';

export function ChordEditorPanel() {
  const { selectedBlockIds, selectedTrackId, showChordEditor, setShowChordEditor } = useUIStore();
  const { project, updateBlock } = useProjectStore();

  // Only show editor when exactly 1 block is selected
  const selectedBlockId = selectedBlockIds.size === 1 ? Array.from(selectedBlockIds)[0] : null;

  // Get the selected track and block
  const selectedTrack = selectedTrackId ? project.tracks[selectedTrackId] : null;
  const selectedBlock = selectedTrack?.blocks.find(b => b.id === selectedBlockId);

  // Check if track uses a pitched instrument (not drums)
  const isPitchedInstrument = useMemo(() => {
    if (!selectedTrack?.instrumentId) return false;
    return ['synth', 'keys', 'pad', 'bass'].includes(selectedTrack.instrumentId);
  }, [selectedTrack?.instrumentId]);

  // Check if the selected block has pitched events (for fallback detection)
  const hasPitchedEvents = useMemo(() => {
    if (!selectedBlock) return false;
    const allEvents = selectedBlock.streams?.flatMap(s => s.events) || [];
    return allEvents.some(e => e.pitch !== undefined);
  }, [selectedBlock]);

  // Don't show chord editor for rhythm tracks (they're timing modifiers, not chord sources)
  const isRhythmTrack = selectedTrack?.typeId === 'rhythm';

  // Don't show chord editor for arp tracks (they have their own editor)
  const isArpTrack = selectedTrack?.patternCategory === 'arp';

  // Don't show chord editor for transpose tracks (they have their own editor)
  const isTransposeTrack = selectedTrack?.typeId === 'transpose';

  // Show chord editor if track has a pitched instrument OR has pitched events (and isn't a special type)
  const shouldShowChordEditor = useMemo(() => {
    if (!selectedBlock) return false;
    if (isRhythmTrack || isArpTrack || isTransposeTrack) return false;
    // Show if track has pitched instrument, OR if block has pitched events (for tracks without instrument set)
    return isPitchedInstrument || hasPitchedEvents;
  }, [selectedBlock, isPitchedInstrument, hasPitchedEvents, isRhythmTrack, isArpTrack, isTransposeTrack]);

  // Auto-show/hide chord editor based on selection
  useEffect(() => {
    if (shouldShowChordEditor) {
      setShowChordEditor(true);
    } else {
      setShowChordEditor(false);
    }
  }, [shouldShowChordEditor, setShowChordEditor]);

  // Handle applying a preset to the selected block
  const handleApplyPreset = (preset: Preset) => {
    if (!selectedTrackId || !selectedBlockId) return;

    updateBlock(selectedTrackId, selectedBlockId, {
      streams: [{ events: [...preset.events] }],
      durationBars: preset.durationBars,
    });
  };

  // Don't render if conditions aren't met
  if (!showChordEditor || !selectedTrack || !selectedBlock) {
    return null;
  }

  return (
    <div className="h-full border-t border-border bg-surface flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-surface">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">Chord Editor</span>
          <span className="text-xs text-muted">- {selectedTrack.name}</span>
        </div>
        <button
          onClick={() => setShowChordEditor(false)}
          className="text-muted hover:text-foreground transition-colors p-1"
          title="Close chord editor"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Preset Selector */}
      <div className="py-2 border-b border-border/50 bg-surface/50">
        <PresetSelector presets={getPresetsByCategory('chords')} onSelectPreset={handleApplyPreset} color={CATEGORY_COLORS.chords} />
      </div>

      {/* Editor content */}
      <div className="flex-1 overflow-hidden">
        <ChordEditor
          block={selectedBlock}
          track={selectedTrack}
          beatsPerBar={project.beatsPerBar}
        />
      </div>
    </div>
  );
}
