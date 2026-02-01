'use client';

import { useEffect, useRef, useCallback } from 'react';
import { getPlaybackEngine, disposePlaybackEngine, PlaybackState } from '@/core/playback';
import { useProjectStore } from '@/stores/projectStore';
import { useUIStore } from '@/stores/uiStore';

export function usePlayback() {
  const engineRef = useRef(getPlaybackEngine());
  const project = useProjectStore((state) => state.project);
  const { isPlaying, setPlaying, setCurrentBeat, setLoopRegion: setUILoopRegion } = useUIStore();

  // Setup callbacks on mount
  useEffect(() => {
    const engine = engineRef.current;

    engine.setCallbacks({
      onBeatChange: (beat) => {
        setCurrentBeat(beat);
      },
      onStateChange: (state: PlaybackState) => {
        setPlaying(state === 'playing');
      },
    });

    // Cleanup on unmount
    return () => {
      disposePlaybackEngine();
    };
  }, [setCurrentBeat, setPlaying]);

  const play = useCallback(async () => {
    const engine = engineRef.current;
    await engine.play(project);
  }, [project]);

  const stop = useCallback(() => {
    const engine = engineRef.current;
    engine.stop();
  }, []);

  const pause = useCallback(() => {
    const engine = engineRef.current;
    engine.pause();
  }, []);

  const resume = useCallback(() => {
    const engine = engineRef.current;
    engine.resume();
  }, []);

  const toggle = useCallback(async () => {
    if (isPlaying) {
      stop();
    } else {
      await play();
    }
  }, [isPlaying, play, stop]);

  const setBpm = useCallback((bpm: number) => {
    const engine = engineRef.current;
    engine.setBpm(bpm);
    useProjectStore.getState().setBpm(bpm);
  }, []);

  const seekTo = useCallback((beat: number) => {
    const engine = engineRef.current;
    engine.seekTo(beat, project.beatsPerBar);
  }, [project.beatsPerBar]);

  const setLoopRegion = useCallback((start: number | null, end: number | null) => {
    const engine = engineRef.current;
    engine.setLoopRegion(start, end, project.beatsPerBar);
    setUILoopRegion(start, end);
  }, [project.beatsPerBar, setUILoopRegion]);

  return {
    isPlaying,
    play,
    stop,
    pause,
    resume,
    toggle,
    setBpm,
    seekTo,
    setLoopRegion,
  };
}
