'use client';

import { useUIStore } from '@/stores/uiStore';
import { useProjectStore } from '@/stores/projectStore';
import { DrumEditor } from './DrumEditor';
import { PresetSelector } from '@/components/shared/PresetSelector';
import { Preset } from '@/core/types';
import { getPresetsByCategory } from '@/core/presets';
import { CATEGORY_COLORS } from '@/utils/colors';

/**
 * DrumEditorPanel renders the drum editor UI.
 * BlockEditor determines when to show this panel based on track properties.
 */
export function DrumEditorPanel() {
  const { selectedBlockIds, selectedTrackId } = useUIStore();
  const { project, updateBlock } = useProjectStore();

  const selectedBlockId = selectedBlockIds.size === 1 ? Array.from(selectedBlockIds)[0] : null;
  const selectedTrack = selectedTrackId ? project.tracks[selectedTrackId] : null;
  const selectedBlock = selectedTrack?.blocks.find(b => b.id === selectedBlockId);

  const handleApplyPreset = (preset: Preset) => {
    if (!selectedTrackId || !selectedBlockId) return;

    updateBlock(selectedTrackId, selectedBlockId, {
      streams: [{ events: [...preset.events] }],
      durationBars: preset.durationBars,
    });
  };

  // Determine which category to use for presets
  const presetCategory = selectedTrack?.typeId === 'rhythm' ? 'rhythm' : 'drums';

  if (!selectedTrack || !selectedBlock) {
    return null;
  }

  return (
    <div className="h-full flex flex-col">
      {/* Preset Selector */}
      <div className="py-2 border-b border-border/50 bg-surface/50">
        <PresetSelector presets={getPresetsByCategory(presetCategory)} onSelectPreset={handleApplyPreset} color={CATEGORY_COLORS[presetCategory]} />
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
