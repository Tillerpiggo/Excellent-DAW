'use client';

import { TreeItem } from 'react-complex-tree';
import { Project, Track } from '@/core/types';

// TreeItem with Track payload
export type TrackTreeItem = TreeItem<Track>;

/**
 * Convert flat track dictionary to react-complex-tree's format.
 * RCT expects a Record<string, TreeItem> where each item has a `children` array of IDs.
 */
export function tracksToTreeItems(project: Project, rootIds?: string[]): Record<string, TrackTreeItem> {
  const items: Record<string, TrackTreeItem> = {
    root: {
      index: 'root',
      isFolder: true,
      children: rootIds ?? project.rootTracks,
      data: null as unknown as Track,
      canMove: false,
      canRename: false,
    },
  };

  Object.values(project.tracks).forEach((track) => {
    items[track.id] = {
      index: track.id,
      isFolder: true, // All tracks can accept children
      children: track.childIds,
      data: track,
      canMove: true,
      canRename: true,
    };
  });

  return items;
}
