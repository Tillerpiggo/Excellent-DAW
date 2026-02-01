import { Project } from '@/core/types';
import { getDescendants } from './tree';

export type DropPosition = 'before' | 'after' | 'inside';

export interface DropResult {
  isValid: boolean;
  newParentId: string | undefined;
  insertIndex: number;
  position: DropPosition;
}

/**
 * Validate whether a track can be dropped at a given position
 */
export function canDropTrack(
  project: Project,
  draggedId: string,
  targetId: string,
  position: DropPosition
): boolean {
  // Cannot drop onto self
  if (draggedId === targetId) {
    return false;
  }

  // Cannot drop into own descendants (would create circular reference)
  const descendants = getDescendants(project, draggedId);
  if (descendants.includes(targetId)) {
    return false;
  }

  return true;
}

/**
 * Calculate drop position based on mouse Y position relative to row
 */
export function calculateDropPosition(
  mouseY: number,
  rowTop: number,
  rowHeight: number,
  mouseX: number,
  rowLeft: number,
  rowWidth: number
): DropPosition {
  const relativeY = mouseY - rowTop;
  const percentY = relativeY / rowHeight;

  // Top 25% = before
  if (percentY < 0.25) {
    return 'before';
  }

  // Bottom 25% = after
  if (percentY > 0.75) {
    return 'after';
  }

  // Middle 50%: check X position for reparent
  const relativeX = mouseX - rowLeft;
  const percentX = relativeX / rowWidth;

  // Right side of middle = inside (reparent)
  if (percentX > 0.5) {
    return 'inside';
  }

  // Left side of middle = after
  return 'after';
}

/**
 * Calculate the final drop result (new parent and index)
 */
export function calculateDropResult(
  project: Project,
  draggedId: string,
  targetId: string,
  position: DropPosition
): DropResult {
  const targetTrack = project.tracks[targetId];
  if (!targetTrack) {
    return { isValid: false, newParentId: undefined, insertIndex: 0, position };
  }

  // Validate the drop
  if (!canDropTrack(project, draggedId, targetId, position)) {
    return { isValid: false, newParentId: undefined, insertIndex: 0, position };
  }

  let newParentId: string | undefined;
  let insertIndex: number;

  switch (position) {
    case 'before': {
      // Insert before target at same level
      newParentId = targetTrack.parentId;
      const siblingList = newParentId
        ? project.tracks[newParentId]?.childIds || []
        : project.rootTracks;
      insertIndex = siblingList.indexOf(targetId);
      break;
    }

    case 'after': {
      // Insert after target at same level
      newParentId = targetTrack.parentId;
      const siblingList = newParentId
        ? project.tracks[newParentId]?.childIds || []
        : project.rootTracks;
      insertIndex = siblingList.indexOf(targetId) + 1;
      break;
    }

    case 'inside': {
      // Reparent as child of target
      newParentId = targetId;
      insertIndex = targetTrack.childIds.length; // Add at end
      break;
    }
  }

  // Adjust index if dragging within the same parent
  const draggedTrack = project.tracks[draggedId];
  if (draggedTrack) {
    const oldParentId = draggedTrack.parentId;
    if (oldParentId === newParentId) {
      const siblingList = newParentId
        ? project.tracks[newParentId]?.childIds || []
        : project.rootTracks;
      const oldIndex = siblingList.indexOf(draggedId);
      if (oldIndex !== -1 && oldIndex < insertIndex) {
        insertIndex--;
      }
    }
  }

  return { isValid: true, newParentId, insertIndex, position };
}
