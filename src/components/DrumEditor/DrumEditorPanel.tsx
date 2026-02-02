'use client';

import { useEffect, useMemo } from 'react';
import { useUIStore } from '@/stores/uiStore';
import { useProjectStore } from '@/stores/projectStore';
import { DrumEditor } from './DrumEditor';
import { PresetSelector } from '@/components/shared/PresetSelector';
import { PatternPreset } from '@/core/types';

export function DrumEditorPanel() {
  const { selectedBlockIds, selectedTrackId, showDrumEditor, setShowDrumEditor } = useUIStore();
  const { project, updateBlock } = useProjectStore();

  // Only show editor when exactly 1 block is selected
  const selectedBlockId = selectedBlockIds.size === 1 ? Array.from(selectedBlockIds)[0] : null;

  // Get the selected track and block
  const selectedTrack = selectedTrackId ? project.tracks[selectedTrackId] : null;
  const selectedBlock = selectedTrack?.blocks.find(b => b.id === selectedBlockId);

  // Check if the selected block has drum events (actual drum sounds, not rhythm triggers)
  const hasDrumEvents = useMemo(() => {
    if (!selectedBlock || !selectedTrack) return false;

    // Rhythm track type is a modifier that re-triggers parent notes at timing points
    // It uses pitch events for timing, NOT drum events - don't show drum editor for it
    if (selectedTrack.typeId === 'rhythm') return false;

    // Check for actual drum events in the block
    const allEvents = selectedBlock.streams?.flatMap(s => s.events) || [];
    return allEvents.some(e => e.drum !== undefined);
  }, [selectedBlock, selectedTrack]);

  // Check if block has pitched events (for priority logic)
  const hasPitchedEvents = useMemo(() => {
    if (!selectedBlock) return false;
    const allEvents = selectedBlock.streams?.flatMap(s => s.events) || [];
    return allEvents.some(e => e.pitch !== undefined);
  }, [selectedBlock]);

  // Determine if we should show drum editor based on priority logic
  // - Rhythm tracks: NO drum editor (they use pitch events for timing, not drum sounds)
  // - Non-rhythm tracks with mixed events: ChordEditor takes priority (handled by ChordEditorPanel)
  // - Non-rhythm tracks with only drum events: Show drum editor
  const shouldShowDrumEditor = useMemo(() => {
    if (!selectedTrack || !hasDrumEvents) return false;

    // For tracks with drum events, only show drum editor if no pitched events
    return !hasPitchedEvents;
  }, [selectedTrack, hasDrumEvents, hasPitchedEvents]);

  // Auto-show/hide drum editor based on selection
  useEffect(() => {
    if (selectedBlock && shouldShowDrumEditor) {
      setShowDrumEditor(true);
    } else {
      setShowDrumEditor(false);
    }
  }, [selectedBlock, shouldShowDrumEditor, setShowDrumEditor]);

  // Handle applying a preset to the selected block
  const handleApplyPreset = (preset: PatternPreset) => {
    if (!selectedTrackId || !selectedBlockId) return;

    updateBlock(selectedTrackId, selectedBlockId, {
      streams: [{ events: [...preset.events] }],
      durationBars: preset.durationBars,
    });
  };

  // Determine which category to use for presets
  // Use 'drums' for drum instrument tracks, 'rhythm' for rhythm type tracks
  const presetCategory = selectedTrack?.typeId === 'rhythm' ? 'rhythm' : 'drums';

  // Don't render if conditions aren't met
  if (!showDrumEditor || !selectedTrack || !selectedBlock) {
    return null;
  }

  return (
    <div className="h-full border-t border-border bg-surface flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-surface">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">Drum Editor</span>
          <span className="text-xs text-muted">- {selectedTrack.name}</span>
        </div>
        <button
          onClick={() => setShowDrumEditor(false)}
          className="text-muted hover:text-foreground transition-colors p-1"
          title="Close drum editor"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Preset Selector */}
      <div className="py-2 border-b border-border/50 bg-surface/50">
        <PresetSelector category={presetCategory} onSelectPreset={handleApplyPreset} />
      </div>

      {/* Editor content */}
      <div className="flex-1 overflow-hidden">
        <DrumEditor
          block={selectedBlock}
          track={selectedTrack}
          beatsPerBar={project.beatsPerBar}
        />
      </div>
    </div>
  );
}
