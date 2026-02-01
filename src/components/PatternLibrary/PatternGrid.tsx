'use client';

import { PresetChip } from './PresetChip';
import { getPatternPresets } from '@/core/presets';

export function PatternGrid() {
  const patterns = getPatternPresets();

  return (
    <div className="flex flex-col gap-2">
      {patterns.map((preset) => (
        <PresetChip key={preset.id} preset={preset} />
      ))}
    </div>
  );
}
