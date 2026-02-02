import { useEffect, useCallback } from 'react';
import { useUIStore } from '@/stores/uiStore';
import { useVisualStore } from '@/stores/visualStore';
import { getVisualPlaybackEngine } from '@/core/visualPlayback';
import { VisualInstrumentState } from '@/core/visualTypes';

export function useVisualPlayback() {
  const isPlaying = useUIStore((state) => state.isPlaying);
  const updateTrackStates = useVisualStore((state) => state.updateTrackStates);
  const clearStates = useVisualStore((state) => state.clearStates);

  // Handle state updates from the visual playback engine
  const handleStateUpdate = useCallback(
    (states: Map<string, VisualInstrumentState>) => {
      updateTrackStates(states);
    },
    [updateTrackStates]
  );

  // Set up callbacks when the component mounts
  useEffect(() => {
    const engine = getVisualPlaybackEngine();
    engine.setCallbacks({
      onStateUpdate: handleStateUpdate,
    });

    return () => {
      engine.setCallbacks({});
    };
  }, [handleStateUpdate]);

  // Clear states when playback stops
  useEffect(() => {
    if (!isPlaying) {
      // Small delay to allow final state updates
      const timeout = setTimeout(() => {
        clearStates();
      }, 100);
      return () => clearTimeout(timeout);
    }
  }, [isPlaying, clearStates]);
}
