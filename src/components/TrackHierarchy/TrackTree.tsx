'use client';

import { useMemo, useCallback } from 'react';
import {
  UncontrolledTreeEnvironment,
  Tree,
  StaticTreeDataProvider,
  TreeItemIndex,
  DraggingPosition,
  TreeItem,
} from 'react-complex-tree';
import 'react-complex-tree/lib/style-modern.css';
import { Track } from '@/core/types';
import { useProjectStore } from '@/stores/projectStore';
import { useUIStore } from '@/stores/uiStore';
import { tracksToTreeItems } from '@/utils/trackTreeAdapter';
import { getDescendants } from '@/utils/tree';
import { TrackRowRenderer } from './TrackRowRenderer';

interface TrackTreeProps {
  treeId: string;
}

export function TrackTree({ treeId }: TrackTreeProps) {
  const project = useProjectStore((state) => state.project);
  const { moveTrack } = useProjectStore();
  const { collapsedTrackIds, toggleTrackCollapsed, selectedTrackId, selectTrack } = useUIStore();

  // Convert project tracks to tree items
  const treeItems = useMemo(() => tracksToTreeItems(project), [project]);

  // Create data provider (memoized to prevent re-creation)
  const dataProvider = useMemo(() => {
    return new StaticTreeDataProvider(treeItems, (item, newName) => ({
      ...item,
      data: { ...item.data, name: newName },
    }));
  }, [treeItems]);

  // Validate drop - prevent circular references
  const canDropAt = useCallback(
    (items: TreeItem<Track>[], target: DraggingPosition): boolean => {
      const draggedId = items[0]?.index as string;
      if (!draggedId || draggedId === 'root') return false;

      // For 'item' drops (reparenting), check if target is descendant
      if (target.targetType === 'item') {
        const targetId = target.targetItem as string;
        if (draggedId === targetId) return false;
        const descendants = getDescendants(project, draggedId);
        if (descendants.includes(targetId)) return false;
      }

      // For 'between-items' drops, check parent
      if (target.targetType === 'between-items') {
        const parentId = target.parentItem as string;
        if (parentId !== 'root') {
          const descendants = getDescendants(project, draggedId);
          if (descendants.includes(parentId)) return false;
        }
      }

      return true;
    },
    [project]
  );

  // Handle drop - call moveTrack with correct parent/index
  const handleDrop = useCallback(
    (items: TreeItem<Track>[], target: DraggingPosition) => {
      const draggedId = items[0]?.index as string;
      if (!draggedId) return;

      let newParentId: string | undefined;
      let insertIndex: number;

      switch (target.targetType) {
        case 'item':
          // Drop ON a track = reparent as child (at end)
          newParentId = target.targetItem as string;
          if (newParentId === 'root') newParentId = undefined;
          insertIndex = newParentId
            ? project.tracks[newParentId]?.childIds.length ?? 0
            : project.rootTracks.length;
          break;

        case 'between-items':
          // Drop between = reorder
          newParentId = target.parentItem as string;
          if (newParentId === 'root') newParentId = undefined;
          insertIndex = target.childIndex;
          break;

        case 'root':
          // Drop at root level
          newParentId = undefined;
          insertIndex = project.rootTracks.length;
          break;

        default:
          return;
      }

      moveTrack(draggedId, newParentId, insertIndex);
    },
    [project, moveTrack]
  );

  // Sync selection
  const handleSelectItems = useCallback(
    (items: TreeItemIndex[]) => {
      const id = items[0] as string;
      if (id && id !== 'root') {
        selectTrack(id);
      }
    },
    [selectTrack]
  );

  // Sync expand/collapse
  const handleExpandItem = useCallback(
    (item: TreeItem<Track>) => {
      const id = item.index as string;
      if (collapsedTrackIds.has(id)) {
        toggleTrackCollapsed(id);
      }
    },
    [collapsedTrackIds, toggleTrackCollapsed]
  );

  const handleCollapseItem = useCallback(
    (item: TreeItem<Track>) => {
      const id = item.index as string;
      if (!collapsedTrackIds.has(id)) {
        toggleTrackCollapsed(id);
      }
    },
    [collapsedTrackIds, toggleTrackCollapsed]
  );

  // Calculate initially expanded items (inverse of collapsed)
  const defaultExpandedItems = useMemo(() => {
    return Object.keys(project.tracks).filter((id) => !collapsedTrackIds.has(id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only on mount

  return (
    <UncontrolledTreeEnvironment
      dataProvider={dataProvider}
      getItemTitle={(item) => item.data?.name || ''}
      viewState={{
        [treeId]: {
          selectedItems: selectedTrackId ? [selectedTrackId] : [],
          expandedItems: defaultExpandedItems,
        },
      }}
      canDragAndDrop
      canReorderItems
      canDropOnFolder
      canDropOnNonFolder={false}
      canDropAt={canDropAt}
      onDrop={handleDrop}
      onSelectItems={handleSelectItems}
      onExpandItem={handleExpandItem}
      onCollapseItem={handleCollapseItem}
      renderItemTitle={({ title }) => <span>{title}</span>}
      renderItem={(props) => <TrackRowRenderer {...props} />}
    >
      <Tree treeId={treeId} rootItem="root" />
    </UncontrolledTreeEnvironment>
  );
}
