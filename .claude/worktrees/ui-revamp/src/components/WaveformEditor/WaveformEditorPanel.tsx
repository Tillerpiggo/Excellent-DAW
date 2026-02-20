'use client';

import { EditorPanel } from '@/components/shared/EditorPanel';
import { WaveformEditor } from './WaveformEditor';

export function WaveformEditorPanel() {
  return (
    <EditorPanel>
      {({ block, track, beatsPerBar }) => (
        <WaveformEditor block={block} track={track} beatsPerBar={beatsPerBar} />
      )}
    </EditorPanel>
  );
}
