'use client';

import { TreeItem, TreeItemRenderContext } from 'react-complex-tree';
import { Track } from '@/core/types';
import { useProjectStore } from '@/stores/projectStore';
import { useUIStore } from '@/stores/uiStore';
import { useDragDrop } from '@/hooks/useDragDrop';
import { TRACK_TYPE_COLORS, INSTRUMENT_COLORS, withAlpha } from '@/utils/colors';

interface TrackRowRendererProps {
  item: TreeItem<Track>;
  title: React.ReactNode;
  context: TreeItemRenderContext;
  children: React.ReactNode;
  depth: number;
}

export function TrackRowRenderer({ item, context, children, depth }: TrackRowRendererProps) {
  const track = item.data;

  // Skip rendering the root item
  if (!track || item.index === 'root') {
    return <>{children}</>;
  }

  const { updateTrack } = useProjectStore();
  const trackHeightScale = useUIStore((s) => s.trackHeightScale);
  const dropTargetTrackId = useUIStore((s) => s.dropTargetTrackId);
  const dragState = useUIStore((s) => s.dragState);
  const trackHeight = Math.round(64 * trackHeightScale);
  const { handleDragOver, handleDragLeave, handleHierarchyDrop } = useDragDrop();

  const isSelected = context.isSelected;
  const isExpanded = context.isExpanded;
  const hasChildren = item.children && item.children.length > 0;
  const isDraggingOver = context.isDraggingOver;
  const isDropTarget = dropTargetTrackId === track.id;

  const typeColor = TRACK_TYPE_COLORS[track.typeId];
  const instrumentColor = track.instrumentId ? INSTRUMENT_COLORS[track.instrumentId] : undefined;

  // Extract the onClick from interactiveElementProps to handle it properly
  const { onClick: rctOnClick, ...restInteractiveProps } = context.interactiveElementProps;

  return (
    <li
      {...context.itemContainerWithChildrenProps}
      className="list-none"
    >
      <div
        {...context.itemContainerWithoutChildrenProps}
        {...restInteractiveProps}
        role="treeitem"
        tabIndex={0}
        className={`group relative flex items-center px-2 cursor-pointer transition-colors select-none outline-none ${
          isSelected ? 'ring-1 ring-accent/50' : 'hover:bg-muted/50'
        } ${isDropTarget && dragState.type === 'preset' ? 'bg-accent-from/30' : ''} ${
          isDraggingOver ? 'bg-accent/10' : ''
        }`}
        style={{
          height: trackHeight,
          paddingLeft: `${8 + depth * 16}px`,
          userSelect: 'none',
          ...(isSelected
            ? { background: 'linear-gradient(90deg, rgba(100, 116, 139, 0.25) 0%, rgba(71, 85, 105, 0.1) 100%)' }
            : {}),
        }}
        onClick={(e) => {
          // Call react-complex-tree's click handler for selection
          if (rctOnClick) {
            rctOnClick(e);
          }
        }}
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
        {/* Drag Handle - visual indicator only, drag is handled by interactiveElementProps */}
        <div className="w-5 h-5 flex items-center justify-center text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity mr-1">
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
            context.toggleExpandedState();
          }}
          className={`w-5 h-5 flex items-center justify-center text-xs text-muted-foreground hover:text-foreground transition-colors ${
            !hasChildren ? 'invisible' : ''
          }`}
          type="button"
        >
          {isExpanded ? '▼' : '▶'}
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
          type="button"
        >
          M
        </button>
      </div>

      {/* Render children (nested tracks) */}
      {children}
    </li>
  );
}
