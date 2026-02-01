'use client';

import { CSSProperties } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { TrackNode } from '@/utils/tree';
import { useProjectStore } from '@/stores/projectStore';
import { useUIStore } from '@/stores/uiStore';
import { useDragDrop } from '@/hooks/useDragDrop';
import { TRACK_TYPE_COLORS, INSTRUMENT_COLORS, withAlpha } from '@/utils/colors';
import { DropIndicator } from './DropIndicator';
import { canDropTrack } from '@/utils/trackDragValidation';

interface TrackRowProps {
  node: TrackNode;
}

export function TrackRow({ node }: TrackRowProps) {
  const { track, depth } = node;
  const project = useProjectStore((state) => state.project);
  const { updateTrack } = useProjectStore();
  const {
    selectedTrackId,
    selectTrack,
    toggleTrackCollapsed,
    collapsedTrackIds,
    dropTargetTrackId,
    dragState,
    trackDragActiveId,
    trackDropTargetId,
    trackDropPosition,
  } = useUIStore();
  const { handleDragOver, handleDragLeave, handleHierarchyDrop } = useDragDrop();

  // Sortable hook for drag and drop reordering
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: track.id,
  });

  const isSelected = selectedTrackId === track.id;
  const isCollapsed = collapsedTrackIds.has(track.id);
  const hasChildren = track.childIds.length > 0;
  const isDropTarget = dropTargetTrackId === track.id;

  // Track reorder drop target state
  const isTrackDropTarget = trackDropTargetId === track.id;
  const isBeingDragged = trackDragActiveId === track.id;

  // Check if this would be a valid drop target
  const isValidDropTarget =
    trackDragActiveId && isTrackDropTarget
      ? canDropTrack(project, trackDragActiveId, track.id, trackDropPosition || 'after')
      : true;

  const typeColor = TRACK_TYPE_COLORS[track.typeId];
  const instrumentColor = track.instrumentId ? INSTRUMENT_COLORS[track.instrumentId] : undefined;

  // Sortable styles
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition: transition || 'transform 200ms ease',
    opacity: isDragging ? 0.5 : 1,
    paddingLeft: `${8 + depth * 16}px`,
  };

  return (
    <div
      ref={setNodeRef}
      className={`group relative flex items-center h-16 px-2 cursor-pointer transition-colors ${
        isSelected ? '' : 'hover:bg-muted/50'
      } ${isDropTarget && dragState.type === 'preset' ? 'bg-accent-from/30' : ''} ${
        isBeingDragged ? 'z-10' : ''
      }`}
      style={{
        ...style,
        ...(isSelected ? { background: 'linear-gradient(90deg, rgba(100, 116, 139, 0.25) 0%, rgba(71, 85, 105, 0.1) 100%)' } : {}),
      }}
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
      {/* Drop indicator for track reordering */}
      {isTrackDropTarget && trackDropPosition && (
        <DropIndicator
          position={trackDropPosition}
          depth={depth}
          isValid={isValidDropTarget}
        />
      )}

      {/* Drag Handle */}
      <div
        className="w-5 h-5 flex items-center justify-center text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 hover:opacity-100 transition-opacity mr-1"
        style={{ opacity: isDragging ? 1 : undefined }}
        {...attributes}
        {...listeners}
      >
        <svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor">
          <circle cx="2" cy="2" r="1.5" />
          <circle cx="8" cy="2" r="1.5" />
          <circle cx="2" cy="7" r="1.5" />
          <circle cx="8" cy="7" r="1.5" />
          <circle cx="2" cy="12" r="1.5" />
          <circle cx="8" cy="12" r="1.5" />
        </svg>
      </div>

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
