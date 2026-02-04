'use client';

import { TrackRow } from './TrackRow';
import { DndTrackContext } from './DndTrackContext';
import { useProjectStore } from '@/stores/projectStore';
import { useUIStore } from '@/stores/uiStore';
import { useDragDrop } from '@/hooks/useDragDrop';
import { flattenTracks } from '@/utils/tree';

export function TrackHierarchy() {
  const project = useProjectStore((state) => state.project);
  const { addTrack } = useProjectStore();
  const { collapsedTrackIds, dropTargetTrackId, dragState } = useUIStore();
  const { handleDragOver, handleDragLeave, handleHierarchyDrop, handleDragEnd } = useDragDrop();

  const flatTracks = flattenTracks(project, collapsedTrackIds);
  const flatTrackIds = flatTracks.map((node) => node.track.id);
  const hasTracks = flatTracks.length > 0;

  return (
    <div className="h-full flex flex-col">
      <div className="h-12 px-3 border-b border-border flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Tracks
        </h2>
        <button
          onClick={() => addTrack()}
          className="px-2 py-1 text-xs rounded bg-gradient-to-r from-accent-from/20 to-accent-to/20 text-accent-from hover:from-accent-from/30 hover:to-accent-to/30 transition-colors"
        >
          + Add
        </button>
      </div>

      <div
        className="flex-1 overflow-y-auto"
        onDragOver={(e) => {
          if (dragState.type === 'preset') {
            handleDragOver(e, '__root__');
          }
        }}
        onDragLeave={handleDragLeave}
        onDrop={(e) => {
          if (dragState.type === 'preset') {
            handleHierarchyDrop(e);
          }
        }}
      >
        {!hasTracks && (
          <div
            className={`m-3 p-6 border-2 border-dashed rounded-lg text-center transition-colors ${
              dropTargetTrackId === '__root__'
                ? 'border-accent-from bg-accent-from/10'
                : 'border-border'
            }`}
          >
            <p className="text-muted-foreground text-sm">
              Drag a pattern here to create your first track
            </p>
          </div>
        )}

        <DndTrackContext flatTrackIds={flatTrackIds}>
          <div className="py-1">
            {flatTracks.map((node) => (
              <TrackRow key={node.track.id} node={node} />
            ))}
          </div>
        </DndTrackContext>
      </div>
    </div>
  );
}
