'use client';

import { useEffect, useMemo } from 'react';
import { useUIStore } from '@/stores/uiStore';
import { useProjectStore } from '@/stores/projectStore';
import { MuteEditor } from './MuteEditor';
import { PresetSelector } from '@/components/shared/PresetSelector';
import { Preset } from '@/core/types';
import { getPresetsByCategory } from '@/core/presets';
import { CATEGORY_COLORS } from '@/utils/colors';

export function MuteEditorPanel() {
  const { selectedBlockIds, selectedTrackId, showMuteEditor, setShowMuteEditor } = useUIStore();
  const { project, updateBlock } = useProjectStore();

  // Only show editor when exactly 1 block is selected
  const selectedBlockId = selectedBlockIds.size === 1 ? Array.from(selectedBlockIds)[0] : null;

  // Get the selected track and block
  const selectedTrack = selectedTrackId ? project.tracks[selectedTrackId] : null;
  const selectedBlock = selectedTrack?.blocks.find(b => b.id === selectedBlockId);

  // Check if this is a mute track
  const isMuteTrack = selectedTrack?.typeId === 'mute';

  // Determine if we should show mute editor
  const shouldShowMuteEditor = useMemo(() => {
    return selectedTrack && selectedBlock && isMuteTrack;
  }, [selectedTrack, selectedBlock, isMuteTrack]);

  // Auto-show/hide mute editor based on selection
  useEffect(() => {
    if (shouldShowMuteEditor) {
      setShowMuteEditor(true);
    } else {
      setShowMuteEditor(false);
    }
  }, [shouldShowMuteEditor, setShowMuteEditor]);

  // Handle applying a preset to the selected block
  const handleApplyPreset = (preset: Preset) => {
    if (!selectedTrackId || !selectedBlockId) return;

    updateBlock(selectedTrackId, selectedBlockId, {
      streams: [{ events: [...preset.events] }],
      durationBars: preset.durationBars,
    });
  };

  // Don't render if conditions aren't met
  if (!showMuteEditor || !selectedTrack || !selectedBlock) {
    return null;
  }

  return (
    <div className="h-full border-t border-border bg-surface flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-surface">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">Mute Editor</span>
          <span className="text-xs text-muted">- {selectedTrack.name}</span>
        </div>
        <button
          onClick={() => setShowMuteEditor(false)}
          className="text-muted hover:text-foreground transition-colors p-1"
          title="Close mute editor"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Preset Selector */}
      <div className="py-2 border-b border-border/50 bg-surface/50">
        <PresetSelector presets={getPresetsByCategory('mute')} onSelectPreset={handleApplyPreset} color={CATEGORY_COLORS.mute} />
      </div>

      {/* Editor content */}
      <div className="flex-1 overflow-hidden">
        <MuteEditor
          block={selectedBlock}
          track={selectedTrack}
          beatsPerBar={project.beatsPerBar}
        />
      </div>
    </div>
  );
}
