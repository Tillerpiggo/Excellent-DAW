'use client';

import { useEffect, useCallback } from 'react';
import { useUIStore } from '@/stores/uiStore';
import { useProjectStore } from '@/stores/projectStore';
import { usePlayback } from './usePlayback';

export function useKeyboard() {
  const { toggle } = usePlayback();
  const {
    selectedTrackId,
    selectedBlockId,
    selectTrack,
    selectBlock,
    setPixelsPerBeat,
    pixelsPerBeat,
  } = useUIStore();

  const { deleteTrack, deleteBlock } = useProjectStore();
  const project = useProjectStore((state) => state.project);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Ignore if focused on input
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      // Check if we're inside an editor panel (chord editor, drum editor, etc.)
      // These panels handle their own delete key behavior
      const isInEditorPanel = target.closest('[data-editor-panel]') !== null;

      switch (e.code) {
        case 'Space':
          e.preventDefault();
          toggle();
          break;

        case 'Delete':
        case 'Backspace':
          // Skip if inside an editor panel - let the panel handle it
          if (isInEditorPanel) {
            return;
          }
          if (selectedBlockId && selectedTrackId) {
            deleteBlock(selectedTrackId, selectedBlockId);
            selectBlock(null);
          } else if (selectedTrackId) {
            deleteTrack(selectedTrackId);
            selectTrack(null);
          }
          break;

        case 'Escape':
          selectTrack(null);
          selectBlock(null);
          break;

        case 'Equal':
        case 'NumpadAdd':
          if (e.metaKey || e.ctrlKey) {
            e.preventDefault();
            setPixelsPerBeat(pixelsPerBeat + 5);
          }
          break;

        case 'Minus':
        case 'NumpadSubtract':
          if (e.metaKey || e.ctrlKey) {
            e.preventDefault();
            setPixelsPerBeat(pixelsPerBeat - 5);
          }
          break;

        case 'KeyM':
          if (selectedTrackId) {
            const track = project.tracks[selectedTrackId];
            if (track) {
              useProjectStore.getState().updateTrack(selectedTrackId, { muted: !track.muted });
            }
          }
          break;

        case 'ArrowUp':
          if (selectedTrackId) {
            e.preventDefault();
            // Find previous visible track
            const trackIds = Object.keys(project.tracks);
            const currentIndex = trackIds.indexOf(selectedTrackId);
            if (currentIndex > 0) {
              selectTrack(trackIds[currentIndex - 1]);
            }
          }
          break;

        case 'ArrowDown':
          if (selectedTrackId) {
            e.preventDefault();
            // Find next visible track
            const trackIds = Object.keys(project.tracks);
            const currentIndex = trackIds.indexOf(selectedTrackId);
            if (currentIndex < trackIds.length - 1) {
              selectTrack(trackIds[currentIndex + 1]);
            }
          }
          break;
      }
    },
    [
      toggle,
      selectedTrackId,
      selectedBlockId,
      deleteTrack,
      deleteBlock,
      selectTrack,
      selectBlock,
      setPixelsPerBeat,
      pixelsPerBeat,
      project.tracks,
    ]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);
}
