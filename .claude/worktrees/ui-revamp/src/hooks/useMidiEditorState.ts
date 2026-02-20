import { useCallback, useEffect, useState } from 'react';
import { Block, Track } from '@/core/types';
import { MidiNote } from '@/components/shared/MidiEditor';

interface UseMidiEditorStateOptions {
  block: Block;
  track: Track;
  extractNotes: (block: Block) => MidiNote[];
  saveNotes: (notes: MidiNote[], trackId: string, blockId: string) => void;
  defaultQuantize: number;
}

export function useMidiEditorState({
  block,
  track,
  extractNotes,
  saveNotes,
  defaultQuantize,
}: UseMidiEditorStateOptions) {
  const [quantize, setQuantize] = useState(defaultQuantize);
  const [notes, setNotes] = useState<MidiNote[]>(() => extractNotes(block));

  // Update notes when block ID changes
  const blockId = block.id;
  useEffect(() => {
    setNotes(extractNotes(block));
  }, [blockId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle notes change
  const handleNotesChange = useCallback((newNotes: MidiNote[]) => {
    setNotes(newNotes);
  }, []);

  // Auto-save when notes change
  useEffect(() => {
    const timeout = setTimeout(() => {
      saveNotes(notes, track.id, block.id);
    }, 500);
    return () => clearTimeout(timeout);
  }, [notes, track.id, block.id, saveNotes]);

  // Clear all
  const handleClear = useCallback(() => {
    setNotes([]);
  }, []);

  return {
    notes,
    setNotes,
    quantize,
    setQuantize,
    handleNotesChange,
    handleClear,
  };
}
