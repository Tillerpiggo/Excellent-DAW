'use client';

import { useEffect, useMemo } from 'react';
import { useUIStore } from '@/stores/uiStore';
import { useProjectStore } from '@/stores/projectStore';
import { RhythmEditor } from './RhythmEditor';
import { PresetSelector } from '@/components/shared/PresetSelector';
import { PatternPreset } from '@/core/types';

export function RhythmEditorPanel() {
  const { selectedBlockIds, selectedTrackId, showRhythmEditor, setShowRhythmEditor } = useUIStore();
  const { project, updateBlock } = useProjectStore();

  // Only show editor when exactly 1 block is selected
  const selectedBlockId = selectedBlockIds.size === 1 ? Array.from(selectedBlockIds)[0] : null;

  // Get the selected track and block
  const selectedTrack = selectedTrackId ? project.tracks[selectedTrackId] : null;
  const selectedBlock = selectedTrack?.blocks.find(b => b.id === selectedBlockId);

  // Check if this is a rhythm track
  const isRhythmTrack = selectedTrack?.typeId === 'rhythm';

  // Determine if we should show rhythm editor
  const shouldShowRhythmEditor = useMemo(() => {
    return selectedTrack && selectedBlock && isRhythmTrack;
  }, [selectedTrack, selectedBlock, isRhythmTrack]);

  // Auto-show/hide rhythm editor based on selection
  useEffect(() => {
    if (shouldShowRhythmEditor) {
      setShowRhythmEditor(true);
    } else {
      setShowRhythmEditor(false);
    }
  }, [shouldShowRhythmEditor, setShowRhythmEditor]);

  // Handle applying a preset to the selected block
  const handleApplyPreset = (preset: PatternPreset) => {
    if (!selectedTrackId || !selectedBlockId) return;

    updateBlock(selectedTrackId, selectedBlockId, {
      streams: [{ events: [...preset.events] }],
      durationBars: preset.durationBars,
    });
  };

  // Don't render if conditions aren't met
  if (!showRhythmEditor || !selectedTrack || !selectedBlock) {
    return null;
  }

  return (
    <div className="h-full border-t border-border bg-surface flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-surface">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">Rhythm Editor</span>
          <span className="text-xs text-muted">- {selectedTrack.name}</span>
        </div>
        <button
          onClick={() => setShowRhythmEditor(false)}
          className="text-muted hover:text-foreground transition-colors p-1"
          title="Close rhythm editor"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Preset Selector */}
      <div className="py-2 border-b border-border/50 bg-surface/50">
        <PresetSelector category="rhythm" onSelectPreset={handleApplyPreset} />
      </div>

      {/* Editor content */}
      <div className="flex-1 overflow-hidden">
        <RhythmEditor
          block={selectedBlock}
          track={selectedTrack}
          beatsPerBar={project.beatsPerBar}
        />
      </div>
    </div>
  );
}
