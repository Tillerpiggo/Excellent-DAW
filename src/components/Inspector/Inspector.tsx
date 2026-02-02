'use client';

import { TrackInspector } from './TrackInspector';
import { BlockInspector } from './BlockInspector';
import { useUIStore } from '@/stores/uiStore';
import { useProjectStore } from '@/stores/projectStore';

export function Inspector() {
  const { selectedTrackId, selectedBlockIds } = useUIStore();
  const project = useProjectStore((state) => state.project);

  const selectedTrack = selectedTrackId ? project.tracks[selectedTrackId] : null;

  // Get the first selected block ID (for single selection display)
  const selectedBlockId = selectedBlockIds.size === 1 ? Array.from(selectedBlockIds)[0] : null;
  const selectedBlock = selectedTrack?.blocks.find((b) => b.id === selectedBlockId);

  // Check if multiple blocks are selected
  const multipleBlocksSelected = selectedBlockIds.size > 1;

  return (
    <div className="h-full flex flex-col">
      <div className="p-3 border-b border-border">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Inspector
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {multipleBlocksSelected ? (
          <div className="text-center text-muted-foreground py-8">
            <p className="text-sm font-medium">{selectedBlockIds.size} blocks selected</p>
            <p className="text-xs mt-2">Press Delete to remove all selected blocks</p>
          </div>
        ) : selectedBlock && selectedTrack ? (
          <BlockInspector block={selectedBlock} track={selectedTrack} />
        ) : selectedTrack ? (
          <TrackInspector track={selectedTrack} />
        ) : (
          <div className="text-center text-muted-foreground py-8">
            <p className="text-sm">Select a track or block to edit its properties</p>
          </div>
        )}
      </div>
    </div>
  );
}
