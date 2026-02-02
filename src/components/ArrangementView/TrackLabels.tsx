'use client';

import { TrackNode } from '@/utils/tree';
import { TrackRow } from '../TrackHierarchy/TrackRow';
import { DndTrackContext } from '../TrackHierarchy/DndTrackContext';
import { useUIStore } from '@/stores/uiStore';
import { useDragDrop } from '@/hooks/useDragDrop';

interface TrackLabelsProps {
  flatTracks: TrackNode[];
}

export function TrackLabels({ flatTracks }: TrackLabelsProps) {
  const { dropTargetTrackId, dragState } = useUIStore();
  const { handleDragOver, handleDragLeave, handleHierarchyDrop } = useDragDrop();

  const flatTrackIds = flatTracks.map((node) => node.track.id);
  const hasTracks = flatTracks.length > 0;

  return (
    <div
      className="min-h-full"
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
  );
}
