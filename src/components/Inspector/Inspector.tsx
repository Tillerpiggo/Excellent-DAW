'use client';

import { TrackInspector } from './TrackInspector';
import { BlockInspector } from './BlockInspector';
import { useUIStore } from '@/stores/uiStore';
import { useProjectStore } from '@/stores/projectStore';

export function Inspector() {
  const { selectedTrackId, selectedBlockId } = useUIStore();
  const project = useProjectStore((state) => state.project);

  const selectedTrack = selectedTrackId ? project.tracks[selectedTrackId] : null;
  const selectedBlock = selectedTrack?.blocks.find((b) => b.id === selectedBlockId);

  return (
    <div className="h-full flex flex-col">
      <div className="p-3 border-b border-border">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Inspector
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {selectedBlock && selectedTrack ? (
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
