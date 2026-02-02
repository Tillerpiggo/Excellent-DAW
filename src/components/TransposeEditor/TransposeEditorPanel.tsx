'use client';

import { useEffect, useMemo } from 'react';
import { useUIStore } from '@/stores/uiStore';
import { useProjectStore } from '@/stores/projectStore';
import { TransposeEditor } from './TransposeEditor';

export function TransposeEditorPanel() {
  const { selectedBlockIds, selectedTrackId, showTransposeEditor, setShowTransposeEditor } = useUIStore();
  const { project } = useProjectStore();

  // Only show editor when exactly 1 block is selected
  const selectedBlockId = selectedBlockIds.size === 1 ? Array.from(selectedBlockIds)[0] : null;

  // Get the selected track and block
  const selectedTrack = selectedTrackId ? project.tracks[selectedTrackId] : null;
  const selectedBlock = selectedTrack?.blocks.find(b => b.id === selectedBlockId);

  // Check if this is a transpose track
  const isTransposeTrack = selectedTrack?.typeId === 'transpose';

  // Auto-show/hide transpose editor based on selection
  useEffect(() => {
    if (selectedBlock && isTransposeTrack) {
      setShowTransposeEditor(true);
    } else {
      setShowTransposeEditor(false);
    }
  }, [selectedBlock, isTransposeTrack, setShowTransposeEditor]);

  // Don't render if conditions aren't met
  if (!showTransposeEditor || !selectedTrack || !selectedBlock || !isTransposeTrack) {
    return null;
  }

  return (
    <div className="h-full border-t border-border bg-surface flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-surface">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">Transpose Editor</span>
          <span className="text-xs text-muted">- {selectedTrack.name}</span>
        </div>
        <button
          onClick={() => setShowTransposeEditor(false)}
          className="text-muted hover:text-foreground transition-colors p-1"
          title="Close transpose editor"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Editor content */}
      <div className="flex-1 overflow-hidden">
        <TransposeEditor
          block={selectedBlock}
          track={selectedTrack}
          beatsPerBar={project.beatsPerBar}
        />
      </div>
    </div>
  );
}
