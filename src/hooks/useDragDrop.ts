'use client';

import { useCallback, DragEvent, useState } from 'react';
import { useUIStore } from '@/stores/uiStore';
import { useProjectStore, addTrackFromPreset } from '@/stores/projectStore';
import { Preset } from '@/core/types';
import { PATTERN_PRESETS } from '@/core/presets';
import { processAudioFile, audioDurationToBars, isAudioFile } from '@/core/audio';

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

  const { addBlock, moveBlock, addAudioTrack } = useProjectStore();
  const project = useProjectStore((state) => state.project);

  // Track if we're currently processing an audio file drop
  const [isProcessingAudio, setIsProcessingAudio] = useState(false);

  // Start dragging a preset from the library
  const handlePresetDragStart = useCallback(
    (e: DragEvent, preset: Preset) => {
      e.dataTransfer.effectAllowed = 'copy';
      e.dataTransfer.setData('application/json', JSON.stringify({ type: 'preset', presetId: preset.id }));
      startDragPreset(preset);
    },
    [startDragPreset]
  );

  // Start dragging a block from the timeline
  const handleBlockDragStart = useCallback(
    (e: DragEvent, blockId: string, trackId: string) => {
      e.dataTransfer.effectAllowed = 'copyMove';
      e.dataTransfer.setData('application/json', JSON.stringify({ type: 'block', blockId, trackId }));
      startDragBlock(blockId, trackId);
    },
    [startDragBlock]
  );

  // Handle drag over timeline or track hierarchy
  const handleDragOver = useCallback(
    (e: DragEvent, trackId: string, bar?: number) => {
      e.preventDefault();
      // For presets always copy, for blocks check Ctrl/Meta key
      if (dragState.type === 'preset') {
        e.dataTransfer.dropEffect = 'copy';
      } else {
        e.dataTransfer.dropEffect = e.altKey ? 'copy' : 'move';
      }
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

  // Handle audio file drop
  const handleAudioFileDrop = useCallback(
    async (file: File, trackId: string | null, bar: number) => {
      if (isProcessingAudio) return;

      setIsProcessingAudio(true);

      try {
        // Process the audio file
        const { audioData } = await processAudioFile(file);

        // Calculate block duration based on audio length
        const durationBars = audioDurationToBars(
          audioData.duration,
          project.bpm,
          project.beatsPerBar
        );

        let targetTrackId = trackId;

        // Check if dropping on an existing audio track
        if (trackId) {
          const track = project.tracks[trackId];
          if (track?.instrumentId !== 'audio') {
            // Not an audio track, create a new one
            targetTrackId = addAudioTrack(audioData.fileName);
          }
        } else {
          // No track specified, create a new audio track
          targetTrackId = addAudioTrack(audioData.fileName);
        }

        // Add the audio block
        addBlock(targetTrackId!, {
          startBar: bar,
          durationBars,
          loop: false,
          streams: [],
          audioData,
        });

      } catch (error) {
        console.error('Error processing audio file:', error);
        // Could add toast notification here
      } finally {
        setIsProcessingAudio(false);
      }
    },
    [isProcessingAudio, project.bpm, project.beatsPerBar, project.tracks, addAudioTrack, addBlock]
  );

  // Handle drop on timeline
  const handleTimelineDrop = useCallback(
    async (e: DragEvent, trackId: string, bar: number) => {
      e.preventDefault();

      // Check for file drop first
      const files = e.dataTransfer?.files;
      if (files && files.length > 0) {
        const file = files[0];
        if (isAudioFile(file)) {
          await handleAudioFileDrop(file, trackId, bar);
          endDrag();
          return;
        }
      }

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
            const isCopy = e.altKey;

            if (isCopy) {
              // Copy block - deep clone streams data and audio data
              const clonedStreams = block.streams?.map(stream => ({
                ...stream,
                events: stream.events.map(event => ({ ...event })),
              }));

              addBlock(trackId, {
                startBar: bar,
                durationBars: block.durationBars,
                loop: block.loop,
                streams: clonedStreams,
                audioData: block.audioData ? { ...block.audioData } : undefined,
              });
            } else if (data.trackId === trackId) {
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
    [addBlock, moveBlock, project.tracks, endDrag, handleAudioFileDrop]
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
    isProcessingAudio,
    handlePresetDragStart,
    handleBlockDragStart,
    handleDragOver,
    handleDragLeave,
    handleTimelineDrop,
    handleHierarchyDrop,
    handleDragEnd,
    handleAudioFileDrop,
  };
}
