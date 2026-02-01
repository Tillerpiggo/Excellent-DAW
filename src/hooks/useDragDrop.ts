'use client';

import { useCallback, DragEvent } from 'react';
import { useUIStore } from '@/stores/uiStore';
import { useProjectStore, addTrackFromPreset } from '@/stores/projectStore';
import { PatternPreset } from '@/core/types';
import { PATTERN_PRESETS } from '@/core/presets';

export function useDragDrop() {
  const {
    dragState,
    startDragPreset,
    startDragBlock,
    setDropTarget,
    endDrag,
    dropTargetTrackId,
    dropTargetBar,
  } = useUIStore();

  const { addBlock, moveBlock, deleteBlock } = useProjectStore();
  const project = useProjectStore((state) => state.project);

  // Start dragging a preset from the library
  const handlePresetDragStart = useCallback(
    (e: DragEvent, preset: PatternPreset) => {
      e.dataTransfer.effectAllowed = 'copy';
      e.dataTransfer.setData('application/json', JSON.stringify({ type: 'preset', presetId: preset.id }));
      startDragPreset(preset);
    },
    [startDragPreset]
  );

  // Start dragging a block from the timeline
  const handleBlockDragStart = useCallback(
    (e: DragEvent, blockId: string, trackId: string) => {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('application/json', JSON.stringify({ type: 'block', blockId, trackId }));
      startDragBlock(blockId, trackId);
    },
    [startDragBlock]
  );

  // Handle drag over timeline or track hierarchy
  const handleDragOver = useCallback(
    (e: DragEvent, trackId: string, bar?: number) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = dragState.type === 'preset' ? 'copy' : 'move';
      setDropTarget(trackId, bar);
    },
    [dragState.type, setDropTarget]
  );

  // Handle drag leave
  const handleDragLeave = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      // Only clear if we're leaving the actual element, not entering a child
      const relatedTarget = e.relatedTarget as HTMLElement;
      const currentTarget = e.currentTarget as HTMLElement;
      if (!currentTarget.contains(relatedTarget)) {
        setDropTarget(null, null);
      }
    },
    [setDropTarget]
  );

  // Handle drop on timeline
  const handleTimelineDrop = useCallback(
    (e: DragEvent, trackId: string, bar: number) => {
      e.preventDefault();

      try {
        const data = JSON.parse(e.dataTransfer.getData('application/json'));

        if (data.type === 'preset') {
          const preset = PATTERN_PRESETS.find(p => p.id === data.presetId);
          if (preset) {
            addBlock(trackId, {
              startBar: bar,
              durationBars: preset.durationBars,
              loop: true,
              streams: [{ events: [...preset.events] }],
            });
          }
        } else if (data.type === 'block') {
          const sourceTrack = project.tracks[data.trackId];
          const block = sourceTrack?.blocks.find(b => b.id === data.blockId);
          if (block) {
            if (data.trackId === trackId) {
              // Same track - just update position
              useProjectStore.getState().updateBlock(trackId, data.blockId, { startBar: bar });
            } else {
              // Different track - move block
              moveBlock(data.trackId, data.blockId, trackId);
              useProjectStore.getState().updateBlock(trackId, data.blockId, { startBar: bar });
            }
          }
        }
      } catch (err) {
        console.error('Drop error:', err);
      }

      endDrag();
    },
    [addBlock, moveBlock, project.tracks, endDrag]
  );

  // Handle drop on track hierarchy (adds a child track)
  const handleHierarchyDrop = useCallback(
    (e: DragEvent, parentTrackId?: string) => {
      e.preventDefault();

      try {
        const data = JSON.parse(e.dataTransfer.getData('application/json'));

        if (data.type === 'preset') {
          addTrackFromPreset(data.presetId, parentTrackId);
        }
      } catch (err) {
        console.error('Drop error:', err);
      }

      endDrag();
    },
    [endDrag]
  );

  // Handle drag end (cleanup)
  const handleDragEnd = useCallback(() => {
    endDrag();
  }, [endDrag]);

  return {
    dragState,
    dropTargetTrackId,
    dropTargetBar,
    handlePresetDragStart,
    handleBlockDragStart,
    handleDragOver,
    handleDragLeave,
    handleTimelineDrop,
    handleHierarchyDrop,
    handleDragEnd,
  };
}
