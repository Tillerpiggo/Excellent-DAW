'use client';

import { useEffect, useMemo } from 'react';
import { useUIStore } from '@/stores/uiStore';
import { useProjectStore } from '@/stores/projectStore';
import { SwingEditor } from './SwingEditor';
import { PresetSelector } from '@/components/shared/PresetSelector';
import { Preset } from '@/core/types';
import { getPresetsByCategory } from '@/core/presets';
import { CATEGORY_COLORS } from '@/utils/colors';

export function SwingEditorPanel() {
  const { selectedBlockIds, selectedTrackId, showSwingEditor, setShowSwingEditor } = useUIStore();
  const { project, updateBlock } = useProjectStore();

  // Only show editor when exactly 1 block is selected
  const selectedBlockId = selectedBlockIds.size === 1 ? Array.from(selectedBlockIds)[0] : null;

  // Get the selected track and block
  const selectedTrack = selectedTrackId ? project.tracks[selectedTrackId] : null;
  const selectedBlock = selectedTrack?.blocks.find(b => b.id === selectedBlockId);

  // Check if this is a swing track
  const isSwingTrack = selectedTrack?.typeId === 'swing';

  // Determine if we should show swing editor
  const shouldShowSwingEditor = useMemo(() => {
    return selectedTrack && selectedBlock && isSwingTrack;
  }, [selectedTrack, selectedBlock, isSwingTrack]);

  // Auto-show/hide swing editor based on selection
  useEffect(() => {
    if (shouldShowSwingEditor) {
      setShowSwingEditor(true);
    } else {
      setShowSwingEditor(false);
    }
  }, [shouldShowSwingEditor, setShowSwingEditor]);

  // Handle applying a preset to the selected block
  const handleApplyPreset = (preset: Preset) => {
    if (!selectedTrackId || !selectedBlockId) return;

    updateBlock(selectedTrackId, selectedBlockId, {
      streams: [{ events: [...preset.events] }],
      durationBars: preset.durationBars,
    });
  };

  // Don't render if conditions aren't met
  if (!showSwingEditor || !selectedTrack || !selectedBlock) {
    return null;
  }

  return (
    <div className="h-full border-t border-border bg-surface flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-surface">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">Swing Editor</span>
          <span className="text-xs text-muted">- {selectedTrack.name}</span>
        </div>
        <button
          onClick={() => setShowSwingEditor(false)}
          className="text-muted hover:text-foreground transition-colors p-1"
          title="Close swing editor"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Preset Selector */}
      <div className="py-2 border-b border-border/50 bg-surface/50">
        <PresetSelector presets={getPresetsByCategory('swing')} onSelectPreset={handleApplyPreset} color={CATEGORY_COLORS.swing} />
      </div>

      {/* Editor content */}
      <div className="flex-1 overflow-hidden">
        <SwingEditor
          block={selectedBlock}
          track={selectedTrack}
          beatsPerBar={project.beatsPerBar}
        />
      </div>
    </div>
  );
}
