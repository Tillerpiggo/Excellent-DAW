import { useEffect, useCallback } from 'react';
import { useUIStore } from '@/stores/uiStore';
import { useVisualStore } from '@/stores/visualStore';
import { getVisualPlaybackEngine } from '@/core/visualPlayback';

export function useVisualPlayback() {
  const isPlaying = useUIStore((state) => state.isPlaying);
  const setActiveTrackIds = useVisualStore((state) => state.setActiveTrackIds);

  // Handle structural changes (which tracks have visual instruments)
  const handleTracksChanged = useCallback(
    (trackIds: string[]) => {
      setActiveTrackIds(trackIds);
    },
    [setActiveTrackIds]
  );

  // Set up callbacks when the component mounts
  useEffect(() => {
    const engine = getVisualPlaybackEngine();
    engine.setCallbacks({
      onTracksChanged: handleTracksChanged,
    });

    return () => {
      engine.setCallbacks({});
    };
  }, [handleTracksChanged]);

  // Clear active tracks when playback stops
  useEffect(() => {
    if (!isPlaying) {
      // Small delay to allow final state updates
      const timeout = setTimeout(() => {
        setActiveTrackIds([]);
      }, 100);
      return () => clearTimeout(timeout);
    }
  }, [isPlaying, setActiveTrackIds]);
}
