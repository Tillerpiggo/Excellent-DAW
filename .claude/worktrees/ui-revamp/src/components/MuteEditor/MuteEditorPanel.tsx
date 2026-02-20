'use client';

import { EditorPanel } from '@/components/shared/EditorPanel';
import { MuteEditor } from './MuteEditor';
import { CATEGORY_PRESETS } from '@/core/presets';
import { CATEGORY_COLORS } from '@/utils/colors';

/**
 * MuteEditorPanel renders the mute (instrument blackout) editor UI.
 * BlockEditor determines when to show this panel based on track properties.
 */
export function MuteEditorPanel() {
  return (
    <EditorPanel presets={CATEGORY_PRESETS.mute} color={CATEGORY_COLORS.mute}>
      {({ block, track, beatsPerBar }) => (
        <MuteEditor block={block} track={track} beatsPerBar={beatsPerBar} />
      )}
    </EditorPanel>
  );
}
