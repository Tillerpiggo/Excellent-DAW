'use client';

import { useEffect, useMemo } from 'react';
import { useUIStore } from '@/stores/uiStore';
import { useProjectStore } from '@/stores/projectStore';
import { ChordEditor } from './ChordEditor';
import { PresetSelector } from '@/components/shared/PresetSelector';
import { PatternPreset } from '@/core/types';

export function ChordEditorPanel() {
  const { selectedBlockId, selectedTrackId, showChordEditor, setShowChordEditor } = useUIStore();
  const { project, updateBlock } = useProjectStore();

  // Get the selected track and block
  const selectedTrack = selectedTrackId ? project.tracks[selectedTrackId] : null;
  const selectedBlock = selectedTrack?.blocks.find(b => b.id === selectedBlockId);

  // Check if the selected block has pitched events (chords)
  const hasPitchedEvents = useMemo(() => {
    if (!selectedBlock) return false;
    const allEvents = selectedBlock.streams?.flatMap(s => s.events) || [];
    return allEvents.some(e => e.pitch !== undefined);
  }, [selectedBlock]);

  // Don't show chord editor for rhythm tracks (they're timing modifiers, not chord sources)
  const isRhythmTrack = selectedTrack?.typeId === 'rhythm';

  // Auto-show/hide chord editor based on selection
  useEffect(() => {
    if (selectedBlock && hasPitchedEvents && !isRhythmTrack) {
      setShowChordEditor(true);
    } else {
      setShowChordEditor(false);
    }
  }, [selectedBlock, hasPitchedEvents, isRhythmTrack, setShowChordEditor]);

  // Handle applying a preset to the selected block
  const handleApplyPreset = (preset: PatternPreset) => {
    if (!selectedTrackId || !selectedBlockId) return;

    updateBlock(selectedTrackId, selectedBlockId, {
      streams: [{ events: [...preset.events] }],
      durationBars: preset.durationBars,
    });
  };

  // Don't render if no chord block selected or if it's a rhythm track
  if (!showChordEditor || !selectedTrack || !selectedBlock || !hasPitchedEvents || isRhythmTrack) {
    return null;
  }

  return (
    <div className="h-48 border-t border-border bg-surface flex flex-col">
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
        <PresetSelector category="chords" onSelectPreset={handleApplyPreset} />
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
