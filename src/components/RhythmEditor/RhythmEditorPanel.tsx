'use client';

import { useUIStore } from '@/stores/uiStore';
import { useProjectStore } from '@/stores/projectStore';
import { RhythmEditor } from './RhythmEditor';
import { PresetSelector } from '@/components/shared/PresetSelector';
import { Preset } from '@/core/types';
import { getPresetsByCategory } from '@/core/presets';
import { CATEGORY_COLORS } from '@/utils/colors';

/**
 * RhythmEditorPanel renders the rhythm editor UI.
 * BlockEditor determines when to show this panel based on track properties.
 */
export function RhythmEditorPanel() {
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

  if (!selectedTrack || !selectedBlock) {
    return null;
  }

  return (
    <div className="h-full flex flex-col">
      {/* Preset Selector */}
      <div className="py-2 border-b border-border/50 bg-surface/50">
        <PresetSelector presets={getPresetsByCategory('rhythm')} onSelectPreset={handleApplyPreset} color={CATEGORY_COLORS.rhythm} />
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
