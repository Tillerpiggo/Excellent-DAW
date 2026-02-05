'use client';

import { TrackNode } from '@/utils/tree';
import { useProjectStore } from '@/stores/projectStore';
import { useUIStore } from '@/stores/uiStore';
import { useDragDrop } from '@/hooks/useDragDrop';
import { TRACK_TYPE_COLORS, INSTRUMENT_COLORS, withAlpha } from '@/utils/colors';

interface TrackLabelsProps {
  flatTracks: TrackNode[];
}

export function TrackLabels({ flatTracks }: TrackLabelsProps) {
  const dropTargetTrackId = useUIStore((state) => state.dropTargetTrackId);
  const dragState = useUIStore((state) => state.dragState);
  const trackHeightScale = useUIStore((state) => state.trackHeightScale);
  const { handleDragOver, handleDragLeave, handleHierarchyDrop } = useDragDrop();

  const trackHeight = Math.round(64 * trackHeightScale);
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

      {/* Simple display - NO DnD wrapper, NO drag handles */}
      <div className="py-1">
        {flatTracks.map((node) => (
          <TrackLabelRow key={node.track.id} node={node} trackHeight={trackHeight} />
        ))}
      </div>
    </div>
  );
}

// Simplified row without drag handle - display only
function TrackLabelRow({ node, trackHeight }: { node: TrackNode; trackHeight: number }) {
  const { track, depth } = node;
  const updateTrack = useProjectStore((state) => state.updateTrack);
  const selectedTrackId = useUIStore((state) => state.selectedTrackId);
  const selectTrack = useUIStore((state) => state.selectTrack);
  const collapsedTrackIds = useUIStore((state) => state.collapsedTrackIds);
  const toggleTrackCollapsed = useUIStore((state) => state.toggleTrackCollapsed);
  const dropTargetTrackId = useUIStore((state) => state.dropTargetTrackId);
  const dragState = useUIStore((state) => state.dragState);
  const { handleDragOver, handleDragLeave, handleHierarchyDrop } = useDragDrop();

  const isSelected = selectedTrackId === track.id;
  const isCollapsed = collapsedTrackIds.has(track.id);
  const hasChildren = track.childIds.length > 0;
  const isDropTarget = dropTargetTrackId === track.id;
  const typeColor = TRACK_TYPE_COLORS[track.typeId];
  const instrumentColor = track.instrumentId ? INSTRUMENT_COLORS[track.instrumentId] : undefined;

  return (
    <div
      className={`group relative flex items-center px-2 cursor-pointer transition-colors ${
        isSelected ? '' : 'hover:bg-muted/50'
      } ${isDropTarget && dragState.type === 'preset' ? 'bg-accent-from/30' : ''}`}
      style={{
        height: trackHeight,
        paddingLeft: `${8 + depth * 16}px`,
        ...(isSelected
          ? { background: 'linear-gradient(90deg, rgba(100, 116, 139, 0.25) 0%, rgba(71, 85, 105, 0.1) 100%)' }
          : {}),
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
      {/* Expand/Collapse Toggle (no drag handle in timeline view) */}
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
      <span className={`flex-1 text-base truncate ${track.muted ? 'text-muted-foreground line-through' : ''}`}>
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
          track.muted ? 'bg-red-500/20 text-red-400' : 'bg-muted/50 text-muted-foreground hover:bg-muted'
        }`}
        title={track.muted ? 'Unmute' : 'Mute'}
      >
        M
      </button>
    </div>
  );
}
