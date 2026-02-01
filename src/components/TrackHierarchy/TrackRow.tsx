'use client';

import { TrackNode } from '@/utils/tree';
import { useProjectStore } from '@/stores/projectStore';
import { useUIStore } from '@/stores/uiStore';
import { useDragDrop } from '@/hooks/useDragDrop';
import { TRACK_TYPE_COLORS, INSTRUMENT_COLORS, withAlpha } from '@/utils/colors';

interface TrackRowProps {
  node: TrackNode;
}

export function TrackRow({ node }: TrackRowProps) {
  const { track, depth } = node;
  const { updateTrack } = useProjectStore();
  const {
    selectedTrackId,
    selectTrack,
    toggleTrackCollapsed,
    collapsedTrackIds,
    dropTargetTrackId,
    dragState,
  } = useUIStore();
  const { handleDragOver, handleDragLeave, handleHierarchyDrop } = useDragDrop();

  const isSelected = selectedTrackId === track.id;
  const isCollapsed = collapsedTrackIds.has(track.id);
  const hasChildren = track.childIds.length > 0;
  const isDropTarget = dropTargetTrackId === track.id;

  const typeColor = TRACK_TYPE_COLORS[track.typeId];
  const instrumentColor = track.instrumentId ? INSTRUMENT_COLORS[track.instrumentId] : undefined;

  return (
    <div
      className={`flex items-center h-16 px-2 cursor-pointer transition-colors ${
        isSelected ? 'bg-accent/20' : 'hover:bg-muted/50'
      } ${isDropTarget && dragState.type === 'preset' ? 'bg-accent/30' : ''}`}
      style={{ paddingLeft: `${8 + depth * 16}px` }}
      onClick={() => selectTrack(track.id)}
      onDragOver={(e) => {
        if (dragState.type === 'preset') {
          handleDragOver(e, track.id);
        }
      }}
      onDragLeave={handleDragLeave}
      onDrop={(e) => {
        if (dragState.type === 'preset') {
          e.stopPropagation();
          handleHierarchyDrop(e, track.id);
        }
      }}
    >
      {/* Expand/Collapse Toggle */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          toggleTrackCollapsed(track.id);
        }}
        className={`w-5 h-5 flex items-center justify-center text-xs text-muted-foreground hover:text-foreground transition-colors ${
          !hasChildren ? 'invisible' : ''
        }`}
      >
        {isCollapsed ? '▶' : '▼'}
      </button>

      {/* Track Type Badge */}
      <div
        className="w-2 h-2 rounded-full mx-1.5"
        style={{ backgroundColor: typeColor }}
        title={track.typeId}
      />

      {/* Track Name */}
      <span
        className={`flex-1 text-base truncate ${
          track.muted ? 'text-muted-foreground line-through' : ''
        }`}
      >
        {track.name}
      </span>

      {/* Instrument Badge */}
      {track.instrumentId && (
        <span
          className="text-xs px-1.5 py-0.5 rounded ml-1"
          style={{
            backgroundColor: withAlpha(instrumentColor || '#888', 0.2),
            color: instrumentColor,
          }}
        >
          {track.instrumentId.slice(0, 3)}
        </span>
      )}

      {/* Mute Button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          updateTrack(track.id, { muted: !track.muted });
        }}
        className={`ml-2 w-6 h-6 rounded text-xs flex items-center justify-center transition-colors ${
          track.muted
            ? 'bg-red-500/20 text-red-400'
            : 'bg-muted/50 text-muted-foreground hover:bg-muted'
        }`}
        title={track.muted ? 'Unmute' : 'Mute'}
      >
        M
      </button>
    </div>
  );
}
