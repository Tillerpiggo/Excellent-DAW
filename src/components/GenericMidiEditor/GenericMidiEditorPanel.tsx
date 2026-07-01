'use client';

import { EditorPanel } from '@/components/shared/EditorPanel';
import { GenericMidiEditor } from './GenericMidiEditor';
import { Preset } from '@/core/types';

interface GenericMidiEditorPanelProps {
  presets?: Preset[];
  color?: string;
}

/**
 * GenericMidiEditorPanel renders a generic MIDI piano roll editor.
 * Used as the default editor when no specific editor type matches,
 * and also for single-row track types (mute, suppress, rhythm).
 */
export function GenericMidiEditorPanel({ presets, color }: GenericMidiEditorPanelProps) {
  return (
    <EditorPanel presets={presets} color={color}>
      {({ block, track, beatsPerBar, instrumentId }) => (
        <GenericMidiEditor block={block} track={track} beatsPerBar={beatsPerBar} instrumentId={instrumentId} />
      )}
    </EditorPanel>
  );
}
