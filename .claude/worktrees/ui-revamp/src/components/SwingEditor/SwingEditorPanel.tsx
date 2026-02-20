'use client';

import { EditorPanel } from '@/components/shared/EditorPanel';
import { SwingEditor } from './SwingEditor';
import { CATEGORY_PRESETS } from '@/core/presets';
import { CATEGORY_COLORS } from '@/utils/colors';

/**
 * SwingEditorPanel renders the swing editor UI.
 * BlockEditor determines when to show this panel based on track properties.
 */
export function SwingEditorPanel() {
  return (
    <EditorPanel presets={CATEGORY_PRESETS.swing} color={CATEGORY_COLORS.swing}>
      {({ block, track, beatsPerBar }) => (
        <SwingEditor block={block} track={track} beatsPerBar={beatsPerBar} />
      )}
    </EditorPanel>
  );
}
