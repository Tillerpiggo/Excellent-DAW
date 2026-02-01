'use client';

import { ReactNode, useState, useCallback } from 'react';
import {
  DndContext,
  DragOverlay,
  DragStartEvent,
  DragEndEvent,
  DragOverEvent,
  DragMoveEvent,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  MeasuringStrategy,
} from '@dnd-kit/core';
import { treeCollisionDetection } from '@/utils/treeCollisionDetection';
import {
  SortableContext,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { useProjectStore } from '@/stores/projectStore';
import { useUIStore } from '@/stores/uiStore';
import { TrackDragOverlay } from './TrackDragOverlay';
import { flattenTracks } from '@/utils/tree';
import {
  calculateDropPosition,
  calculateDropResult,
} from '@/utils/trackDragValidation';

interface DndTrackContextProps {
  children: ReactNode;
  flatTrackIds: string[];
}

export function DndTrackContext({ children, flatTrackIds }: DndTrackContextProps) {
  const project = useProjectStore((state) => state.project);
  const { moveTrack } = useProjectStore();
  const { collapsedTrackIds } = useUIStore();
  const {
    trackDragActiveId,
    trackDropTargetId,
    trackDropPosition,
    setTrackDragState,
    clearTrackDragState,
  } = useUIStore();

  const [activeDepth, setActiveDepth] = useState(0);
  const [pointerPosition, setPointerPosition] = useState({ x: 0, y: 0 });

  // Configure sensors for mouse and keyboard
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // 8px drag threshold before activating
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const { active } = event;
      const trackId = active.id as string;

      // Find the depth of the dragged track
      const flatTracks = flattenTracks(project, collapsedTrackIds);
      const node = flatTracks.find((n) => n.track.id === trackId);
      setActiveDepth(node?.depth || 0);

      setTrackDragState(trackId, null, null);
    },
    [project, collapsedTrackIds, setTrackDragState]
  );

  const handleDragMove = useCallback((event: DragMoveEvent) => {
    // Get current pointer position from the event
    const { activatorEvent, delta } = event;
    const initialX = (activatorEvent as PointerEvent)?.clientX || 0;
    const initialY = (activatorEvent as PointerEvent)?.clientY || 0;

    setPointerPosition({
      x: initialX + (delta?.x || 0),
      y: initialY + (delta?.y || 0),
    });
  }, []);

  const handleDragOver = useCallback(
    (event: DragOverEvent) => {
      const { active, over } = event;

      if (!over || active.id === over.id) {
        if (trackDropTargetId) {
          setTrackDragState(active.id as string, null, null);
        }
        return;
      }

      const draggedId = active.id as string;
      const targetId = over.id as string;

      // Get the over element's rect
      const overRect = over.rect;
      if (!overRect) return;

      // Calculate drop position based on current pointer position (tracked via onDragMove)
      const position = calculateDropPosition(
        pointerPosition.y,
        overRect.top,
        overRect.height,
        pointerPosition.x,
        overRect.left,
        overRect.width
      );

      // Validate and get drop result
      const result = calculateDropResult(project, draggedId, targetId, position);

      if (result.isValid) {
        setTrackDragState(draggedId, targetId, result.position);
      } else {
        setTrackDragState(draggedId, targetId, null); // Invalid drop shown with red
      }
    },
    [project, trackDropTargetId, pointerPosition, setTrackDragState]
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;

      if (over && active.id !== over.id && trackDropPosition) {
        const draggedId = active.id as string;
        const targetId = over.id as string;

        const result = calculateDropResult(
          project,
          draggedId,
          targetId,
          trackDropPosition
        );

        if (result.isValid) {
          moveTrack(draggedId, result.newParentId, result.insertIndex);
        }
      }

      clearTrackDragState();
    },
    [project, trackDropPosition, moveTrack, clearTrackDragState]
  );

  const handleDragCancel = useCallback(() => {
    clearTrackDragState();
  }, [clearTrackDragState]);

  // Get active track for overlay
  const activeTrack = trackDragActiveId
    ? project.tracks[trackDragActiveId]
    : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={treeCollisionDetection}
      onDragStart={handleDragStart}
      onDragMove={handleDragMove}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
      measuring={{
        droppable: {
          strategy: MeasuringStrategy.Always,
        },
      }}
    >
      <SortableContext
        items={flatTrackIds}
        strategy={verticalListSortingStrategy}
      >
        {children}
      </SortableContext>

      <DragOverlay dropAnimation={null}>
        {activeTrack && (
          <TrackDragOverlay track={activeTrack} depth={activeDepth} />
        )}
      </DragOverlay>
    </DndContext>
  );
}
