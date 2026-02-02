'use client';

import { useEffect, useRef, useCallback } from 'react';
import { getPlaybackEngine, disposePlaybackEngine, PlaybackState } from '@/core/playback';
import { useProjectStore } from '@/stores/projectStore';
import { useUIStore } from '@/stores/uiStore';

export function usePlayback() {
  const engineRef = useRef(getPlaybackEngine());
  const project = useProjectStore((state) => state.project);
  const {
    isPlaying,
    setPlaying,
    setCurrentBeat,
    setLoopRegion: setUILoopRegion,
    loopStart,
    loopEnd,
    loopEnabled,
  } = useUIStore();

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

  // Sync loop region with engine when loopEnabled changes
  useEffect(() => {
    if (!isPlaying) return;

    const engine = engineRef.current;
    if (loopEnabled && loopStart !== null && loopEnd !== null && loopStart !== loopEnd) {
      engine.setLoopRegion(loopStart, loopEnd, project.beatsPerBar);
    } else {
      // Clear custom loop - restore full project loop
      engine.setLoopRegion(null, null, project.beatsPerBar);
    }
  }, [isPlaying, loopEnabled, loopStart, loopEnd, project.beatsPerBar]);

  const play = useCallback(async () => {
    const engine = engineRef.current;
    await engine.play(project);
    // Apply loop region after playback starts if enabled
    if (loopEnabled && loopStart !== null && loopEnd !== null && loopStart !== loopEnd) {
      engine.setLoopRegion(loopStart, loopEnd, project.beatsPerBar);
    }
  }, [project, loopEnabled, loopStart, loopEnd]);

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
