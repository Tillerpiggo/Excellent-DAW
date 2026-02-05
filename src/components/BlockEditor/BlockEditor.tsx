'use client';

import { useMemo, useState } from 'react';
import { useUIStore } from '@/stores/uiStore';
import { useProjectStore } from '@/stores/projectStore';
import { ChordEditorPanel } from '../ChordEditor';
import { DrumEditorPanel } from '../DrumEditor';
import { ArpEditorPanel } from '../ArpEditor';
import { MuteEditorPanel } from '../MuteEditor';
import { TransposeEditorPanel } from '../TransposeEditor';
import { RhythmEditorPanel } from '../RhythmEditor';
import { SwingEditorPanel } from '../SwingEditor';
import { GenericMidiEditorPanel } from '../GenericMidiEditor';
import { VisualViewPanel } from '../VisualView';
import { PatternCategory } from '@/core/types';
import { getInstrument } from '@/instruments';

export type EditorType = 'chord' | 'drum' | 'arp' | 'mute' | 'transpose' | 'rhythm' | 'swing' | 'generic' | null;
type ViewMode = 'editor' | 'visual';

/**
 * Maps pattern category to the appropriate editor type.
 */
function getEditorForCategory(category: PatternCategory): EditorType {
  switch (category) {
    case 'drums':
      return 'drum';
    case 'chords':
    case 'bass':
      return 'chord';
    case 'arp':
      return 'arp';
    case 'rhythm':
      return 'rhythm';
    case 'mute':
      return 'mute';
    case 'swing':
      return 'swing';
    case 'rest':
    case 'modifier':
      return null;
    default:
      return null;
  }
}

/**
 * BlockEditor is the container for MIDI editors and visual view.
 * Always renders with a header containing a segmented control to switch views.
 */
export function BlockEditor() {
  const { selectedBlockIds, selectedTrackId } = useUIStore();
  const { project } = useProjectStore();
  const [viewMode, setViewMode] = useState<ViewMode>('editor');

  const selectedBlockId = selectedBlockIds.size === 1 ? Array.from(selectedBlockIds)[0] : null;
  const selectedTrack = selectedTrackId ? project.tracks[selectedTrackId] ?? null : null;
  const selectedBlock = selectedTrack?.blocks.find(b => b.id === selectedBlockId) ?? null;

  // Determine which editor type to show
  const editorType = useMemo((): EditorType => {
    if (!selectedBlock || !selectedTrack) return null;

    const { patternCategory, typeId, instrumentId } = selectedTrack;

    if (typeId === 'rhythm') return 'rhythm';
    if (typeId === 'transpose') return 'transpose';
    if (typeId === 'swing') return 'swing';

    if (patternCategory) {
      const categoryEditor = getEditorForCategory(patternCategory);
      if (categoryEditor) return categoryEditor;
    }

    // Check instrument's editor type
    const instrument = getInstrument(instrumentId);
    if (instrument?.editorType) {
      return instrument.editorType;
    }

    // Default to generic MIDI editor
    return 'generic';
  }, [selectedBlock, selectedTrack]);

  // Render the editor content based on type
  const renderEditor = () => {
    switch (editorType) {
      case 'chord':
        return <ChordEditorPanel />;
      case 'drum':
        return <DrumEditorPanel />;
      case 'arp':
        return <ArpEditorPanel />;
      case 'mute':
        return <MuteEditorPanel />;
      case 'transpose':
        return <TransposeEditorPanel />;
      case 'rhythm':
        return <RhythmEditorPanel />;
      case 'swing':
        return <SwingEditorPanel />;
      case 'generic':
        return <GenericMidiEditorPanel />;
      default:
        return (
          <div className="flex-1 flex flex-col items-center justify-center text-muted gap-3">
            {/* Block icon */}
            <svg className="w-12 h-12 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            <p className="text-sm">Select a block to edit</p>
          </div>
        );
    }
  };

  return (
    <div className="h-full flex flex-col bg-surface border-t border-border">
      {/* Header with centered segmented control */}
      <div className="flex items-center justify-center px-4 py-2 border-b border-border bg-surface">
        <div className="flex rounded-lg bg-background p-0.5 border border-border">
          <button
            onClick={() => setViewMode('editor')}
            className={`px-6 py-1.5 text-xs font-medium rounded-md transition-colors ${
              viewMode === 'editor'
                ? 'bg-surface text-foreground shadow-sm'
                : 'text-muted hover:text-foreground'
            }`}
          >
            Editor
          </button>
          <button
            onClick={() => setViewMode('visual')}
            className={`px-6 py-1.5 text-xs font-medium rounded-md transition-colors ${
              viewMode === 'visual'
                ? 'bg-surface text-foreground shadow-sm'
                : 'text-muted hover:text-foreground'
            }`}
          >
            Visual
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {viewMode === 'visual' ? <VisualViewPanel /> : renderEditor()}
      </div>
    </div>
  );
}
