import { CollisionDetection, UniqueIdentifier } from '@dnd-kit/core';

/**
 * Custom collision detection for tree-based track ordering
 *
 * Uses pointer coordinates instead of overlay center to ensure the drop indicator
 * appears at the row the pointer is in, not where the overlay center happens to be.
 * This fixes the off-by-one row alignment issue when dragging up/down.
 */
export const treeCollisionDetection: CollisionDetection = ({
  active,
  droppableRects,
  droppableContainers,
  pointerCoordinates,
}) => {
  const collisions: Array<{
    id: UniqueIdentifier;
    data: {
      droppableContainer: (typeof droppableContainers)[number];
      value: number;
    };
  }> = [];

  if (!pointerCoordinates) {
    return collisions;
  }

  const pointerY = pointerCoordinates.y;

  for (const droppableContainer of droppableContainers) {
    const { id } = droppableContainer;
    const rect = droppableRects.get(id);

    if (rect && id !== active.id) {
      // Check if pointer is within this row's vertical bounds
      if (pointerY >= rect.top && pointerY <= rect.bottom) {
        const droppableCenterY = rect.top + rect.height / 2;
        const distanceY = Math.abs(pointerY - droppableCenterY);

        collisions.push({
          id,
          data: {
            droppableContainer,
            value: distanceY,
          },
        });
      }
    }
  }

  // Sort by distance (closest first)
  collisions.sort((a, b) => a.data.value - b.data.value);

  return collisions;
};
