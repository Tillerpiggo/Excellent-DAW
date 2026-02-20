'use client';

import { EditorPanel } from '@/components/shared/EditorPanel';
import { DrumEditor } from './DrumEditor';
import { CATEGORY_PRESETS } from '@/core/presets';
import { CATEGORY_COLORS } from '@/utils/colors';

/**
 * DrumEditorPanel renders the drum editor UI.
 * BlockEditor determines when to show this panel based on track properties.
 */
export function DrumEditorPanel() {
  return (
    <EditorPanel presets={CATEGORY_PRESETS.drums} color={CATEGORY_COLORS.drums}>
      {({ block, track, beatsPerBar }) => (
        <DrumEditor block={block} track={track} beatsPerBar={beatsPerBar} />
      )}
    </EditorPanel>
  );
}
