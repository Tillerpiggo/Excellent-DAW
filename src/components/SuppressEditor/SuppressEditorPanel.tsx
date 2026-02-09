'use client';

import { EditorPanel } from '@/components/shared/EditorPanel';
import { SuppressEditor } from './SuppressEditor';
import { CATEGORY_PRESETS } from '@/core/presets';
import { CATEGORY_COLORS } from '@/utils/colors';

/**
 * SuppressEditorPanel renders the suppress editor UI.
 * BlockEditor determines when to show this panel based on track properties.
 */
export function SuppressEditorPanel() {
  return (
    <EditorPanel presets={CATEGORY_PRESETS.suppress} color={CATEGORY_COLORS.suppress}>
      {({ block, track, beatsPerBar }) => (
        <SuppressEditor block={block} track={track} beatsPerBar={beatsPerBar} />
      )}
    </EditorPanel>
  );
}
