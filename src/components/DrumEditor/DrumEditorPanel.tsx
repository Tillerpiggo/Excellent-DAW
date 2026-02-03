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

  // Check if track uses drums instrument
  const isDrumInstrument = selectedTrack?.instrumentId === 'drums';

  // Check if the selected block has drum events (for fallback detection)
  const hasDrumEvents = useMemo(() => {
    if (!selectedBlock || !selectedTrack) return false;
    if (selectedTrack.typeId === 'rhythm') return false;
    const allEvents = selectedBlock.streams?.flatMap(s => s.events) || [];
    return allEvents.some(e => e.drum !== undefined);
  }, [selectedBlock, selectedTrack]);

  // Check if track uses a pitched instrument (takes priority over drums)
  const isPitchedInstrument = useMemo(() => {
    if (!selectedTrack?.instrumentId) return false;
    return ['synth', 'keys', 'pad', 'bass'].includes(selectedTrack.instrumentId);
  }, [selectedTrack?.instrumentId]);

  // Check if block has pitched events (for priority logic when no instrument set)
  const hasPitchedEvents = useMemo(() => {
    if (!selectedBlock) return false;
    const allEvents = selectedBlock.streams?.flatMap(s => s.events) || [];
    return allEvents.some(e => e.pitch !== undefined);
  }, [selectedBlock]);

  // Determine if we should show drum editor
  // - Show if track has drums instrument (regardless of events)
  // - Show if block has drum events AND track doesn't have a pitched instrument
  // - Don't show for rhythm tracks (they use pitch events for timing)
  const shouldShowDrumEditor = useMemo(() => {
    if (!selectedBlock || !selectedTrack) return false;
    if (selectedTrack.typeId === 'rhythm') return false;

    // If track has drums instrument, always show drum editor
    if (isDrumInstrument) return true;

    // If track has pitched instrument, chord editor takes priority
    if (isPitchedInstrument) return false;

    // Fallback: show if block has drum events and no pitched events
    return hasDrumEvents && !hasPitchedEvents;
  }, [selectedBlock, selectedTrack, isDrumInstrument, isPitchedInstrument, hasDrumEvents, hasPitchedEvents]);

  // Auto-show/hide drum editor based on selection
  useEffect(() => {
    if (shouldShowDrumEditor) {
      setShowDrumEditor(true);
    } else {
      setShowDrumEditor(false);
    }
  }, [shouldShowDrumEditor, setShowDrumEditor]);

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
